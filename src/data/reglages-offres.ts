/**
 * Les réglages des offres de groupe : Bike for All, Road trip en groupe et
 * Gbashi Bike (cahier des charges, étape 1). Tout ce qui fixe un prix, une
 * durée ou une règle se change dans l'administration, rubrique « Réglages
 * des offres », et se relit à chaque calcul. Aucun prix n'est écrit ailleurs.
 *
 * Ce module ne fait que décrire, comme src/data/reglages.ts : les valeurs par
 * défaut (onglet Paramètres du tableur Bike_Land_Calculatrice_Offres.xlsx,
 * corrigé par les décisions du responsable du 9 novembre 2026, voir
 * docs/bike-land/SUIVI.md), ce qu'un réglage peut valoir (schéma zod) et la
 * clé sous laquelle il est rangé (table ParametreAdmin, en JSON).
 *
 * C'est le contrat commun du moteur de calcul (src/lib/offres/), de la
 * disponibilité, de l'administration et des écrans : chacun reçoit ces
 * réglages en paramètre et n'en lit pas d'autres.
 *
 * Montants en francs CFA entiers, durées en minutes, heures au format
 * « 08:00 », jours de la semaine 0 = dimanche … 6 = samedi.
 */

import { z } from "zod";

import type { GammeVelo } from "@/data/offres";

/* --------------------------------------------------------------- Types */

export interface ReglagesOffres {
  /** Tarif normal d'un vélo, à l'heure : sert au prix barré de Bike for All. */
  tarifNormalHeureXof: number;
  bikeForAll: {
    personnesMin: number;
    /** Budget minimum demandé au client, en mode budget. */
    budgetMinXof: number;
    /** Tarif Bike for All, par heure et par personne. */
    tarifHeurePersonneXof: number;
    fraisOrganisationXof: number;
    /** Frais d'organisation à partir du seuil « gros budget ». */
    fraisOrganisationGrosXof: number;
    /**
     * Seuil des frais à 2 000 F. Comparé au budget en mode budget, et au
     * temps de vélo en mode durée (comportement du tableur, gardé tel quel).
     */
    seuilGrosBudgetXof: number;
    /** Part maximale des cocos dans le budget (0,2 = 20 %). */
    partMaxCocos: number;
    dureeMinMinutes: number;
    /** Pas de durée : on arrondit au pas inférieur (quart d'heure). */
    pasMinutes: number;
    /** Frais d'organisation hors offre, pour le prix barré. */
    fraisHorsOffreXof: number;
    /** Premier et dernier départ, et retour au plus tard (décision 11). */
    premierDepart: string;
    dernierDepart: string;
    retourAuPlusTard: string;
  };
  accompagnateur: {
    minXof: number;
    /** Par personne au-delà de 5. */
    parPersonneXof: number;
    /** Par heure entamée au-delà de la première. */
    parHeureXof: number;
    plafondXof: number;
  };
  consommables: {
    cocoPetitXof: number;
    cocoGrandXof: number;
    /** Coût d'achat d'une bouteille d'eau (pour l'encaissé net). */
    eauCoutXof: number;
    gateauPrixXof: number;
    /** Coût d'achat d'un gâteau (pour l'encaissé net). */
    gateauCoutXof: number;
  };
  roadTrip: {
    /**
     * Prix du road trip par personne, avant les frais de paiement : 3 000 F,
     * soit 3 125 F frais compris (décision 2). La réduction s'applique à ce
     * prix, pas aux frais.
     */
    prixPersonneXof: number;
    /** Réduction possible (0,04 = 4 %), une seule par groupe. */
    reduction: number;
    personnesMin: number;
    cocosGrandsParPersonne: number;
    eauxParPersonne: number;
    distanceKm: number;
    /** Jours de départ (samedi, dimanche) et horaires. */
    jours: number[];
    depart: string;
    retour: string;
  };
  gbashi: {
    /** Prix par personne selon la gamme du vélo, avant les frais de paiement (décision 4). */
    prixXof: Record<GammeVelo, number>;
    personnesMin: number;
    jours: number[];
    depart: string;
    retour: string;
  };
  paiement: {
    /** Frais de paiement électronique, par personne, ajoutés en ligne. */
    fraisParPersonneXof: number;
  };
  /** Les réservations du week-end se font au plus tard ce jour-là, à cette heure. */
  dateLimiteWeekend: {
    jour: number;
    heure: string;
  };
  retard: {
    toleranceMinutes: number;
    /** Pénalité par minute au-delà de la tolérance, pour tout le groupe. */
    penaliteParMinuteXof: number;
  };
}

