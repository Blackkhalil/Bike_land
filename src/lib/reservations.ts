/**
 * Ce qui compte comme une réservation, et ce qui n'est qu'un panier.
 *
 * Une réservation n'existe qu'une fois payée. Avant cela, il n'y a qu'un
 * vélo retenu pendant quelques minutes, le temps que le client valide la
 * demande sur son téléphone. Ce n'est ni un engagement, ni une vente, ni
 * une ligne de chiffre d'affaires.
 *
 * La distinction manquait, et elle coûtait cher : le tableau de bord
 * comptait tout ce qui n'était pas annulé, donc les paniers abandonnés
 * entraient dans le chiffre d'affaires, dans le panier moyen et dans le
 * taux d'occupation. Les sommes affichées n'avaient jamais été
 * encaissées, et personne n'aurait su le voir en les relisant.
 *
 * Trois notions, à ne pas confondre :
 *
 *  - **payée** : le client a réglé. C'est la seule qui compte comme
 *    réservation et comme recette.
 *  - **en attente** : la demande vient de partir sur son téléphone, le
 *    vélo lui est retenu. Elle peut encore devenir une réservation.
 *  - **abandonnée** : le délai est passé sans paiement. Le vélo est
 *    reparti à la vente, et cette ligne ne redeviendra jamais rien.
 */

import { EXPIRATION_PANIER_MINUTES, panierExpire } from "@/data/offres";
import type { Reservation, StatutReservation } from "@/lib/types";

export { EXPIRATION_PANIER_MINUTES };

/** Les états qui attestent d'un paiement reçu. */
const PAYEES: StatutReservation[] = ["CONFIRMEE", "EN_COURS", "TERMINEE"];

/**
 * Vrai si le client a payé.
 *
 * C'est le seul critère qui vaille pour compter une vente, une
 * réservation ou une occupation. `ANNULEE` en est exclu : une
 * réservation annulée a pu être payée puis remboursée, et la compter
 * comme une recette en cours serait faux.
 */
export function estPayee(reservation: { statut: StatutReservation }): boolean {
  return PAYEES.includes(reservation.statut);
}

/** Vrai si le vélo est encore retenu, en attente du paiement. */
export function estEnAttente(reservation: {
  statut: StatutReservation;
  creeLe: string;
}): boolean {
  return reservation.statut === "EN_ATTENTE_PAIEMENT" && !panierExpire(reservation.creeLe);
}

/**
 * Vrai si le délai est passé sans paiement.
 *
 * Ces lignes ne bloquent plus aucun vélo, mais elles restent en base. Il
 * faut donc les reconnaître pour ne pas les présenter comme des
 * réservations à venir dans l'espace d'exploitation.
 */
export function estAbandonnee(reservation: {
  statut: StatutReservation;
  creeLe: string;
}): boolean {
  return reservation.statut === "EN_ATTENTE_PAIEMENT" && panierExpire(reservation.creeLe);
}

/**
 * Ne garde que les réservations payées.
 *
 * À utiliser partout où l'on compte de l'argent ou des sorties : chiffre
 * d'affaires, panier moyen, taux d'occupation, classement des vélos,
 * fiches clients.
 */
export function seulementPayees<T extends { statut: StatutReservation }>(
  reservations: T[],
): T[] {
  return reservations.filter(estPayee);
}

/** Comment nommer l'état d'un panier non payé, pour l'exploitant. */
export function libelleAttente(reservation: {
  statut: StatutReservation;
  creeLe: string;
}): "en attente" | "abandonnée" | null {
  if (reservation.statut !== "EN_ATTENTE_PAIEMENT") return null;
  return panierExpire(reservation.creeLe) ? "abandonnée" : "en attente";
}

/** Les paniers abandonnés d'une liste, les seuls qu'il soit sûr d'effacer. */
export function paniersAbandonnes<T extends { statut: StatutReservation; creeLe: string }>(
  reservations: T[],
): T[] {
  return reservations.filter(estAbandonnee);
}

/** Vrai si cette réservation a déjà fait entrer de l'argent. */
export function aEncaisse(reservation: Reservation): boolean {
  return reservation.paiements.some(
    (paiement) => !paiement.estCaution && paiement.statut === "REUSSI",
  );
}
