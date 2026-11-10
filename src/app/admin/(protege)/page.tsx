import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BarreEmpilee } from "@/components/graphiques/BarreEmpilee";
import { BarresHorizontales } from "@/components/graphiques/BarresHorizontales";
import { Colonnes } from "@/components/graphiques/Colonnes";
import { Courbe } from "@/components/graphiques/Courbe";
import { Jauge, TuileStat } from "@/components/graphiques/TuileStat";
import { SelecteurPeriode } from "@/components/admin/SelecteurPeriode";
import { exigerSessionAdmin } from "@/lib/admin";
import { AIDE_A_PREVOIR, indicateursDuJour } from "@/lib/rapport";
import { depot } from "@/lib/db";
import { aujourdhui, nombreDeJours } from "@/lib/dates";
import { formatDate, formatDateAvecJour, formatNombre, formatXof } from "@/lib/format";
import {
  calculerStatistiques,
  construirePeriode,
  type Granularite,
} from "@/lib/statistiques";
import { PilotageOuverture } from "@/components/admin/PilotageOuverture";
import { clotureInscriptionsOctobreRose, formatHoraire } from "@/data/octobre-rose";
import { CRENEAUX_ROAD_TRIP, creneauxDisponibles, gammesDuDepart, heureAuBenin } from "@/data/offres";
import {
  CODE_PADEL_BIKE,
  delaiPadelEnClair,
  jourOuverturePadel,
  joursPadelReservables,
  padelBikeOuvert,
  plageHorairePadel,
} from "@/data/padel-bike";
import { programmeEnClair } from "@/data/reglages";
import { CODE_INTERRUPTEUR_OFFRES } from "@/data/reglages-offres";
import { AlerteParc } from "@/components/admin/AlerteParc";
import { etatsSortiesOctobreRose, lireOuverture, offresGroupeActives, padelBikeOuvertEnLigne } from "@/lib/ouverture";
import { lireReglages } from "@/lib/reglages";
import { lireReglagesOffres } from "@/lib/reglages-offres";

export const metadata: Metadata = { title: "Tableau de bord" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

const granularitesValides: Granularite[] = ["jour", "semaine", "mois", "annee"];

/**
 * Titre de bloc du tableau de bord.
 *
 * Volontairement un vrai titre lisible, et non une étiquette grise en
 * petites capitales : l'exploitant doit balayer la page et comprendre
 * chaque bloc sans effort. Le sous-titre dit, en français courant, à
 * quelle question le bloc répond.
 */
function TitreBloc({
  id,
  titre,
  question,
  action,
}: {
  id: string;
  titre: string;
  question: string;
  action?: { href: string; libelle: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 id={id} className="titre-editorial text-[1.5rem]">
          {titre}
        </h2>
        <p className="mt-1.5 text-[0.88rem] text-gris-cadre">{question}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="lien-souligne cible-elargie text-[0.85rem] font-semibold text-orange-sourd"
        >
          {action.libelle}
        </Link>
      )}
    </div>
  );
}

/**
 * Tableau de bord de l'exploitation.
 *
 * L'écran est ordonné comme la journée de l'exploitant, et non comme un
 * rapport financier : d'abord ce qu'il y a à faire aujourd'hui, ensuite
 * seulement les chiffres.
 *
 * Deux principes tiennent tout le reste :
 *
 *  1. **L'état fait foi, jamais la date.** Un vélo est « à remettre »
 *     parce qu'il est payé et pas encore sorti, pas parce que la date du
 *     jour est arrivée. La fiche du jour et la liste des réservations
 *     appliquent la même règle : sans cela les trois écrans annonceraient
 *     des nombres différents pour la même réalité.
 *
 *  2. **Les deux formules ne se mesurent pas pareil.** Le road trip se
 *     facture au participant, la location libre à l'heure. On ne les
 *     additionne donc jamais : chacune garde son volume et son unité.
 *
 * Aucun calcul métier ici, tout vient de `calculerStatistiques`.
 */
