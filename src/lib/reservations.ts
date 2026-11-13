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
 *    reparti à la vente ; un paiement tardif peut encore la confirmer, ou
 *    être remboursé.
 *
 * Depuis la décision 27 du responsable (13 novembre 2026), une demande en
 * attente ou abandonnée n'apparaît nulle part dans l'administration et ne
 * déclenche aucun email : elle ne devient visible qu'une fois payée
 * (`jamaisPayee`), et la tâche quotidienne efface celles jamais payées.
 */

import { COCOS_ROAD_TRIP, estOffreGroupe, EXPIRATION_PANIER_MINUTES, panierExpire } from "@/data/offres";
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
 * repris entre-temps, ou après l'annulation d'une demande jamais
 * confirmée. L'identifiant de la transaction y est noté, et l'argent est à
 * rembourser : ce n'est pas un panier abandonné, la réservation se voit dans
 * l'administration et ne s'efface jamais.
 *
 * En démonstration, tout paiement en ligne naît avec une référence
 * provisoire « TX-… » : elle ne compte pas.
 */
export function paiementARembourser(reservation: {
  statut: StatutReservation;
  confirmeLe?: string;
  paiements?: Paiement[];
}): boolean {
  const recu = (reservation.paiements ?? []).some((paiement) => !paiement.estCaution && referenceRecue(paiement));
  // Payée après l'annulation d'une demande jamais confirmée : l'argent est
  // arrivé sur une demande qui ne pouvait plus le prendre, il est à rendre
  // aussi (`confirmerParSasPay`, issue « annulée »).
  const annuleeAvantPaiement =
    reservation.statut === "ANNULEE" &&
    !reservation.confirmeLe &&
    !(reservation.paiements ?? []).some((paiement) => !paiement.estCaution && paiement.statut === "REMBOURSE");
  return recu && (reservation.statut === "EN_ATTENTE_PAIEMENT" || annuleeAvantPaiement);
}

/**
 * Vrai pour une référence de transaction réellement reçue : un identifiant
 * SasPay, ou la référence d'une saisie au comptoir. La référence provisoire
 * « TX-… » qu'un paiement en ligne porte dès sa création en démonstration ne
 * compte pas (en base, il naît sans).
 */
export function referenceRecue(paiement: Pick<Paiement, "referenceFournisseur">): boolean {
  return Boolean(paiement.referenceFournisseur) && !paiement.referenceFournisseur?.startsWith("TX-");
}

/**
 * Vrai pour une demande que le client n'a jamais payée (décision 27 du
 * responsable, 13 novembre 2026) : en attente de paiement, ou annulée, sans
 * avoir jamais été confirmée, ni encaissée, ni remboursée, et sans
 * identifiant de paiement reçu (un paiement arrivé trop tard, ou sur une
 * demande annulée, est de l'argent à rendre : il se voit).
 *
 * Ce n'est qu'une note technique, qui retient les vélos le temps du
 * paiement et permet de le rattacher : elle n'apparaît nulle part dans
 * l'administration (listes, recherche, chiffres, clients, exports, journal),
 * et la tâche quotidienne l'efface (`DELAI_EFFACEMENT_DEMANDES_HEURES`). Une
 * réservation payée puis annulée ou remboursée, elle, reste visible. Les
 * deux dépôts appliquent la même règle (en base, `jamaisPayeeEnBase`), qui
 * tient aussi compte des remboursements notés dans l'administration.
 */
export function jamaisPayee(reservation: {
  statut: StatutReservation;
  confirmeLe?: string;
  paiements?: Paiement[];
}): boolean {
  if (reservation.statut !== "EN_ATTENTE_PAIEMENT" && reservation.statut !== "ANNULEE") return false;
  if (reservation.confirmeLe) return false;
  return !(reservation.paiements ?? []).some(
    (paiement) =>
      !paiement.estCaution &&
      (paiement.statut === "REUSSI" || paiement.statut === "REMBOURSE" || referenceRecue(paiement)),
  );
}

/**
 * Combien de temps une demande jamais payée reste en base après la fin du
 * délai de paiement, avant que la tâche quotidienne ne l'efface.
 *
 * Un paiement arrivé après le délai est encore traité, sans limite de temps
 * dans le code (`confirmerParSasPay`) : il confirme la réservation si les
 * vélos sont libres, sinon le remboursement est noté. La relance du paiement
 * n'est proposée que pendant le délai, et une demande Mobile Money expire en
 * quelques minutes : 48 heures laissent largement le temps à une
 * notification de SasPay en retard, ou rejouée, de trouver sa demande.
 */
export const DELAI_EFFACEMENT_DEMANDES_HEURES = 48;

/**
 * L'instant (ISO) avant lequel une demande jamais payée, créée plus tôt, peut
 * être effacée : délai de paiement, plus `DELAI_EFFACEMENT_DEMANDES_HEURES`.
 */
export function limiteEffacementDemandes(maintenant = Date.now()): string {
  return new Date(
    maintenant - EXPIRATION_PANIER_MINUTES * 60_000 - DELAI_EFFACEMENT_DEMANDES_HEURES * 3_600_000,
  ).toISOString();
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
 *
 * Une offre de groupe a les siens, comptés à la réservation selon le
 * budget et les réglages du moment (`offreDetails.cocos`) : ce nombre-là, et
 * aucun autre. Sans lui, zéro, plutôt qu'un nombre deviné.
 */
export function cocosDe(
  reservation: Pick<Reservation, "offre" | "nombrePersonnes"> & Partial<Pick<Reservation, "offreDetails">>,
): number {
  if (estOffreGroupe(reservation.offre)) return quantiteDe(reservation.offreDetails?.cocos);
  return reservation.offre === "road-trip" || reservation.offre === "gbashi-bike"
    ? reservation.nombrePersonnes * COCOS_ROAD_TRIP
    : 0;
}

/**
 * Ce que le calcul d'une offre de groupe a prévu de préparer pour le
 * groupe : cocos, gâteaux, bouteilles d'eau (`offreDetails`). Zéro pour
 * tout ce qu'il ne dit pas, et pour les autres formules.
 */
export function aPreparerOffreGroupe(
  reservation: Pick<Reservation, "offre"> & Partial<Pick<Reservation, "offreDetails">>,
): { cocos: number; gateaux: number; eaux: number } {
  if (!estOffreGroupe(reservation.offre)) return { cocos: 0, gateaux: 0, eaux: 0 };
  const details = reservation.offreDetails;
  return {
    cocos: quantiteDe(details?.cocos),
    gateaux: quantiteDe(details?.gateaux),
    eaux: quantiteDe(details?.eaux),
  };
}

/** Un nombre de choses à préparer, lu dans l'instantané : entier positif, ou zéro. */
function quantiteDe(valeur: unknown): number {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : 0;
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
