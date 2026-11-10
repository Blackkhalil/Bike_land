/**
 * La conversation du chatbot des offres de groupe (décisions 22 et 23 du
 * responsable) : une machine à états pure, sans React, sans réseau, sans
 * horloge. La vue (src/components/offres-groupe) ne fait qu'afficher l'état
 * et envoyer des actions ; elle porte aussi les échanges avec le serveur,
 * dont elle rend les réponses à la machine telles quelles (statut HTTP et
 * corps), pour que tout ce qui en découle se teste ici.
 *
 * Le chatbot pose ses questions une par une, avec des boutons, sans IA :
 *
 *   l'offre → le groupe → le jour → (Bike for All) l'heure, le budget ou la
 *   durée et le coco → les gâteaux → (Bike for All) l'accompagnateur →
 *   (road trip) la réduction et sa capture → (Gbashi Bike) les vélos par
 *   gamme → l'offre chiffrée → la négociation → les coordonnées → le
 *   réseau Mobile Money → les conditions générales → le paiement.
 *
 * Chaque montant vient du moteur (src/lib/offres), identique au tableur du
 * responsable, calculé dans le navigateur pour répondre tout de suite, puis
 * confirmé par le serveur (POST devis) avant toute réservation. Le chatbot
 * n'invente jamais un prix. Quand le moteur refuse, il le dit avec le
 * message du moteur et propose d'autres choix qui passent, chacun recalculé
 * (src/lib/offres-groupe/negociation.ts).
 *
 * Les routes et les formes des échanges sont celles du contrat commun
 * (src/lib/offres-groupe/api.ts), en lecture seule ici.
 */

import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import type { ReglagesOffres } from "@/data/reglages-offres";
import type { DateISO } from "@/lib/dates";
import { diagnostiquer } from "@/lib/echecs-paiement";
import {
  budgetMinimumBikeForAllXof,
  formatMontant,
  formatPourcentage,
  prixAccompagnateurXof,
  type Coco,
  type CodeOffreGroupe,
  type GammeVelo,
  type HeureMinute,
  type Refus,
  type ResultatOffre,
} from "@/lib/offres";
import type { MoyenPaiement } from "@/lib/types";

import {
  schemaClient,
  type CodeErreurOffresGroupe,
  type DemandeDevis,
  type DemandeReservation,
  type ProchainCreneau,
  type ReponseDevis,
  type StatutPreuve,
} from "./api";
import {
  alternativesDuRefus,
  evaluer,
  parcDesFaits,
  refusDuJour,
  totalVelos,
  variantesMoinsCheres,
  type ParcConnu,
} from "./negociation";
import {
  cocoEnClair,
  consignesPreuve,
  CORRECTIONS_CHAMPS,
  correctionPersonnesMax,
  correctionPersonnesMin,
  departEnClair,
  dureeEnClair,
  estCodeOffreGroupe,
  gateauxEnClair,
  jourEnClair,
  ligneDeLOffre,
  majuscule,
  MESSAGE_ACCUEIL,
  MESSAGE_ACCUEIL_OFFRES,
  MESSAGE_RECOMMENCER,
  MESSAGE_REPRISE_COORDONNEES,
  NOMS_OFFRES,
  ORDRE_OFFRES,
  personnesEnClair,
  personnesMinDe,
  presentationOffre,
  QUESTION_COORDONNEES,
  QUESTION_DUREE,
  QUESTION_MODE,
  QUESTION_MOYEN,
  QUESTION_OFFRE,
  QUESTION_PAYER,
  questionAccompagnateur,
  questionBudget,
  questionChamp,
  questionCoco,
  questionDate,
  questionGateaux,
  questionHeure,
  questionPersonnes,
  questionReduction,
  questionVelos,
  rappelCoordonnees,
  velosEnClair,
  type ChampCoordonnees,
} from "./textes-chat";

export type { ChampCoordonnees };

/* ------------------------------------------------------------------ Types */

/** Ce que le serveur a dit au chargement de la page : les réglages et le parc en état. */
export interface FaitsChat {
  reglages: ReglagesOffres;
  /** Les vélos en état de rouler, toutes gammes : le plafond du groupe tant que le jour n'est pas connu. */
  velosEnEtat: number;
  /** Les mêmes, gamme par gamme (Gbashi Bike). */
  parGamme: Record<GammeVelo, number>;
}

/** Où en est la réduction du road trip (décision 8 : jamais par défaut). */
export type EtatReduction =
  /** Pas encore demandé. */
  | { etat: "a-demander" }
  /** Le client réserve sans la réduction. */
  | { etat: "sans" }
  /** Une capture est connue (lien de l'email), son état est à demander au serveur. */
  | { etat: "a-verifier"; preuveId: string }
  /** La capture part vers le serveur. */
  | { etat: "envoi" }
  | { etat: "en_attente"; preuveId: string }
  | { etat: "validee"; preuveId: string }
  | { etat: "refusee"; preuveId?: string };

/** Les réponses du client, `null` tant qu'il ne les a pas données. */
export interface Choix {
  offre: CodeOffreGroupe | null;
  personnes: number | null;
  date: DateISO | null;
  /** Bike for All : l'heure de départ choisie. Les deux autres partent à l'heure des réglages. */
  depart: HeureMinute | null;
  mode: "budget" | "duree" | null;
  budgetXof: number | null;
  minutes: number | null;
  coco: Coco | null;
  gateauxParPersonne: number | null;
  accompagnateur: boolean | null;
  /** Gbashi Bike : les vélos de chaque gamme. */
  velos: Partial<Record<GammeVelo, number>> | null;
  reduction: EtatReduction;
}

export interface Coordonnees {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
}

export type Etape =
  | "offre"
  | "personnes"
  | "date"
  | "heure"
  | "mode"
  | "budget"
  | "duree"
  | "coco"
  | "gateaux"
  | "accompagnateur"
  | "reduction"
  | "preuve"
  | "preuve-statut"
  | "velos"
  | "proposition"
  | "negociation"
  | "refus"
  | "coordonnees"
  | "moyen"
  | "payer"
  | "attente"
  | "confirmee"
  | "echec"
  | "ferme";

const ETAPES: readonly Etape[] = [
  "offre",
  "personnes",
  "date",
  "heure",
  "mode",
  "budget",
  "duree",
  "coco",
  "gateaux",
  "accompagnateur",
  "reduction",
  "preuve",
  "preuve-statut",
  "velos",
  "proposition",
  "negociation",
  "refus",
  "coordonnees",
  "moyen",
  "payer",
  "attente",
  "confirmee",
  "echec",
  "ferme",
];

/** Un autre choix proposé au client, toujours recalculé par le moteur avant d'être proposé. */
export interface Alternative {
  /** Une clé stable, pour l'affichage et les tests. */
  cle: string;
  /** Ce que lit le client, total compris quand le moteur le connaît. */
  libelle: string;
  totalXof?: number;
  /** Ce qui change dans les réponses du client. */
  changement: Partial<Choix>;
}

export type TonMessage = "alerte" | "succes";

/** Une ligne d'une liste dans une bulle : les trois sorties de l'accueil, chacune avec sa présentation. */
export interface PointMessage {
  titre: string;
  texte: string;
}

export interface MessageChat {
  id: number;
  de: "bot" | "client";
  texte: string;
  ton?: TonMessage;
  /**
   * L'instant où la bulle est arrivée (millisecondes) : son heure s'affiche
   * dessous, comme sur un téléphone. Posé par `reduire` avec l'instant de
   * l'action ; absent des conversations rangées avant, qui s'affichent sans heure.
   */
  a?: number;
  /** Une liste sous le texte de la bulle (l'accueil présente ainsi les trois sorties). */
  points?: PointMessage[];
}

/** Ce que le navigateur doit savoir pour suivre un paiement en cours (comme src/lib/paiement.ts). */
export interface SuiviPaiementChat {
  paiementId: string;
  moyen: MoyenPaiement;
  telephone: string;
  urlCheckout?: string;
}

/** La réservation créée par le serveur (POST reservations, 201). */
export interface ReservationCreee {
  reference: string;
  lienSuivi: string;
  /** Le jeton du lien de suivi, qui sert à suivre le paiement ; `null` si le lien ne le porte pas. */
  token: string | null;
  totalXof: number;
  montantADebiterXof: number;
  statutPaiement: "REUSSI" | "EN_ATTENTE" | "ECHOUE";
  suivi: SuiviPaiementChat | null;
  messagePaiement?: string;
  /** L'instant où la demande de paiement est partie : l'attente expire 30 minutes après. */
  demandeLe?: number;
}

export interface EtatChat {
  version: typeof VERSION_CONVERSATION;
  etape: Etape;
  choix: Choix;
  client: Coordonnees;
  moyen: MoyenPaiement | null;
  cgv: boolean;
  messages: MessageChat[];
  prochainId: number;
  /** Le dernier devis du serveur, et la demande (sa signature) pour laquelle il a été fait. */
  devis: { signature: string; reponse: ReponseDevis } | null;
  /** La demande dont le devis n'a pas pu être obtenu : on attend que le client relance. */
  devisEnEchec: string | null;
  /** Les vélos libres mesurés par le serveur pour une offre et un jour (road trip et Gbashi Bike partent à heure fixe). */
  capacite: { offre: CodeOffreGroupe; date: DateISO; velosLibres: number; parGamme: Record<GammeVelo, number> } | null;
  refus: { refus: Refus; prochainCreneau: ProchainCreneau | null } | null;
  /** Les choix proposés en ce moment : après un refus, ou pour payer moins. */
  alternatives: Alternative[];
  reservation: ReservationCreee | null;
  /** Un envoi en cours : les boutons attendent sa réponse. */
  envoi: "preuve" | "reservation" | null;
}

/** La version de l'état rangé dans le navigateur : à changer quand sa forme change. */
export const VERSION_CONVERSATION = 1;

