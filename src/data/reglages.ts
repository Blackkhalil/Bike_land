/**
 * Les réglages des produits, que l'exploitant change lui-même depuis
 * l'administration (page « Réglages des produits »), sans passer par le
 * code : l'heure, les jours, le prix, la durée, le nombre de personnes, la
 * date d'ouverture, le délai de réservation (demande de l'exploitant,
 * 9 novembre 2026).
 *
 * Ce module ne fait que décrire : les valeurs par défaut, celles d'avant
 * tout réglage, et ce qu'un réglage peut valoir (schémas zod). Les réglages
 * enregistrés sont rangés en JSON dans la table ParametreAdmin, un produit
 * par clé, et lus côté serveur (src/lib/reglages.ts) ; les pages et les
 * formulaires les reçoivent du serveur.
 *
 * Padel bike en a le premier. Les autres produits suivront le même modèle :
 * une interface, des valeurs par défaut, un schéma, une clé.
 */

import { z } from "zod";

import { DUREE_PADEL_HEURES, PRIX_PADEL_BIKE_XOF } from "@/data/offres";
import { estDateISOValide, type DateISO } from "@/lib/dates";

/* ------------------------------------------------------------ Horaires */

/** « 18:30 » : une heure de la journée, à la minute. */
export type HeureMinute = string;

const FORMAT_HEURE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Les minutes depuis minuit : « 18:30 » vaut 1110. */
export function minutesDe(horaire: HeureMinute): number {
  const [heures, minutes] = horaire.split(":").map(Number);
  return heures * 60 + minutes;
}

/** « 18 h 30 », « 18 h » : une heure telle qu'on l'écrit. */
export function formatHeureMinute(horaire: HeureMinute): string {
  const [heures, minutes] = horaire.split(":").map(Number);
  const insecable = String.fromCharCode(0xa0);
  return minutes
    ? `${heures}${insecable}h${insecable}${String(minutes).padStart(2, "0")}`
    : `${heures}${insecable}h`;
}

/** « 3 h », « 1 h 30 » : une durée en heures, à la demi-heure. */
export function formatDureeHeures(heures: number): string {
  const insecable = String.fromCharCode(0xa0);
  const entieres = Math.floor(heures);
  const minutes = Math.round((heures - entieres) * 60);
  return minutes ? `${entieres}${insecable}h${insecable}${minutes}` : `${entieres}${insecable}h`;
}

/** Les noms des jours, 0 = dimanche. */
export const NOMS_JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

/**
 * Les jours de départ en toutes lettres : « tous les jours », « du lundi
 * au vendredi », « le samedi et le dimanche », « le mardi, le jeudi et le
 * samedi ».
 */
