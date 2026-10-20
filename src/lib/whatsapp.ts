/**
 * Le message WhatsApp d'une réservation.
 *
 * Juste après un paiement en ligne, le client est envoyé sur WhatsApp, sur
 * la ligne d'Ulrich (la seconde de `site.whatsapp`, celle de `lienWhatsApp`),
 * avec un message déjà écrit qui reprend toute sa réservation : il n'a qu'à
 * appuyer sur « Envoyer » pour l'avoir sous la main dans WhatsApp. La page
 * de suivi garde un bouton qui fait de même, et l'email de confirmation
 * porte le même lien, avec le même message.
 *
 * C'est le client qui envoie : un message parti de Bike Land de lui-même
 * demanderait l'API WhatsApp Business.
 *
 * Rien ici ne dépend du serveur : la page de suivi, l'email et un composant
 * du navigateur construisent exactement le même message, à partir de la
 * réservation et de son lien de suivi.
 */

import { formatHoraire, sortieDeLaReservation, texteOffertOctobreRose } from "@/data/octobre-rose";

import { formatCreneau, formatXof, resumeOffre } from "./format";
import { estPayee } from "./reservations";
import { lienWhatsApp, site } from "./site";
import { fraisEncaissement } from "./tarifs-paiement";
import type { Reservation } from "./types";

/** L'espace insécable de la typographie française, avant « : ». */
const INSECABLE = String.fromCharCode(0xa0);

/** Ce que le message lit d'une réservation : une `Reservation` du domaine convient. */
export type ReservationWhatsApp = Pick<
  Reservation,
  | "reference"
  | "statut"
  | "offre"
  | "nombrePersonnes"
  | "dureeHeures"
  | "dateDebut"
  | "heureDebut"
  | "heureFin"
  | "lignes"
  | "cautionXof"
  | "totalXof"
  | "paiements"
  | "client"
>;

/** « Référence : BL-4F2K9Q », une information par ligne. */
const ligne = (libelle: string, valeur: string) => `${libelle}${INSECABLE}: ${valeur}`;

/** Le règlement de la réservation, caution exclue. */
const reglement = (reservation: Pick<ReservationWhatsApp, "paiements">) =>
  reservation.paiements.find((paiement) => !paiement.estCaution);

/**
 * Vrai pour une réservation payée en ligne (Mobile Money) : c'est elle que
 * l'on envoie sur WhatsApp juste après le paiement. Une vente au comptoir,
 * réglée en espèces, n'y est pas envoyée d'office.
 */
export function estPayeeEnLigne(reservation: Pick<ReservationWhatsApp, "statut" | "paiements">): boolean {
  const paiement = reglement(reservation);
  return estPayee(reservation) && paiement !== undefined && paiement.moyen !== "ESPECES";
}

/**
 * Le montant, tel que le client l'a réglé. En ligne, SasPay ajoute ses
 * frais au total au moment de payer (`fraisEncaissement`) : c'est le
 * montant que le paiement a annoncé et que l'opérateur a débité, avec la
 * part des frais pour qu'Ulrich retrouve le prix de la réservation. En
 * espèces, le total. Avant paiement, le montant à régler.
 */
function montant(reservation: ReservationWhatsApp): string {
  if (!estPayee(reservation)) return ligne("Montant à régler", formatXof(reservation.totalXof));
  if (reglement(reservation)?.moyen === "ESPECES") {
    return ligne("Montant payé", `${formatXof(reservation.totalXof)}, en espèces`);
  }
  const frais = fraisEncaissement(reservation.totalXof);
  return frais > 0
    ? ligne(
        "Montant payé",
        `${formatXof(reservation.totalXof + frais)}, dont ${formatXof(frais)} de frais Mobile Money`,
      )
    : ligne("Montant payé", formatXof(reservation.totalXof));
}

/**
 * Le message déjà écrit : tout ce qui sert de la réservation, en texte
 * simple, une information par ligne. Le point de départ n'y figure qu'une
 * fois la réservation payée : c'est à ce moment qu'il est donné au client.
 */
export function messageWhatsAppReservation(reservation: ReservationWhatsApp, lienSuivi: string): string {
  // Octobre rose : la sortie de ce jour, sa tenue et ce qu'elle offre.
  const sortie = sortieDeLaReservation(reservation);
  // Le vélo choisi ; à Octobre rose, chacun reçoit le sien au rassemblement.
  const velo = reservation.offre === "octobre-rose" ? undefined : reservation.lignes[0]?.veloNom;
  const point = site.pointDeDepart;

  return [
    `Bonjour Ulrich, je viens de réserver chez ${site.nom}.`,
    "",
    ligne("Référence", reservation.reference),
    ligne("Formule", resumeOffre(reservation)),
    ligne("Date", formatCreneau(reservation)),
    ...(sortie ? [ligne("Retour", `vers ${formatHoraire(sortie.retour)}`)] : []),
    ...(velo ? [ligne("Vélo", velo)] : []),
    ...(estPayee(reservation)
      ? [ligne("Point de départ", `${point.lieu}. ${point.indication}`), ligne("Carte", point.carte)]
      : []),
    ...(sortie
      ? [ligne("Dress code", sortie.tenue), ligne("Offerts à chacun", texteOffertOctobreRose())]
      : []),
    ...(reservation.cautionXof > 0
      ? [ligne("Caution", `${formatXof(reservation.cautionXof)} en espèces au départ, rendue au retour du vélo`)]
      : []),
    montant(reservation),
    "",
    ligne("Nom", `${reservation.client.prenom} ${reservation.client.nom}`),
    ...(reservation.client.telephone ? [ligne("Téléphone", reservation.client.telephone)] : []),
    ligne("Email", reservation.client.email),
    ligne("Suivi de ma réservation", lienSuivi),
  ].join("\n");
}

/**
 * La discussion WhatsApp avec Ulrich, message déjà écrit. À ouvrir dans un
 * nouvel onglet, ou en remplaçant la page sur téléphone : l'application
 * WhatsApp prend le relais.
 */
export function lienWhatsAppReservation(reservation: ReservationWhatsApp, lienSuivi: string): string {
  return lienWhatsApp(messageWhatsAppReservation(reservation, lienSuivi));
}