/** Le nombre de bulles gardées : une conversation complète en tient largement. */
const MESSAGES_MAX = 80;

const CHOIX_VIDES: Choix = {
  offre: null,
  personnes: null,
  date: null,
  depart: null,
  mode: null,
  budgetXof: null,
  minutes: null,
  coco: null,
  gateauxParPersonne: null,
  accompagnateur: null,
  velos: null,
  reduction: { etat: "a-demander" },
};

const CLIENT_VIDE: Coordonnees = { prenom: "", nom: "", email: "", telephone: "" };

/**
 * L'accueil quand la discussion s'ouvre sans offre choisie (la bulle) ou
 * repart de zéro : les trois sorties avec leur présentation, aux chiffres
 * des réglages en vigueur, puis la question.
 */
function messagesAccueil(reglages: ReglagesOffres, recommence: boolean): Omit<MessageChat, "id">[] {
  return [
    {
      de: "bot",
      texte: recommence ? MESSAGE_RECOMMENCER : MESSAGE_ACCUEIL_OFFRES,
      points: ORDRE_OFFRES.map((offre) => ({ titre: NOMS_OFFRES[offre], texte: ligneDeLOffre(offre, reglages) })),
    },
    { de: "bot", texte: QUESTION_OFFRE },
  ];
}

/**
 * La discussion au départ. Avec les faits du serveur, l'accueil présente
 * les trois sorties ; avec l'instant, ses bulles portent leur heure.
 */
export function etatInitial(client: Coordonnees = CLIENT_VIDE, faits?: FaitsChat, maintenant?: number): EtatChat {
  const accueil: Omit<MessageChat, "id">[] = faits ? messagesAccueil(faits.reglages, false) : [{ de: "bot", texte: MESSAGE_ACCUEIL }];
  const messages = accueil.map((message, index) => ({
    ...message,
    id: index + 1,
    ...(typeof maintenant === "number" ? { a: maintenant } : {}),
  }));
  return {
    version: VERSION_CONVERSATION,
    etape: "offre",
    choix: CHOIX_VIDES,
    client,
    moyen: null,
    cgv: false,
    messages,
    prochainId: messages.length + 1,
    devis: null,
    devisEnEchec: null,
    capacite: null,
    refus: null,
    alternatives: [],
    reservation: null,
    envoi: null,
  };
}

/* ---------------------------------------------------------------- Actions */

type Horodatee<T> = T & { maintenant: number };

export type ActionChat = Horodatee<
  | { type: "demarrer"; offre?: CodeOffreGroupe; preuveId?: string }
  | { type: "recommencer" }
  | { type: "choisir-offre"; offre: CodeOffreGroupe }
  | { type: "choisir-personnes"; personnes: number }
  | { type: "choisir-date"; date: DateISO }
  | { type: "choisir-heure"; depart: HeureMinute }
  | { type: "choisir-mode"; mode: "budget" | "duree" }
  | { type: "choisir-budget"; budgetXof: number }
  | { type: "choisir-duree"; minutes: number }
  | { type: "choisir-coco"; coco: Coco }
  | { type: "choisir-gateaux"; gateauxParPersonne: number }
  | { type: "choisir-accompagnateur"; accompagnateur: boolean }
  | { type: "choisir-velos"; velos: Partial<Record<GammeVelo, number>> }
  | { type: "repondre-reduction"; veut: boolean }
  | { type: "preuve-envoi"; telephone: string; email: string }
  | { type: "preuve-recue"; statut: number; corps: unknown }
  | { type: "verifier-preuve" }
  | { type: "renvoyer-preuve" }
  | { type: "reduction-sans" }
  | { type: "devis-recu"; signature: string; statut: number; corps: unknown }
  | { type: "devis-echec"; signature: string }
  | { type: "relancer-devis" }
  | { type: "trop-cher" }
  | { type: "garder-offre" }
  | { type: "appliquer"; alternative: Alternative }
  | { type: "reserver" }
  | { type: "saisir-coordonnees"; client: Coordonnees }
  /** Une coordonnée tapée dans la barre du bas, en réponse à la question posée (`champDemande`). */
  | { type: "saisir-champ"; champ: ChampCoordonnees; valeur: string }
  /** Revenir sur des coordonnées déjà données, avant de payer. */
  | { type: "modifier-coordonnees" }
  | { type: "choisir-moyen"; moyen: MoyenPaiement }
  | { type: "accepter-cgv"; acceptees: boolean }
  | { type: "reservation-envoi" }
  | { type: "reservation-recue"; statut: number; corps: unknown }
  | { type: "reservation-echec" }
  | { type: "paiement-confirme" }
  | { type: "paiement-echoue"; message: string }
  | { type: "paiement-expire" }
>;

/** L'attente du paiement a dépassé la garde des vélos. */
const MESSAGE_PAIEMENT_EXPIRE =
  "La demande de paiement a expiré. Votre lien de suivi permet de la relancer, si les vélos sont encore libres.";

/* ------------------------------------------------------------ Petits outils */

const bot = (texte: string, ton?: TonMessage): Omit<MessageChat, "id"> => ({ de: "bot", texte, ...(ton ? { ton } : {}) });
const duClient = (texte: string): Omit<MessageChat, "id"> => ({ de: "client", texte });

/** Ajoute des bulles à la discussion, numérotées dans l'ordre. */
function ajouter(etat: EtatChat, ...messages: Omit<MessageChat, "id">[]): EtatChat {
  let id = etat.prochainId;
  const nouveaux = messages.filter((message) => message.texte).map((message) => ({ ...message, id: id++ }));
  if (nouveaux.length === 0) return etat;
  return { ...etat, messages: [...etat.messages, ...nouveaux].slice(-MESSAGES_MAX), prochainId: id };
}

/** Le parc à donner au moteur : les vélos libres que le serveur a mesurés ce jour-là, sinon le parc en état. */
export function parcConnu(etat: EtatChat, faits: FaitsChat): ParcConnu {
  const { capacite, choix } = etat;
  // Bike for All part à l'heure choisie, pour une durée qui change : une
  // mesure faite pour un autre créneau ne vaut pas pour celui-ci.
  if (capacite && choix.offre !== "bike-for-all" && capacite.offre === choix.offre && capacite.date === choix.date) {
    return { velosDisponibles: capacite.velosLibres, stockParGamme: capacite.parGamme };
  }
  return parcDesFaits(faits);
}

/** La première réponse qui manque encore, dans l'ordre de la discussion ; `null` quand tout est là. */
export function etapeManquante(choix: Choix): Etape | null {
  if (!choix.offre) return "offre";
  if (choix.personnes === null) return "personnes";
  if (!choix.date) return "date";
  if (choix.offre === "bike-for-all") {
    if (!choix.depart) return "heure";
    if (!choix.mode) return "mode";
    if (choix.mode === "budget" && choix.budgetXof === null) return "budget";
    if (choix.mode === "duree") {
      if (choix.minutes === null) return "duree";
      if (!choix.coco) return "coco";
    }
    if (choix.gateauxParPersonne === null) return "gateaux";
    if (choix.accompagnateur === null) return "accompagnateur";
    return null;
  }
  if (choix.offre === "gbashi-groupe") {
    if (!choix.velos) return "velos";
    if (choix.gateauxParPersonne === null) return "gateaux";
    return null;
  }
  if (choix.gateauxParPersonne === null) return "gateaux";
  switch (choix.reduction.etat) {
    case "a-demander":
      return "reduction";
    case "envoi":
      return "preuve";
    case "a-verifier":
    case "en_attente":
    case "refusee":
      return "preuve-statut";
    default:
      return null;
  }
}

/** La question que le chatbot pose à cette étape, avec les chiffres du moment. */
function question(etape: Etape, etat: EtatChat, faits: FaitsChat, maintenant: number): string | null {
  const { choix } = etat;
  const reglages = faits.reglages;
  const offre = choix.offre;
  switch (etape) {
    case "offre":
      return "Quelle sortie vous tente ?";
    case "personnes":
      return offre ? questionPersonnes(offre, reglages, faits.velosEnEtat) : null;
    case "date":
      return offre ? questionDate(offre, reglages) : null;
    case "heure":
      return questionHeure(reglages);
    case "mode":
      return QUESTION_MODE;
    case "budget":
      return choix.personnes === null ? null : questionBudget(choix.personnes, budgetMinimumBikeForAllXof(choix.personnes, reglages));
    case "duree":
      return QUESTION_DUREE;
    case "coco":
      return questionCoco(reglages);
    case "gateaux":
      return questionGateaux(reglages);
    case "accompagnateur": {
      const issue = evaluer(choix, faits, maintenant, parcConnu(etat, faits));
      const minutes = issue?.ok ? issue.resultat.minutes : (choix.minutes ?? reglages.bikeForAll.dureeMinMinutes);
      return questionAccompagnateur(prixAccompagnateurXof(choix.personnes ?? 0, minutes, reglages));
    }
    case "reduction":
      return questionReduction(reglages);
    case "preuve":
      return consignesPreuve();
    case "preuve-statut":
      return choix.reduction.etat === "a-verifier" ? "Je regarde où en est votre capture d'écran." : null;
    case "velos":
      return choix.personnes === null ? null : questionVelos(choix.personnes);
    case "coordonnees":
      return QUESTION_COORDONNEES;
    case "moyen":
      return QUESTION_MOYEN;
    case "payer":
      return QUESTION_PAYER;
    default:
      return null;
  }
}

/** Passe à une étape en posant sa question. */
function poser(etat: EtatChat, etape: Etape, faits: FaitsChat, maintenant: number): EtatChat {
  const texte = question(etape, etat, faits, maintenant);
  return { ...ajouter(etat, ...(texte ? [bot(texte)] : [])), etape, refus: null, alternatives: [] };
}

