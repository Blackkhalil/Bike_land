/**
 * Types du domaine.
 *
 * Volontairement indépendants du client Prisma généré : la couche de
 * données a deux implémentations (démo et PostgreSQL, cf. src/lib/db)
 * et c'est ce contrat-ci qu'elles partagent.
 */

import type { DateISO } from "./dates";

/**
 * Les deux offres. Definie ici et non dans data/offres.ts pour que la
 * couche de donnees n'ait pas a dependre du contenu editorial.
 */
export type CodeOffre = "road-trip" | "location-libre";

export type CategorieVelo = "RANDONNEUR" | "GRAVEL" | "VAE" | "VTC" | "TANDEM";
export type TailleVelo = "S" | "M" | "L" | "XL";
export type StatutVelo = "DISPONIBLE" | "EN_LOCATION" | "MAINTENANCE" | "RETIRE";

export type StatutReservation =
  | "EN_ATTENTE_PAIEMENT"
  | "CONFIRMEE"
  | "EN_COURS"
  | "TERMINEE"
  | "ANNULEE";

export type MoyenPaiement = "MTN_MONEY" | "MOOV_MONEY" | "CARTE_BANCAIRE" | "ESPECES";
export type FournisseurPaiement = "FEDAPAY" | "KKIAPAY" | "ESPECES";
export type StatutPaiement = "INITIE" | "REUSSI" | "ECHOUE" | "REMBOURSE";

export interface PointDeRetrait {
  id: string;
  nom: string;
  ville: string;
  adresse: string;
  horaires: string;
  actif: boolean;
}

export interface Velo {
  id: string;
  slug: string;
  nom: string;
  categorie: CategorieVelo;
  taille: TailleVelo;
  statut: StatutVelo;
  accroche: string;
  description: string;
  poidsKg: number;
  vitesses: number;
  chargeMaxKg: number;
  autonomieConseilleeKm: number;
  autonomieAssistanceKm?: number;
  moteurWatts?: number;
  batterieWh?: number;
  equipementInclus: string[];
  pointDeRetraitId: string;
  noteMoyenne: number;
  nombreAvis: number;
  /** Teintes du visuel de repli, utilisé tant qu'aucune photo n'existe. */
  teintes: [string, string];
  /**
   * Photographie du vélo, servie depuis `public/images`. Absente, le
   * composant retombe sur l'illustration vectorielle : mieux vaut un
   * schéma juste qu'une photo d'un autre vélo.
   */
  photo?: string;
}

export interface OptionLocation {
  code: string;
  libelle: string;
  description: string;
  prixXof: number;
  /** `jour` : facturée par jour de location. `location` : forfait unique. */
  unite: "jour" | "location";
  quantifiable: boolean;
}


export interface LigneReservation {
  veloId: string;
  veloNom: string;
  veloSlug: string;
  prixUnitaireXof: number;
  totalLigneXof: number;
}

export interface OptionReservee {
  code: string;
  libelle: string;
  prixXof: number;
  quantite: number;
}

export interface Paiement {
  id: string;
  fournisseur: FournisseurPaiement;
  moyen: MoyenPaiement;
  statut: StatutPaiement;
  montantXof: number;
  referenceFournisseur?: string;
  estCaution: boolean;
  rembourseLe?: string;
  creeLe: string;
}

export interface Client {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  telephone?: string;
  creeLe: string;
}

export interface Reservation {
  id: string;
  reference: string;
  statut: StatutReservation;
  /** Offre choisie : elle commande le prix, la caution et les exigences. */
  offre: CodeOffre;
  /** Nombre de participants. Toujours 1 en location libre. */
  nombrePersonnes: number;
  /** Duree en heures : renseignee en location libre uniquement. */
  dureeHeures?: number;
  clientId: string;
  client: Client;
  pointDeRetraitId: string;
  dateDebut: DateISO;
  dateFin: DateISO;
  jours: number;
  lignes: LigneReservation[];
  options: OptionReservee[];
  sousTotalXof: number;
  optionsXof: number;
  remiseXof: number;
  cautionXof: number;
  totalXof: number;
  paiements: Paiement[];
  message?: string;
  creeLe: string;
  confirmeLe?: string;
  annuleLe?: string;
  /** Note laissée après la location, quand le module d'avis est activé. */
  note?: number;
}

export interface Avis {
  id: string;
  veloId: string;
  auteur: string;
  ville: string;
  note: number;
  titre: string;
  commentaire: string;
  date: string;
}

export interface Itineraire {
  slug: string;
  titre: string;
  region: string;
  distanceKm: number;
  duree: string;
  niveau: "Facile" | "Intermédiaire" | "Sportif";
  denivele: number;
  resume: string;
  etapes: { jour: string; titre: string; detail: string }[];
  veloConseille: CategorieVelo;
  teintes: [string, string];
  /** Photographie du parcours ; repli sur l'illustration si absente. */
  photo?: string;
}

export interface MessageContact {
  id: string;
  nom: string;
  email: string;
  sujet: string;
  message: string;
  creeLe: string;
  traiteLe?: string;
}
