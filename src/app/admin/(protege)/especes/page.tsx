import type { Metadata } from "next";
import Link from "next/link";

import {
  AnnulerVente,
  NoterRemboursement,
  RenvoyerFacture,
  VenteEspeces,
  type VeloComptoir,
} from "@/components/admin/VenteEspeces";
import { Pastille } from "@/components/ui";
import { heureAuBenin } from "@/data/offres";
import { exigerSessionAdmin } from "@/lib/admin";
import { ajouterJours, aujourdhui, dateAuBenin, DECALAGE_BENIN_MS, estDateISOValide, type DateISO } from "@/lib/dates";
import { depot } from "@/lib/db";
import type { CreneauOccupe } from "@/lib/db/contrat";
import {
  formatDate,
  formatDateAvecJour,
  formatDateCourte,
  formatNombre,
  formatPlageReservation,
  formatXof,
  resumeOffre,
} from "@/lib/format";
import { lireReglages } from "@/lib/reglages";
import { estEnAttente, estPayee, estVenteEspeces, montantARendre, paiementPrincipal } from "@/lib/reservations";
import { construirePeriode, dateEncaissement } from "@/lib/statistiques";
import type { Reservation, StatutReservation } from "@/lib/types";

export const metadata: Metadata = { title: "Ventes en espèces" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

const statuts: Record<StatutReservation, { texte: string; ton: "succes" | "info" | "alerte" | "neutre" }> = {
  EN_ATTENTE_PAIEMENT: { texte: "À payer", ton: "alerte" },
  CONFIRMEE: { texte: "Vélo à remettre", ton: "succes" },
  EN_COURS: { texte: "Vélo sorti", ton: "info" },
  TERMINEE: { texte: "Terminée", ton: "neutre" },
  ANNULEE: { texte: "Annulée", ton: "alerte" },
};

/**
 * Les ventes au comptoir, réglées en espèces.
 *
 * En haut, la saisie : le client reçoit sa confirmation et sa facture par
 * email dès l'enregistrement. En dessous, le suivi : ce qui a été encaissé
 * un jour donné, par qui, et ce que cela fait sur la semaine et le mois.
 * C'est l'écran du rapprochement de caisse, le soir : le total du jour,
 * moins ce qui est à rendre pour les annulations du jour, doit être ce
 * qu'il y a dans la caisse.
 *
 * L'argent se compte au jour où il a été reçu, comme au tableau de bord,
 * et non au jour de la sortie : un road trip du dimanche payé le samedi
 * est dans la caisse du samedi.
 */
export default async function PageEspeces({ searchParams }: { searchParams: Recherche }) {
  await exigerSessionAdmin();
  const parametres = await searchParams;
  const maintenant = new Date();
  const ajd = aujourdhui();
  const demande = typeof parametres.jour === "string" ? parametres.jour : "";
  const jour = estDateISOValide(demande) && demande <= ajd ? demande : ajd;

  const [parc, reservations, reglages] = await Promise.all([
    depot.listerVelos(),
    depot.listerReservations(),
    lireReglages(),
  ]);

  const velos: VeloComptoir[] = parc.map((velo) => ({
    id: velo.id,
    nom: velo.nom,
    gamme: velo.gamme,
    statut: velo.statut,
    photo: velo.photo,
  }));

  // Les créneaux déjà pris, pour griser au comptoir un vélo occupé. Mêmes
  // règles que la base : une réservation payée, ou un panier encore dans
  // son délai. Le serveur revérifie de toute façon à l'enregistrement.
  const occupes: Record<string, CreneauOccupe[]> = {};
  for (const reservation of reservations) {
    if (reservation.dateFin < ajd) continue;
    if (!estPayee(reservation) && !estEnAttente(reservation)) continue;
    for (const ligne of reservation.lignes) {
      (occupes[ligne.veloId] ??= []).push({
        debut: reservation.dateDebut,
        fin: reservation.dateFin,
        heureDebut: reservation.heureDebut,
        heureFin: reservation.heureFin,
      });
    }
  }

  // --- Le suivi de caisse
  //
  // Comme une caisse : l'argent entre le jour de la vente, et ressort le
  // jour où il est rendu. Une vente annulée plus tard reste donc comptée le
  // jour où elle a été encaissée (l'argent était bien dans la caisse ce
  // soir-là), et son remboursement compte le jour où il est fait : sur-le-
  // champ pour une annulation au comptoir, le jour où le client revient
  // pour une annulation qu'il a faite depuis son lien. Entre les deux, la
  // vente est « à rendre » : l'argent est encore dans la caisse, mais il
  // n'est plus à Bike Land.
  const ici = heureAuBenin(maintenant);
  const ventes = reservations.filter((reservation) => estVenteEspeces(reservation) && reservation.statut !== "EN_ATTENTE_PAIEMENT");
  const vendues = (debut: DateISO, fin: DateISO) =>
    ventes.filter((reservation) => {
      const date = dateEncaissement(reservation);
      return date >= debut && date <= fin;
    });
  const rendues = (debut: DateISO, fin: DateISO) =>
    ventes.filter((reservation) => {
      const rendu = paiementPrincipal(reservation);
      if (rendu?.statut !== "REMBOURSE" || !rendu.rembourseLe) return false;
      const date = dateAuBenin(rendu.rembourseLe);
      return date >= debut && date <= fin;
    });
  // À rendre : annulées par le client, argent pas encore rendu. Toutes,
  // quel que soit le jour affiché : c'est une liste de choses à faire.
  const aRendre = ventes.filter(
    (reservation) => reservation.statut === "ANNULEE" && paiementPrincipal(reservation)?.statut === "REUSSI",
  );

  const semaine = construirePeriode("semaine", jour);
  const mois = construirePeriode("mois", jour);
  const duJour = vendues(jour, jour).sort((a, b) => (instantEncaissement(a) < instantEncaissement(b) ? 1 : -1));
  const renduesDuJour = rendues(jour, jour);
  const deLaSemaine = vendues(semaine.debut, semaine.fin);
  const duMois = vendues(mois.debut, mois.fin);

  const vendeursJour = new Map(parVendeur(duJour).map((v) => [v.cle, v]));
  const vendeurs = parVendeur(deLaSemaine).map((v) => ({ ...v, jour: vendeursJour.get(v.cle) }));
  const totalRendu = (liste: Reservation[]) => liste.reduce((total, reservation) => total + montantSortie(reservation), 0);
  const resumeSorties = (liste: Reservation[]) =>
    liste.length > 0 ? ` · ${formatXof(totalRendu(liste))} rendus aux clients` : "";
  // Une vente s'annule au comptoir tant que le vélo n'est pas parti et que
  // son créneau n'est pas passé : la route refuse au-delà.
  const annulableAuComptoir = (reservation: Reservation) =>
    reservation.statut === "CONFIRMEE" &&
    (reservation.dateFin > ici.date || (reservation.dateFin === ici.date && reservation.heureFin > ici.heure));

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Comptoir</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Ventes en espèces</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          Le client paie sur place : enregistrez la vente ici, il reçoit aussitôt sa confirmation et
          sa facture par email. Chaque vente est signée du nom de qui a reçu l&apos;argent, et le
          gérant en est averti par email.
        </p>
      </header>

      <div className="mt-8 max-w-3xl">
        <VenteEspeces velos={velos} occupes={occupes} instant={maintenant.getTime()} reglages={reglages} />
      </div>

      <section aria-labelledby="titre-suivi" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="titre-suivi" className="titre-editorial text-[1.4rem]">
              Encaissements
            </h2>
            <p className="mt-1 text-[0.88rem] text-gris-cadre">
              {jour === ajd ? "Aujourd'hui, " : ""}
              {formatDateAvecJour(jour)}
            </p>
          </div>

          <nav aria-label="Changer de jour" className="flex flex-wrap items-center gap-2 text-[0.84rem]">
            <Link
              href={`/admin/especes?jour=${ajouterJours(jour, -1)}`}
              className="inline-flex min-h-11 items-center rounded-full border border-noir-piste/20 bg-white px-4 font-semibold"
            >
              ← Veille
            </Link>
            {jour < ajd && (
              <Link
                href={`/admin/especes?jour=${ajouterJours(jour, 1)}`}
                className="inline-flex min-h-11 items-center rounded-full border border-noir-piste/20 bg-white px-4 font-semibold"
              >
                Lendemain →
              </Link>
            )}
            <form method="get" className="flex items-center gap-2">
              <input
                type="date"
                name="jour"
                defaultValue={jour}
                max={ajd}
                aria-label="Choisir un jour"
                className="h-11 rounded-full border border-noir-piste/20 bg-white px-3"
              />
              <button type="submit" className="h-11 rounded-full bg-noir-piste px-4 font-semibold text-craie">
                Voir
              </button>
            </form>
            {jour !== ajd && (
              <Link href="/admin/especes" className="lien-souligne px-2 font-semibold text-orange-sourd">
                Aujourd&apos;hui
              </Link>
            )}
          </nav>
        </div>

        <dl className="mt-6 grid gap-4 *:min-w-0 sm:grid-cols-3">
          <Tuile
            titre={jour === ajd ? "Encaissé aujourd'hui" : `Encaissé le ${formatDate(jour)}`}
            valeur={formatXof(somme(duJour))}
            detail={`${formatNombre(duJour.length)} vente${duJour.length > 1 ? "s" : ""}${resumeSorties(renduesDuJour)}`}
          />
          <Tuile
            titre={`Semaine du ${formatDate(semaine.debut)}`}
            valeur={formatXof(somme(deLaSemaine))}
            detail={`${formatNombre(deLaSemaine.length)} vente${deLaSemaine.length > 1 ? "s" : ""}${resumeSorties(rendues(semaine.debut, semaine.fin))}`}
          />
          <Tuile
            titre={`Mois de ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mois.debut}T12:00:00Z`))}`}
            valeur={formatXof(somme(duMois))}
            detail={`${formatNombre(duMois.length)} vente${duMois.length > 1 ? "s" : ""}${resumeSorties(rendues(mois.debut, mois.fin))}`}
          />
        </dl>

        {/* L'argent rendu ce jour-là : il est sorti de la caisse, pour des
            ventes faites ce jour ou avant. */}
        {renduesDuJour.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-white px-4 py-3 text-[0.86rem] leading-relaxed">
            <p className="font-semibold">
              Rendu aux clients ce jour : {formatXof(totalRendu(renduesDuJour))}, à retirer du total
              encaissé pour la caisse.
            </p>
            <ul className="mt-1 space-y-0.5 text-gris-cadre">
              {renduesDuJour.map((reservation) => (
                <li key={reservation.id}>
                  <span className="font-mono">{reservation.reference}</span> · {reservation.client.prenom}{" "}
                  {reservation.client.nom} · vendue {formatXof(reservation.totalXof)} le{" "}
                  {formatDate(dateEncaissement(reservation))} · {formatXof(montantSortie(reservation))} rendus
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ce qui reste à rendre : annulé par le client, argent pas encore
            rendu. Il est encore dans la caisse, mais n'est plus à Bike Land. */}
        {aRendre.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-carte)] border border-orange-signal/50 bg-white px-4 py-3 text-[0.86rem] leading-relaxed">
            <p className="font-semibold text-orange-sourd">
              À rendre aux clients : {formatXof(aRendre.reduce((total, r) => total + montantSortie(r), 0))}{" "}
              ({aRendre.length} annulation{aRendre.length > 1 ? "s" : ""} faite{aRendre.length > 1 ? "s" : ""}{" "}
              par le client, montant selon les CGV)
            </p>
            <ul className="mt-2 space-y-2">
              {aRendre.map((reservation) => (
                <li key={reservation.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-gris-cadre">
                    <span className="font-mono">{reservation.reference}</span> · {reservation.client.prenom}{" "}
                    {reservation.client.nom}
                    {reservation.client.telephone ? ` · ${reservation.client.telephone}` : ""} · annulée le{" "}
                    {formatDate(dateAuBenin(reservation.annuleLe ?? reservation.creeLe))} ·{" "}
                    <strong className="text-noir-piste">{formatXof(montantSortie(reservation))}</strong> sur{" "}
                    {formatXof(reservation.totalXof)}
                  </span>
                  <NoterRemboursement reference={reservation.reference} montantXof={montantSortie(reservation)} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Par vendeur : qui a reçu quoi, ce jour-là et sur la semaine. Sur
            téléphone, une fiche par vendeur : le tableau fait 480 px, et la
            colonne de la semaine, qui sert au rapprochement, tombait hors
            de l'écran. */}
        {vendeurs.length > 0 && (
          <>
            <ul className="mt-6 grid gap-3 sm:hidden">
              {vendeurs.map((vendeur) => (
                <li key={vendeur.cle} className="rounded-[var(--radius-carte)] bg-white p-4 text-[0.86rem]">
                  <p className="font-semibold">{vendeur.nom}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
                    <dt className="text-gris-cadre">Ce jour</dt>
                    <dd className="text-right">
                      {formatXof(vendeur.jour?.montant ?? 0)} · {formatNombre(vendeur.jour?.nombre ?? 0)}&nbsp;vente
                      {(vendeur.jour?.nombre ?? 0) > 1 ? "s" : ""}
                    </dd>
                    <dt className="text-gris-cadre">Semaine</dt>
                    <dd className="text-right">{formatXof(vendeur.montant)}</dd>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="mt-6 hidden overflow-x-auto rounded-[var(--radius-carte)] bg-white sm:block">
              <table className="w-full min-w-[30rem] text-left text-[0.86rem]">
                <caption className="sr-only">Encaissements par vendeur</caption>
                <thead className="border-b border-noir-piste/10 text-[0.76rem] text-gris-cadre">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Reçu par</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Ce jour</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Ventes du jour</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Semaine</th>
                  </tr>
                </thead>
                <tbody>
                  {vendeurs.map((vendeur) => (
                    <tr key={vendeur.cle} className="border-b border-noir-piste/5 last:border-0">
                      <td className="px-4 py-3 font-semibold">{vendeur.nom}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatXof(vendeur.jour?.montant ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNombre(vendeur.jour?.nombre ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatXof(vendeur.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Les ventes du jour, une par une. */}
        {duJour.length === 0 ? (
          <p className="mt-6 rounded-[var(--radius-carte)] bg-white px-5 py-10 text-center text-[0.92rem] text-gris-cadre">
            Aucune vente en espèces ce jour-là.
          </p>
        ) : (
          <>
            <ul className="mt-6 grid gap-3 md:hidden">
              {duJour.map((reservation) => (
                <li key={reservation.id} className="rounded-[var(--radius-carte)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {reservation.client.prenom} {reservation.client.nom}
                      </p>
                      <p className="text-[0.78rem] text-gris-cadre">
                        {heureLisible(instantEncaissement(reservation))} ·{" "}
                        <Link href={`/admin/reservations?reference=${reservation.reference}`} className="font-mono lien-souligne">
                          {reservation.reference}
                        </Link>
                      </p>
                    </div>
                    <Pastille ton={etiquette(reservation).ton}>{etiquette(reservation).texte}</Pastille>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.84rem]">
                    <div>
                      <dt className="text-[0.74rem] text-gris-cadre">Montant</dt>
                      <dd className={`font-semibold tabular-nums`}>
                        {formatXof(reservation.totalXof)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.74rem] text-gris-cadre">Reçu par</dt>
                      <dd>{paiementPrincipal(reservation)?.encaissePar ?? "non renseigné"}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.74rem] text-gris-cadre">Formule</dt>
                      <dd>{resumeOffre(reservation)}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.74rem] text-gris-cadre">Départ</dt>
                      <dd>
                        {formatDate(reservation.dateDebut)}
                        <span className="block text-[0.76rem] text-gris-cadre tabular-nums">
                          {formatPlageReservation(reservation)}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[0.8rem] text-gris-cadre">
                    {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                  </p>
                  {reservation.statut !== "ANNULEE" && (
                    <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-1">
                      <RenvoyerFacture reference={reservation.reference} />
                      {annulableAuComptoir(reservation) && (
                        <AnnulerVente reference={reservation.reference} montantXof={reservation.totalXof} />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6 hidden overflow-x-auto rounded-[var(--radius-carte)] bg-white md:block">
              <table className="w-full min-w-[56rem] text-left text-[0.85rem]">
                <caption className="sr-only">Ventes en espèces du jour</caption>
                <thead className="border-b border-noir-piste/10 text-[0.76rem] text-gris-cadre">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-semibold">Heure</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Client</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Formule et vélo</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Départ</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Montant</th>
                    <th scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">Reçu par</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Statut</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {duJour.map((reservation) => (
                    <tr key={reservation.id} className="border-b border-noir-piste/5 align-top last:border-0">
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                        {heureLisible(instantEncaissement(reservation))}
                        <Link
                          href={`/admin/reservations?reference=${reservation.reference}`}
                          className="lien-souligne block font-mono text-[0.76rem] text-gris-cadre"
                        >
                          {reservation.reference}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {reservation.client.prenom} {reservation.client.nom}
                        <span className="block break-words text-[0.76rem] text-gris-cadre">{reservation.client.email}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {resumeOffre(reservation)}
                        <span className="block text-[0.76rem] text-gris-cadre">
                          {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatDate(reservation.dateDebut)}
                        <span className="block text-[0.76rem] text-gris-cadre tabular-nums">
                          {formatPlageReservation(reservation)}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums`}
                      >
                        {formatXof(reservation.totalXof)}
                        {reservation.remiseXof > 0 && (
                          <span className="block text-[0.74rem] font-normal text-gris-cadre">
                            code {reservation.codeParrainage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">{paiementPrincipal(reservation)?.encaissePar ?? "non renseigné"}</td>
                      <td className="px-3 py-3">
                        <Pastille ton={etiquette(reservation).ton}>{etiquette(reservation).texte}</Pastille>
                      </td>
                      <td className="px-3 py-3">
                        {reservation.statut !== "ANNULEE" && (
                          <span className="flex flex-col items-start gap-1.5">
                            <RenvoyerFacture reference={reservation.reference} />
                            {/* Tant que le vélo n'est pas parti, une erreur
                                de saisie se corrige ici. */}
                            {annulableAuComptoir(reservation) && (
                              <AnnulerVente reference={reservation.reference} montantXof={reservation.totalXof} />
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-noir-piste/15 font-semibold">
                  <tr>
                    <td className="px-3 py-3" colSpan={4}>
                      Total encaissé ce jour
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{formatXof(somme(duJour))}</td>
                    <td className="px-3 py-3" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function somme(liste: Reservation[]): number {
  return liste.reduce((total, reservation) => total + reservation.totalXof, 0);
}

/** L'instant où l'argent a été reçu : la confirmation, qui est immédiate au comptoir. */
function instantEncaissement(reservation: Reservation): string {
  return reservation.confirmeLe ?? reservation.creeLe;
}

/** L'argent de cette vente annulée a été rendu au client. */
function estRendue(reservation: Reservation): boolean {
  return paiementPrincipal(reservation)?.statut === "REMBOURSE";
}

/**
 * Ce que l'annulation fait sortir de la caisse : le montant noté au
 * remboursement (tout au comptoir, la part des CGV pour une annulation du
 * client) ; tant qu'il n'est pas rendu, la part que les CGV prévoient.
 */
function montantSortie(reservation: Reservation): number {
  const paiement = paiementPrincipal(reservation);
  if (paiement?.statut === "REMBOURSE") return paiement.montantRenduXof ?? reservation.totalXof;
  if (!reservation.annuleLe) return reservation.totalXof;
  return montantARendre(reservation, dateAuBenin(reservation.annuleLe));
}

/**
 * Le statut affiché. Une vente annulée dit quand, et si l'argent est déjà
 * rendu : son montant reste dans le total du jour où il est entré.
 */
function etiquette(reservation: Reservation): { texte: string; ton: "succes" | "info" | "alerte" | "neutre" } {
  if (reservation.statut === "ANNULEE" && reservation.annuleLe) {
    const le = formatDateCourte(dateAuBenin(reservation.annuleLe));
    return { texte: estRendue(reservation) ? `Annulée le ${le}, rendue` : `Annulée le ${le}, à rendre`, ton: "alerte" };
  }
  return statuts[reservation.statut];
}

/** « 14 h 05 », à l'heure de Cotonou. */
function heureLisible(instant: string): string {
  const ici = new Date(Date.parse(instant) + DECALAGE_BENIN_MS);
  return `${ici.getUTCHours()} h ${String(ici.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Les encaissements regroupés par personne. Le nom est comparé sans tenir
 * compte des majuscules : « Koffi » et « koffi » sont la même personne.
 */
function parVendeur(liste: Reservation[]) {
  const groupes = new Map<string, { cle: string; nom: string; nombre: number; montant: number }>();
  for (const reservation of liste) {
    const nom = paiementPrincipal(reservation)?.encaissePar?.trim() || "Non renseigné";
    const cle = nom.toLocaleLowerCase("fr-FR");
    const groupe = groupes.get(cle) ?? { cle, nom, nombre: 0, montant: 0 };
    groupe.nombre += 1;
    groupe.montant += reservation.totalXof;
    groupes.set(cle, groupe);
  }
  return [...groupes.values()].sort((a, b) => b.montant - a.montant);
}

function Tuile({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius-carte)] bg-white p-5">
      <dt className="text-[0.8rem] text-gris-cadre">{titre}</dt>
      <dd className="mt-2 font-display text-[1.5rem] font-bold tabular-nums">{valeur}</dd>
      {detail && <dd className="mt-1 text-[0.78rem] text-gris-cadre">{detail}</dd>}
    </div>
  );
}
