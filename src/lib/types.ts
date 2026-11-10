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
 * Les offres. Definie ici et non dans data/offres.ts pour que la couche de
 * donnees n'ait pas a dependre du contenu editorial.
 *
 * `octobre-rose` est la sortie de saison (src/data/octobre-rose.ts), une
 * par jour fixe : le client choisit son jour, qui est la date de la
 * reservation. Un prix par personne quel que soit le velo, et des velos
 * attribues d'office, un par participant.
 */
/**
 * Les formules. Gbashi bike et Padel bike sont des sorties sur commande
 * (novembre 2026) : elles ne se réservent pas en ligne, le comptoir les
 * enregistre au jour et à l'heure convenus avec le client.
 *
 * Les trois offres de groupe (`CodeOffreGroupe`) s'y ajoutent : leur prix
 * vient du moteur de src/lib/offres/ et des réglages de l'administration,
 * jamais de `calculerDevis`. « gbashi-groupe » est Gbashi Bike sur
 * réservation ; « gbashi-bike » reste pour les ventes passées au comptoir.
 */
export type CodeOffre =
  | "road-trip"
  | "location-libre"
  | "octobre-rose"
  | "gbashi-bike"
  | "padel-bike"
  | CodeOffreGroupe;

/** Bike for All, Road trip en groupe, Gbashi Bike sur réservation. */
export type CodeOffreGroupe = "bike-for-all" | "road-trip-groupe" | "gbashi-groupe";

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
  /** Qui a reçu l'argent, pour une vente en espèces saisie dans l'administration. */
  encaissePar?: string;
  /** Ce qui a été rendu au client, quand le paiement est REMBOURSE. */
  montantRenduXof?: number;
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
  /**
   * Nombre de participants. Toujours 1 en location libre. Pour Octobre
   * rose, autant que de vélos attribués (`lignes`).
   */
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
  /**
   * L'horaire exact d'une sortie réglée à la minute (Padel bike), tel que
   * réservé : départ « 18:30 », retour « 22:30 ». Les heures pleines
   * ci-dessus restent celles pendant lesquelles les vélos sont pris.
   */
  horaire?: { depart: string; retour: string };
  /**
   * Le créneau exact d'une offre de groupe, en minutes depuis minuit
   * (480 = 8 h, 525 = 8 h 45). Les heures pleines ci-dessus le couvrent.
   */
  minuteDebut?: number;
  minuteFin?: number;
  /** Le retard saisi au retour des vélos, et sa pénalité. */
  retard?: RetardReservation;
  /** Ce que le calcul d'une offre de groupe a donné à la réservation. */
  offreDetails?: DetailsOffreGroupe;
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
  /**
   * Commission due au partenaire pour cette réservation, figée au moment
   * où le code a été appliqué. Elle ne se recalcule jamais : le taux est
   * une politique, et appliquer celui d'aujourd'hui à une réservation
   * passée fausserait ce qu'on doit au partenaire.
   */
  commissionParrainageXof?: number;
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
  /**
   * Ce que montre vraiment la photo, pour son texte alternatif : une photo
   * d'illustration ne doit pas se faire passer pour le circuit lui-même.
   */
  photoAlt?: string;
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

/* ------------------------------------------- Ouverture des réservations */

/** Ce qu'un jour fermé concerne : une formule, ou les deux. */
export type FormuleFermee = "road-trip" | "location-libre" | "toutes";

/**
 * Un jour fermé à la réservation en ligne, depuis le tableau de bord.
 *
 * Complet parce que des places ont été vendues en espèces, sortie privée,
 * atelier fermé : le site cesse de proposer ce jour, et le serveur refuse
 * toute nouvelle réservation dessus. Les réservations déjà prises restent
 * valables.
 */
export interface JourFerme {
  id: string;
  date: string;
  formule: FormuleFermee;
  motif?: string;
  creeLe: string;
}

/** L'état de la réservation tel que l'exploitant l'a réglé. */
export interface ReglagesOuverture {
  /** État des créneaux de road trip modifiés depuis l'admin, par code. */
  creneaux: Record<string, boolean>;
  joursFermes: JourFerme[];
}

/* ------------------------------------------------------ Offres de groupe */

/**
 * Ce que le calcul d'une offre de groupe a donné, figé sur la réservation
 * (colonne `offreDetails`) : un réglage changé ensuite ne réécrit pas ce que
 * le client a payé. Écrit par la réservation des offres de groupe ; lu par
 * l'administration (fiche du jour, cocos à prévoir, fiche de la
 * réservation). Tous les champs sont facultatifs : l'administration affiche
 * ce qui est là et ignore le reste.
 */
