/**
 * La pénalité de retard des offres de groupe (cahier des charges, étape 9) :
 * une tolérance, puis un montant par minute, pour tout le groupe. Affichée
 * avant le paiement et dans le récapitulatif ; saisie par Bike Land au
 * retour des vélos (« minutes de retard »), payée en espèces (décision 9).
 *
 * Fonction pure : les réglages arrivent en paramètre, rien n'est écrit ici.
 */

import type { ReglagesOffres } from "@/data/reglages-offres";

/** Le montant dû pour un retard de `minutesRetard` minutes, zéro dans la tolérance. */
export function penaliteRetardXof(minutesRetard: number, reglages: Pick<ReglagesOffres, "retard">): number {
  const minutes = Math.max(0, Math.floor(minutesRetard));
  const facturees = Math.max(0, minutes - reglages.retard.toleranceMinutes);
  return facturees * reglages.retard.penaliteParMinuteXof;
}
