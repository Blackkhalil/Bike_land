import Link from "next/link";

import { formatDateAvecJour, formatPlageReservation, resumeOffre } from "@/lib/format";
import type { RaisonVeloTouche, ReservationTouchee } from "@/lib/types";

const RAISONS: Record<RaisonVeloTouche, string> = {
  RETIRE: "retiré du parc",
  MAINTENANCE: "à l'atelier",
  INDISPONIBLE: "indisponible ce jour-là",
};

/** « Mardi 17 novembre » en tête de ligne. */
function jourAvecMajuscule(date: string): string {
  const texte = formatDateAvecJour(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * L'alerte du parc (cahier des charges, étape 1) : des réservations payées,
 * à venir ou en cours, dont un vélo n'est plus là. Retiré du parc, passé à
 * l'atelier, ou déclaré indisponible ce jour-là. Bike Land appelle chaque
 * client, numéro sous la main ; la réservation reste valable. Rien ne
 * s'affiche quand tout va bien. `touchees` à `null` : la vérification n'a
 * pas pu se faire, et l'écran le dit plutôt que de se taire.
 */
export function AlerteParc({ touchees }: { touchees: ReservationTouchee[] | null }) {
  if (touchees === null) {
    return (
      <p className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]">
        Les réservations payées n&apos;ont pas pu être comparées au parc. Rechargez la page dans un instant.
      </p>
    );
  }
  if (touchees.length === 0) return null;
  const n = touchees.length;

  return (
    <section
      aria-labelledby="titre-alerte-parc"
      className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 p-4 sm:p-6"
    >
      <h2 id="titre-alerte-parc" className="titre-editorial text-[1.4rem]">
        Appelez ces clients
      </h2>
      <p className="mt-1.5 max-w-2xl text-[0.86rem] leading-relaxed">
        {n > 1
          ? `${n} réservations payées n'ont plus tous leurs vélos`
          : "Une réservation payée n'a plus tous ses vélos"}{" "}
        : un vélo retiré du parc, à l&apos;atelier, ou indisponible ce jour-là. La réservation reste
        valable : proposez un autre vélo ou un autre créneau.
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {touchees.map((reservation) => (
          <li key={reservation.reference} className="rounded-[var(--radius-bouton)] bg-white p-4 text-[0.86rem]">
            <p className="font-semibold">
              {jourAvecMajuscule(reservation.dateDebut)}, {formatPlageReservation(reservation)}
            </p>
            <p className="mt-1">
              {reservation.client.prenom} {reservation.client.nom}
              {reservation.client.telephone ? (
                <>
                  {" · "}
                  <a
                    href={`tel:${reservation.client.telephone.replace(/\s/g, "")}`}
                    className="lien-souligne cible-elargie whitespace-nowrap font-semibold"
                  >
                    {reservation.client.telephone}
                  </a>
                </>
              ) : (
                <span className="text-gris-cadre"> · pas de numéro, voir l&apos;email sur la fiche</span>
              )}
            </p>
            <p className="mt-0.5 text-[0.8rem] text-gris-cadre">
              {resumeOffre(reservation)} ·{" "}
              <Link
                href={`/admin/reservations?detail=${encodeURIComponent(reservation.reference)}`}
                className="lien-souligne font-mono"
              >
                {reservation.reference}
              </Link>
            </p>
            <ul className="mt-2 space-y-0.5 text-[0.82rem]">
              {reservation.velos.map((velo) => (
                <li key={velo.veloId}>
                  <span className="font-semibold">{velo.veloNom}</span> : {RAISONS[velo.raison]}
                  {velo.motif ? ` (${velo.motif})` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
