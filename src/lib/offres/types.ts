/**
 * Les types du moteur de calcul des offres de groupe : Bike for All (par
 * budget ou par durée), Road trip en groupe et Gbashi Bike (cahier des
 * charges, étape 4).
 *
 * Le moteur reçoit trois choses et n'en lit pas d'autres :
 *
 *  - la demande du client, telle que le formulaire la décrit (étape 3) ;
 *  - les réglages des offres (src/data/reglages-offres.ts), relus à chaque
 *    calcul ;
 *  - le contexte du jour demandé : la date, l'heure qu'il est, et les vélos
 *    libres ce jour-là. C'est l'appelant qui les lit (base, horloge) : le
 *    moteur ne touche ni à la base, ni à l'horloge, ni au réseau, ce qui
 *    permet de le tester à la minute près et de l'appeler aussi bien dans le
 *    navigateur que sur le serveur.
 *
 * Il rend soit un résultat chiffré, soit un refus motivé, poli, à montrer
 * tel quel au client. Il ne lève jamais d'erreur pour une saisie du client.
 */

import type { GammeVelo } from "@/data/offres";
import type { DateISO } from "@/lib/dates";

export type { GammeVelo };

/** Les trois offres de groupe. */
export type CodeOffreGroupe = "bike-for-all" | "road-trip-groupe" | "gbashi-groupe";

/** Le coco servi à chacun : aucun, petit format ou grand format. */
export type Coco = "aucun" | "petit" | "grand";

/** Une heure de la journée, « 08:00 », heure du Bénin. */
export type HeureMinute = string;

/* ------------------------------------------------------------ Demandes */

/**
 * Bike for All, le client donne son budget (cahier, 4.1) : le moteur en
 * tire le coco, la durée de vélo et le prix barré.
 */
export interface DemandeBikeForAllBudget {
  personnes: number;
  /** Le budget du groupe, en francs CFA entiers. */
  budgetXof: number;
  /** L'heure de départ, au quart d'heure : « 08:00 ». */
  depart: HeureMinute;
  /** Zéro par défaut. */
  gateauxParPersonne?: number;
  /** Non par défaut. */
  accompagnateur?: boolean;
  /**
   * Vrai en ligne : les frais de paiement électronique s'ajoutent. Faux au
   * comptoir, en espèces : mêmes réglages, sans ces frais (décision 12).
   * Toujours précisé : un oubli ne doit ni facturer des frais au comptoir,
   * ni les perdre en ligne.
   */
  paiementElectronique: boolean;
}

/** Bike for All, le client donne sa durée (cahier, 4.2) : le moteur additionne. */
export interface DemandeBikeForAllDuree {
  personnes: number;
  /** Durée de vélo souhaitée, en minutes, par pas réglé (15 min). */
  minutes: number;
  depart: HeureMinute;
  coco: Coco;
  gateauxParPersonne?: number;
  accompagnateur?: boolean;
  paiementElectronique: boolean;
}

/** Road trip en groupe (cahier, 4.4) : départ et retour fixés par les réglages. */
export interface DemandeRoadTrip {
  personnes: number;
  /**
   * La réduction validée (agent IA ou administration, décision 8). Jamais
   * accordée par défaut : faux si absent.
   */
  reductionValidee?: boolean;
  gateauxParPersonne?: number;
  paiementElectronique: boolean;
}

/**
 * Gbashi Bike (cahier, 4.5) : le client choisit le nombre de vélos de chaque
 * gamme ; le groupe compte une personne par vélo. Une gamme absente vaut zéro.
 */
export interface DemandeGbashi {
  velos: Partial<Record<GammeVelo, number>>;
  gateauxParPersonne?: number;
  paiementElectronique: boolean;
}

/* ------------------------------------------------------------ Contexte */

/** Ce que l'appelant sait du jour demandé, et l'heure qu'il est. */
export interface ContexteOffre {
  /** Le jour de la sortie, AAAA-MM-JJ, heure du Bénin. */
  date: DateISO;
  /**
   * L'instant présent (le serveur le lit, le moteur jamais). Sert à refuser
   * un départ passé et une réservation du week-end après la date limite.
   */
  maintenant: Date | number;
  /**
   * Les vélos libres ce jour-là, toutes gammes confondues (décision 10) :
   * c'est le plafond du groupe, il n'y en a pas d'autre. Un nombre inconnu
   * ou invalide compte pour zéro : on ne vend pas à l'aveugle.
   */
  velosDisponibles: number;
  /**
   * Gbashi Bike : les vélos libres de chaque gamme ce jour-là. Une gamme
   * absente compte pour zéro.
   */
  stockParGamme?: Partial<Record<GammeVelo, number>>;
}

/* --------------------------------------------------------------- Refus */