export interface DetailsOffreGroupe {
  /** Bike for All : le client a donné son budget, ou sa durée. */
  mode?: "budget" | "duree";
  budgetXof?: number;
  /** La durée de vélo retenue, en minutes. */
  minutes?: number;
  /** « 08:00 », « 08:45 ». */
  depart?: string;
  retour?: string;
  /** Le format de coco, et combien en préparer pour tout le groupe. */
  coco?: "aucun" | "petit" | "grand";
  cocos?: number;
  eaux?: number;
  gateaux?: number;
  accompagnateur?: boolean;
  accompagnateurXof?: number;
  /** Gbashi Bike : combien de vélos de chaque gamme. */
  gammes?: Partial<Record<GammeVelo, number>>;
  reductionXof?: number;
  fraisPaiementXof?: number;
  prixBarreXof?: number;
  totalXof?: number;
  /** Le récapitulatif envoyé au client, tel quel. */
  recapitulatif?: string;
  [cle: string]: unknown;
}

/** Le retard au retour des vélos, saisi dans l'administration. */
export interface RetardReservation {
  minutes: number;
  /** Calculée avec la tolérance et le montant par minute du moment de la saisie. */
  penaliteXof: number;
  /** « admin (Koffi) ». */
  saisiPar?: string;
}

/** Un vélo indisponible un jour précis : il sort du parc ce jour-là seulement. */
export interface IndisponibiliteVelo {
  id: string;
  veloId: string;
  veloNom: string;
  date: DateISO;
  motif?: string;
  creePar: string;
  creeLe: string;
}

/**
 * Une ligne du journal des événements. `type` est libre (les types connus
 * et leurs libellés sont dans src/lib/journal.ts) : une offre ou un lot qui
 * journalise un nouvel événement n'a rien à déclarer ici.
 */
export interface EvenementJournal {
  id: string;
  type: string;
  reference?: string;
  details: Record<string, unknown>;
  auteur: string;
  creeLe: string;
}

export type StatutRemboursement = "a_faire" | "fait";

/** De l'argent à rendre à un client, et qui l'a rendu. */
export interface Remboursement {
  id: string;
  reservationId: string;
  reference: string;
  offre: CodeOffre;
  /** À qui rendre l'argent : le contact saisi pour la réservation. */
  client: { prenom: string; nom: string; email: string; telephone?: string };
  montantXof: number;
  motif: string;
  statut: StatutRemboursement;
  faitPar?: string;
  faitLe?: string;
  creeLe: string;
  /** La clé qui désigne la demande (une transaction reçue, par exemple) : unique, elle empêche un second remboursement. */
  cleIdempotence?: string;
}

/** Pourquoi un vélo réservé ne peut plus partir. */
export type RaisonVeloTouche = "RETIRE" | "MAINTENANCE" | "INDISPONIBLE";

/**
 * Une réservation payée dont un vélo n'est plus là : retiré du parc, à
 * l'atelier, ou déclaré indisponible ce jour-là. Bike Land appelle le client
 * (cahier des charges, étape 1 : « afficher une alerte qui liste les
 * réservations concernées »).
 */
export interface ReservationTouchee {
  reference: string;
  offre: CodeOffre;
  statut: "CONFIRMEE" | "EN_COURS";
  dateDebut: DateISO;
  dateFin: DateISO;
  heureDebut: number;
  heureFin: number;
  horaire?: { depart: string; retour: string };
  nombrePersonnes: number;
  /** De quoi résumer la formule (`resumeOffre`) : la durée d'une location libre, les minutes d'une offre de groupe. */
  dureeHeures?: number;
  minuteDebut?: number;
  minuteFin?: number;
  client: { prenom: string; nom: string; telephone?: string };
  velos: { veloId: string; veloNom: string; raison: RaisonVeloTouche; date?: DateISO; motif?: string }[];
}

/** Où en est une preuve de réduction : à vérifier, validée, ou refusée. */
export type StatutPreuveReduction = "en_attente" | "validee" | "refusee";

/**
 * Une capture d'écran envoyée pour la réduction du Road trip en groupe
 * (abonné à un réseau de Bike Land, ou story qui l'identifie), et la décision
 * prise : par l'agent IA quand il est activé, sinon à la main dans
 * l'administration (décisions 8 et 21). Le fichier est privé, effacé dès la
 * décision et 30 jours au plus tard ; la ligne reste, sans lui, pour la trace.
 */
export interface PreuveReduction {
  id: string;
  /** La réservation qui a retenu la réduction, une fois la preuve servie (une par groupe). */
  reference?: string;
  /** Où le fichier est rangé (« blob:… » ou « base:… ») ; absent une fois effacé. */
  fichierCle?: string;
  typeMime: string;
  tailleOctets: number;
  statut: StatutPreuveReduction;
  /** Ce que l'agent IA a lu, réduit au réseau et au compte de Bike Land reconnus. */
  verdict?: Record<string, unknown>;
  /** La raison de la décision, pour l'administration. */
  motif?: string;
  /** « admin (Koffi) », « agent IA » ou « site ». */
  decidePar?: string;
  decideLe?: string;
  /** Quand le fichier a été effacé. */
  supprimeLe?: string;
  /** Pour prévenir le client de la décision prise à la main (décision 14). */
  email?: string;
  telephone?: string;
  creeLe: string;
}
