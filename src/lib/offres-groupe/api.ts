/**
 * Le contrat entre les écrans des offres de groupe et leurs routes serveur.
 *
 * Les écrans (src/app/(site)/offres-groupe, src/components/offres-groupe)
 * envoient ces demandes ; les routes (src/app/api/offres-groupe) les
 * valident avec ces mêmes schémas, refont tout le calcul avec les réglages et
 * le parc du moment (src/lib/offres, src/lib/disponibilite), et répondent ces
 * formes. Le navigateur ne décide d'aucun prix : le total qu'il envoie
 * (`attendu`) ne sert qu'à détecter un écart entre ce qu'il a affiché et ce
 * que le serveur trouve, auquel cas le client revoit le nouveau montant.
 *
 * Le canal (« en-ligne ») est toujours fixé par la route, jamais lu ici ; la
 * réduction du road trip ne vient que d'une preuve que le serveur retrouve
 * validée, jamais d'un booléen envoyé par le navigateur.
 */

import { z } from "zod";

import type { GammeVelo } from "@/data/offres";
import type { DateISO } from "@/lib/dates";
import type { HeureMinute, IssueOffre, Refus } from "@/lib/offres";

/* --------------------------------------------------------------- Routes */

/** Les adresses, pour que les écrans et les routes ne divergent jamais. */
export const ROUTES_OFFRES_GROUPE = {
  devis: "/api/offres-groupe/devis",
  reservations: "/api/offres-groupe/reservations",
  preuves: "/api/offres-groupe/preuves",
  /** Suivi d'une preuve restée « en_attente » : `${preuves}/${preuveId}`. */
  preuve: (preuveId: string) => `/api/offres-groupe/preuves/${encodeURIComponent(preuveId)}`,
  /** Vente en espèces au comptoir, depuis l'administration (session requise). */
  comptoir: "/api/admin/offres-groupe/comptoir",
} as const;

/* -------------------------------------------------------------- Saisies */

const entier = (min: number, max: number) => z.number().int().min(min).max(max);
const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure attendue au format 08:00.");
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.");
const gateaux = entier(0, 20).default(0);

export const schemaSaisieBikeForAll = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("budget"),
    personnes: entier(1, 500),
    budgetXof: entier(0, 10_000_000),
    depart: heure,
    gateauxParPersonne: gateaux,
    accompagnateur: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal("duree"),
    personnes: entier(1, 500),
    minutes: entier(1, 24 * 60),
    depart: heure,
    coco: z.enum(["aucun", "petit", "grand"]),
    gateauxParPersonne: gateaux,
    accompagnateur: z.boolean().default(false),
  }),
]);

export const schemaSaisieRoadTrip = z.object({
  personnes: entier(1, 500),
  gateauxParPersonne: gateaux,
  /**
   * La capture envoyée pour la réduction de 4 % (route des preuves). La
   * réduction ne s'applique que si le serveur retrouve cette preuve validée
   * (par l'agent IA ou à la main) et pas déjà utilisée (une par groupe).
   */
  preuveId: z.string().min(1).max(64).optional(),
});

export const schemaSaisieGbashi = z.object({
  velos: z
    .object({ CLASSIQUE: entier(0, 500), PREMIUM: entier(0, 500), PRESTIGE: entier(0, 500) })
    .partial(),
  gateauxParPersonne: gateaux,
});

export const schemaDemandeDevis = z.discriminatedUnion("offre", [
  z.object({ offre: z.literal("bike-for-all"), date: jour, saisie: schemaSaisieBikeForAll }),
  z.object({ offre: z.literal("road-trip-groupe"), date: jour, saisie: schemaSaisieRoadTrip }),
  z.object({ offre: z.literal("gbashi-groupe"), date: jour, saisie: schemaSaisieGbashi }),
]);
export type DemandeDevis = z.infer<typeof schemaDemandeDevis>;

export const schemaClient = z.object({
  prenom: z.string().trim().min(1).max(60),
  nom: z.string().trim().min(1).max(60),
  /** Obligatoire (décision 14) : récapitulatif, facture, lien de suivi. */
  email: z.string().trim().email().max(120),
  telephone: z.string().trim().min(8).max(20),
});