/* ------------------------------------------------------ Valeurs de départ */

export const REGLAGES_OFFRES_PAR_DEFAUT: ReglagesOffres = {
  tarifNormalHeureXof: 1500,
  bikeForAll: {
    personnesMin: 10,
    budgetMinXof: 5000,
    tarifHeurePersonneXof: 800,
    fraisOrganisationXof: 1000,
    fraisOrganisationGrosXof: 2000,
    seuilGrosBudgetXof: 15000,
    partMaxCocos: 0.2,
    dureeMinMinutes: 30,
    pasMinutes: 15,
    fraisHorsOffreXof: 3000,
    premierDepart: "08:00",
    dernierDepart: "21:30",
    retourAuPlusTard: "22:00",
  },
  accompagnateur: {
    minXof: 1500,
    parPersonneXof: 200,
    parHeureXof: 250,
    plafondXof: 5000,
  },
  consommables: {
    cocoPetitXof: 175,
    cocoGrandXof: 275,
    eauCoutXof: 200,
    gateauPrixXof: 150,
    gateauCoutXof: 100,
  },
  roadTrip: {
    prixPersonneXof: 3000,
    reduction: 0.04,
    personnesMin: 10,
    cocosGrandsParPersonne: 2,
    eauxParPersonne: 2,
    distanceKm: 25,
    jours: [6, 0],
    depart: "08:00",
    retour: "12:00",
  },
  gbashi: {
    prixXof: { CLASSIQUE: 3500, PREMIUM: 4000, PRESTIGE: 4500 },
    personnesMin: 5,
    jours: [0],
    depart: "07:00",
    retour: "11:00",
  },
  paiement: {
    fraisParPersonneXof: 125,
  },
  dateLimiteWeekend: {
    jour: 5,
    heure: "19:00",
  },
  retard: {
    toleranceMinutes: 7,
    penaliteParMinuteXof: 1000,
  },
};

/* ------------------------------------------------------------- Schéma */

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure attendue au format 08:00.");
const montant = z
  .number({ invalid_type_error: "Montant attendu en francs CFA." })
  .int("Montant en francs entiers.")
  .min(0, "Montant positif.")
  .max(1_000_000);
const jours = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((liste) => [...new Set(liste)].sort((a, b) => a - b));
const minutesDe = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export const schemaReglagesOffres = z
  .object({
    tarifNormalHeureXof: montant.min(1),
    bikeForAll: z.object({
      personnesMin: z.number().int().min(1).max(100),
      budgetMinXof: montant,
      tarifHeurePersonneXof: montant.min(1),
      fraisOrganisationXof: montant,
      fraisOrganisationGrosXof: montant,
      seuilGrosBudgetXof: montant,
      partMaxCocos: z.number().min(0).max(1),
      dureeMinMinutes: z.number().int().min(5).max(600),
      pasMinutes: z.number().int().min(5).max(120),
      fraisHorsOffreXof: montant,
      premierDepart: heure,
      dernierDepart: heure,
      retourAuPlusTard: heure,
    }),
    accompagnateur: z.object({
      minXof: montant,
      parPersonneXof: montant,
      parHeureXof: montant,
      plafondXof: montant,
    }),
    consommables: z.object({
      cocoPetitXof: montant,
      cocoGrandXof: montant,
      eauCoutXof: montant,
      gateauPrixXof: montant,
      gateauCoutXof: montant,
    }),
    roadTrip: z.object({
      prixPersonneXof: montant.min(1),
      reduction: z.number().min(0).max(0.5),
      personnesMin: z.number().int().min(1).max(100),
      cocosGrandsParPersonne: z.number().int().min(0).max(10),
      eauxParPersonne: z.number().int().min(0).max(10),
      distanceKm: z.number().int().min(1).max(200),
      jours,
      depart: heure,
      retour: heure,
    }),
    gbashi: z.object({
      prixXof: z.object({ CLASSIQUE: montant.min(1), PREMIUM: montant.min(1), PRESTIGE: montant.min(1) }),
      personnesMin: z.number().int().min(1).max(100),
      jours,
      depart: heure,
      retour: heure,
    }),
    paiement: z.object({ fraisParPersonneXof: montant }),
    dateLimiteWeekend: z.object({ jour: z.number().int().min(0).max(6), heure }),
    retard: z.object({
      toleranceMinutes: z.number().int().min(0).max(120),
      penaliteParMinuteXof: montant,
    }),
  })
  .refine((r) => r.bikeForAll.dureeMinMinutes % r.bikeForAll.pasMinutes === 0, {
    message: "La durée minimale doit tomber sur un pas.",
    path: ["bikeForAll", "dureeMinMinutes"],
  })
  .refine((r) => minutesDe(r.bikeForAll.premierDepart) <= minutesDe(r.bikeForAll.dernierDepart), {
    message: "Le dernier départ doit suivre le premier.",
    path: ["bikeForAll", "dernierDepart"],
  })
  .refine((r) => minutesDe(r.roadTrip.retour) > minutesDe(r.roadTrip.depart), {
    message: "Le retour doit suivre le départ.",
    path: ["roadTrip", "retour"],
  })
  .refine((r) => minutesDe(r.gbashi.retour) > minutesDe(r.gbashi.depart), {
    message: "Le retour doit suivre le départ.",
    path: ["gbashi", "retour"],
  })
  .refine((r) => r.accompagnateur.minXof <= r.accompagnateur.plafondXof, {
    message: "Le minimum dépasse le plafond.",
    path: ["accompagnateur", "minXof"],
  })
  .refine((r) => r.consommables.cocoPetitXof <= r.consommables.cocoGrandXof, {
    message: "Le petit coco coûte plus que le grand.",
    path: ["consommables", "cocoPetitXof"],
  });