export default async function PageTableauDeBord({ searchParams }: { searchParams: Recherche }) {
  await exigerSessionAdmin();
  const parametres = await searchParams;
  const demandee = typeof parametres.periode === "string" ? parametres.periode : "mois";
  const granularite = granularitesValides.includes(demandee as Granularite)
    ? (demandee as Granularite)
    : "mois";

  const [reservations, velos, clients] = await Promise.all([
    depot.listerReservations(),
    depot.listerVelos(),
    depot.listerClients(),
  ]);

  const periode = construirePeriode(granularite);
  const stats = calculerStatistiques(reservations, velos, clients, periode);

  // Les réglages d'ouverture, et ce qu'ils donnent côté client : le
  // prochain départ réellement proposé pour chaque créneau ouvert.
  const ouverture = await lireOuverture();
  const departsProposes = creneauxDisponibles(new Date(), ouverture);
  const aujourdhuiBenin = heureAuBenin().date;
  // L'inscription en ligne à Octobre rose se pilote comme un créneau, jour
  // par jour, tant que la sortie de ce jour est à venir.
  const instantRose = new Date();
  const joursRose = (await etatsSortiesOctobreRose(instantRose, ouverture)).filter((etat) => !etat.partie);
  // Padel bike en ligne : réglé sous son propre code, ouvert au public le 20 novembre.
  const { padel } = await lireReglages();
  const padelEnLigne = padelBikeOuvertEnLigne(ouverture);
  const padelLance = padelBikeOuvert(padel);
  const premierJourPadel = joursPadelReservables(padel)[0];

  // Les offres de groupe : l'interrupteur, leurs réglages (illisibles, la
  // vente est bloquée), les réservations payées dont un vélo n'est plus là,
  // l'argent à rendre et les captures de réduction qui attendent
  // (décision 24). Une lecture qui échoue ne fait pas tomber la page.
  const offresGroupe = offresGroupeActives(ouverture);
  const [lectureOffres, touchees, remboursementsAFaire, capturesAVerifier] = await Promise.all([
    lireReglagesOffres().catch((erreur) => {
      console.error("[tableau de bord] réglages des offres illisibles", erreur);
      return null;
    }),
    depot.reservationsTouchees(aujourdhuiBenin).catch((erreur) => {
      console.error("[tableau de bord] alerte du parc impossible", erreur);
      return null;
    }),
    depot.listerRemboursements({ statut: "a_faire" }).catch((erreur) => {
      console.error("[tableau de bord] remboursements illisibles", erreur);
      return [];
    }),
    depot.compterPreuvesEnAttente().catch((erreur) => {
      console.error("[tableau de bord] captures à vérifier illisibles", erreur);
      return 0;
    }),
  ]);
  const reglagesOffresIllisibles = lectureOffres?.source === "illisible";

  const totalClients = stats.nouveauxClients + stats.clientsRecurrents;
  const joursCompares = nombreDeJours(stats.fenetreCourante.debut, stats.fenetreCourante.fin);

  // Ce qui se passe aujourd'hui ouvre la page : c'est la première chose
  // que l'exploitant regarde en arrivant à l'atelier, avant tout
  // indicateur de performance.
  const jour = aujourdhui();
  // Calcul partagé avec les exports PDF et CSV : l'écran et le fichier
  // annoncent toujours les mêmes chiffres.
  const {
    departs: departsDuJour,
    retours: retoursDuJour,
    aPayer,
    aPrevoir,
    cautions: cautionsAcollecter,
  } = indicateursDuJour(reservations, jour);

  return (
    <div className="pb-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="titre-editorial text-[2.2rem]">Tableau de bord</h1>
          <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-gris-cadre">
            Vous regardez{" "}
            <strong className="text-noir-piste">{periode.libelle.toLowerCase()}</strong>, du{" "}
            {formatDate(stats.fenetreCourante.debut)} au {formatDate(stats.fenetreCourante.fin)}.
            {stats.periodeEnCours && (
              <>
                {" "}
                La période n&apos;est pas terminée&nbsp;: elle est comparée aux {joursCompares} mêmes
                jours de la période précédente, et non à une période entière, sinon la
                comparaison montrerait une chute qui n&apos;existe pas.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-10 w-64 rounded-full bg-white" />}>
            <SelecteurPeriode actuelle={granularite} />
          </Suspense>
          <a
            href={`/api/admin/export?periode=${granularite}`}
            className="rounded-full bg-noir-piste px-5 py-2.5 text-[0.82rem] font-semibold text-craie transition-colors hover:bg-orange-signal hover:text-noir-piste"
          >
            Exporter en CSV
          </a>
          <a
            href={`/api/admin/export?periode=${granularite}&format=pdf`}
            className="rounded-full border border-noir-piste/25 px-5 py-2.5 text-[0.82rem] font-semibold transition-colors hover:bg-noir-piste hover:text-craie"
          >
            Exporter en PDF
          </a>
        </div>
      </header>

      {/* ---------------------------------------------- Ce qui ne peut attendre */}
      {reglagesOffresIllisibles && (
        <p className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed">
          <strong className="font-semibold">Les réglages des offres de groupe ne se lisent plus.</strong> La vente de
          ces offres est bloquée tant qu&apos;ils ne sont pas corrigés.{" "}
          <Link href="/admin/reglages#reglages-offres" className="lien-souligne font-semibold">
            Corriger les réglages
          </Link>
        </p>
      )}
      <AlerteParc touchees={touchees} />
      {remboursementsAFaire.length > 0 && (
        <p className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed">
          <strong className="font-semibold">
            {remboursementsAFaire.length} remboursement{remboursementsAFaire.length > 1 ? "s" : ""} à faire
          </strong>
          , sous 48 heures, sur SasPay ou en Mobile Money.{" "}
          <Link href="/admin/remboursements" className="lien-souligne font-semibold">
            Voir les remboursements
          </Link>
        </p>
      )}
      {capturesAVerifier > 0 && (
        <p className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed">
          <strong className="font-semibold">
            {capturesAVerifier} capture{capturesAVerifier > 1 ? "s" : ""} à vérifier
          </strong>
          , pour la réduction du road trip en groupe : le client attend votre réponse par email.{" "}
          <Link href="/admin/preuves" className="lien-souligne font-semibold">
            Voir les captures
          </Link>
        </p>
      )}

      {/* ------------------------------------------------------ Aujourd'hui */}
      <section className="mt-12" aria-labelledby="titre-aujourdhui">
        <TitreBloc
          id="titre-aujourdhui"
          titre="Aujourd'hui"
          question="Ce que vous avez à faire dans la journée."
          action={{ href: "/admin/reservations", libelle: "Voir les réservations" }}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TuileStat
            libelle="Départs à préparer"
            valeur={formatNombre(departsDuJour.length)}
            aide={
              departsDuJour.length === 0
                ? "Aucun vélo n'attend d'être remis."
                : "Vélos payés à sortir et à régler, client pas encore servi."
            }
          />
          <TuileStat
            libelle="Retours attendus"
            valeur={formatNombre(retoursDuJour.length)}
            aide={
              retoursDuJour.length === 0
                ? "Aucun vélo dehors dont le retour soit échu."
                : "Vélos sortis à récupérer et à contrôler."
            }
          />
          <TuileStat
            libelle="Paiements en attente"
            valeur={formatNombre(aPayer.length)}
            aide={
              aPayer.length === 0
                ? "Toutes les réservations sont réglées."
                : "Réservations enregistrées mais pas encore payées."
            }
          />
          <TuileStat
            libelle="Cocos à prévoir"
            valeur={formatNombre(aPrevoir.cocos)}
            aide={
              aPrevoir.cocos === 0 && aPrevoir.eaux === 0
                ? "Aucune sortie encadrée au départ aujourd'hui."
                : `Et ${formatNombre(aPrevoir.gateaux)} gâteau${aPrevoir.gateaux > 1 ? "x" : ""}, ` +
                  `${formatNombre(aPrevoir.eaux)} bouteille${aPrevoir.eaux > 1 ? "s" : ""} d'eau. ${AIDE_A_PREVOIR}`
            }
          />
          <TuileStat
            libelle="Cautions à encaisser"
            valeur={formatXof(cautionsAcollecter)}
            aide={
              cautionsAcollecter === 0
                ? "Aucune location libre au départ aujourd'hui."
                : "En espèces au départ, avec la pièce d'identité. À rendre au retour du vélo."
            }
          />
          <TuileStat
            libelle="Vélos disponibles"
            valeur={`${formatNombre(stats.velosDisponibles)} sur ${velos.length}`}
            aide="Ni sortis, ni immobilisés à l'atelier."
          />
        </div>
      </section>

      {/* ------------------------------------------ Ouverture des réservations */}
      <section className="mt-12" aria-labelledby="titre-ouverture">
        <TitreBloc
          id="titre-ouverture"
          titre="Ouverture des réservations"
          question="Montrer ou cacher les offres de groupe, fermer un départ ou un jour complet, et le rouvrir quand il y a de la place."
        />
        <PilotageOuverture
          creneaux={[
            // L'interrupteur des offres de groupe, en premier : désactivé par
            // défaut, il montre ou cache aux clients les trois offres d'un coup.
            {
              code: CODE_INTERRUPTEUR_OFFRES,
              libelle: "Offres de groupe",
              horaire: "Bike for All, Road trip en groupe, Gbashi Bike",
              actif: offresGroupe,
              mots: { actif: "Activées", inactif: "Désactivées", ouvrir: "Activer", fermer: "Désactiver" },
              confirmationOuverture:
                "Les trois offres de groupe vont apparaître sur le site et remplacer le road trip actuel du week-end. Les activer maintenant ?",
              remarque:
                (offresGroupe
                  ? "Activées : les clients voient Bike for All, le Road trip en groupe et Gbashi Bike, et les réservent en ligne. Elles remplacent le road trip actuel du week-end."
                  : "Désactivées : les trois offres de groupe sont cachées aux clients. Les activer les montre sur le site, à la place du road trip actuel du week-end.") +
                (reglagesOffresIllisibles ? " Attention : leurs réglages ne se lisent plus, la vente est bloquée." : ""),
            },
            ...CRENEAUX_ROAD_TRIP.map((c) => ({
              code: c.code,
              // Un départ qui porte le nom d'un produit le dit ici.
              libelle: c.produit ? `${c.libelle} · ${c.produit}` : c.libelle,
              // Les gammes qui roulent ce départ.
              horaire: `${c.heureDebut} h - ${c.heureFin} h · ${gammesDuDepart(c.code)}`,
              actif: ouverture.creneauxActifs.has(c.code),
              prochainDepart: departsProposes.find((d) => d.code === c.code)?.date,
              // Gbashi bike se commande sur WhatsApp : rien à ouvrir ni à
              // fermer, les commandes s'enregistrent au comptoir.
              ...(c.enLigne
                ? {}
                : {
                    surCommande: true,
                    remarque:
                      "Sur commande\u00a0: ne se réserve plus en ligne. Les clients écrivent sur WhatsApp, et la commande s'enregistre au comptoir.",
                  }),
            })),
            // Padel bike, réservé en ligne sur sa page : il se ferme d'un clic
            // quand le terrain n'est pas disponible, et se rouvre de même.
            {
              code: CODE_PADEL_BIKE,
              libelle: "Padel bike",
              horaire: `${programmeEnClair(padel)}, ${plageHorairePadel(padel)}`,
              actif: padelEnLigne,
              prochainDepart: padelEnLigne && padelLance ? premierJourPadel : undefined,
              // L'heure, les jours, le prix et le reste se règlent dans
              // Réglages des produits ; ici, seulement ouvrir ou fermer.
              remarque: padelLance
                ? padelEnLigne
                  ? premierJourPadel
                    ? `Ouvert : réservable ${delaiPadelEnClair(padel)}. Prochain départ proposé : ${formatDate(premierJourPadel)}.`
                    : "Ouvert, mais aucun départ programmé : ajoutez des jours ou des dates dans Réglages des produits."
                  : undefined
                : padelEnLigne
                  ? `Réservation en ligne à partir du ${jourOuverturePadel(padel)}, d'elle-même, pour les jours programmés dans Réglages des produits. D'ici là, la vente se fait au comptoir.`
                  : `Fermé : ne s'ouvrira pas en ligne le ${jourOuverturePadel(padel)} tant que vous ne l'aurez pas rouvert.`,
            },
            // Une ligne par jour de sortie Octobre rose : chacun s'ouvre et se
            // ferme seul.
            ...joursRose.map((etat) => ({
              code: etat.code,
              libelle: `Octobre rose · ${formatDateAvecJour(etat.sortie.date)}`,
              horaire: `${formatHoraire(etat.sortie.rassemblement)} - ${formatHoraire(etat.sortie.retour)}`,
              actif: etat.ouverteEnLigne,
              // Proposée tant que l'heure limite des inscriptions n'est pas passée.
              prochainDepart: etat.ouverteEnLigne && etat.inscriptionsOuvertes ? etat.sortie.date : undefined,
              remarque:
                etat.ouverteEnLigne && !etat.inscriptionsOuvertes
                  ? instantRose.getTime() >= clotureInscriptionsOctobreRose(etat.sortie)
                    ? `Inscriptions en ligne closes depuis ${formatHoraire(etat.sortie.finInscriptions)} ce jour-là : le comptoir vend encore jusqu'au départ.`
                    : "L'inscription en ligne s'ouvre en octobre."
                  : etat.ouverteEnLigne && etat.places === 0
                    ? "Ouvert, mais complet : plus aucun vélo libre ce jour-là (le site affiche « Sold out »)."
                    : etat.ouverteEnLigne
                      ? `Ouvert : ${etat.places} place${etat.places > 1 ? "s" : ""} libre${etat.places > 1 ? "s" : ""}.`
                      : undefined,
            })),
          ]}
          joursFermes={ouverture.joursFermes.filter((j) => j.date >= aujourdhuiBenin)}
          aujourdhui={aujourdhuiBenin}
        />
      </section>

      {/* -------------------------------------------------- Les deux formules */}
      <section className="mt-12" aria-labelledby="titre-formules">
        <TitreBloc
          id="titre-formules"
          titre={stats.parOffre.length > 2 ? "Les formules" : "Les deux formules"}
          question="Ce que chaque formule a vendu sur la période."
        />
        <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${stats.parOffre.length > 2 ? "lg:grid-cols-3" : ""}`}>
          {stats.parOffre.map((offre) => (
            <div
              key={offre.code}
              className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6"
            >
              <p className="text-[0.85rem] font-medium text-gris-cadre">{offre.nom}</p>
              <p className="mt-2 font-display text-[2.1rem] leading-none tabular-nums text-noir-piste">
                {formatXof(offre.chiffreAffaires)}
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[0.85rem]">
                <div>
                  <dt className="text-gris-cadre">Réservations</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">
                    {formatNombre(offre.reservations)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gris-cadre">
                    {offre.uniteVolume === "participants" ? "Participants" : "Heures vendues"}
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">
                    {formatNombre(offre.volume)}
                  </dd>
                </div>
              </dl>
              {offre.reservations === 0 && (
                <p className="mt-4 text-[0.8rem] leading-relaxed text-gris-cadre">
                  Aucune réservation sur cette formule pendant la période.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- Argent */}
      <section className="mt-12" aria-labelledby="titre-argent">
        <TitreBloc
          id="titre-argent"
          titre="L'argent"
          question="Ce qui a été encaissé pendant la période, quelle que soit la date de la sortie, et si c'est mieux qu'avant."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TuileStat
            libelle="Chiffre d'affaires"
            valeur={formatXof(stats.chiffreAffaires.valeur)}
            indicateur={stats.chiffreAffaires}
            aide="Aucune période précédente à comparer."
          />
          {/* Ce que la période rapporte réellement, frais de SasPay payés.
              Les frais sont compris dans les tarifs affichés : sans cette
              tuile, le tableau de bord annoncerait un encaissement que le
              compte ne verra jamais. Les espèces du comptoir n'en paient
              pas, et elles sont dans la caisse, pas sur SasPay : la tuile
              le dit. Le retrait vers la banque coûte en plus 1,5 % + 100 F,
              par versement et non par réservation, il n'a donc pas sa
              place ici. */}
          <TuileStat
            libelle="Encaissé net"
            valeur={formatXof(stats.encaisseNet)}
            aide={`Après ${formatXof(stats.fraisRetenus)} de frais d'encaissement SasPay (3,25 %) sur les paiements en ligne.${
              stats.encaisseEspeces > 0
                ? ` Dont ${formatXof(stats.encaisseEspeces)} en espèces, dans la caisse et non sur SasPay.`
                : ""
            } Le retrait vers la banque coûte 1,5 % + 100 F par versement.`}
          />
          <TuileStat
            libelle="Panier moyen"
            valeur={formatXof(stats.revenuMoyenParReservation.valeur)}
            indicateur={stats.revenuMoyenParReservation}
            aide="Montant moyen d'une réservation."
          />
          <TuileStat
            libelle="Réservations payées"
            valeur={formatNombre(stats.nombreReservations.valeur)}
            indicateur={stats.nombreReservations}
            aide="Annulations exclues."
          />
          {/* Les cautions ne sont jamais encaissées en ligne : elles ne
              font pas partie du chiffre d'affaires. Mais l'exploitant doit
              savoir combien de liquide est sorti et reste à rendre. */}
          <TuileStat
            libelle="Cautions en circulation"
            valeur={formatXof(stats.cautionsEnCirculation)}
            aide={
              stats.cautionsEnCirculation === 0
                ? "Aucun vélo dehors en location libre."
                : "Espèces détenues pour des vélos encore dehors. À rendre au retour, hors chiffre d'affaires."
            }
          />
        </div>
      </section>

      {/* ------------------------------------------------------ Exploitation */}
      <section className="mt-12" aria-labelledby="titre-exploitation">
        <TitreBloc
          id="titre-exploitation"
          titre="Comment tournent les vélos"
          question="Les sorties de la période : si le parc travaille assez, et si les clients vont au bout."
          action={{ href: "/admin/velos", libelle: "Gérer le parc" }}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Jauge
            libelle="Taux d'occupation"
            pourcentage={stats.tauxOccupation}
            detail={`Part des journées-vélo utilisées sur la période, pour un parc de ${velos.length} vélos. 100 % signifierait que chaque vélo sort chaque jour.`}
          />
          <TuileStat
            libelle="Participants emmenés"
            valeur={formatNombre(stats.participants.valeur)}
            indicateur={stats.participants}
            aide="Personnes parties en road trip sur la période."
          />
          <TuileStat
            libelle="Heures vendues"
            valeur={`${formatNombre(stats.heuresVendues.valeur)} h`}
            indicateur={stats.heuresVendues}
            aide="Total des heures de location libre sur la période."
          />
          <TuileStat
            libelle="Taux d'annulation"
            valeur={`${formatNombre(stats.tauxAnnulation.valeur, 1)} %`}
            indicateur={stats.tauxAnnulation}
            aide="Aucune annulation sur les deux périodes comparées."
            baisseSouhaitable
          />
          <TuileStat
            libelle="Vélos immobilisés"
            valeur={formatNombre(stats.velosEnEntretien)}
            aide="À l'atelier, donc non réservables."
          />
          <TuileStat
            libelle="Note moyenne"
            valeur={stats.noteMoyenne !== null ? `${formatNombre(stats.noteMoyenne, 2)} / 5` : "aucune note"}
            aide={`${stats.nombreAvis} avis laissés sur la période.`}
          />
        </div>
      </section>

      {/* --------------------------------------------------------- Tendances */}
      <section className="mt-12" aria-labelledby="titre-tendances">
        <TitreBloc
          id="titre-tendances"
          titre="Sur douze mois"
          question="La tendance de fond, indépendante de la période choisie plus haut."
        />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Courbe
            titre="Chiffre d'affaires par mois"
            sousTitre="Douze derniers mois, annulations exclues"
            points={stats.evolutionChiffreAffaires}
            dernierPointPartiel={stats.periodeEnCours}
          />
          <Colonnes
            titre="Départs par mois"
            sousTitre="Combien de locations commencent chaque mois"
            points={stats.saisonnalite}
            uniteInfobulle="Réservations"
          />
        </div>
      </section>

      {/* ------------------------------------------------------ Répartitions */}
      <section className="mt-12" aria-labelledby="titre-repartitions">
        <TitreBloc
          id="titre-repartitions"
          titre="Qui paie quoi, et avec quel vélo"
          question="Les répartitions sur la période choisie."
        />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <BarresHorizontales
            titre="Moyens de paiement"
            sousTitre="Montant encaissé par moyen"
            points={stats.repartitionPaiements}
            format="xof"
            uniteInfobulle="Montant"
          />
          <BarresHorizontales
            titre="Vélos les plus loués"
            sousTitre="Nombre de sorties sur la période"
            points={stats.velosLesPlusLoues}
            format="nombre"
            uniteInfobulle="Locations"
            limite={6}
          />
          <BarreEmpilee
            titre="Nouveaux ou habitués"
            sousTitre={`${totalClients} client${totalClients > 1 ? "s" : ""} ont réservé`}
            segments={[
              { clef: "nouveaux", etiquette: "Première location", valeur: stats.nouveauxClients },
              { clef: "recurrents", etiquette: "Déjà venus", valeur: stats.clientsRecurrents },
            ]}
            format="nombre"
          />
        </div>
      </section>
    </div>
  );
}
