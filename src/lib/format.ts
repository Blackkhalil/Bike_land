/**
 * Formatage des montants et des dates.
 *
 * Les montants sont manipulés en FCFA entiers dans tout le projet : le franc
 * CFA n'a pas de subdivision utilisée, donc aucun arrondi flottant à gérer.
 */

import { creneauDuDepart } from "@/data/offres";

import type { MoyenPaiement } from "./types";

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

export function formatXof(montant: number): string {
  return `${formatteurMontant.format(Math.round(montant))} FCFA`;
}

export function formatXofCourt(montant: number): string {
  if (montant >= 1_000_000) {
    const millions = montant / 1_000_000;
    return `${formatteurMontant.format(Number(millions.toFixed(millions < 10 ? 1 : 0)))} M`;
  }
  if (montant >= 1_000) {
    return `${formatteurMontant.format(Math.round(montant / 1000))} k`;
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

export function formatDate(valeur: string | Date): string {
  return formatteurDateLongue.format(versDate(valeur));
}

export function formatDateCourte(valeur: string | Date): string {
  return formatteurDateCourte.format(versDate(valeur));
}

export function formatDateAvecJour(valeur: string | Date): string {
  return formatteurJourMois.format(versDate(valeur));
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
 */
export function formatCreneau(reservation: {
  dateDebut: string | Date;
  heureDebut: number;
  heureFin: number;
}): string {
  return `${formatDate(reservation.dateDebut)}, de ${reservation.heureDebut} h à ${reservation.heureFin} h`;
}

/** Le seul horaire, sans le jour : « 8 h - 11 h ». */
export function formatPlageHoraire(heureDebut: number, heureFin: number): string {
  return `${heureDebut} h - ${heureFin} h`;
}

export function formatNombre(valeur: number, decimales = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur);
}

export function formatPourcentage(valeur: number, decimales = 0): string {
  return `${formatNombre(valeur, decimales)} %`;
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
  offre: "road-trip" | "location-libre";
  nombrePersonnes: number;
  dureeHeures?: number;
  dateDebut?: string;
  heureDebut?: number;
}): string {
  if (reservation.offre === "road-trip") {
    const n = reservation.nombrePersonnes;
    return `${nomDuRoadTrip(reservation)} · ${n} personne${n > 1 ? "s" : ""}`;
  }
  return `Location libre · ${reservation.dureeHeures ?? "?"} h`;
}

/**
 * Le nom sous lequel ce road trip est vendu : « Gbashi bike » le dimanche,
 * « Road trip » sinon. Le jour et l'heure retrouvent le créneau, qui porte
 * le nom (voir CRENEAUX_ROAD_TRIP).
 */
export function nomDuRoadTrip(reservation: { dateDebut?: string; heureDebut?: number }): string {
  if (reservation.dateDebut === undefined || reservation.heureDebut === undefined) return "Road trip";
  return creneauDuDepart(reservation.dateDebut, reservation.heureDebut)?.produit ?? "Road trip";
}
