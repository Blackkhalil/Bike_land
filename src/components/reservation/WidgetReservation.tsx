"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Bouton } from "@/components/Bouton";
import type { Velo } from "@/lib/types";
import type { DateISO } from "@/lib/dates";
import { Calendrier, type PeriodeOccupee } from "./Calendrier";

/**
 * Encart de réservation de la fiche produit.
 *
 * Volontairement réduit au strict minimum : le vélo est déjà choisi
 * puisqu'on est sur sa fiche, il ne reste qu'à dire quel jour. La
 * formule — road trip encadré ou location libre — se choisit à l'étape
 * suivante, où il y a la place de montrer ce que chacune implique
 * (prix, caution, pièce d'identité).
 *
 * Une sortie comme une location libre tiennent dans la journée : on ne
 * demande donc qu'une date, pas une période.
 */
export function WidgetReservation({
  velo,
  periodesOccupees,
  datesInitiales,
}: {
  velo: Velo;
  periodesOccupees: PeriodeOccupee[];
  datesInitiales?: { debut: DateISO; fin: DateISO };
}) {
  const routeur = useRouter();
  const [jour, setJour] = useState<DateISO | null>(datesInitiales?.debut ?? null);
  const [redirection, setRedirection] = useState(false);

  const indisponible = velo.statut === "MAINTENANCE" || velo.statut === "RETIRE";

  const continuer = () => {
    if (!jour) return;
    setRedirection(true);
    routeur.push(`/reservation?velo=${velo.slug}&debut=${jour}&fin=${jour}`);
  };

  return (
    <div className="rounded-[var(--radius-bloc)] border border-noir-piste/10 bg-white p-6 sm:p-7">
      {indisponible ? (
        <div className="rounded-[var(--radius-carte)] bg-orange-signal/15 p-5 text-[0.9rem] leading-relaxed text-orange-sourd">
          Ce vélo est actuellement à l&apos;atelier. Écrivez-nous pour connaître sa date de retour
          ou pour qu&apos;on vous propose un modèle équivalent.
        </div>
      ) : (
        <>
          <p className="text-[0.95rem] font-semibold">Quel jour voulez-vous rouler ?</p>

          <div className="mt-4">
            <Calendrier
              periodesOccupees={periodesOccupees}
              debut={jour}
              fin={null}
              nombreDeMois={1}
              onChange={(nouveauJour) => setJour(nouveauJour)}
            />
          </div>

          <Bouton
            onClick={continuer}
            disabled={!jour || redirection}
            taille="lg"
            className="mt-6 w-full"
          >
            {redirection ? "Un instant…" : !jour ? "Choisissez une date" : "Réserver ce vélo"}
          </Bouton>

          <p className="mt-3 text-center text-[0.76rem] text-gris-cadre">
            Aucun compte à créer. Formule et paiement à l&apos;étape suivante.
          </p>
        </>
      )}
    </div>
  );
}