export type CodeRefus =
  /** Une saisie illisible : nombre non entier, date mal écrite… */
  | "SAISIE"
  /** Moins de personnes que le minimum de l'offre. */
  | "PERSONNES_MIN"
  /** Plus de personnes que de vélos libres ce jour-là. */
  | "PARC"
  /** Gbashi Bike : plus de vélos d'une gamme qu'il n'en reste. */
  | "STOCK_GAMME"
  /** Bike for All : budget sous le minimum réglé (5 000 F). */
  | "BUDGET_MIN"
  /** Bike for All : le budget ne paie pas la durée minimale (30 min) pour ce groupe. */
  | "BUDGET_INSUFFISANT"
  /** Bike for All : durée sous le minimum, ou hors du pas de 15 min. */
  | "DUREE"
  /** Jour où l'offre ne part pas (road trip : samedi ou dimanche ; Gbashi : dimanche). */
  | "JOUR"
  /** Départ hors des horaires, hors du quart d'heure, ou retour après l'heure limite. */
  | "HEURE"
  /** Départ déjà passé. */
  | "DATE_PASSEE"
  /** Réservation du week-end après le vendredi 19 h. */
  | "DATE_LIMITE";

/** Le champ du formulaire auquel rattacher le message. */
export type ChampOffre =
  | "personnes"
  | "budgetXof"
  | "minutes"
  | "coco"
  | "gateauxParPersonne"
  | "accompagnateur"
  | "reductionValidee"
  | "paiementElectronique"
  | "velos"
  | "date"
  | "depart";

export interface Refus {
  code: CodeRefus;
  /** Le message pour le client : poli, simple, en français. */
  message: string;
  champ?: ChampOffre;
  /**
   * BUDGET_MIN et BUDGET_INSUFFISANT : le plus petit budget accepté pour ce
   * groupe (frais + durée minimale au tarif Bike for All), au-dessus du
   * budget proposé.
   */
  budgetMinimumXof?: number;
  /** PARC et STOCK_GAMME : le nombre de vélos qu'on peut encore prendre. */
  maximum?: number;
  /** STOCK_GAMME : la gamme en cause. */
  gamme?: GammeVelo;
  /** HEURE, retour trop tardif : le dernier départ qui rentre à l'heure. */
  dernierDepartPossible?: HeureMinute;
}

/* ------------------------------------------------------------ Résultat */

/** Le code d'une ligne de prix, pour la reconnaître sans lire son libellé. */
export type CodeLigne =
  | "budget"
  | "temps"
  | "frais-organisation"
  | "cocos"
  | "gateaux"
  | "accompagnateur"
  | "road-trip"
  | "reduction"
  | `velos-${Lowercase<GammeVelo>}`
  | "frais-paiement";

/**
 * Une ligne du prix. La somme des lignes fait toujours le total ; la
 * réduction du road trip y figure en négatif.
 */
export interface LigneOffre {
  code: CodeLigne;
  libelle: string;
  /** Le calcul, en clair : « 15 × 175 F ». */
  detail?: string;
  montantXof: number;
}

export interface ResultatOffre {
  offre: CodeOffreGroupe;
  /** Bike for All : par budget ou par durée ; les deux autres : au forfait. */
  mode: "budget" | "duree" | "forfait";
  personnes: number;
  date: DateISO;
  /** Départ et retour, « 08:00 » et « 08:45 ». */
  depart: HeureMinute;
  fin: HeureMinute;
  /** La durée de vélo, en minutes. */
  minutes: number;
  /**
   * Le coco servi : celui retenu par le budget ou choisi (Bike for All), le
   * grand format compris dans le prix (road trip, Gbashi Bike).
   */
  coco: Coco;
  /** Le nombre de cocos à préparer. */
  cocos: number;
  /** Le nombre de bouteilles d'eau à préparer (road trip, Gbashi Bike ; zéro pour Bike for All). */
  eaux: number;
  /** Le nombre de gâteaux à préparer. */
  gateaux: number;
  /** Gbashi Bike : les vélos de chaque gamme ; ailleurs, gamme mélangée : `null`. */
  velosParGamme: Record<GammeVelo, number> | null;
  lignes: LigneOffre[];
  paiementElectronique: boolean;
  /** Bike for All : frais d'organisation retenus ; zéro ailleurs. */
  fraisOrganisationXof: number;
  /** Bike for All : le prix des cocos ; ailleurs, compris dans le prix (pas de ligne à part) : zéro. */
  cocosXof: number;
  gateauxXof: number;
  /** Bike for All : le prix de l'accompagnateur, zéro sans lui. */
  accompagnateurXof: number;
  /** Frais de paiement électronique : 125 F par personne en ligne, zéro au comptoir. */
  fraisPaiementXof: number;
  /** Road trip : la réduction accordée, en positif ; zéro ailleurs. */
  reductionXof: number;
  /** Ce que paie le groupe. */
  totalXof: number;
  /**
   * Le prix barré : toujours pour Bike for All ; pour le road trip
   * seulement quand la réduction s'applique ; jamais pour Gbashi Bike.
   */
  prixBarreXof: number | null;
  /** Ce qui reste à Bike Land une fois cocos, eau, gâteaux et frais de paiement réglés. */
  encaisseNetXof: number;
  /** Les vélos à bloquer de `depart` à `fin`. */
  velosBloques: number;
  /**
   * Le récapitulatif modèle (onglets du tableur, cellules A33, A27 et A20 ;
   * Gbashi Bike sur le même patron), que l'agent IA reprend sans changer
   * un chiffre.
   */
  recapModele: string;
}

/** Ce que rend chaque calcul : un résultat, ou un refus motivé. */
export type IssueOffre = { ok: true; resultat: ResultatOffre } | { ok: false; refus: Refus };