/** Le moteur refuse : son message, et les autres choix qui passent. */
function versRefus(
  etat: EtatChat,
  refus: Refus,
  prochainCreneau: ProchainCreneau | null,
  faits: FaitsChat,
  maintenant: number,
): EtatChat {
  const alternatives = alternativesDuRefus(etat.choix, refus, prochainCreneau, faits, maintenant);
  const suite = alternatives.length > 0 ? "Voici ce que je peux vous proposer :" : "";
  return {
    ...ajouter(etat, bot(refus.message, "alerte"), ...(suite ? [bot(suite)] : [])),
    etape: "refus",
    refus: { refus, prochainCreneau },
    alternatives,
  };
}

/** Tout est là : l'offre chiffrée. */
function versProposition(etat: EtatChat, precedentXof: number | null, faits: FaitsChat, maintenant: number): EtatChat {
  const issue = evaluer(etat.choix, faits, maintenant, parcConnu(etat, faits));
  const total = issue?.ok ? issue.resultat.totalXof : null;
  const texte =
    precedentXof !== null && total !== null && total !== precedentXof
      ? `Voici la nouvelle offre : ${formatMontant(total)} au lieu de ${formatMontant(precedentXof)}.`
      : "Voici votre offre, ligne par ligne :";
  return { ...ajouter(etat, bot(texte)), etape: "proposition", refus: null, alternatives: [] };
}

/**
 * Après chaque réponse : le moteur vérifie tout de suite ce qui est déjà
 * connu (un jour sans départ, un groupe trop grand, un budget trop petit),
 * puis le chatbot pose la question suivante, ou présente l'offre.
 */
function continuer(etatRecu: EtatChat, faits: FaitsChat, maintenant: number, precedentXof: number | null = null): EtatChat {
  // Réduction du road trip réglée à 0 % : il n'y a rien à demander au client.
  const etat: EtatChat =
    etatRecu.choix.offre === "road-trip-groupe" && etatRecu.choix.reduction.etat === "a-demander" && faits.reglages.roadTrip.reduction <= 0
      ? { ...etatRecu, choix: { ...etatRecu.choix, reduction: { etat: "sans" } } }
      : etatRecu;
  const issue = evaluer(etat.choix, faits, maintenant, parcConnu(etat, faits));
  if (issue && !issue.ok) return versRefus(etat, issue.refus, null, faits, maintenant);
  const manque = etapeManquante(etat.choix);
  // Une nouvelle venue du serveur (état d'une capture) pendant que la même
  // question attend sa réponse : on ne la repose pas.
  if (manque && manque === etat.etape) return { ...etat, refus: null, alternatives: [] };
  if (manque) return poser(etat, manque, faits, maintenant);
  return versProposition(etat, precedentXof, faits, maintenant);
}

/** Le total de l'offre affichée en ce moment, s'il y en a une. */
function totalAffiche(etat: EtatChat, faits: FaitsChat, maintenant: number): number | null {
  return offreAffichee(etat, faits, maintenant)?.resultat.totalXof ?? null;
}

/** Les réponses du client, avec un changement appliqué et ce qui en dépend remis à zéro. */
function avecChangement(choix: Choix, changement: Partial<Choix>): Choix {
  const suivant: Choix = { ...choix, ...changement };
  // Changer de mode de Bike for All repart de zéro sur le budget ou la durée.
  if (changement.mode !== undefined && changement.mode !== choix.mode) {
    suivant.budgetXof = changement.budgetXof ?? null;
    suivant.minutes = changement.minutes ?? null;
    suivant.coco = changement.coco ?? null;
  }
  return suivant;
}

/* ------------------------------------------------------------- L'heure des bulles */

/**
 * Donne leur heure aux bulles arrivées avec cette action : celles qui
 * n'étaient pas dans la discussion d'avant (la même bulle garde le même
 * objet d'une étape à l'autre) et n'ont pas encore d'heure. Les bulles
 * d'une conversation rangée avant l'ajout des heures restent sans heure.
 */
function horodater(avant: readonly MessageChat[], etat: EtatChat, maintenant: number): EtatChat {
  if (etat.messages === avant || !Number.isFinite(maintenant)) return etat;
  const connues = new Set(avant);
  let changees = 0;
  const messages = etat.messages.map((message) => {
    if (connues.has(message) || typeof message.a === "number") return message;
    changees += 1;
    return { ...message, a: maintenant };
  });
  return changees ? { ...etat, messages } : etat;
}

/* ------------------------------------------------------------------ Machine */

/**
 * La machine : l'état suivant, après une action du client ou une réponse du
 * serveur. Chaque bulle ajoutée par l'action reçoit l'heure de l'action.
 */
export function reduire(etat: EtatChat, action: ActionChat, faits: FaitsChat): EtatChat {
  const suivant = transition(etat, action, faits);
  return suivant === etat ? etat : horodater(etat.messages, suivant, action.maintenant);
}

/* ------------------------------------------------------- Les coordonnées */

const ORDRE_CHAMPS: readonly ChampCoordonnees[] = ["prenom", "nom", "email", "telephone"];

/**
 * Une coordonnée passe-t-elle les règles du contrat (`schemaClient`, celles
 * que le serveur applique à la réservation) ? Le téléphone ne garde que des
 * chiffres, des espaces et + ( ) . -, comme avant.
 */
export function champValide(champ: ChampCoordonnees, valeur: string): boolean {
  if (typeof valeur !== "string" || !schemaClient.shape[champ].safeParse(valeur).success) return false;
  return champ !== "telephone" || /^[+0-9 ().-]+$/.test(valeur.trim());
}

/** La coordonnée à demander maintenant : la première qui manque ou ne passe pas, ou `null` quand tout est là. */
export function champDemande(client: Coordonnees): ChampCoordonnees | null {
  return ORDRE_CHAMPS.find((champ) => !champValide(champ, client[champ])) ?? null;
}

/** Pose la question de la coordonnée qui manque, ou passe au réseau Mobile Money quand tout est là. */
function demanderCoordonnees(etat: EtatChat, faits: FaitsChat, maintenant: number, ...avant: Omit<MessageChat, "id">[]): EtatChat {
  const champ = champDemande(etat.client);
  if (!champ) return poser(ajouter(etat, ...avant), "moyen", faits, maintenant);
  return {
    ...ajouter(etat, ...avant, bot(questionChamp(champ, etat.client.prenom))),
    etape: "coordonnees",
    refus: null,
    alternatives: [],
  };
}

