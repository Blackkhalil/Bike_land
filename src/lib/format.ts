/**
 * Formatage des montants et des dates.
 *
 * Les montants sont manipulés en FCFA entiers dans tout le projet : le franc
 * CFA n'a pas de subdivision utilisée, donc aucun arrondi flottant à gérer.
 */

import { formatHoraire, sortieDeLaReservation } from "@/data/octobre-rose";
import { creneauDuDepart, DERNIER_GBASHI_DU_DIMANCHE } from "@/data/offres";

import type { CodeOffre, MoyenPaiement } from "./types";

const libellesMoyens: Record<MoyenPaiement, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS_CASH: "Celtiis Cash",
  ESPECES: "Espèces",
};

/** Le nom d'un moyen de paiement, tel que le client le connaît. */
export function libelleMoyen(moyen: MoyenPaiement): string {
  return libellesMoyens[moyen] ?? moyen;
}

/**
 * Le règlement tel que la facture le nomme : « Espèces » au comptoir,
 * « Mobile Money » en ligne. L'opérateur n'y figure pas : une relance du
 * paiement peut changer d'opérateur sans que la ligne de paiement le note,
 * et une facture ne doit pas affirmer ce qu'on ne sait pas.
 */
export function libelleReglement(moyen: MoyenPaiement): string {
  return moyen === "ESPECES" ? "Espèces" : "Mobile Money";
}

/**
 * L'intitulé d'une remise sur la facture. Seul un code de parrainage en
 * accorde aujourd'hui ; les remises de durée d'avant n'avaient pas de code.
 */
export function libelleRemise(reservation: { codeParrainage?: string }): string {
  return reservation.codeParrainage ? `Remise (code ${reservation.codeParrainage})` : "Remise";
}

const formatteurMontant = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

/**
 * L'espace insécable entre un nombre et son unité : « 1 625 FCFA »,
 * « 8 h », « 20 % » ne se coupent jamais en fin de ligne, où l'unité
 * seule au début de la suivante se lisait mal sur téléphone. Les
 * milliers, eux, sont déjà séparés par l'espace fine insécable d'Intl.
 */
const INSECABLE = String.fromCharCode(0xa0);

export function formatXof(montant: number): string {
  return `${formatteurMontant.format(Math.round(montant))}${INSECABLE}FCFA`;
}

export function formatXofCourt(montant: number): string {
  if (montant >= 1_000_000) {
    const millions = montant / 1_000_000;
    return `${formatteurMontant.format(Number(millions.toFixed(millions < 10 ? 1 : 0)))}${INSECABLE}M`;
  }
  if (montant >= 1_000) {
    return `${formatteurMontant.format(Math.round(montant / 1000))}${INSECABLE}k`;
  }
  return formatteurMontant.format(montant);
}

const formatteurDateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatteurDateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const formatteurJourMois = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const formatteurDateComplete = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * « 1 novembre » devient « 1er novembre », comme l'écrit le français :
 * Intl ne le fait pas. Les autres jours ne bougent pas.
 */
function premierDuMois(texte: string): string {
  return texte.replace(/(^|\s)1(?=\s)/u, (_, avant: string) => `${avant}1er`);
}

export function formatDate(valeur: string | Date): string {
  return premierDuMois(formatteurDateLongue.format(versDate(valeur)));
}

export function formatDateCourte(valeur: string | Date): string {
  return formatteurDateCourte.format(versDate(valeur));
}

export function formatDateAvecJour(valeur: string | Date): string {
  return premierDuMois(formatteurJourMois.format(versDate(valeur)));
}

/**
 * « samedi 24 octobre 2026 » : le jour de la semaine et l'année. Pour une
 * sortie Octobre rose, le jour de la semaine compte : le client a choisi
 * entre le samedi et le dimanche.
 */
export function formatDateComplete(valeur: string | Date): string {
  return premierDuMois(formatteurDateComplete.format(versDate(valeur)));
}

export function formatPeriode(debut: string | Date, fin: string | Date): string {
  const d = versDate(debut);
  const f = versDate(fin);
  if (d.getUTCFullYear() === f.getUTCFullYear() && d.getUTCMonth() === f.getUTCMonth()) {
    return `${d.getUTCDate()} - ${formatDate(f)}`;
  }
  return `${formatDateCourte(d)} - ${formatDate(f)}`;
}

