/**
 * Numérotation des factures.
 *
 * Le numéro doit être stable pour une réservation donnée — une facture
 * renvoyée deux fois porte le même numéro — et lisible par la comptabilité.
 * Format : FA-AAAA-XXXXXX, où le suffixe reprend la référence de la
 * réservation, déjà unique.
 */

import type { Reservation } from "./types";

export function numeroDeFacture(reservation: Reservation): string {
  const annee = (reservation.confirmeLe ?? reservation.creeLe).slice(0, 4);
  return `FA-${annee}-${reservation.reference.replace(/^BL-/, "")}`;
}