/* ---------------------------------------------------------------- Lecture */

/** La clé de ParametreAdmin sous laquelle les réglages des offres sont rangés. */
export const CLE_REGLAGES_OFFRES = "reglages:offres-groupe";

/** Le code de l'interrupteur « Offres de groupe » (CreneauReglage), désactivé tant qu'il n'existe pas. */
export const CODE_INTERRUPTEUR_OFFRES = "offres-groupe";

/**
 * D'où viennent les réglages lus : les valeurs de départ (rien d'enregistré),
 * les valeurs enregistrées, ou « illisible » quand l'enregistrement ne passe
 * plus le schéma. Dans ce dernier cas, la vente des offres de groupe est
 * refusée et l'administration alertée : on ne vend jamais en silence au prix
 * par défaut (risque relevé par l'audit du 9 novembre 2026).
 */
export type SourceReglagesOffres = "defaut" | "enregistre" | "illisible";

export interface LectureReglagesOffres {
  reglages: ReglagesOffres;
  source: SourceReglagesOffres;
  /** Le premier problème trouvé, quand la source est « illisible ». */
  probleme?: string;
}

/** Fusion profonde d'un objet enregistré sur les valeurs de départ : un champ ajouté depuis garde sa valeur par défaut. */
function fusionner(defaut: unknown, enregistre: unknown): unknown {
  if (Array.isArray(defaut) || typeof defaut !== "object" || defaut === null) {
    return enregistre === undefined ? defaut : enregistre;
  }
  if (typeof enregistre !== "object" || enregistre === null || Array.isArray(enregistre)) return defaut;
  const resultat: Record<string, unknown> = { ...(defaut as Record<string, unknown>) };
  for (const [cle, valeur] of Object.entries(enregistre as Record<string, unknown>)) {
    resultat[cle] = cle in resultat ? fusionner(resultat[cle], valeur) : valeur;
  }
  return resultat;
}

/**
 * Les réglages des offres, lus par `lire` (une clé de ParametreAdmin). Une
 * base injoignable fait échouer la lecture : on ne vend pas à l'aveugle.
 */
export async function lireReglagesOffresAvec(
  lire: (cle: string) => Promise<string | null>,
): Promise<LectureReglagesOffres> {
  const brut = await lire(CLE_REGLAGES_OFFRES);
  if (!brut) return { reglages: REGLAGES_OFFRES_PAR_DEFAUT, source: "defaut" };
  try {
    const analyse = schemaReglagesOffres.safeParse(fusionner(REGLAGES_OFFRES_PAR_DEFAUT, JSON.parse(brut)));
    if (analyse.success) return { reglages: analyse.data, source: "enregistre" };
    return {
      reglages: REGLAGES_OFFRES_PAR_DEFAUT,
      source: "illisible",
      probleme: analyse.error.errors[0]?.message ?? "réglages illisibles",
    };
  } catch {
    return { reglages: REGLAGES_OFFRES_PAR_DEFAUT, source: "illisible", probleme: "réglages enregistrés illisibles" };
  }
}