/**
 * Le créneau d'une réservation : jour et horaire d'un seul tenant.
 *
 * Écrit une fois ici plutôt que recopié dans chaque écran : la facture,
 * le suivi client et la fiche du jour doivent annoncer exactement le même
 * horaire, sinon le coordinateur et le client ne s'attendent pas au même
 * moment au point de départ.
 *
 * Une sortie Octobre rose s'annonce par son jour, de la semaine compris,
 * son rendez-vous et son départ, à la minute près, plutôt que par les
 * heures pleines qu'elle retient sur les vélos (voir `sortieDe`) :
 * « samedi 24 octobre 2026, rassemblement à 16 h, départ 16 h 30 ».
 */
export function formatCreneau(reservation: {
  dateDebut: string | Date;
  heureDebut: number;
  heureFin: number;
  offre?: CodeOffre;
}): string {
  const sortie = sortieDe(reservation);
  if (sortie) {
    return (
      `${formatDateComplete(reservation.dateDebut)}, rassemblement à ${formatHoraire(sortie.rassemblement)}, ` +
      `départ ${formatHoraire(sortie.depart)}`
    );
  }
  return `${formatDate(reservation.dateDebut)}, de ${reservation.heureDebut}${INSECABLE}h à ${reservation.heureFin}${INSECABLE}h`;
}

/** Le seul horaire, sans le jour : « 8 h - 11 h ». */
export function formatPlageHoraire(heureDebut: number, heureFin: number): string {
  return `${heureDebut}${INSECABLE}h - ${heureFin}${INSECABLE}h`;
}

/**
 * La sortie Octobre rose d'une réservation, retrouvée par son jour parmi
 * celles de la campagne décrite (src/data/octobre-rose.ts) : ses horaires à
 * la minute près ne valent que pour elle. Une inscription d'une campagne
 * passée garde ses heures enregistrées.
 */
function sortieDe(reservation: { offre?: CodeOffre; dateDebut: string | Date }) {
  return reservation.offre ? sortieDeLaReservation({ offre: reservation.offre, dateDebut: reservation.dateDebut }) : null;
}

/**
 * L'horaire d'une réservation, sans le jour : « 8 h - 11 h », et pour
 * Octobre rose, du rassemblement au retour, « 16 h - 17 h 30 ».
 */
export function formatPlageReservation(reservation: {
  offre?: CodeOffre;
  dateDebut: string | Date;
  heureDebut: number;
  heureFin: number;
}): string {
  const sortie = sortieDe(reservation);
  return sortie
    ? `${formatHoraire(sortie.rassemblement)} - ${formatHoraire(sortie.retour)}`
    : formatPlageHoraire(reservation.heureDebut, reservation.heureFin);
}

export function formatNombre(valeur: number, decimales = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur);
}

export function formatPourcentage(valeur: number, decimales = 0): string {
  return `${formatNombre(valeur, decimales)}${INSECABLE}%`;
}

function versDate(valeur: string | Date): Date {
  return typeof valeur === "string" ? new Date(`${valeur.slice(0, 10)}T00:00:00Z`) : valeur;
}

/**
 * Résume une réservation en une ligne : sa formule et ce qui la
 * dimensionne.
 *
 * Remplace l'ancien « N jours », qui ne veut plus rien dire, toutes les
 * sorties tiennent dans la journée. Ce qui distingue deux réservations,
 * c'est désormais la formule, et le nombre de participants ou la durée.
 */
export function resumeOffre(reservation: {
  offre: CodeOffre;
  nombrePersonnes: number;
  dureeHeures?: number;
  dateDebut?: string;
  heureDebut?: number;
}): string {
  const n = reservation.nombrePersonnes;
  if (reservation.offre === "road-trip") {
    return `${nomDuRoadTrip(reservation)} · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}`;
  }
  if (reservation.offre === "octobre-rose") {
    return `Octobre rose · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}`;
  }
  const velos = n > 1 ? ` · ${n}${INSECABLE}vélos` : "";
  return `Location libre · ${reservation.dureeHeures ?? "?"}${INSECABLE}h${velos}`;
}

/**
 * Le nom sous lequel ce road trip est vendu : « Gbashi bike » le dimanche,
 * « Road trip » sinon. Le jour et l'heure retrouvent le créneau, qui porte
 * le nom (voir CRENEAUX_ROAD_TRIP).
 */
export function nomDuRoadTrip(reservation: { dateDebut?: string; heureDebut?: number }): string {
  if (reservation.dateDebut === undefined || reservation.heureDebut === undefined) return "Road trip";
  const creneau = creneauDuDepart(reservation.dateDebut, reservation.heureDebut);
  // Jusqu'au 8 novembre 2026, le road trip du dimanche était Gbashi bike :
  // ces réservations gardent leur nom.
  if (creneau?.code === "dimanche-matin" && reservation.dateDebut <= DERNIER_GBASHI_DU_DIMANCHE) return "Gbashi bike";
  return creneau?.produit ?? "Road trip";
}