/** La machine elle-même, sans l'heure des bulles. */
function transition(etat: EtatChat, action: ActionChat, faits: FaitsChat): EtatChat {
  const { maintenant } = action;
  const reglages = faits.reglages;

  switch (action.type) {
    case "demarrer": {
      // Un paiement en cours ne s'interrompt jamais.
      if (etat.etape === "attente" || etat.envoi) return etat;
      let suivant = etat;
      // Une discussion terminée (réservée, en échec, fermée) repart de zéro,
      // même sur la même offre.
      const terminee = etat.etape === "confirmee" || etat.etape === "echec" || etat.etape === "ferme";
      if (action.offre && (action.offre !== etat.choix.offre || terminee)) {
        suivant = reduire(etatInitial(etat.client), { type: "choisir-offre", offre: action.offre, maintenant }, faits);
      }
      if (action.preuveId && (action.offre ?? suivant.choix.offre) === "road-trip-groupe") {
        if (suivant.choix.offre !== "road-trip-groupe") {
          suivant = reduire(etatInitial(etat.client), { type: "choisir-offre", offre: "road-trip-groupe", maintenant }, faits);
        }
        suivant = {
          ...ajouter(suivant, bot("Je regarde où en est votre capture d'écran pour la réduction.")),
          choix: { ...suivant.choix, reduction: { etat: "a-verifier", preuveId: action.preuveId } },
        };
      }
      return suivant;
    }

    case "recommencer":
      // Tout repart de zéro, les coordonnées restent : l'accueil présente de nouveau les trois sorties.
      return ajouter({ ...etatInitial(etat.client), messages: [], prochainId: 1 }, ...messagesAccueil(reglages, true));

    case "choisir-offre": {
      if (!estCodeOffreGroupe(action.offre)) return etat;
      const depart = {
        ...ajouter(etat, duClient(NOMS_OFFRES[action.offre]), bot(presentationOffre(action.offre, reglages))),
        choix: { ...CHOIX_VIDES, offre: action.offre },
        devis: null,
        devisEnEchec: null,
        capacite: null,
        reservation: null,
      };
      return continuer(depart, faits, maintenant);
    }

    case "choisir-personnes": {
      if (!Number.isSafeInteger(action.personnes) || action.personnes < 1) return etat;
      const suivant = ajouter(etat, duClient(personnesEnClair(action.personnes)));
      // Un nombre tapé hors des bornes : le minimum de l'offre, les vélos en
      // état. Le chatbot le dit et repose la question.
      const offre = etat.choix.offre;
      if (offre) {
        const minimum = personnesMinDe(offre, reglages);
        const correction =
          action.personnes < minimum
            ? correctionPersonnesMin(offre, minimum)
            : faits.velosEnEtat >= minimum && action.personnes > faits.velosEnEtat
              ? correctionPersonnesMax(faits.velosEnEtat)
              : null;
        if (correction) return { ...ajouter(suivant, bot(correction)), etape: "personnes", refus: null, alternatives: [] };
      }
      // La répartition des vélos de Gbashi Bike suit le nombre de personnes.
      return continuer({ ...suivant, choix: { ...suivant.choix, personnes: action.personnes, velos: null } }, faits, maintenant);
    }

    case "choisir-date": {
      const suivant = ajouter(etat, duClient(majuscule(jourEnClair(action.date))));
      const avecDate = { ...suivant, choix: { ...suivant.choix, date: action.date } };
      // Un jour qui ne se réserve pas en ligne est refusé tout de suite, avant
      // les vélos ou le budget : le moteur dit pourquoi, les jours qui
      // marchent sont proposés.
      const refusJour = avecDate.choix.offre ? refusDuJour(avecDate.choix.offre, action.date, faits, maintenant) : null;
      if (refusJour) return versRefus(avecDate, refusJour, null, faits, maintenant);
      return continuer(avecDate, faits, maintenant);
    }

    case "choisir-heure": {
      const suivant = ajouter(etat, duClient(`Départ à ${departEnClair(action.depart)}`));
      return continuer({ ...suivant, choix: { ...suivant.choix, depart: action.depart } }, faits, maintenant);
    }

    case "choisir-mode": {
      const suivant = ajouter(etat, duClient(action.mode === "budget" ? "Oui, j'ai un budget" : "Je choisis plutôt la durée"));
      return continuer({ ...suivant, choix: avecChangement(suivant.choix, { mode: action.mode }) }, faits, maintenant);
    }

    case "choisir-budget": {
      if (!Number.isSafeInteger(action.budgetXof) || action.budgetXof < 0) return etat;
      let suivant = ajouter(etat, duClient(formatMontant(action.budgetXof)));
      suivant = { ...suivant, choix: { ...suivant.choix, budgetXof: action.budgetXof } };
      // Ce que le budget achète, dit tout de suite (cahier, 4.1).
      const issue = evaluer(suivant.choix, faits, maintenant, parcConnu(suivant, faits));
      if (issue?.ok) suivant = ajouter(suivant, bot(ceQueLeBudgetAchete(issue.resultat, action.budgetXof)));
      return continuer(suivant, faits, maintenant);
    }

    case "choisir-duree": {
      const suivant = ajouter(etat, duClient(majuscule(dureeEnClair(action.minutes))));
      return continuer({ ...suivant, choix: { ...suivant.choix, minutes: action.minutes } }, faits, maintenant);
    }

    case "choisir-coco": {
      const suivant = ajouter(etat, duClient(majuscule(cocoEnClair(action.coco))));
      return continuer({ ...suivant, choix: { ...suivant.choix, coco: action.coco } }, faits, maintenant);
    }

    case "choisir-gateaux": {
      if (!Number.isSafeInteger(action.gateauxParPersonne) || action.gateauxParPersonne < 0) return etat;
      const suivant = ajouter(etat, duClient(gateauxEnClair(action.gateauxParPersonne)));
      return continuer({ ...suivant, choix: { ...suivant.choix, gateauxParPersonne: action.gateauxParPersonne } }, faits, maintenant);
    }

    case "choisir-accompagnateur": {
      const suivant = ajouter(etat, duClient(action.accompagnateur ? "Avec un accompagnateur" : "Sans accompagnateur"));
      return continuer({ ...suivant, choix: { ...suivant.choix, accompagnateur: action.accompagnateur } }, faits, maintenant);
    }

    case "choisir-velos": {
      const personnes = totalVelos(action.velos);
      if (personnes < 1) return etat;
      const suivant = ajouter(etat, duClient(majuscule(velosEnClair(action.velos))));
      return continuer({ ...suivant, choix: { ...suivant.choix, velos: action.velos, personnes } }, faits, maintenant);
    }

    case "repondre-reduction": {
      if (!action.veut) {
        const suivant = ajouter(etat, duClient("Non merci, sans la réduction"));
        return continuer({ ...suivant, choix: { ...suivant.choix, reduction: { etat: "sans" } } }, faits, maintenant);
      }
      return poser(ajouter(etat, duClient("Oui, je veux la réduction")), "preuve", faits, maintenant);
    }

    case "preuve-envoi":
      return {
        ...ajouter(etat, duClient("Voici ma capture d'écran")),
        client: { ...etat.client, telephone: action.telephone.trim(), email: action.email.trim() },
        choix: { ...etat.choix, reduction: { etat: "envoi" } },
        envoi: "preuve",
      };

    case "verifier-preuve": {
      const reduction = etat.choix.reduction;
      if (reduction.etat !== "en_attente" && reduction.etat !== "refusee") return etat;
      if (!reduction.preuveId) return etat;
      return {
        ...ajouter(etat, duClient("Est-ce que c'est validé ?")),
        choix: { ...etat.choix, reduction: { etat: "a-verifier", preuveId: reduction.preuveId } },
      };
    }

    case "renvoyer-preuve":
      return poser(ajouter(etat, duClient("J'envoie une autre capture")), "preuve", faits, maintenant);

    case "reduction-sans": {
      const suivant = ajouter(etat, duClient("Je réserve sans la réduction"));
      return continuer({ ...suivant, choix: { ...suivant.choix, reduction: { etat: "sans" } } }, faits, maintenant);
    }

    case "preuve-recue":
      return recevoirPreuve(etat, action.statut, action.corps, faits, maintenant);

    case "devis-recu":
      return recevoirDevis(etat, action.signature, action.statut, action.corps, faits, maintenant);

    case "devis-echec": {
      if (etat.devisEnEchec === action.signature) return etat;
      return {
        ...ajouter(
          etat,
          bot("La connexion est instable : je n'arrive pas à confirmer le prix auprès de Bike Land. Réessayez dans un instant.", "alerte"),
        ),
        devisEnEchec: action.signature,
      };
    }

    case "relancer-devis":
      return { ...etat, devisEnEchec: null };

    case "trop-cher": {
      const suivant = ajouter(etat, duClient("C'est un peu cher pour nous"));
      const variantes = variantesMoinsCheres(suivant.choix, faits, maintenant, parcConnu(suivant, faits));
      if (variantes.length === 0) {
        return ajouter(
          suivant,
          bot("C'est déjà le prix le plus doux pour ce groupe et ce créneau. Si vous voulez en parler, écrivez-nous sur WhatsApp."),
        );
      }
      return {
        ...ajouter(suivant, bot("Je comprends. Voici ce qui fait baisser le prix, pour le même groupe :")),
        etape: "negociation",
        alternatives: variantes,
      };
    }

    case "garder-offre":
      return { ...ajouter(etat, duClient("Je garde cette offre")), etape: "proposition", alternatives: [] };

    case "appliquer": {
      const precedent = etat.etape === "negociation" ? totalAffiche(etat, faits, maintenant) : null;
      const libelle = action.alternative.libelle.split(" : ")[0];
      const suivant = ajouter(etat, duClient(libelle));
      return continuer(
        { ...suivant, choix: avecChangement(suivant.choix, action.alternative.changement), refus: null, alternatives: [] },
        faits,
        maintenant,
        precedent,
      );
    }

    case "reserver": {
      if (!devisConfirme(etat)) return etat;
      const suivant = ajouter(etat, duClient("Je réserve"));
      // Les coordonnées déjà connues (une réservation précédente, la capture
      // de la réduction) ne sont pas redemandées : tout est connu, on les
      // rappelle ; sinon, les autres une par une.
      if (!champDemande(suivant.client)) return demanderCoordonnees(suivant, faits, maintenant, bot(rappelCoordonnees(suivant.client)));
      return demanderCoordonnees(suivant, faits, maintenant, bot(QUESTION_COORDONNEES));
    }

    case "saisir-coordonnees": {
      const client: Coordonnees = {
        prenom: action.client.prenom.trim(),
        nom: action.client.nom.trim(),
        email: action.client.email.trim(),
        telephone: action.client.telephone.trim(),
      };
      if (!coordonneesValides(client)) return etat;
      return poser({ ...ajouter(etat, duClient(`${client.prenom} ${client.nom}`)), client }, "moyen", faits, maintenant);
    }

    case "saisir-champ": {
      // Seulement en réponse à la question posée : une réponse en retard (deux
      // envois rapides) ne remplit pas un autre champ.
      if (etat.etape !== "coordonnees" || typeof action.valeur !== "string") return etat;
      const champ = champDemande(etat.client);
      const valeur = action.valeur.trim();
      if (!champ || action.champ !== champ || !valeur) return etat;
      const suivant = ajouter(etat, duClient(valeur));
      if (!champValide(champ, valeur)) {
        // Une correction chaleureuse, puis la même question.
        return ajouter(suivant, bot(CORRECTIONS_CHAMPS[champ]), bot(questionChamp(champ, etat.client.prenom)));
      }
      return demanderCoordonnees({ ...suivant, client: { ...suivant.client, [champ]: valeur } }, faits, maintenant);
    }

    case "modifier-coordonnees": {
      if ((etat.etape !== "moyen" && etat.etape !== "payer") || etat.envoi) return etat;
      return demanderCoordonnees(
        { ...ajouter(etat, duClient("Je modifie mes coordonnées")), client: CLIENT_VIDE, moyen: null },
        faits,
        maintenant,
      );
    }

    case "choisir-moyen":
      return poser({ ...ajouter(etat, duClient(NOMS_MOYENS[action.moyen] ?? action.moyen)), moyen: action.moyen }, "payer", faits, maintenant);

    case "accepter-cgv":
      return { ...etat, cgv: action.acceptees };

    case "reservation-envoi":
      return demandeReservationDe(etat) ? { ...etat, envoi: "reservation" } : etat;

    case "reservation-recue":
      return recevoirReservation({ ...etat, envoi: null }, action.statut, action.corps, faits, maintenant);

    case "reservation-echec":
      return {
        ...ajouter(
          { ...etat, envoi: null },
          bot(
            "La connexion a coupé avant la réponse. Si un email de Bike Land vient d'arriver, votre réservation existe déjà : suivez son lien. Sinon, réessayez.",
            "alerte",
          ),
        ),
        etape: "payer",
      };

    case "paiement-confirme": {
      const reservation = etat.reservation;
      if (!reservation) return etat;
      return { ...ajouter(etat, bot(messageConfirmation(reservation, etat.client), "succes")), etape: "confirmee" };
    }

    case "paiement-expire": {
      if (etat.etape !== "attente") return etat;
      return {
        ...ajouter(etat, bot(MESSAGE_PAIEMENT_EXPIRE, "alerte")),
        etape: "echec",
      };
    }

    case "paiement-echoue": {
      if (!etat.reservation) return etat;
      const diagnostic = diagnostiquer(action.message);
      return {
        ...ajouter(
          etat,
          bot(
            `${diagnostic.titre}. ${diagnostic.explication} Vos vélos restent gardés un moment : reprenez le paiement depuis votre lien de suivi.`,
            "alerte",
          ),
        ),
        etape: "echec",
        reservation: { ...etat.reservation, messagePaiement: action.message },
      };
    }
  }
}

