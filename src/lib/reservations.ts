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

import { COCOS_ROAD_TRIP, EXPIRATION_PANIER_MINUTES, panierExpire } from "@/data/offres";
import { ajouterJours, type DateISO } from "@/lib/dates";
import type { Paiement, Reservation, StatutReservation } from "@/lib/types";

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
 * Vrai si un paiement est arrivé sur cette réservation alors qu'elle ne
 * pouvait plus le prendre : payée après son délai, le vélo ayant été
 * repris entre-temps. L'identifiant de la transaction y est noté, et
 * l'argent est à rembourser : ce n'est pas un panier abandonné, et la
 * ligne ne doit surtout pas être effacée avec eux.
 *
 * En démonstration, tout paiement en ligne naît avec une référence
 * provisoire « TX-… » : elle ne compte pas.
 */
export function paiementARembourser(reservation: {
  statut: StatutReservation;
  paiements?: Paiement[];
}): boolean {
  return (
    reservation.statut === "EN_ATTENTE_PAIEMENT" &&
    (reservation.paiements ?? []).some(
      (paiement) =>
        !paiement.estCaution &&
        Boolean(paiement.referenceFournisseur) &&
        !paiement.referenceFournisseur?.startsWith("TX-"),
    )
  );
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
  paiements?: Paiement[];
}): boolean {
  return (
    reservation.statut === "EN_ATTENTE_PAIEMENT" &&
    panierExpire(reservation.creeLe) &&
    !paiementARembourser(reservation)
  );
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
export function paniersAbandonnes<
  T extends { statut: StatutReservation; creeLe: string; paiements?: Paiement[] },
>(
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

/** Le règlement de la réservation, caution exclue. */
export function paiementPrincipal(reservation: Reservation): Paiement | undefined {
  return reservation.paiements.find((paiement) => !paiement.estCaution);
}

/**
 * Les cocos à offrir au retour d'un road trip, et de Gbashi bike : deux
 * par personne, quelle que soit la gamme (`COCOS_ROAD_TRIP`), comme le
 * devis les promet au client. Zéro ailleurs : Octobre rose a son propre
 * compte, Padel bike n'en promet pas.
 */
export function cocosDe(reservation: Pick<Reservation, "offre" | "nombrePersonnes">): number {
  return reservation.offre === "road-trip" || reservation.offre === "gbashi-bike"
    ? reservation.nombrePersonnes * COCOS_ROAD_TRIP
    : 0;
}

/**
 * Vrai pour une vente au comptoir : réglée en espèces, de la main à la
 * main, et saisie dans l'administration. Elle ne passe pas par SasPay.
 */
export function estVenteEspeces(reservation: Reservation): boolean {
  return paiementPrincipal(reservation)?.moyen === "ESPECES";
}

/**
 * Ce qu'une annulation par le client lui rend, selon l'article 5 des CGV :
 * tout jusqu'à 72 heures avant le départ, la moitié ensuite. Le jour se lit
 * comme sur la page de suivi, qui annonce au client si l'annulation est
 * gratuite.
 */
export function montantARendre(
  reservation: Pick<Reservation, "totalXof" | "dateDebut">,
  dateAnnulation: DateISO,
): number {
  const gratuite = dateAnnulation <= ajouterJours(reservation.dateDebut, -3);
  return gratuite ? reservation.totalXof : reservation.totalXof - Math.round(reservation.totalXof / 2);
}
