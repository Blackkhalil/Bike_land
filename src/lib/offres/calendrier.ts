/**
 * Les heures et les jours des offres de groupe, à l'heure du Bénin (UTC+1
 * toute l'année, sans heure d'été : DECALAGE_BENIN_MS).
 *
 * Fonctions pures : l'instant présent arrive toujours en paramètre.
 */

import { ajouterJours, DECALAGE_BENIN_MS, type DateISO } from "@/lib/dates";

import type { HeureMinute } from "./types";

const INSECABLE = String.fromCharCode(0xa0);
const MOTIF_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Les jours du week-end : samedi et dimanche (0 = dimanche … 6 = samedi). */
export const JOURS_WEEKEND: readonly number[] = [6, 0];

/** Les jours de la semaine, 0 = dimanche. */
export const NOMS_JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

/** Vrai pour une heure écrite « 08:00 », de 00:00 à 23:59. */
export function estHeureValide(valeur: unknown): valeur is HeureMinute {
  return typeof valeur === "string" && MOTIF_HEURE.test(valeur);
}

/** « 08:45 » devient 525 : les minutes depuis minuit. */
export function minutesDe(heure: HeureMinute): number {
  return Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
}

/** 525 devient « 08:45 ». */
export function heureDe(minutes: number): HeureMinute {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** « 08:45 » devient « 08h45 », comme l'écrit le récapitulatif du tableur. */
export function heureDuRecap(heure: HeureMinute): string {
  return heure.replace(":", "h");
}

/** « 8 h », « 21 h 30 » : une heure dans une phrase, comme sur le reste du site. */
export function heureEnClair(heure: HeureMinute): string {
  const heures = Number(heure.slice(0, 2));
  const minutes = heure.slice(3, 5);
  return minutes === "00" ? `${heures}${INSECABLE}h` : `${heures}${INSECABLE}h${INSECABLE}${minutes}`;
}

/** « 45 minutes », « 1 h », « 1 h 30 », « 4 h 15 » : une durée de vélo. */
export function dureeEnClair(minutes: number): string {
  if (minutes < 60) return `${minutes}${INSECABLE}minutes`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste ? `${heures}${INSECABLE}h${INSECABLE}${String(reste).padStart(2, "0")}` : `${heures}${INSECABLE}h`;
}

/** Le jour de la semaine d'une date civile, 0 = dimanche. */
export function jourDeLaSemaine(date: DateISO): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/** L'instant (millisecondes UTC) d'une heure d'un jour donné, à l'heure du Bénin. */
export function instantAuBenin(date: DateISO, heure: HeureMinute): number {
  return Date.parse(`${date}T${heure}:00.000Z`) - DECALAGE_BENIN_MS;
}

/** La date du jour au Bénin, à l'instant donné. */
export function dateAuBeninDe(instant: number): DateISO {
  return new Date(instant + DECALAGE_BENIN_MS).toISOString().slice(0, 10);
}

/**
 * La date limite de réservation d'un jour du week-end : le dernier
 * `jour` réglé (vendredi) à `heure` (19 h), strictement avant ce jour. Un
 * samedi : la veille ; un dimanche : l'avant-veille. `null` en semaine,
 * où il n'y a pas de date limite (décision 11 : elle vaut pour les trois
 * offres, le week-end seulement).
 */
export function dateLimiteDuWeekend(date: DateISO, limite: { jour: number; heure: HeureMinute }): number | null {
  const jour = jourDeLaSemaine(date);
  if (!JOURS_WEEKEND.includes(jour)) return null;
  const joursAvant = (jour - limite.jour + 7) % 7 || 7;
  return instantAuBenin(ajouterJours(date, -joursAvant), limite.heure);
}

/** « le samedi ou le dimanche » : des jours de la semaine, dans une phrase. */
export function joursEnClair(jours: readonly number[]): string {
  // Du lundi au dimanche, comme on les dit, et non du dimanche au samedi.
  const ordonnes = [...jours].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((jour) => `le ${NOMS_JOURS[jour]}`);
  if (ordonnes.length <= 1) return ordonnes.join("");
  return `${ordonnes.slice(0, -1).join(", ")} ou ${ordonnes[ordonnes.length - 1]}`;
}