/** « Avec 10 000 F, votre groupe roule 45 minutes, de 8 h à 8 h 45, avec un petit coco chacun. » */
function ceQueLeBudgetAchete(resultat: ResultatOffre, budgetXof: number): string {
  const coco = resultat.coco === "aucun" ? "" : `, avec un ${resultat.coco} coco chacun`;
  const barre = resultat.prixBarreXof !== null ? ` Prix habituel : ${formatMontant(resultat.prixBarreXof)}.` : "";
  return (
    `Avec ${formatMontant(budgetXof)}, votre groupe roule ${dureeEnClair(resultat.minutes)}, ` +
    `de ${departEnClair(resultat.depart)} à ${departEnClair(resultat.fin)}${coco}.${barre}`
  );
}

/* ---------------------------------------------------------- Le devis serveur */

/** Les étapes où le prix doit être confirmé par le serveur. */
const ETAPES_AVEC_DEVIS: readonly Etape[] = [
  "gateaux",
  "accompagnateur",
  "reduction",
  "preuve",
  "preuve-statut",
  "velos",
  "proposition",
  "negociation",
  "coordonnees",
  "moyen",
  "payer",
];

/** La signature d'une demande : deux demandes identiques ont la même. */
export function signatureDe(demande: DemandeDevis): string {
  return JSON.stringify(demande);
}

/**
 * La demande de devis qui correspond aux réponses du client (contrat
 * commun : `schemaDemandeDevis`), ou `null` s'il manque l'essentiel. Les
 * options pas encore demandées partent à leur valeur par défaut. La
 * réduction n'est demandée qu'avec une capture validée : le serveur la
 * retrouve lui-même, le navigateur n'envoie jamais un « oui ».
 */
export function demandeDevisDe(choix: Choix): DemandeDevis | null {
  const { offre, date } = choix;
  if (!offre || !date) return null;
  const gateauxParPersonne = choix.gateauxParPersonne ?? 0;
  if (offre === "bike-for-all") {
    if (choix.personnes === null || !choix.depart) return null;
    const accompagnateur = choix.accompagnateur ?? false;
    if (choix.mode === "budget" && choix.budgetXof !== null) {
      return {
        offre,
        date,
        saisie: { mode: "budget", personnes: choix.personnes, budgetXof: choix.budgetXof, depart: choix.depart, gateauxParPersonne, accompagnateur },
      };
    }
    if (choix.mode === "duree" && choix.minutes !== null) {
      return {
        offre,
        date,
        saisie: {
          mode: "duree",
          personnes: choix.personnes,
          minutes: choix.minutes,
          depart: choix.depart,
          coco: choix.coco ?? "aucun",
          gateauxParPersonne,
          accompagnateur,
        },
      };
    }
    return null;
  }
  if (offre === "road-trip-groupe") {
    if (choix.personnes === null) return null;
    const preuveId = choix.reduction.etat === "validee" && choix.reduction.preuveId ? choix.reduction.preuveId : undefined;
    return { offre, date, saisie: { personnes: choix.personnes, gateauxParPersonne, ...(preuveId ? { preuveId } : {}) } };
  }
  if (!choix.velos) return null;
  return { offre, date, saisie: { velos: choix.velos, gateauxParPersonne } };
}

/**
 * La demande de devis de l'étape en cours. À l'étape des vélos de Gbashi
 * Bike, la répartition n'est pas encore choisie : une demande provisoire
 * (tout le groupe en Classique) suffit à connaître ce qu'il reste de chaque
 * gamme ce jour-là (`capacite.parGamme`).
 */
export function demandeDevisCourante(etat: EtatChat): DemandeDevis | null {
  if (!ETAPES_AVEC_DEVIS.includes(etat.etape)) return null;
  const { choix } = etat;
  if (etat.etape === "velos" && choix.offre === "gbashi-groupe" && choix.date && choix.personnes !== null) {
    return { offre: "gbashi-groupe", date: choix.date, saisie: { velos: { CLASSIQUE: choix.personnes }, gateauxParPersonne: 0 } };
  }
  return demandeDevisDe(choix);
}

/** La demande que la vue doit envoyer maintenant (POST devis), ou `null`. */
export function demandeDevisAttendue(etat: EtatChat): DemandeDevis | null {
  const demande = demandeDevisCourante(etat);
  if (!demande) return null;
  const signature = signatureDe(demande);
  if (etat.devis?.signature === signature || etat.devisEnEchec === signature) return null;
  return demande;
}

/** Le devis du serveur pour les réponses actuelles, s'il est arrivé. */
function devisCourant(etat: EtatChat): ReponseDevis | null {
  const demande = demandeDevisDe(etat.choix);
  if (!demande || !etat.devis || etat.devis.signature !== signatureDe(demande)) return null;
  return etat.devis.reponse;
}

/** Le serveur a confirmé le prix des réponses actuelles : on peut réserver. */
export function devisConfirme(etat: EtatChat): boolean {
  return devisCourant(etat)?.issue.ok === true;
}

/**
 * Les étapes où l'écran attend le devis pour avancer : le stock des gammes
 * (Gbashi Bike), l'offre chiffrée, le montant à payer. Ailleurs, le devis
 * se vérifie en silence, pendant que la question attend sa réponse.
 */
const ETAPES_DEVIS_ATTENDU: readonly Etape[] = ["velos", "proposition", "negociation", "payer"];

/**
 * Bike Land « écrit » : une réponse du serveur est attendue et l'écran en
 * dépend (le devis à ces étapes, l'envoi d'une capture ou de la réservation,
 * l'état d'une capture). La vue montre alors les trois petits points.
 */
export function botEcrit(etat: EtatChat): boolean {
  if (etat.envoi !== null || etat.choix.reduction.etat === "a-verifier") return true;
  return ETAPES_DEVIS_ATTENDU.includes(etat.etape) && demandeDevisAttendue(etat) !== null;
}

/**
 * L'offre à montrer : celle du serveur dès que son devis est arrivé (même
 * moteur, réglages et vélos libres du moment), sinon celle du moteur dans
 * le navigateur, à confirmer.
 */
export function offreAffichee(
  etat: EtatChat,
  faits: FaitsChat,
  maintenant: number,
): { resultat: ResultatOffre; confirme: boolean; commissionXof?: number; montantADebiterXof?: number } | null {
  const devis = devisCourant(etat);
  if (devis?.issue.ok) {
    return {
      resultat: devis.issue.resultat,
      confirme: true,
      ...(typeof devis.commissionXof === "number" ? { commissionXof: devis.commissionXof } : {}),
      ...(typeof devis.montantADebiterXof === "number" ? { montantADebiterXof: devis.montantADebiterXof } : {}),
    };
  }
  const issue = evaluer(etat.choix, faits, maintenant, parcConnu(etat, faits));
  return issue?.ok ? { resultat: issue.resultat, confirme: false } : null;
}

/** Ce qu'il reste de vélos de chaque gamme ce jour-là (Gbashi Bike), et si le serveur l'a confirmé. */
export function stockGbashi(etat: EtatChat, faits: FaitsChat): { stock: Record<GammeVelo, number>; confirme: boolean } {
  const { capacite, choix } = etat;
  if (capacite && capacite.offre === "gbashi-groupe" && capacite.date === choix.date) {
    return { stock: capacite.parGamme, confirme: true };
  }
  return { stock: faits.parGamme, confirme: false };
}

/* ------------------------------------------------------- Lire les réponses */

export type CodeErreurLue = CodeErreurOffresGroupe | "INCONNUE";

const MESSAGES_ERREUR: Record<CodeErreurLue, string> = {
  FERME:
    "La réservation en ligne des sorties de groupe est fermée pour le moment. Écrivez-nous sur WhatsApp : nous organisons votre sortie avec vous.",
  REGLAGES_ILLISIBLES:
    "La réservation en ligne des sorties de groupe est en pause pour le moment. Écrivez-nous sur WhatsApp : nous organisons votre sortie avec vous.",
  SAISIE: "Une information n'est pas passée. Vérifiez vos réponses, puis réessayez.",
  TROP_DE_DEMANDES: "Beaucoup de demandes en même temps : patientez une minute, puis réessayez.",
  EN_ATTENTE: `Une demande de paiement à votre nom attend déjà sur votre téléphone. Validez-la, ou attendez ${EXPIRATION_PANIER_MINUTES} minutes qu'elle expire avant d'en lancer une autre. Le lien de suivi est dans votre email.`,
  PAIEMENT: "La demande de paiement n'a pas pu partir. Aucun montant n'a été prélevé : réessayez dans un instant.",
  SERVEUR: "Un souci de notre côté a interrompu la demande. Réessayez dans un instant, ou écrivez-nous sur WhatsApp.",
  INCONNUE: "Je n'ai pas eu de réponse claire de Bike Land. Réessayez dans un instant.",
};

const CODES_ERREUR: readonly CodeErreurOffresGroupe[] = ["FERME", "REGLAGES_ILLISIBLES", "SAISIE", "TROP_DE_DEMANDES", "EN_ATTENTE", "PAIEMENT", "SERVEUR"];

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null;

