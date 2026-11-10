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
import { ordreAttribution, type ParcDuJour } from "@/lib/db/contrat";
import type { DateISO } from "@/lib/dates";

/** Les codes des gammes, dans l'ordre du catalogue. */
const CODES_GAMMES: GammeVelo[] = GAMMES.map((gamme) => gamme.code);

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
  const parGamme = Object.fromEntries(CODES_GAMMES.map((gamme) => [gamme, 0])) as Record<GammeVelo, number>;
  for (const velo of libres) parGamme[velo.gamme] += 1;
  return { total: libres.length, parGamme, ids: libres.map((velo) => velo.id) };
}

/** Le besoin d'un groupe : un nombre de vélos toutes gammes, ou le nombre de chaque gamme (Gbashi Bike). */
export type BesoinVelos = number | Partial<Record<GammeVelo, number>>;

/** Les vélos libres suffisent-ils au besoin ? */
export function suffit(libres: VelosLibres, besoin: BesoinVelos): boolean {
  if (typeof besoin === "number") return libres.total >= besoin;
  return CODES_GAMMES.every((gamme) => (besoin[gamme] ?? 0) <= libres.parGamme[gamme]);
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

/* ------------------------------------------- Le parc d'un jour, par le dépôt */

/**
 * Les minutes qu'une ligne de réservation occupe dans sa journée : exactes
 * quand elles sont notées (offres de groupe, au quart d'heure), sinon de
 * heureDebut × 60 à heureFin × 60. Une réservation sur plusieurs jours garde
 * le sens de `creneauxSeChevauchent` : les mêmes heures, chaque jour.
 */
export function minutesDeLigne(ligne: {
  heureDebut: number;
  heureFin: number;
  minuteDebut?: number | null;
  minuteFin?: number | null;
}): CreneauMinutes {
  if (
    typeof ligne.minuteDebut === "number" &&
    typeof ligne.minuteFin === "number" &&
    ligne.minuteDebut < ligne.minuteFin
  ) {
    return { debutMinute: ligne.minuteDebut, finMinute: ligne.minuteFin };
  }
  return { debutMinute: ligne.heureDebut * 60, finMinute: ligne.heureFin * 60 };
}

/** Les heures pleines qui couvrent un créneau en minutes : 8 h 15 - 9 h 15 prend 8 h - 10 h. */
export function heuresCouvrantes(creneau: CreneauMinutes): { heureDebut: number; heureFin: number } {
  return { heureDebut: Math.floor(creneau.debutMinute / 60), heureFin: Math.ceil(creneau.finMinute / 60) };
}

/** Un vélo du parc tel que le dépôt le lit, avec ce qu'il lui faut en plus pour écrire. */
export type VeloDuParc = ParcDuJour["velos"][number];

/** Le parc d'un jour, ses vélos portant ce que le dépôt y a mis en plus. */
export interface ParcDuJourDe<T extends VeloDuParc> extends ParcDuJour {
  velos: T[];
}

/**
 * Le parc d'un jour, à partir de ce que le dépôt a lu (en base ou en
 * démonstration, pour que les deux répondent pareil) : les vélos ni retirés
 * ni à l'atelier, moins ceux déclarés indisponibles ce jour-là, dans l'ordre
 * d'attribution ; et les créneaux que les réservations bloquantes du jour
 * prennent sur ces vélos, toutes offres confondues. Les lignes passées ici
 * sont déjà celles qui bloquent (payées, ou en attente de paiement depuis
 * moins de 30 minutes) et qui couvrent ce jour.
 */
export function construireParcDuJour<T extends VeloDuParc & { statut: string }>(
  date: DateISO,
  velos: T[],
  indisponibles: ReadonlySet<string>,
  lignes: { veloId: string; heureDebut: number; heureFin: number; minuteDebut?: number | null; minuteFin?: number | null }[],
): ParcDuJourDe<T> {
  const enEtat = ordreAttribution(
    velos.filter(
      (velo) => velo.statut !== "RETIRE" && velo.statut !== "MAINTENANCE" && !indisponibles.has(velo.id),
    ),
  );
  const duParc = new Set(enEtat.map((velo) => velo.id));
  const occupations = lignes
    .filter((ligne) => duParc.has(ligne.veloId))
    .map((ligne) => ({ veloId: ligne.veloId, ...minutesDeLigne(ligne) }))
    .sort((a, b) => a.debutMinute - b.debutMinute || a.finMinute - b.finMinute || a.veloId.localeCompare(b.veloId));
  return { date, velos: enEtat, occupations };
}

/**
 * L'écart, en minutes, entre le créneau et l'occupation la plus proche d'un
 * vélo ce jour-là : celle qui finit avant le départ, ou commence après le
 * retour. L'infini quand le vélo n'a rien d'autre ce jour-là.
 */
function ecartAuVoisin(veloId: string, occupations: ParcDuJour["occupations"], creneau: CreneauMinutes): number {
  let ecart = Number.POSITIVE_INFINITY;
  for (const o of occupations) {
    if (o.veloId !== veloId) continue;
    if (o.finMinute <= creneau.debutMinute) ecart = Math.min(ecart, creneau.debutMinute - o.finMinute);
    else if (o.debutMinute >= creneau.finMinute) ecart = Math.min(ecart, o.debutMinute - creneau.finMinute);
  }
  return ecart;
}

/**
 * Les vélos à bloquer pour un groupe, parmi ceux libres sur tout le créneau :
 * un nombre de vélos toutes gammes confondues, ou le nombre exact de chaque
 * gamme (Gbashi Bike). Au plus serré d'abord : les vélos dont une occupation
 * finit juste avant le départ ou commence juste après le retour. Le parc se
 * fragmente moins, et un groupe plus long trouve encore ses vélos (cahier,
 * étape 5). À écart égal, l'ordre d'attribution (le Classique d'abord, comme
 * Octobre rose et Padel bike) : un jour sans autre réservation, rien ne
 * change. `velos` vaut `null` quand il n'y en a pas assez ; `libres` dit
 * toujours ce qui reste sur le créneau.
 */
export function attribuerVelos<T extends VeloDuParc>(
  parc: ParcDuJourDe<T>,
  creneau: CreneauMinutes,
  besoin: BesoinVelos,
): { velos: T[] | null; libres: VelosLibres } {
  const libres = velosLibresSurCreneau(parc, creneau);
  if (!suffit(libres, besoin)) return { velos: null, libres };
  const idsLibres = new Set(libres.ids);
  const ecarts = new Map(parc.velos.map((velo) => [velo.id, ecartAuVoisin(velo.id, parc.occupations, creneau)]));
  // Tri stable : à écart égal, l'ordre d'attribution est gardé.
  const candidats = ordreAttribution(parc.velos.filter((velo) => idsLibres.has(velo.id))).sort((a, b) => {
    const ea = ecarts.get(a.id) ?? Number.POSITIVE_INFINITY;
    const eb = ecarts.get(b.id) ?? Number.POSITIVE_INFINITY;
    return ea === eb ? 0 : ea < eb ? -1 : 1;
  });
  if (typeof besoin === "number") return { velos: candidats.slice(0, besoin), libres };
  return {
    velos: CODES_GAMMES.flatMap((gamme) =>
      candidats.filter((velo) => velo.gamme === gamme).slice(0, besoin[gamme] ?? 0),
    ),
    libres,
  };
}
