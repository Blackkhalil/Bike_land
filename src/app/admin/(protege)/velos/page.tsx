import type { Metadata } from "next";
import Link from "next/link";

import { ControlesVelo } from "@/components/admin/ControlesVelo";
import { FormulaireNouveauVelo } from "@/components/admin/FormulaireNouveauVelo";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { libellesStatut } from "@/data/catalogue";
import { seulementPayees } from "@/lib/reservations";
import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";
import { formatDate, formatNombre, formatXof, resumeOffre } from "@/lib/format";
import type { StatutVelo } from "@/lib/types";

export const metadata: Metadata = { title: "Parc de vélos" };

const tons: Record<StatutVelo, "succes" | "info" | "alerte" | "neutre"> = {
  DISPONIBLE: "succes",
  EN_LOCATION: "info",
  MAINTENANCE: "alerte",
  RETIRE: "neutre",
};

/**
 * Le parc, vélo par vélo.
 *
 * Une fiche par machine : où elle est, ce qu'elle fait en ce moment, ce
 * qu'elle a rapporté, et le seul réglage qui se change en exploitation,
 * son statut.
 *
 * Trois choix méritent d'être expliqués :
 *
 *  - **Aucun montant n'est porté par le vélo.** Ni prix, ni caution. Le
 *    tarif vient de la formule et la caution est un forfait unique de la
 *    location libre (cf. `src/data/offres.ts`). L'ancienne ligne
 *    « valeur de remplacement » affichait une caution par machine héritée
 *    d'un modèle abandonné : elle laissait croire que le vélo choisi
 *    changeait la note.
 *
 *  - **Le volume se compte en participants ET en heures.** Un décompte en
 *    jours ne dirait plus rien : toute sortie tient dans la journée, donc
 *    « jours loués » valait exactement le nombre de sorties.
 *
 *  - **« Sorti » se lit dans le statut, pas dans les dates.** Un vélo est
 *    dehors parce que le coordinateur l'a remis, et l'écran rappelle alors
 *    ce qu'il détient en échange : caution et pièce d'identité.
 *
 * Les vélos retirés restent affichés (`inclureRetires`) : l'exploitant
 * doit pouvoir en remettre un en service, ce que le site public ne montre
 * plus.
 */