/** Le code d'erreur d'une réponse, d'après son corps, sinon d'après son statut HTTP. */
function codeErreur(statut: number, corps: unknown): CodeErreurLue {
  const code = estObjet(corps) ? corps.code : undefined;
  if (typeof code === "string" && (CODES_ERREUR as readonly string[]).includes(code)) return code as CodeErreurOffresGroupe;
  if (statut === 403) return "FERME";
  if (statut === 503) return "REGLAGES_ILLISIBLES";
  if (statut === 429) return "TROP_DE_DEMANDES";
  if (statut === 400) return "SAISIE";
  if (statut === 502) return "PAIEMENT";
  return "INCONNUE";
}

/** Le message d'une erreur : celui du serveur, en français, sinon le nôtre. */
function messageErreur(code: CodeErreurLue, corps: unknown): string {
  const message = estObjet(corps) ? corps.message : undefined;
  return typeof message === "string" && message.trim() && code !== "INCONNUE" ? message.trim() : MESSAGES_ERREUR[code];
}

function estRefus(valeur: unknown): valeur is Refus {
  return estObjet(valeur) && typeof valeur.code === "string" && typeof valeur.message === "string";
}

function estResultat(valeur: unknown): valeur is ResultatOffre {
  return (
    estObjet(valeur) &&
    typeof valeur.totalXof === "number" &&
    Array.isArray(valeur.lignes) &&
    typeof valeur.personnes === "number" &&
    typeof valeur.recapModele === "string"
  );
}

function estProchainCreneau(valeur: unknown): valeur is ProchainCreneau {
  return estObjet(valeur) && typeof valeur.date === "string" && typeof valeur.depart === "string";
}

/** Un devis du serveur bien formé (POST devis, 200), ou `null`. */
export function lireDevis(corps: unknown): ReponseDevis | null {
  if (!estObjet(corps) || corps.ok !== true || !estObjet(corps.issue) || !estObjet(corps.capacite)) return null;
  const issue = corps.issue;
  if (issue.ok === true ? !estResultat(issue.resultat) : !estRefus(issue.refus)) return null;
  const capacite = corps.capacite;
  if (typeof capacite.velosLibres !== "number" || !estObjet(capacite.parGamme)) return null;
  if (corps.prochainCreneau !== null && corps.prochainCreneau !== undefined && !estProchainCreneau(corps.prochainCreneau)) return null;
  const { preuve, ...reste } = corps as unknown as ReponseDevis;
  return {
    ...reste,
    prochainCreneau: estProchainCreneau(corps.prochainCreneau) ? corps.prochainCreneau : null,
    // Un état de preuve inconnu de ce contrat n'est pas gardé.
    ...(preuve && (ETATS_PREUVE_DEVIS as readonly string[]).includes(preuve) ? { preuve } : {}),
  };
}

const ETATS_PREUVE_DEVIS: readonly NonNullable<ReponseDevis["preuve"]>[] = [
  "validee",
  "en_attente",
  "refusee",
  "inconnue",
  "deja-utilisee",
];

export type LectureDevis = { type: "ok"; reponse: ReponseDevis } | { type: "erreur"; code: CodeErreurLue; message: string };

export function lireReponseDevis(statut: number, corps: unknown): LectureDevis {
  if (statut === 200) {
    const reponse = lireDevis(corps);
    if (reponse) return { type: "ok", reponse };
  }
  const code = statut === 200 ? "INCONNUE" : codeErreur(statut, corps);
  return { type: "erreur", code, message: messageErreur(code, corps) };
}

/** Le jeton d'un lien de suivi (`…/reservation/<jeton>`), ou `null` (page générique de suivi). */
export function jetonDuLien(lienSuivi: string): string | null {
  let chemin: string;
  try {
    chemin = new URL(lienSuivi, "https://bike-land.vercel.app").pathname;
  } catch {
    return null;
  }
  const trouve = chemin.match(/^\/reservation\/([^/]+)\/?$/);
  if (!trouve) return null;
  const jeton = decodeURIComponent(trouve[1]);
  return jeton && jeton !== "suivi" ? jeton : null;
}

const MOYENS: readonly MoyenPaiement[] = ["MTN_MONEY", "MOOV_MONEY", "CELTIIS_CASH"];

/** Le suivi d'un paiement, s'il est bien formé (contrat : `suivi?: unknown`). */
function lireSuivi(valeur: unknown): SuiviPaiementChat | null {
  if (!estObjet(valeur)) return null;
  const { paiementId, moyen, telephone, urlCheckout } = valeur;
  if (typeof paiementId !== "string" || !paiementId || typeof telephone !== "string") return null;
  if (typeof moyen !== "string" || !(MOYENS as readonly string[]).includes(moyen)) return null;
  return { paiementId, moyen: moyen as MoyenPaiement, telephone, ...(typeof urlCheckout === "string" && urlCheckout ? { urlCheckout } : {}) };
}

export type LectureReservation =
  | { type: "creee"; reservation: ReservationCreee }
  | { type: "reglages"; message: string; devis: ReponseDevis }
  | { type: "dispo"; message: string; prochainCreneau: ProchainCreneau | null }
  | { type: "refus"; refus: Refus }
  | { type: "erreur"; code: CodeErreurLue; message: string };

/** La réponse de POST reservations, lue selon le contrat commun. */
export function lireReponseReservation(statut: number, corps: unknown): LectureReservation {
  if (statut >= 200 && statut < 300 && estObjet(corps) && corps.ok === true) {
    const paiement = estObjet(corps.paiement) ? corps.paiement : {};
    if (typeof corps.reference === "string" && typeof corps.lienSuivi === "string" && typeof corps.totalXof === "number") {
      const statutPaiement =
        paiement.statut === "REUSSI" || paiement.statut === "EN_ATTENTE" || paiement.statut === "ECHOUE" ? paiement.statut : "ECHOUE";
      return {
        type: "creee",
        reservation: {
          reference: corps.reference,
          lienSuivi: corps.lienSuivi,
          token: jetonDuLien(corps.lienSuivi),
          totalXof: corps.totalXof,
          montantADebiterXof: typeof corps.montantADebiterXof === "number" ? corps.montantADebiterXof : corps.totalXof,
          statutPaiement,
          suivi: lireSuivi(paiement.suivi),
          ...(typeof paiement.message === "string" && paiement.message ? { messagePaiement: paiement.message } : {}),
        },
      };
    }
  }
  if (estObjet(corps) && corps.ok === false) {
    const message = typeof corps.message === "string" ? corps.message.trim() : "";
    if (corps.code === "REGLAGES") {
      const devis = lireDevis(corps.devis);
      if (devis) return { type: "reglages", message: message || "Le prix vient de changer.", devis };
    }
    if (corps.code === "DISPO") {
      return {
        type: "dispo",
        message: message || "Ces vélos viennent d'être réservés sur ce créneau.",
        prochainCreneau: estProchainCreneau(corps.prochainCreneau) ? corps.prochainCreneau : null,
      };
    }
    if (corps.code === "REFUS" && estRefus(corps.refus)) return { type: "refus", refus: corps.refus };
  }
  const code = codeErreur(statut, corps);
  return { type: "erreur", code, message: messageErreur(code, corps) };
}

export type LecturePreuve =
  | { type: "ok"; preuveId: string; statut: StatutPreuve; message: string }
  | { type: "erreur"; statut: number; message: string };

/** La réponse de POST preuves (201) ou de GET preuve (200). */
export function lireReponsePreuve(statut: number, corps: unknown): LecturePreuve {
  if (statut >= 200 && statut < 300 && estObjet(corps) && corps.ok === true && typeof corps.preuveId === "string") {
    const etat = corps.statut;
    if (etat === "validee" || etat === "en_attente" || etat === "refusee") {
      return { type: "ok", preuveId: corps.preuveId, statut: etat, message: typeof corps.message === "string" ? corps.message.trim() : "" };
    }
  }
  const message = estObjet(corps) && typeof corps.message === "string" ? corps.message.trim() : "";
  return { type: "erreur", statut, message };
}

/* --------------------------------------------------- Recevoir les réponses */