export function joursEnClair(jours: readonly number[]): string {
  const tries = [...new Set(jours)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (tries.length === 7) return "tous les jours";
  const cle = tries.join(",");
  if (cle === "1,2,3,4,5") return "du lundi au vendredi";
  if (cle === "1,2,3,4,5,6") return "du lundi au samedi";
  const noms = tries.map((jour) => `le ${NOMS_JOURS[jour]}`);
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : (noms[0] ?? "aucun jour");
}

/**
 * Ce qui est programmé, en clair : les jours de chaque semaine, les dates
 * ajoutées une à une, les deux, ou rien encore. « le samedi et le
 * dimanche », « aux dates programmées », « le samedi, et à d'autres dates
 * programmées », « aucun départ programmé pour le moment ».
 */
export function programmeEnClair(programme: { jours: readonly number[]; dates: readonly string[] }): string {
  if (programme.jours.length === 0) {
    return programme.dates.length > 0 ? "aux dates programmées" : "aucun départ programmé pour le moment";
  }
  const jours = joursEnClair(programme.jours);
  return programme.dates.length > 0 ? `${jours}, et à d'autres dates programmées` : jours;
}

/* ---------------------------------------------------------- Padel bike */

export interface ReglagesPadel {
  /** Le prix par personne, le même en ligne et au comptoir, quel que soit le vélo. */
  prixXof: number;
  /** L'heure du départ à vélo. */
  depart: HeureMinute;
  /**
   * L'heure où les vélos rentrent. Ils sont retenus de l'heure pleine du
   * départ à l'heure pleine qui suit le retour : de 18 h à 23 h pour une
   * sortie de 18 h 30 à 22 h 30.
   */
  retour: HeureMinute;
  /** Combien d'heures de padel, pour le dire au client. */
  dureePadelHeures: number;
  /**
   * Les jours de départ de chaque semaine, 0 = dimanche … 6 = samedi.
   * Aucun : la sortie ne part qu'aux dates programmées une à une.
   */
  jours: number[];
  /**
   * Les dates de départ programmées une à une depuis l'administration, en
   * plus des jours de chaque semaine. Padel bike part certains jours
   * seulement, que l'équipe programme elle-même (décision de l'exploitant).
   */
  dates: DateISO[];
  personnesMin: number;
  personnesMax: number;
  /** Le jour où la réservation en ligne ouvre, à minuit heure du Bénin. */
  ouverture: DateISO;
  /** Jusqu'à combien d'heures avant le départ on réserve en ligne. */
  clotureHeuresAvant: number;
}

const SURCHARGE_OUVERTURE_PADEL = process.env.NEXT_PUBLIC_PADEL_BIKE_OUVERTURE;

/**
 * Padel bike avant tout réglage : le soir à 18 h 30, retour des vélos à
 * 22 h 30, ouverture en ligne le vendredi 20 novembre 2026 (décisions de
 * l'exploitant). Aucun jour de départ : l'équipe les programme elle-même
 * depuis l'administration, et rien ne se réserve avant.
 * `NEXT_PUBLIC_PADEL_BIKE_OUVERTURE` (AAAA-MM-JJ) avance l'ouverture par
 * défaut pour une démonstration ; elle n'existe pas en production.
 */
export const REGLAGES_PADEL_PAR_DEFAUT: ReglagesPadel = {
  prixXof: PRIX_PADEL_BIKE_XOF,
  depart: "18:30",
  retour: "22:30",
  dureePadelHeures: DUREE_PADEL_HEURES,
  jours: [],
  dates: [],
  personnesMin: 2,
  personnesMax: 12,
  ouverture:
    SURCHARGE_OUVERTURE_PADEL && estDateISOValide(SURCHARGE_OUVERTURE_PADEL) ? SURCHARGE_OUVERTURE_PADEL : "2026-11-20",
  clotureHeuresAvant: 3,
};

const heureMinute = z.string().trim().regex(FORMAT_HEURE, "Heure attendue au format 18:30.");

export const schemaReglagesPadel = z
  .object({
    prixXof: z
      .number({ invalid_type_error: "Prix attendu en francs CFA." })
      .int("Prix en francs entiers.")
      .min(200, "200 F au moins : le Mobile Money n'encaisse pas moins.")
      .max(1_000_000),
    depart: heureMinute,
    retour: heureMinute,
    dureePadelHeures: z
      .number({ invalid_type_error: "Durée attendue en heures." })
      .min(0.5, "Une demi-heure au moins.")
      .max(8, "Huit heures au plus.")
      .multipleOf(0.5, "Durée à la demi-heure près."),
    jours: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .transform((jours) => [...new Set(jours)].sort((a, b) => a - b)),
    dates: z
      .array(z.string().refine(estDateISOValide, "Date attendue au format AAAA-MM-JJ."))
      .max(400, "400 dates au plus.")
      .transform((dates) => [...new Set(dates)].sort()),
    personnesMin: z.number().int().min(1, "Une personne au moins.").max(12, "Douze au plus."),
    personnesMax: z.number().int().min(1, "Une personne au moins.").max(12, "Douze au plus par réservation."),
    ouverture: z.string().refine(estDateISOValide, "Date attendue au format AAAA-MM-JJ."),
    clotureHeuresAvant: z
      .number({ invalid_type_error: "Délai attendu en heures." })
      .int("Délai en heures entières.")
      .min(0)
      .max(72, "Trois jours au plus."),
  })
  .refine((r) => minutesDe(r.retour) > minutesDe(r.depart), {
    message: "Le retour doit suivre le départ.",
    path: ["retour"],
  })
  .refine((r) => minutesDe(r.retour) <= 23 * 60, {
    message: "Les vélos rentrent à 23 h au plus tard.",
    path: ["retour"],
  })
  .refine((r) => r.personnesMin <= r.personnesMax, {
    message: "Le minimum dépasse le maximum.",
    path: ["personnesMin"],
  });

/**
 * Les heures pleines pendant lesquelles les vélos de Padel bike sont pris :
 * de l'heure du départ, arrondie en dessous, à celle du retour, arrondie
 * au-dessus. C'est ce créneau que la base retient.
 */
export function blocPadel(reglages: Pick<ReglagesPadel, "depart" | "retour">): { heureDebut: number; heureFin: number } {
  return {
    heureDebut: Math.floor(minutesDe(reglages.depart) / 60),
    heureFin: Math.ceil(minutesDe(reglages.retour) / 60),
  };
}

/* ------------------------------------------------------ Tous les produits */

export interface ReglagesProduits {
  padel: ReglagesPadel;
}

export const REGLAGES_PAR_DEFAUT: ReglagesProduits = {
  padel: REGLAGES_PADEL_PAR_DEFAUT,
};

/** Les clés de ParametreAdmin sous lesquelles chaque produit range ses réglages. */
export const CLES_REGLAGES = {
  padel: "reglages:padel-bike",
} as const satisfies Record<keyof ReglagesProduits, string>;

/**
 * Les réglages enregistrés d'un produit, sur ses valeurs par défaut : un
 * champ absent (ajouté au produit depuis) garde sa valeur par défaut. Un
 * réglage illisible retombe sur le défaut, et le dit dans le journal.
 */
function fusionner<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, defaut: T, brut: string | null, cle: string): T {
  if (!brut) return defaut;
  try {
    const analyse = schema.safeParse({ ...defaut, ...JSON.parse(brut) });
    if (analyse.success) return analyse.data;
    console.error(`[reglages] ${cle} illisible, valeurs par défaut :`, analyse.error.errors[0]?.message);
  } catch {
    console.error(`[reglages] ${cle} n'est pas du JSON, valeurs par défaut.`);
  }
  return defaut;
}

/**
 * Les réglages de tous les produits, lus par `lire` (une clé de
 * ParametreAdmin). Le serveur et la base s'en servent, chacun avec sa façon
 * de lire ; une base injoignable fait échouer la lecture plutôt que de
 * vendre au prix par défaut.
 */
export async function lireReglagesAvec(lire: (cle: string) => Promise<string | null>): Promise<ReglagesProduits> {
  const padel = await lire(CLES_REGLAGES.padel);
  return {
    padel: fusionner(schemaReglagesPadel, REGLAGES_PADEL_PAR_DEFAUT, padel, CLES_REGLAGES.padel),
  };
}