export default async function PageParcAdmin() {
  const [velos, reservations, points] = await Promise.all([
    depot.listerVelos({ inclureRetires: true }),
    depot.listerReservations(),
    depot.listerPointsDeRetrait(),
  ]);

  const jour = aujourdhui();
  // Les revenus et sorties par vélo ne comptent que le payé.
  const actives = seulementPayees(reservations);

  const fiches = velos.map((velo) => {
    const sorties = actives.filter((reservation) =>
      reservation.lignes.some((ligne) => ligne.veloId === velo.id),
    );

    // Un vélo est dehors parce que le coordinateur l'a effectivement
    // remis, pas parce que la date est arrivée : c'est la même règle que
    // sur la fiche du jour et le tableau de bord.
    const enCours = sorties.find((reservation) => reservation.statut === "EN_COURS");
    const prochaine = sorties
      .filter((reservation) => reservation.statut === "CONFIRMEE" && reservation.dateDebut >= jour)
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1))[0];

    const revenus = sorties.reduce((total, reservation) => total + reservation.totalXof, 0);
    // Le volume ne se compte pas de la même façon selon la formule : des
    // participants d'un côté, des heures de l'autre. Le nombre de jours
    // ne veut plus rien dire, toute sortie tenant dans la journée.
    const participants = sorties
      .filter((reservation) => reservation.offre === "road-trip")
      .reduce((total, reservation) => total + reservation.nombrePersonnes, 0);
    const heures = sorties
      .filter((reservation) => reservation.offre === "location-libre")
      .reduce((total, reservation) => total + (reservation.dureeHeures ?? 0), 0);

    return { velo, sorties, enCours, prochaine, revenus, participants, heures };
  });

  const enService = velos.filter((velo) => velo.statut !== "RETIRE").length;
  const retires = velos.length - enService;
  const dehors = fiches.filter((fiche) => fiche.enCours).length;
  const atelier = velos.filter((velo) => velo.statut === "MAINTENANCE").length;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiquette opacity-75">Exploitation</p>
          <h1 className="titre-editorial mt-3 text-[2rem]">Parc de vélos</h1>
          <p className="mt-2 text-[0.88rem] text-gris-cadre">
            {enService} vélo{enService > 1 ? "s" : ""} en service, {dehors} dehors,{" "}
            {atelier} à l&apos;atelier, {Math.max(enService - dehors - atelier, 0)} disponible
            {enService - dehors - atelier > 1 ? "s" : ""}.
            {retires > 0 && ` ${retires} retiré${retires > 1 ? "s" : ""} du parc.`}
          </p>
        </div>
      </header>

      <div className="mt-8 space-y-4">
        {fiches.map(({ velo, sorties, enCours, prochaine, revenus, participants, heures }) => {
          const point = points.find((p) => p.id === velo.pointDeRetraitId);
          const statutEffectif: StatutVelo =
            velo.statut === "MAINTENANCE" ? "MAINTENANCE" : enCours ? "EN_LOCATION" : velo.statut;

          return (
            <article key={velo.id} className="rounded-[var(--radius-carte)] bg-white p-6">
              <div className="flex flex-wrap items-start gap-6">
                <div
                  className="grid h-24 w-36 shrink-0 place-items-center rounded-[var(--radius-bouton)] px-3"
                  style={{ background: velo.teintes[1] }}
                >
                  <VeloIllustration
                    categorie={velo.categorie}
                    teintes={velo.teintes}
                    className="w-full"
                  />
                </div>

                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[1.2rem] font-extrabold uppercase leading-none">
                      {velo.nom}
                    </h2>
                    <Pastille ton={tons[statutEffectif]}>{libellesStatut[statutEffectif]}</Pastille>
                  </div>
                  <p className="mt-2 text-[0.85rem] text-gris-cadre">
                    {point ? `${point.nom}, ${point.ville}` : "point non affecté"}
                  </p>
                  <p className="mt-3 text-[0.85rem]">
                    {enCours ? (
                      <>
                        <strong className="font-semibold text-orange-sourd">Sorti</strong>,{" "}
                        {resumeOffre(enCours)}, avec {enCours.client.prenom} {enCours.client.nom} (
                        {enCours.reference}).
                        {enCours.cautionXof > 0 &&
                          ` Vous détenez ${formatXof(enCours.cautionXof)} et sa pièce d'identité.`}
                      </>
                    ) : prochaine ? (
                      <>
                        Prochaine sortie le {formatDate(prochaine.dateDebut)},{" "}
                        {resumeOffre(prochaine)}, avec {prochaine.client.prenom}{" "}
                        {prochaine.client.nom}.
                      </>
                    ) : velo.statut === "MAINTENANCE" ? (
                      "Immobilisé à l'atelier, non réservable."
                    ) : velo.statut === "RETIRE" ? (
                      "Retiré du parc : n'apparaît plus sur le site."
                    ) : (
                      "Aucune sortie à venir."
                    )}
                  </p>
                </div>

                <dl className="grid shrink-0 grid-cols-2 gap-6 text-[0.8rem] sm:grid-cols-4 sm:gap-8">
                  <div>
                    <dt className="text-gris-cadre">Sorties</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatNombre(sorties.length)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gris-cadre">Participants</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatNombre(participants)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gris-cadre">Heures louées</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatNombre(heures)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gris-cadre">Revenus</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatXof(revenus)}
                    </dd>
                  </div>
                </dl>
              </div>

              <ControlesVelo velo={velo} />

              <div className="mt-5 flex flex-wrap gap-3 border-t border-noir-piste/10 pt-4 text-[0.82rem]">
                <Link
                  href={`/velos/${velo.slug}`}
                  className="lien-souligne font-semibold text-orange-sourd"
                >
                  Voir la fiche publique
                </Link>
                <Link
                  href={`/admin/reservations?reference=${encodeURIComponent(velo.nom)}`}
                  className="lien-souligne font-semibold text-orange-sourd"
                >
                  Historique des sorties
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <FormulaireNouveauVelo points={points} />

      <p className="mt-8 rounded-[var(--radius-carte)] border border-noir-piste/12 p-6 text-[0.85rem] leading-relaxed text-gris-cadre">
        Pour sortir un vélo du parc, passez-le en{" "}
        <strong className="text-noir-piste">Retiré du parc</strong> sur sa fiche ci-dessus : il
        disparaît du site public et son historique reste consultable. Il n&apos;existe
        volontairement pas de suppression définitive : elle détacherait les réservations passées
        des factures déjà envoyées.
      </p>
    </div>
  );
}