/** Le serveur a répondu au devis. */
function recevoirDevis(
  etat: EtatChat,
  signature: string,
  statut: number,
  corps: unknown,
  faits: FaitsChat,
  maintenant: number,
): EtatChat {
  const demande = demandeDevisCourante(etat);
  // Une réponse à une demande dépassée (le client a changé d'avis entre-temps) ne compte plus.
  if (!demande || signatureDe(demande) !== signature) return etat;
  const lecture = lireReponseDevis(statut, corps);

  if (lecture.type === "erreur") {
    if (lecture.code === "FERME" || lecture.code === "REGLAGES_ILLISIBLES") {
      return { ...ajouter(etat, bot(lecture.message, "alerte")), etape: "ferme", alternatives: [], refus: null };
    }
    if (etat.devisEnEchec === signature) return etat;
    return { ...ajouter(etat, bot(lecture.message, "alerte")), devisEnEchec: signature };
  }

  const reponse = lecture.reponse;
  const offre = demande.offre;
  let suivant: EtatChat = {
    ...etat,
    devis: { signature, reponse },
    devisEnEchec: null,
    capacite: { offre, date: demande.date, velosLibres: reponse.capacite.velosLibres, parGamme: reponse.capacite.parGamme },
  };

  // À l'étape des vélos, seul compte ce qu'il reste de chaque gamme : le refus
  // de la demande provisoire (tout en Classique) est ignoré. Sauf s'il ne reste
  // même plus le minimum du groupe ce jour-là : le refus du serveur et son
  // créneau libre le plus proche s'appliquent alors, comme pour les autres offres.
  if (etat.etape === "velos") {
    if (!reponse.issue.ok && reponse.capacite.velosLibres < faits.reglages.gbashi.personnesMin) {
      return versRefus(suivant, reponse.issue.refus, reponse.prochainCreneau, faits, maintenant);
    }
    return suivant;
  }

  // La capture du road trip : le serveur dit où elle en est vraiment.
  const reduction = suivant.choix.reduction;
  if (offre === "road-trip-groupe" && reduction.etat === "validee" && reponse.preuve && reponse.preuve !== "validee") {
    const changements: Record<Exclude<NonNullable<ReponseDevis["preuve"]>, "validee">, { reduction: EtatReduction; texte: string }> = {
      en_attente: {
        reduction: { etat: "en_attente", preuveId: reduction.preuveId },
        texte: "Votre capture est encore en vérification : le prix s'entend sans la réduction pour l'instant.",
      },
      refusee: {
        reduction: { etat: "refusee", preuveId: reduction.preuveId },
        texte: "Votre capture n'a pas été validée : le prix s'entend sans la réduction.",
      },
      inconnue: {
        reduction: { etat: "a-demander" },
        texte: "Je ne retrouve pas votre capture d'écran : le prix s'entend sans la réduction.",
      },
      "deja-utilisee": {
        reduction: { etat: "sans" },
        texte: "Cette capture a déjà servi pour une réservation : la réduction vaut une fois par groupe.",
      },
    };
    const changement = changements[reponse.preuve];
    suivant = { ...ajouter(suivant, bot(changement.texte, "alerte")), choix: { ...suivant.choix, reduction: changement.reduction } };
    return continuer(suivant, faits, maintenant);
  }

  if (!reponse.issue.ok) return versRefus(suivant, reponse.issue.refus, reponse.prochainCreneau, faits, maintenant);

  // Le moteur du navigateur et celui du serveur ne donnent pas le même prix :
  // les réglages ont changé depuis l'ouverture de la page. Le serveur fait foi.
  if (etat.etape === "proposition" || etat.etape === "negociation") {
    const local = evaluer(etat.choix, faits, maintenant, parcConnu(etat, faits));
    if (local?.ok && local.resultat.totalXof !== reponse.issue.resultat.totalXof) {
      suivant = ajouter(suivant, bot(`Le prix vient d'être mis à jour par Bike Land : ${formatMontant(reponse.issue.resultat.totalXof)}.`, "alerte"));
    }
  }
  return suivant;
}

/** Le serveur a répondu à l'envoi d'une capture, ou à la question de son état. */
function recevoirPreuve(etat: EtatChat, statut: number, corps: unknown, faits: FaitsChat, maintenant: number): EtatChat {
  const lecture = lireReponsePreuve(statut, corps);
  const sans = { ...etat, envoi: null };
  const pourcentage = formatPourcentage(faits.reglages.roadTrip.reduction);

  if (lecture.type === "erreur") {
    const verification = etat.choix.reduction.etat === "a-verifier";
    const texte = verification
      ? "Je ne retrouve pas votre capture d'écran. Vous pouvez en envoyer une nouvelle, ou réserver sans la réduction."
      : statut === 413 || statut === 415 || statut === 400
        ? `${lecture.message || "La capture n'est pas passée."} Envoyez une image JPG, PNG ou WebP de 4 Mo au plus.`
        : statut === 429
          ? MESSAGES_ERREUR.TROP_DE_DEMANDES
          : statut === 403
            ? MESSAGES_ERREUR.FERME
            : "La capture n'est pas arrivée jusqu'à nous. Vérifiez votre connexion, puis réessayez.";
    const suivant = { ...ajouter(sans, bot(texte, "alerte")), choix: { ...sans.choix, reduction: { etat: "a-demander" as const } } };
    // Une capture introuvable : on reprend la question de la réduction au bon moment.
    if (verification) return continuer(suivant, faits, maintenant);
    return { ...suivant, etape: "preuve" };
  }

  if (lecture.statut === "validee") {
    const suivant = {
      ...ajouter(sans, bot(`C'est validé ! La réduction de ${pourcentage} s'applique à votre road trip.`, "succes")),
      choix: { ...sans.choix, reduction: { etat: "validee" as const, preuveId: lecture.preuveId } },
    };
    return continuer(suivant, faits, maintenant);
  }
  if (lecture.statut === "en_attente") {
    const suivant = {
      ...ajouter(sans, bot("Nous vérifions votre capture et vous écrivons très vite. Vous pouvez aussi réserver maintenant sans la réduction.")),
      choix: { ...sans.choix, reduction: { etat: "en_attente" as const, preuveId: lecture.preuveId } },
    };
    return continuer(suivant, faits, maintenant);
  }
  const suivant = {
    ...ajouter(
      sans,
      bot(
        `${lecture.message || "Nous n'avons pas pu valider cette capture."} Vous pouvez en envoyer une autre, ou réserver sans la réduction.`,
        "alerte",
      ),
    ),
    choix: { ...sans.choix, reduction: { etat: "refusee" as const, preuveId: lecture.preuveId } },
  };
  return continuer(suivant, faits, maintenant);
}

/** Le serveur a répondu à la réservation. */
function recevoirReservation(etat: EtatChat, statut: number, corps: unknown, faits: FaitsChat, maintenant: number): EtatChat {
  const lecture = lireReponseReservation(statut, corps);
  switch (lecture.type) {
    case "creee": {
      const reservation = lecture.reservation;
      const suivant = { ...etat, reservation };
      if (reservation.statutPaiement === "REUSSI") {
        return { ...ajouter(suivant, bot(messageConfirmation(reservation, etat.client), "succes")), etape: "confirmee" };
      }
      if (reservation.statutPaiement === "EN_ATTENTE" && reservation.suivi && reservation.token) {
        return {
          ...ajouter(
            { ...suivant, reservation: { ...reservation, demandeLe: maintenant } },
            bot(
              `La demande de paiement de ${formatMontant(reservation.montantADebiterXof)} est partie sur le ${reservation.suivi.telephone}. ` +
                `Validez-la avec votre code secret. Vos vélos sont gardés ${EXPIRATION_PANIER_MINUTES} minutes.`,
            ),
          ),
          etape: "attente",
        };
      }
      return {
        ...ajouter(
          suivant,
          bot(
            `Votre réservation ${reservation.reference} est créée, mais la demande de paiement n'est pas partie sur votre téléphone. ` +
              `Vos vélos restent gardés ${EXPIRATION_PANIER_MINUTES} minutes : reprenez le paiement depuis votre lien de suivi.`,
            "alerte",
          ),
        ),
        etape: "echec",
      };
    }
    case "reglages": {
      const demande = demandeDevisDe(etat.choix);
      if (!demande) return etat;
      const suivant = {
        ...etat,
        devis: { signature: signatureDe(demande), reponse: lecture.devis },
        devisEnEchec: null,
      };
      if (!lecture.devis.issue.ok) {
        return versRefus(ajouter(suivant, bot(lecture.message, "alerte")), lecture.devis.issue.refus, lecture.devis.prochainCreneau, faits, maintenant);
      }
      return {
        ...ajouter(
          suivant,
          bot(
            `${lecture.message} Voici l'offre à jour : ${formatMontant(lecture.devis.issue.resultat.totalXof)}. Confirmez pour réserver à ce prix.`,
            "alerte",
          ),
        ),
        etape: "proposition",
        alternatives: [],
      };
    }
    case "dispo":
      return versRefus(
        etat,
        { code: "PARC", message: `${lecture.message} Aucun montant n'a été prélevé.` },
        lecture.prochainCreneau,
        faits,
        maintenant,
      );
    case "refus":
      return versRefus(etat, lecture.refus, null, faits, maintenant);
    case "erreur": {
      const texte = bot(lecture.message, "alerte");
      if (lecture.code === "FERME" || lecture.code === "REGLAGES_ILLISIBLES") {
        return { ...ajouter(etat, texte), etape: "ferme" };
      }
      // Le serveur refuse les coordonnées (ses règles sont celles de champValide,
      // c'est rare) : on les reprend toutes, une par une.
      if (lecture.code === "SAISIE") {
        return demanderCoordonnees({ ...etat, client: CLIENT_VIDE }, faits, maintenant, texte, bot(MESSAGE_REPRISE_COORDONNEES));
      }
      if (lecture.code === "EN_ATTENTE") return { ...ajouter(etat, texte), etape: "echec" };
      return { ...ajouter(etat, texte), etape: "payer" };
    }
  }
}

function messageConfirmation(reservation: ReservationCreee, client: Coordonnees): string {
  return (
    `C'est réservé, merci ! Votre référence : ${reservation.reference}. ` +
    `Le récapitulatif et la facture partent sur ${client.email || "votre email"}. Votre lien de suivi est juste en dessous.`
  );
}

/* ------------------------------------------------------- La réservation */

/** Les coordonnées passent les règles du contrat (`schemaClient`), champ par champ (`champValide`). */
export function coordonneesValides(client: Coordonnees): boolean {
  return champDemande(client) === null;
}

export const NOMS_MOYENS: Record<MoyenPaiement, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS_CASH: "Celtiis Cash",
  ESPECES: "Espèces",
};

/** Les réseaux proposés en ligne : Mobile Money seulement. */
export const MOYENS_EN_LIGNE: readonly MoyenPaiement[] = MOYENS;

/**
 * La demande de réservation (contrat commun : `schemaDemandeReservation`),
 * prête à partir, ou `null` s'il manque quelque chose : le prix confirmé par
 * le serveur, les coordonnées, le réseau, les conditions générales.
 * `attendu.totalXof` est le total que le client a vu, celui du devis du
 * serveur : il ne sert qu'à détecter un changement de prix.
 */
export function demandeReservationDe(etat: EtatChat): DemandeReservation | null {
  const demande = demandeDevisDe(etat.choix);
  const devis = devisCourant(etat);
  if (!demande || !devis?.issue.ok) return null;
  if (!etat.moyen || etat.moyen === "ESPECES" || !etat.cgv || !coordonneesValides(etat.client)) return null;
  return {
    ...demande,
    client: {
      prenom: etat.client.prenom.trim(),
      nom: etat.client.nom.trim(),
      email: etat.client.email.trim(),
      telephone: etat.client.telephone.trim(),
    },
    moyenPaiement: etat.moyen,
    cgvAcceptees: true,
    attendu: { totalXof: devis.issue.resultat.totalXof },
  };
}