export const schemaDemandeReservation = schemaDemandeDevis.and(
  z.object({
    client: schemaClient,
    moyenPaiement: z.enum(["MTN_MONEY", "MOOV_MONEY", "CELTIIS_CASH"]),
    cgvAcceptees: z.literal(true),
    message: z.string().trim().max(500).optional(),
    /** Le total affiché au client (moteur dans le navigateur) : sert seulement à détecter un écart. */
    attendu: z.object({ totalXof: entier(0, 100_000_000) }),
  }),
);
export type DemandeReservation = z.infer<typeof schemaDemandeReservation>;

/** Preuve de réduction : champs du formulaire multipart, à côté du fichier « capture ». */
export const schemaChampsPreuve = z.object({
  telephone: z.string().trim().min(8).max(20),
});
/** Ce que la route des preuves accepte. */
export const TYPES_CAPTURE = ["image/jpeg", "image/png", "image/webp"] as const;
export const TAILLE_MAX_CAPTURE_OCTETS = 5 * 1024 * 1024;

/* ------------------------------------------------------------- Réponses */

/** Les vélos libres sur tout le créneau demandé. */
export interface Capacite {
  velosLibres: number;
  parGamme: Record<GammeVelo, number>;
}

/** Le créneau libre le plus proche, quand celui demandé est plein. */
export interface ProchainCreneau {
  date: DateISO;
  depart: HeureMinute;
}

export type StatutPreuve = "validee" | "en_attente" | "refusee";

/** POST devis : 200, même en cas de refus métier (il est dans `issue`). */
export interface ReponseDevis {
  ok: true;
  issue: IssueOffre;
  capacite: Capacite;
  /** Rempli quand le créneau est plein (refus PARC ou STOCK_GAMME) ; null s'il n'y en a pas. */
  prochainCreneau: ProchainCreneau | null;
  /**
   * Décision 3 : la commission SasPay (3,25 %) ajoutée au paiement, sur une
   * ligne visible, et ce que le téléphone sera débité. Absentes en cas de refus.
   */
  commissionXof?: number;
  montantADebiterXof?: number;
  /** Road trip avec `preuveId` : où en est la preuve (« inconnue » si l'identifiant ne correspond à rien). */
  preuve?: StatutPreuve | "inconnue" | "deja-utilisee";
}

/** Les refus qui ne sont pas un refus du moteur. */
export type CodeErreurOffresGroupe =
  | "FERME" // interrupteur « Offres de groupe » coupé : 403
  | "REGLAGES_ILLISIBLES" // réglages enregistrés impossibles : 503, l'administration est alertée
  | "SAISIE" // demande mal formée : 400
  | "TROP_DE_DEMANDES" // limite de débit : 429
  | "EN_ATTENTE" // une demande du même client attend déjà son paiement : 409
  | "PAIEMENT"; // le paiement n'a pas pu être lancé : 502

export interface ReponseErreur {
  ok: false;
  code: CodeErreurOffresGroupe;
  message: string;
}

/** POST reservations. */
export type ReponseReservation =
  | {
      ok: true;
      reference: string;
      /** La page de suivi du client (lien envoyé aussi par email). */
      lienSuivi: string;
      totalXof: number;
      montantADebiterXof: number;
      /** Comme le tunnel actuel : la demande part sur le téléphone, le navigateur suit avec `suivi`. */
      paiement: { statut: "REUSSI" | "EN_ATTENTE" | "ECHOUE"; suivi?: unknown; message?: string };
    }
  /** 409 : le prix a changé entre l'affichage et la demande ; le client revoit le nouveau devis. */
  | { ok: false; code: "REGLAGES"; message: string; devis: ReponseDevis }
  /** 409 : les vélos viennent d'être pris ; le créneau libre le plus proche. */
  | { ok: false; code: "DISPO"; message: string; prochainCreneau: ProchainCreneau | null }
  /** 422 : refus du moteur (minimum, date limite, délai…). */
  | { ok: false; code: "REFUS"; refus: Refus }
  | ReponseErreur;

/** POST preuves (201) et GET preuve (200). */
export interface ReponsePreuve {
  ok: true;
  preuveId: string;
  statut: StatutPreuve;
  /** Le message pour le client, en français. */
  message: string;
}
