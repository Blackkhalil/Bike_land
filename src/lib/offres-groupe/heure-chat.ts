/**
 * L'heure et le jour des bulles du chatbot des offres de groupe, à l'heure
 * du Bénin, comme sur un téléphone : « 14:32 » dans chaque bulle,
 * « Aujourd'hui » ou « Hier » au-dessus de la discussion.
 *
 * Module pur : l'instant présent arrive en paramètre. Une bulle sans heure
 * (conversation rangée avant l'ajout des heures) s'affiche sans heure.
 */

import { ajouterJours, DECALAGE_BENIN_MS } from "@/lib/dates";
import { dateAuBeninDe } from "@/lib/offres/calendrier";

import { jourEnClair, majuscule } from "./textes-chat";

/** Le fuseau de Cotonou et Porto-Novo : UTC+1 toute l'année. */
const FUSEAU_BENIN = "Africa/Porto-Novo";

/** « 09:05 ». Un navigateur sans ce fuseau retombe sur le décalage fixe du Bénin. */
const FORMAT_HEURE = ((): Intl.DateTimeFormat | null => {
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: FUSEAU_BENIN });
  } catch {
    return null;
  }
})();

const estInstant = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur);

/** L'heure d'une bulle, « 14:32 » à l'heure du Bénin, ou `null` si elle n'en a pas. */
export function heureDuMessage(instant: unknown): string | null {
  if (!estInstant(instant)) return null;
  if (FORMAT_HEURE) return FORMAT_HEURE.format(instant);
  return new Date(instant + DECALAGE_BENIN_MS).toISOString().slice(11, 16);
}

/** Le jour au-dessus des bulles : « Aujourd'hui », « Hier », sinon « Samedi 7 novembre ». */
export function jourDuMessage(instant: unknown, maintenant: number): string {
  if (!estInstant(instant)) return "Aujourd'hui";
  const jour = dateAuBeninDe(instant);
  const aujourdhui = dateAuBeninDe(maintenant);
  if (jour >= aujourdhui) return "Aujourd'hui";
  if (jour === ajouterJours(aujourdhui, -1)) return "Hier";
  return majuscule(jourEnClair(jour));
}

/** Deux bulles du même jour au Bénin ? Vrai si l'une n'a pas d'heure : pas de séparation sans le savoir. */
export function memeJourAuBenin(a: unknown, b: unknown): boolean {
  if (!estInstant(a) || !estInstant(b)) return true;
  return dateAuBeninDe(a) === dateAuBeninDe(b);
}
