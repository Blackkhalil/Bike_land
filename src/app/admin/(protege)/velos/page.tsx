import type { Metadata } from "next";
import Link from "next/link";

import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { libellesCategorie, libellesStatut } from "@/data/catalogue";
import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";
import { formatDate, formatNombre, formatXof } from "@/lib/format";
import type { StatutVelo } from "@/lib/types";

export const metadata: Metadata = { title: "Parc de vélos" };

const tons: Record<StatutVelo, "succes" | "info" | "alerte" | "neutre"> = {
  DISPONIBLE: "succes",
  EN_LOCATION: "info",
  MAINTENANCE: "alerte",
  RETIRE: "neutre",
};

export default async function PageParcAdmin() {
  const [velos, reservations, points] = await Promise.all([
    depot.listerVelos(),
    depot.listerReservations(),
    depot.listerPointsDeRetrait(),
  ]);

  const jour = aujourdhui();
  const actives = reservations.filter((reservation) => reservation.statut !== "ANNULEE");

  const fiches = velos.map((velo) => {
    const locations = actives.filter((reservation) =>
      reservation.lignes.some((ligne) => ligne.veloId === velo.id),
    );
    const enCours = locations.find(
      (reservation) => reservation.dateDebut <= jour && reservation.dateFin >= jour,
    );
    const prochaine = locations
      .filter((reservation) => reservation.dateDebut > jour)
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1))[0];

    const revenus = locations.reduce((total, reservation) => total + reservation.totalXof, 0);
    const joursLoues = locations.reduce((total, reservation) => total + reservation.jours, 0);

    return { velo, locations, enCours, prochaine, revenus, joursLoues };
  });

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiquette opacity-55">Exploitation</p>
          <h1 className="titre-editorial mt-3 text-[2rem]">Parc de vélos</h1>
          <p className="mt-2 text-[0.88rem] text-encre-500">
            {velos.length} vélos en service, répartis sur {points.length} points de retrait.
          </p>
        </div>
      </header>

      <div className="mt-8 space-y-4">
        {fiches.map(({ velo, locations, enCours, prochaine, revenus, joursLoues }) => {
          const point = points.find((p) => p.id === velo.pointDeRetraitId);
          const statutEffectif: StatutVelo =
            velo.statut === "MAINTENANCE" ? "MAINTENANCE" : enCours ? "EN_LOCATION" : velo.statut;

          return (
            <article key={velo.id} className="rounded-[1.25rem] bg-white p-6">
              <div className="flex flex-wrap items-start gap-6">
                <div
                  className="grid h-24 w-36 shrink-0 place-items-center rounded-xl px-3"
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
                  <p className="mt-2 text-[0.85rem] text-encre-500">
                    {libellesCategorie[velo.categorie]} · taille {velo.taille} ·{" "}
                    {point ? `${point.nom}, ${point.ville}` : "point non affecté"}
                  </p>
                  <p className="mt-1 text-[0.85rem] text-encre-500">
                    {formatXof(velo.prixJourXof)} / jour · caution {formatXof(velo.cautionXof)}
                  </p>

                  <p className="mt-3 text-[0.85rem]">
                    {enCours ? (
                      <>
                        <strong className="font-semibold text-terre-700">Sorti</strong> — retour
                        prévu le {formatDate(enCours.dateFin)} ({enCours.client.prenom}{" "}
                        {enCours.client.nom}, {enCours.reference})
                      </>
                    ) : prochaine ? (
                      <>
                        Prochaine sortie le {formatDate(prochaine.dateDebut)} (
                        {prochaine.client.prenom} {prochaine.client.nom})
                      </>
                    ) : velo.statut === "MAINTENANCE" ? (
                      "Immobilisé à l'atelier, non réservable."
                    ) : (
                      "Aucune réservation à venir."
                    )}
                  </p>
                </div>

                <dl className="grid shrink-0 grid-cols-3 gap-6 text-[0.8rem] sm:gap-8">
                  <div>
                    <dt className="text-encre-500">Locations</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatNombre(locations.length)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-encre-500">Jours loués</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatNombre(joursLoues)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-encre-500">Revenus</dt>
                    <dd className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">
                      {formatXof(revenus)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 border-t border-encre-900/10 pt-4 text-[0.82rem]">
                <Link
                  href={`/velos/${velo.slug}`}
                  className="lien-souligne font-semibold text-terre-700"
                >
                  Voir la fiche publique
                </Link>
                <Link
                  href={`/admin/reservations?reference=${velo.nom}`}
                  className="lien-souligne font-semibold text-terre-700"
                >
                  Historique des locations
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-8 rounded-[1.25rem] border border-encre-900/12 p-6 text-[0.85rem] leading-relaxed text-encre-500">
        L&apos;ajout, la modification et le retrait de vélos passent aujourd&apos;hui par le jeu de
        données du projet (<code className="font-mono">src/data/catalogue.ts</code>) ou par la base
        PostgreSQL. Un formulaire d&apos;édition en ligne est le prolongement naturel de cet écran,
        une fois le parc stabilisé.
      </p>
    </div>
  );
}
