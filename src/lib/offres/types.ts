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
 *  - le contexte de la vente : le canal (en ligne ou au comptoir), la date
 *    demandée, l'heure qu'il est, et les vélos libres ce jour-là. C'est
 *    l'appelant qui les fixe ou les lit (route, base, horloge) : le moteur
 *    ne touche ni à la base, ni à l'horloge, ni au réseau, ce qui permet de
 *    le tester à la minute près et de l'appeler aussi bien dans le
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

/**
 * Où se fait la vente (décision 12, mêmes réglages des deux côtés) :
 *
 *  - « en-ligne » : sur le site, payée par Mobile Money. Les frais de
 *    paiement électronique s'ajoutent (125 F par personne), la date limite
 *    du week-end s'applique (vendredi 19 h) et le départ doit être à
 *    `delaiMinimumMinutes` au moins de la demande (2 h) ;
 *  - « comptoir » : à la boutique, en espèces. Ni frais de paiement, ni date
 *    limite, ni délai ; la vente peut être saisie après coup, donc un départ
 *    plus tôt le jour même est accepté, jamais un jour passé.
 */
export type CanalVente = "en-ligne" | "comptoir";

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
}

/**
 * Gbashi Bike (cahier, 4.5) : le client choisit le nombre de vélos de chaque
 * gamme ; le groupe compte une personne par vélo. Une gamme absente vaut zéro.
 */
export interface DemandeGbashi {
  velos: Partial<Record<GammeVelo, number>>;
  gateauxParPersonne?: number;
}

/* ------------------------------------------------------------ Contexte */

/** Ce que l'appelant sait de la vente : son canal, le jour demandé, l'heure qu'il est. */
export interface ContexteOffre {
  /**
   * En ligne ou au comptoir : les frais de paiement et les règles de délai
   * en découlent (voir CanalVente). Toujours fixé par le serveur selon la
   * route (le site : « en-ligne » ; l'administration : « comptoir »), jamais
   * lu dans la demande du client, qui s'éviterait sinon frais et délais.
   * Absent ou inconnu : erreur du serveur (TypeError), jamais une vente au
   * hasard avec ou sans les frais.
   */
  canal: CanalVente;
  /** Le jour de la sortie, AAAA-MM-JJ, heure du Bénin. */
  date: DateISO;
  /**
   * L'instant présent (le serveur le lit, le moteur jamais). Sert à refuser
   * un jour passé et, en ligne, un départ passé ou trop proche (délai
   * minimum) et une réservation du week-end après la date limite.
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
  /** Jour déjà passé ; en ligne, départ déjà passé le jour même. */
  | "DATE_PASSEE"
  /** En ligne : réservation du week-end après le vendredi 19 h. */
  | "DATE_LIMITE"
  /** En ligne : départ trop proche, à moins de `delaiMinimumMinutes` (2 h) de la demande. */
  | "DELAI";

/** Le champ du formulaire auquel rattacher le message. */
export type ChampOffre =
  | "personnes"
  | "budgetXof"
  | "minutes"
  | "coco"
  | "gateauxParPersonne"
  | "accompagnateur"
  | "reductionValidee"
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
  /**
   * BUDGET_INSUFFISANT dans le trou du seuil des frais (avec les réglages de
   * départ : 33 et 34 personnes, de 15 000 F à 15 199 F ou 15 599 F) : un
   * budget plus petit que celui proposé marche aussi, sous le seuil, avec
   * les petits frais. C'est le plus petit budget accepté pour ce groupe
   * (14 600 F pour 34 personnes) ; `budgetMinimumXof` donne l'autre choix,
   * au-dessus (15 600 F). Absent hors du trou.
   */
  budgetInferieurXof?: number;
  /** PARC et STOCK_GAMME : le nombre de vélos qu'on peut encore prendre. */
  maximum?: number;
  /** STOCK_GAMME : la gamme en cause. */
  gamme?: GammeVelo;
  /** HEURE, retour trop tardif : le dernier départ qui rentre à l'heure (et, en ligne, encore réservable). */
  dernierDepartPossible?: HeureMinute;
  /**
   * DELAI, et DATE_PASSEE le jour même, quand le client choisit son heure
   * (Bike for All) : le premier départ encore réservable en ligne ce jour-là.
   * Absent s'il n'y en a plus (le message invite alors à changer de jour).
   */
  premierDepartPossible?: HeureMinute;
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
  /** Le canal de la vente, repris du contexte. */
  canal: CanalVente;
  /** Vrai en ligne (frais de paiement électronique), faux au comptoir : tiré du canal, jamais saisi à part. */
  paiementElectronique: boolean;
  /** Bike for All : frais d'organisation retenus ; zéro ailleurs. */
  fraisOrganisationXof: number;
  /** Bike for All : le prix des cocos ; ailleurs, compris dans le prix (pas de ligne à part) : zéro. */
  cocosXof: number;
  gateauxXof: number;
  /** Bike for All : le prix de l'accompagnateur, zéro sans lui. */
  accompagnateurXof: number;
  /** Frais de paiement électronique : 125 F par personne en ligne, zéro au comptoir (décision 12). */
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
   * Gbashi Bike sur le même patron), envoyé tel quel au client
   * (décision 21).
   */
  recapModele: string;
}

/** Ce que rend chaque calcul : un résultat, ou un refus motivé. */
export type IssueOffre = { ok: true; resultat: ResultatOffre } | { ok: false; refus: Refus };
