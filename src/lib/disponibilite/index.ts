/**
 * La disponibilité des vélos pour les offres de groupe, au quart d'heure
 * (cahier des charges, étape 5). Fonctions pures : elles travaillent sur le
 * parc d'un jour (`ParcDuJour`, lu par le dépôt) et ne touchent à rien.
 *
 * Toutes les offres partagent les mêmes vélos : un vélo occupé sur une partie
 * du créneau demandé n'est pas libre pour ce créneau. Une réservation à
 * l'heure pleine compte de heureDebut × 60 à heureFin × 60 ; les intervalles
 * sont semi-ouverts, un retour à 8 h 30 et un départ à 8 h 30 ne se gênent pas.
 *
 * Le lot 3 (disponibilité) peut enrichir ce module, sans changer ces signatures :
 * les routes des offres de groupe (lot 5b) s'en servent.
 */

import { GAMMES, type GammeVelo } from "@/data/offres";
import type { ParcDuJour } from "@/lib/db/contrat";

/** Un créneau en minutes depuis minuit : [debutMinute, finMinute). */
export interface CreneauMinutes {
  debutMinute: number;
  finMinute: number;
}

/** Deux créneaux se gênent-ils ? */
export function seChevauchent(a: CreneauMinutes, b: CreneauMinutes): boolean {
  return a.debutMinute < b.finMinute && b.debutMinute < a.finMinute;
}

/** Les vélos libres sur tout un créneau. */
export interface VelosLibres {
  total: number;
  parGamme: Record<GammeVelo, number>;
  /** Leurs identifiants, dans l'ordre du parc. */
  ids: string[];
}

export function velosLibresSurCreneau(parc: ParcDuJour, creneau: CreneauMinutes): VelosLibres {
  const occupes = new Set(parc.occupations.filter((o) => seChevauchent(o, creneau)).map((o) => o.veloId));
  const libres = parc.velos.filter((velo) => !occupes.has(velo.id));
  const parGamme = Object.fromEntries(GAMMES.map((gamme) => [gamme, 0])) as Record<GammeVelo, number>;
  for (const velo of libres) parGamme[velo.gamme] += 1;
  return { total: libres.length, parGamme, ids: libres.map((velo) => velo.id) };
}

/** Le besoin d'un groupe : un nombre de vélos toutes gammes, ou le nombre de chaque gamme (Gbashi Bike). */
export type BesoinVelos = number | Partial<Record<GammeVelo, number>>;

/** Les vélos libres suffisent-ils au besoin ? */
export function suffit(libres: VelosLibres, besoin: BesoinVelos): boolean {
  if (typeof besoin === "number") return libres.total >= besoin;
  return GAMMES.every((gamme) => (besoin[gamme] ?? 0) <= libres.parGamme[gamme]);
}

/** La grille des départs d'une offre, en minutes depuis minuit. */
export interface GrilleDeparts {
  premier: number;
  dernier: number;
  pas: number;
  /** Le retour au plus tard : un départ dont le retour le dépasse n'est pas proposé. */
  retourAuPlusTard: number;
}

/**
 * Le départ de la grille le plus proche de `souhaite` où le groupe trouve ses
 * vélos pour toute la durée, le même jour ; à égalité d'écart, le plus tôt.
 * `exclure` écarte les départs que la vente refuse par ailleurs (délai
 * minimum en ligne, départ passé). `null` quand aucun départ ne convient.
 */
export function prochainDepartLibre(
  parc: ParcDuJour,
  besoin: BesoinVelos,
  dureeMinutes: number,
  souhaite: number,
  grille: GrilleDeparts,
  exclure?: (depart: number) => boolean,
): number | null {
  const candidats: number[] = [];
  for (let depart = grille.premier; depart <= grille.dernier; depart += grille.pas) {
    if (depart + dureeMinutes > grille.retourAuPlusTard) continue;
    if (exclure?.(depart)) continue;
    const libres = velosLibresSurCreneau(parc, { debutMinute: depart, finMinute: depart + dureeMinutes });
    if (suffit(libres, besoin)) candidats.push(depart);
  }
  candidats.sort((a, b) => Math.abs(a - souhaite) - Math.abs(b - souhaite) || a - b);
  return candidats[0] ?? null;
}

/** « 08:15 » devient 495. */
export function minutesDeHeure(heure: string): number {
  return Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
}

/** 495 devient « 08:15 ». */
export function heureDeMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