/** Le lien de suivi, qui ouvre la reprise du paiement avec le bon diagnostic (comme ReservationPadelBike). */
export function lienRepriseDuPaiement(reservation: ReservationCreee): string {
  if (!reservation.token) return reservation.lienSuivi;
  const motif = diagnostiquer(reservation.messagePaiement, reservation.statutPaiement === "ECHOUE" ? "CANCELLED" : null).motif;
  const separateur = reservation.lienSuivi.includes("?") ? "&" : "?";
  return `${reservation.lienSuivi}${separateur}nouvelle=1&echec=${motif}`;
}

/* --------------------------------------------------------------- WhatsApp */

/** Le message déjà écrit pour Bike Land sur WhatsApp, qui résume les choix du client. */
export function messageWhatsApp(etat: EtatChat, faits: FaitsChat, maintenant: number): string {
  const { choix } = etat;
  const lignes = ["Bonjour Bike Land, je prépare une sortie en groupe avec l'assistant du site."];
  if (choix.offre) lignes.push(`Formule : ${NOMS_OFFRES[choix.offre]}`);
  if (choix.personnes !== null) lignes.push(`Groupe : ${personnesEnClair(choix.personnes)}`);
  if (choix.date) {
    const depart =
      choix.offre === "bike-for-all"
        ? choix.depart
        : choix.offre === "road-trip-groupe"
          ? faits.reglages.roadTrip.depart
          : choix.offre === "gbashi-groupe"
            ? faits.reglages.gbashi.depart
            : null;
    lignes.push(`Jour : ${jourEnClair(choix.date)}${depart ? `, départ à ${departEnClair(depart)}` : ""}`);
  }
  if (choix.mode === "budget" && choix.budgetXof !== null) lignes.push(`Budget : ${formatMontant(choix.budgetXof)}`);
  if (choix.mode === "duree" && choix.minutes !== null) {
    lignes.push(`Durée : ${dureeEnClair(choix.minutes)}${choix.coco ? `, ${cocoEnClair(choix.coco)}` : ""}`);
  }
  if (choix.velos) lignes.push(`Vélos : ${velosEnClair(choix.velos)}`);
  if (choix.gateauxParPersonne !== null && choix.gateauxParPersonne > 0) lignes.push(`Gâteaux : ${gateauxEnClair(choix.gateauxParPersonne)}`);
  if (choix.accompagnateur) lignes.push("Avec un accompagnateur");
  const offre = offreAffichee(etat, faits, maintenant);
  if (offre) lignes.push(`Prix calculé : ${formatMontant(offre.resultat.totalXof)}`);
  if (etat.reservation) lignes.push(`Référence : ${etat.reservation.reference}`);
  lignes.push("Pouvez-vous m'aider ?");
  return lignes.join("\n");
}

/* ------------------------------------------------- Ce que comprend l'offre */

/** Ce que le prix comprend, d'après le résultat du moteur et les réglages. */
export function inclusDans(resultat: ResultatOffre, reglages: ReglagesOffres): string[] {
  const inclus: string[] = [];
  if (resultat.offre === "gbashi-groupe") {
    inclus.push("Votre vélo et un casque", "La séance de muscu encadrée par nos coachs");
  } else {
    inclus.push("Toute notre gamme de vélos (Classique, Premium, Prestige) et nos casques");
  }
  if (resultat.offre === "bike-for-all") {
    if (resultat.cocos > 0) inclus.push(`Un ${resultat.coco} coco par personne (${resultat.cocos} cocos)`);
  } else {
    const parPersonne = resultat.offre === "road-trip-groupe" ? reglages.roadTrip : reglages.gbashi;
    const offerts = [
      ...(parPersonne.cocosGrandsParPersonne > 0
        ? [`${parPersonne.cocosGrandsParPersonne} coco${parPersonne.cocosGrandsParPersonne > 1 ? "s" : ""}`]
        : []),
      ...(parPersonne.eauxParPersonne > 0
        ? [`${parPersonne.eauxParPersonne} bouteille${parPersonne.eauxParPersonne > 1 ? "s" : ""} d'eau`]
        : []),
    ];
    if (offerts.length) inclus.push(`${majuscule(offerts.join(" et "))} par personne`);
  }
  if (resultat.gateaux > 0) inclus.push(`${resultat.gateaux} gâteau${resultat.gateaux > 1 ? "x" : ""}`);
  if (resultat.accompagnateurXof > 0) inclus.push("Un accompagnateur Bike Land, qui vous montre le circuit");
  return inclus;
}

/* ---------------------------------------------------- Le stockage du navigateur */

/** La clé de la conversation dans le stockage de session du navigateur. */
export const CLE_STOCKAGE_CHAT = "bikeland.chat-groupe";

/** Au-delà, une conversation rangée repart de zéro. */
const DUREE_CONSERVATION_MS = 12 * 60 * 60 * 1000;

interface SauvegardeChat {
  version: number;
  ouvert: boolean;
  misAJourLe: number;
  etat: EtatChat;
}

/** Ce qui se range dans le navigateur, pour que la conversation survive à un rechargement. */
export function sauvegarder(etat: EtatChat, ouvert: boolean, maintenant: number): string {
  const sauvegarde: SauvegardeChat = { version: VERSION_CONVERSATION, ouvert, misAJourLe: maintenant, etat };
  return JSON.stringify(sauvegarde);
}

function estChoix(valeur: unknown): valeur is Choix {
  if (!estObjet(valeur) || !estObjet(valeur.reduction) || typeof valeur.reduction.etat !== "string") return false;
  return valeur.offre === null || estCodeOffreGroupe(valeur.offre);
}

/**
 * Les bulles rangées, remises d'aplomb : une bulle illisible est écartée,
 * une heure ou une liste mal formée est retirée (l'heure ne s'affiche pas).
 */
function messagesLisibles(brut: unknown[]): MessageChat[] {
  const messages: MessageChat[] = [];
  for (const valeur of brut) {
    if (!estObjet(valeur) || typeof valeur.id !== "number" || typeof valeur.texte !== "string") continue;
    if (valeur.de !== "bot" && valeur.de !== "client") continue;
    const points = Array.isArray(valeur.points)
      ? valeur.points.filter((point): point is PointMessage => estObjet(point) && typeof point.titre === "string" && typeof point.texte === "string")
      : [];
    messages.push({
      id: valeur.id,
      de: valeur.de,
      texte: valeur.texte,
      ...(valeur.ton === "alerte" || valeur.ton === "succes" ? { ton: valeur.ton } : {}),
      ...(typeof valeur.a === "number" && Number.isFinite(valeur.a) ? { a: valeur.a } : {}),
      ...(points.length ? { points: points.map(({ titre, texte }) => ({ titre, texte })) } : {}),
    });
  }
  return messages.slice(-MESSAGES_MAX);
}

/**
 * La conversation rangée, relue et remise d'aplomb, ou `null` si elle est
 * illisible, d'une autre version, ou trop ancienne. Le prix sera confirmé de
 * nouveau par le serveur : le devis rangé n'est pas gardé.
 */
export function relireSauvegarde(texte: string | null, maintenant: number): { etat: EtatChat; ouvert: boolean } | null {
  if (!texte) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!estObjet(brut) || brut.version !== VERSION_CONVERSATION || typeof brut.misAJourLe !== "number") return null;
  if (maintenant - brut.misAJourLe > DUREE_CONSERVATION_MS || brut.misAJourLe > maintenant + 60_000) return null;
  const etat = brut.etat;
  if (!estObjet(etat) || etat.version !== VERSION_CONVERSATION) return null;
  if (typeof etat.etape !== "string" || !(ETAPES as readonly string[]).includes(etat.etape)) return null;
  if (!estChoix(etat.choix) || !Array.isArray(etat.messages) || typeof etat.prochainId !== "number" || !estObjet(etat.client)) return null;

  const lus = messagesLisibles(etat.messages);
  let relu: EtatChat = { ...(etat as unknown as EtatChat), messages: lus, devis: null, devisEnEchec: null, capacite: null };
  // Un envoi interrompu par le rechargement.
  if (relu.envoi === "preuve" || relu.choix.reduction.etat === "envoi") {
    relu = {
      ...ajouter(relu, bot("L'envoi de votre capture a été interrompu : envoyez-la de nouveau.", "alerte")),
      envoi: null,
      etape: "preuve",
      choix: { ...relu.choix, reduction: { etat: "a-demander" } },
    };
  }
  if (relu.envoi === "reservation") {
    relu = {
      ...ajouter(
        relu,
        bot("La page s'est rechargée pendant l'envoi. Si un email de Bike Land est arrivé, votre réservation existe déjà : suivez son lien. Sinon, réessayez.", "alerte"),
      ),
      envoi: null,
      etape: "payer",
    };
  }
  // Une attente de paiement plus vieille que la garde des vélos, comptée
  // depuis la demande (pas depuis la dernière sauvegarde, qu'une fermeture
  // du panneau rafraîchit).
  const demandeLe = relu.reservation?.demandeLe ?? brut.misAJourLe;
  if (relu.etape === "attente" && maintenant - demandeLe > EXPIRATION_PANIER_MINUTES * 60_000) {
    relu = { ...ajouter(relu, bot(MESSAGE_PAIEMENT_EXPIRE, "alerte")), etape: "echec" };
  }
  // Les bulles ajoutées ici (envoi interrompu, attente expirée) portent l'heure de la relecture.
  return { etat: horodater(lus, relu, maintenant), ouvert: brut.ouvert === true };
}
