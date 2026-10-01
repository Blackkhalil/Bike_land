/**
 * Types du domaine.
 *
 * Volontairement indépendants du client Prisma généré : la couche de
 * données a deux implémentations (démo et PostgreSQL, cf. src/lib/db)
 * et c'est ce contrat-ci qu'elles partagent.
 */

import type { DateISO } from "./dates";
import type { GammeVelo } from "@/data/offres";

/**
 * Les deux offres. Definie ici et non dans data/offres.ts pour que la
 * couche de donnees n'ait pas a dependre du contenu editorial.
 */
export type CodeOffre = "road-trip" | "location-libre";

export type { GammeVelo };

export type CategorieVelo = "VTT" | "RANDONNEUR" | "GRAVEL" | "VAE" | "VTC" | "TANDEM";
export type TailleVelo = "S" | "M" | "L" | "XL";
export type StatutVelo = "DISPONIBLE" | "EN_LOCATION" | "MAINTENANCE" | "RETIRE";

export type StatutReservation =
  | "EN_ATTENTE_PAIEMENT"
  | "CONFIRMEE"
  | "EN_COURS"
  | "TERMINEE"
  | "ANNULEE";

/**
 * Moyens de paiement du domaine.
 *
 * `ESPECES` n'est pas proposé en ligne : il ne sert qu'aux encaissements
 * faits de la main à la main au point de départ.
 */
export type MoyenPaiement = "MTN_MONEY" | "MOOV_MONEY" | "CELTIIS_CASH" | "ESPECES";
/**
 * Agrégateurs de paiement.
 *
 * SasPay est le seul actif. FEDAPAY et KKIAPAY restent déclarés pour les
 * paiements déjà enregistrés sous ces noms : les retirer rendrait
 * illisibles des factures déjà envoyées.
 */
export type FournisseurPaiement = "FEDAPAY" | "KKIAPAY" | "SASPAY" | "ESPECES";
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
  /** Gamme commerciale : c'est elle qui commande le prix. */
  gamme: GammeVelo;
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
  /**
   * Presentation video du velo, servie depuis `public/images`.
   *
   * Quand elle existe, elle remplace la photo sur la fiche : douze
   * secondes de tour complet valent mieux qu'un cliche fixe pour juger
   * d'une machine qu'on va louer.
   */
  video?: string;
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
  /** Heures de la sortie. 8 h-11 h pour un road trip, variables sinon. */
  heureDebut: number;
  heureFin: number;
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
  /** Code de parrainage utilisé, s'il y en a un. */
  codeParrainage?: string;
}

/**
 * Un avis laissé par un client après sa sortie.
 *
 * Distinct de `Avis`, qui est le témoignage éditorial du site : celui-ci
 * est rattaché à une réservation réelle, une seule par sortie, et ne
 * paraît qu'une fois relu. Sans cette relecture, la page d'un vélo
 * deviendrait le premier endroit venu pour écrire n'importe quoi.
 */
/** Un partenaire qui nous apporte des clients par son code de parrainage. */
export interface Partenaire {
  id: string;
  nom: string;
  /** Téléphone ou email : à qui l'on parle chez ce partenaire. */
  contact?: string;
  notes?: string;
  actif: boolean;
  creeLe: string;
}

/**
 * Ce que le partenaire a apporté, et ce qu'on lui doit.
 *
 * Le chiffre d'affaires compté ici est celui **après** réduction : c'est
 * ce que ces clients ont réellement payé, et donc ce que le partenariat a
 * rapporté. Y mettre le montant avant réduction gonflerait
 * artificiellement le rendement de chaque partenaire.
 *
 * `commissionDueXof` est la somme des commissions figées à chaque
 * utilisation. Elle ne se recalcule pas : le taux est une politique, et
 * appliquer le taux d'aujourd'hui à une réservation de l'an dernier
 * fausserait l'historique des versements.
 */
export interface StatistiquesPartenaire {
  partenaire: Partenaire;
  codes: string[];
  /** Nombre de clients venus par ce partenaire. */
  utilisations: number;
  reductionsAccordeesXof: number;
  chiffreAffairesXof: number;
  /** Commission à verser au partenaire. */
  commissionDueXof: number;
  derniereUtilisation?: string;
}

export interface AvisClient {
  id: string;
  veloId: string;
  veloNom: string;
  /** Référence de la réservation : un avis par sortie, pas un de plus. */
  reference: string;
  auteur: string;
  note: number;
  titre?: string;
  commentaire?: string;
  /** Un avis n'apparaît sur le site qu'une fois relu et publié. */
  publie: boolean;
  creeLe: string;
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
