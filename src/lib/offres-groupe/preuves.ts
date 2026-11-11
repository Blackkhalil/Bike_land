/**
 * Les preuves de réduction du road trip en groupe (lot 5b ; décisions 8,
 * 21, 24 et 25) : la capture envoyée depuis le chatbot, contrôlée (type lu
 * dans ses premiers octets, taille), réencodée (tournée, réduite, sans
 * métadonnées : ni EXIF, ni XMP, ni position GPS), rangée en privé, puis
 * vérifiée : par l'agent IA quand il est activé, sinon à la main dans
 * l'administration, qui répond au client par email. Bike Land reçoit un
 * email à chaque capture qui attend (décision 24). La réduction ne se donne
 * qu'une fois par client (décision 25), et une capture ne sert qu'à la
 * personne qui l'a envoyée (son numéro ou son email sur la réservation). Le
 * fichier est effacé dès la décision, et 30 jours au plus tard (tâche
 * quotidienne) ; le contact du client 30 jours après la décision : la
 * capture ne sert plus ensuite, et celle qui a servi l'a laissé sur la
 * réservation qu'elle a réduite. Jamais de réduction par défaut.
 *
 * Comme le service des réservations, ces fonctions reçoivent leurs
 * dépendances : les routes passent les vraies, les tests des faux.
 */

import { z } from "zod";

import type { LectureReglagesOffres } from "@/data/reglages-offres";
import type { ResultatCapture } from "@/lib/agent-ia/capture";
import { dateAuBenin, type DateISO } from "@/lib/dates";
import {
  emailDuClient,
  identiteVide,
  memeClient,
  numeroDuClient,
  reductionDejaEue,
  reservationRetenue,
  usageDUnePreuveValidee,
  type Depot,
  type ReservationRoadTripClient,
} from "@/lib/db/contrat";
import { auteurAdmin } from "@/lib/journal";
import { formatPourcentage } from "@/lib/offres";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";
import type { PreuveReduction } from "@/lib/types";

import {
  schemaChampsPreuve,
  TAILLE_MAX_CAPTURE_OCTETS,
  TYPES_CAPTURE,
  type EtatPreuveClient,
  type ReponseErreur,
  type ReponsePreuve,
  type StatutPreuve,
} from "./api";
import type { Reponse } from "./service";
import type { StockagePreuves } from "./stockage-preuves";
import {
  MESSAGE_CAPTURE_PAS_ENCORE,
  MESSAGE_REDUCTION_INACTIVE,
  messageCaptureRecue,
  messageCaptureRefusee,
  PHRASE_CAPTURE_DEJA_UTILISEE,
  phraseReductionDejaEue,
} from "./textes-chat";

/* ---------------------------------------------------------- Réglages */

/** Captures acceptées par heure depuis une même adresse. */
export const PREUVES_PAR_HEURE_ADRESSE = 10;
/** Captures acceptées par jour depuis une même adresse : 10 par heure, mais pas toute la journée. */
export const PREUVES_PAR_JOUR_ADRESSE = 20;
/**
 * Les emails « Capture à vérifier » envoyés à Bike Land par heure, au plus
 * (décision 24). Au-delà, l'équipe est déjà prévenue plusieurs fois : les
 * captures suivantes attendent sur la page des preuves et le tableau de
 * bord, sans email de plus (quelqu'un qui enverrait des images à la chaîne
 * ne remplit pas la boîte de Bike Land ni son quota d'envoi).
 */
export const ALERTES_PAR_HEURE = 10;
/** Captures acceptées par jour pour un même numéro. */
export const PREUVES_PAR_JOUR_NUMERO = 5;
/** Captures acceptées par jour pour un même email. */
export const PREUVES_PAR_JOUR_EMAIL = 5;
/**
 * La même capture (même numéro, même email, la même image une fois
 * réencodée, octet pour octet) renvoyée dans ce délai n'est pas enregistrée
 * une seconde fois : un envoi interrompu (page rechargée, réseau coupé) et
 * repris ne fait pas de doublon. Une autre image, ou la même avec un autre
 * email (une faute corrigée), fait une nouvelle capture.
 */
export const DOUBLON_MINUTES = 10;
/** Le plus long côté d'une capture réencodée, en pixels : assez pour lire un profil. */
export const COTE_MAX_PIXELS = 1600;
/**
 * Le poids d'une capture réencodée, au plus : elle est gardée dans la base
 * quand aucun magasin privé n'est réglé. Une capture d'écran ordinaire pèse
 * bien moins ; une image de bruit envoyée pour remplir la base est refusée.
 */
export const TAILLE_MAX_REENCODEE_OCTETS = 1024 * 1024;
/** Au-delà, l'image n'est pas décodée (une image piège qui gonflerait en mémoire). */
export const PIXELS_MAX = 40_000_000;
/** Un fichier de preuve ne vit pas plus longtemps. */
export const JOURS_CONSERVATION_MAX = 30;
/**
 * L'email et le téléphone donnés avec une capture sont effacés tant de
 * jours après la décision. Une capture validée qui n'a pas servi ne peut
 * plus servir ensuite (on ne sait plus à qui elle est) ; celle qui a servi a
 * laissé son contact sur la réservation qu'elle a réduite (décision 25). La
 * page Données personnelles lit cette durée ici.
 */
export const JOURS_CONSERVATION_CONTACT = 30;
/**
 * Au-delà de tant de captures qui attendent d'être vérifiées, les nouvelles
 * sont refusées pour un temps : un garde-fou contre qui enverrait des images
 * à la chaîne depuis beaucoup d'adresses (elles pèsent dans la base : 100 Mo
 * au plus avec TAILLE_MAX_REENCODEE_OCTETS).
 */
export const PREUVES_EN_ATTENTE_MAX = 100;

const MINUTE_MS = 60 * 1000;
const JOUR_MS = 24 * 60 * MINUTE_MS;

/* ------------------------------------------------------------- Image */

export type TypeCapture = (typeof TYPES_CAPTURE)[number];

/**
 * Le type d'une image, lu dans ses premiers octets (sa signature), jamais
 * dans le nom du fichier ni dans ce qu'annonce le navigateur : JPEG, PNG ou
 * WebP, sinon `null`.
 */
export function typeDeLImage(octets: Uint8Array): TypeCapture | null {
  const commencePar = (signature: number[], decalage = 0) =>
    octets.length >= decalage + signature.length && signature.every((octet, i) => octets[decalage + i] === octet);
  if (commencePar([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (commencePar([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // « RIFF », la taille sur quatre octets, puis « WEBP ».
  if (commencePar([0x52, 0x49, 0x46, 0x46]) && commencePar([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export interface CaptureReencodee {
  octets: Uint8Array;
  typeMime: "image/webp";
  largeur: number;
  hauteur: number;
}

/**
 * La capture réencodée par sharp : tournée selon son orientation, réduite à
 * 1 600 pixels au plus sur son plus grand côté, en WebP, de moins en moins
 * fine tant qu'elle dépasse TAILLE_MAX_REENCODEE_OCTETS. Le réencodage ne
 * garde aucune métadonnée (sharp n'en recopie aucune sans qu'on le lui
 * demande) : ni EXIF, ni XMP, ni position GPS. Lève une erreur si l'image ne
 * se décode pas.
 */
export async function reencoderCapture(octets: Uint8Array): Promise<CaptureReencodee> {
  const { default: sharp } = await import("sharp");
  let capture: CaptureReencodee | null = null;
  for (const quality of [82, 60, 40]) {
    const { data, info } = await sharp(octets, { limitInputPixels: PIXELS_MAX, failOn: "error" })
      .autoOrient()
      .resize({ width: COTE_MAX_PIXELS, height: COTE_MAX_PIXELS, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    capture = { octets: new Uint8Array(data), typeMime: "image/webp", largeur: info.width, hauteur: info.height };
    if (capture.octets.byteLength <= TAILLE_MAX_REENCODEE_OCTETS) break;
  }
  return capture!;
}

/* ------------------------------------------------------- Dépendances */

/**
 * Ce que dit l'email de Bike Land quand une capture attend sa vérification
 * (décision 24). Jamais le contact du client : il ne resterait pas dans la
 * messagerie après l'effacement promis ; la page des preuves le montre.
 */
export interface AlerteCapture {
  /** L'instant où la capture est arrivée (ISO). */
  recueLe: string;
  /** Les captures qui attendent d'être vérifiées, celle-ci comprise. */
  enAttente: number;
}

export interface DependancesPreuves {
  depot: Pick<
    Depot,
    | "compterEssai"
    | "creerPreuve"
    | "trouverPreuve"
    | "listerPreuves"
    | "deciderPreuve"
    | "effacerFichierPreuve"
    | "listerFichiersPreuvesAEffacer"
    | "trouverReservationParReference"
    | "listerReservationsRoadTripGroupe"
    | "journaliser"
  >;
  stockage: StockagePreuves;
  lireOuverture: () => Promise<{ offresGroupeActives: boolean }>;
  lireReglages: () => Promise<LectureReglagesOffres>;
  /** L'agent IA, quand une clé est réglée ; `null` : vérification à la main (décision 21). */
  analyser: ((entree: { image: Uint8Array; typeMime: "image/webp" }) => Promise<ResultatCapture>) | null;
  reencoder: (octets: Uint8Array) => Promise<CaptureReencodee>;
  maintenant: () => number;
  /** La réponse au client après une vérification à la main. */
  emailDecision: (champs: {
    email: string;
    statut: "validee" | "refusee";
    lienReprise: string;
    reduction?: string;
    motif?: string;
    /**
     * Validée, alors que ce client a déjà réservé un road trip au prix
     * normal après sa capture (payé, ou en attente de paiement) : cette
     * réservation reste au prix normal, la réduction servira une fois, sur
     * un prochain road trip (décision 24, sans remboursement).
     */
    reservationPrixNormal?: string;
    /** Validée, alors que ce client a déjà eu la réduction sur cette réservation : une fois par client (décision 25). */
    reductionDejaEue?: string;
    /** Validée, alors que la réduction est réglée à 0 % : rien à appliquer, ni pourcentage ni lien de reprise. */
    sansReduction?: boolean;
    /**
     * Validée : la capture sert pendant tant de jours (son contact est effacé
     * ensuite, et elle ne sert plus) ; l'email le dit.
     */
    valableJours?: number;
  }) => Promise<{ envoye: boolean }>;
  /** Prévient Bike Land qu'une capture attend sa vérification (décision 24). */
  alerterBikeLand: (alerte: AlerteCapture) => Promise<{ envoye: boolean }>;
  /**
   * Lance une tâche après la réponse au client (`after` de next/server dans
   * la route) : l'email à Bike Land ne retarde jamais l'envoi de la capture.
   * Absente (tests), la tâche est attendue avant de répondre.
   */
  differer?: (tache: () => Promise<void>) => void;
  /** L'adresse du site (sur un aperçu, celle de la branche). */
  urlSite: () => string;
}

/* ---------------------------------------------------------- Messages */

function erreur(statut: number, code: ReponseErreur["code"], message: string): Reponse<ReponseErreur> {
  return { statut, corps: { ok: false, code, message } };
}

/**
 * Le taux de la réduction lu dans les réglages : « 4 % », et `inactive`
 * quand il est réglé à 0 % (l'offre aux abonnés est arrêtée). Rien s'ils
 * ne se lisent pas.
 */
async function lireTaux(deps: Pick<DependancesPreuves, "lireReglages">): Promise<{ texte?: string; inactive: boolean }> {
  try {
    const lecture = await deps.lireReglages();
    if (lecture.source === "illisible") return { inactive: false };
    const taux = lecture.reglages.roadTrip.reduction;
    return { texte: formatPourcentage(taux), inactive: taux <= 0 };
  } catch {
    return { inactive: false };
  }
}

/** « 4 % », lu dans les réglages ; rien s'ils ne se lisent pas. */
async function tauxDeReduction(deps: Pick<DependancesPreuves, "lireReglages">): Promise<string | undefined> {
  return (await lireTaux(deps)).texte;
}

/**
 * Le message au client, selon où en est sa preuve. `email` : l'adresse que
 * le client vient de donner avec sa capture, rappelée à l'envoi seulement
 * (jamais dans la réponse publique du statut). `suivi` : le client demande
 * où en est une capture déjà envoyée (« Est-ce que c'est validé ? »).
 */
export function messagePreuve(
  statut: EtatPreuveClient,
  reduction?: string,
  options: { email?: string; suivi?: boolean; motif?: string } = {},
): string {
  const laReduction = reduction ? `la réduction de ${reduction}` : "la réduction";
  switch (statut) {
    case "validee":
      return `Votre capture est validée : ${laReduction} s'applique à votre road trip en groupe.`;
    case "refusee":
      return messageCaptureRefusee(options.motif);
    case "deja-utilisee":
      return PHRASE_CAPTURE_DEJA_UTILISEE;
    case "deja-eue":
      return phraseReductionDejaEue(reduction);
    default:
      return options.suivi ? MESSAGE_CAPTURE_PAS_ENCORE : messageCaptureRecue(options.email);
  }
}

/** Le lien qui rouvre le chatbot sur le road trip en groupe, avec cette preuve s'il y en a une validée. */
export function lienDeReprise(urlSite: string, preuveId?: string): string {
  const parametres = new URLSearchParams({ "reserver-en-groupe": "road-trip-groupe" });
  if (preuveId) parametres.set("preuve", preuveId);
  return `${urlSite.replace(/\/+$/, "")}/?${parametres.toString()}`;
}

/** Les huit derniers chiffres d'un numéro : « +229 01 97… » et « 0197… » se reconnaissent. */
const finDeNumero = (telephone: string) => telephone.replace(/[^0-9]/g, "").slice(-8);

/**
 * L'adresse d'une boîte aux lettres, pour la limite de captures par jour et
 * par email : en minuscules, sans la partie « +… » avant l'arobase (une même
 * boîte), et, pour Gmail, sans les points (« a.y.o@gmail.com » arrive chez
 * « ayo@gmail.com »). Ne sert qu'à la limite de débit : la règle « une
 * réduction par client » garde l'email tel que la décision 25 le définit.
 */
export function boiteAuxLettres(email: string): string {
  const adresse = emailDuClient(email);
  const arobase = adresse.lastIndexOf("@");
  if (arobase <= 0) return adresse;
  let local = adresse.slice(0, arobase).split("+")[0] ?? "";
  let domaine = adresse.slice(arobase + 1);
  if (domaine === "googlemail.com") domaine = "gmail.com";
  if (domaine === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domaine}`;
}

/** Deux images identiques, octet pour octet. */
function memesOctets(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Le compteur d'une limite de débit ; injoignable, il ne bloque personne. */
async function compter(deps: Pick<DependancesPreuves, "depot">, cle: string, fenetreSecondes: number): Promise<number> {
  try {
    return await deps.depot.compterEssai(cle, fenetreSecondes);
  } catch (e) {
    console.error("[offres-groupe] compteur des preuves injoignable", e);
    return 0;
  }
}

/** Efface le fichier d'une preuve décidée ; un échec est rattrapé par la tâche quotidienne. */
async function effacerFichier(preuve: PreuveReduction, deps: Pick<DependancesPreuves, "depot" | "stockage">): Promise<boolean> {
  try {
    await deps.stockage.effacer(preuve);
    await deps.depot.effacerFichierPreuve(preuve.id);
    return true;
  } catch (e) {
    console.error(`[offres-groupe] preuve ${preuve.id} : fichier non effacé, la tâche quotidienne s'en chargera`, e);
    return false;
  }
}

/* ------------------------------------------- Une réduction par client */

/** Ce que l'administration et l'email de décision doivent savoir du client d'une capture. */
export interface SituationClient {
  /** La réservation où ce client a déjà eu la réduction : elle vaut une fois par client (décision 25). */
  dejaEue?: string;
  /**
   * Sa réservation au prix normal faite après la capture, payée ou en attente
   * de paiement : elle garde ce prix (décision 24, pas de remboursement).
   */
  prixNormal?: { reference: string; payee: boolean };
}

/**
 * Le premier jour de départ à lire pour la situation des clients de ces
 * captures : le jour où la plus ancienne est arrivée. Une réservation faite
 * après une capture part ce jour-là ou plus tard ; une réservation à venir
 * aussi.
 */
export function departsALire(captures: readonly Pick<PreuveReduction, "creeLe">[], maintenant: number): DateISO {
  const plusAncienne = captures.reduce((min, preuve) => (preuve.creeLe < min ? preuve.creeLe : min), new Date(maintenant).toISOString());
  return dateAuBenin(plusAncienne);
}

/**
 * La situation du client d'une capture, d'après les road trips en groupe :
 * ceux qui ont eu la réduction (`avecReduction`) et ceux au prix normal
 * (`auPrixNormal`). Pour l'écran des preuves, avant de décider, et pour
 * l'email qui suit une validation. Une réservation au prix normal compte
 * quand elle a été faite après la capture, ou quand son départ est encore à
 * venir, même réservée un peu avant : elle garde ce prix (décision 24).
 */
export function situationDuClient(
  preuve: Pick<PreuveReduction, "email" | "telephone" | "creeLe">,
  avecReduction: readonly ReservationRoadTripClient[],
  auPrixNormal: readonly ReservationRoadTripClient[],
  maintenant: number,
): SituationClient {
  const identite = { email: preuve.email, telephone: preuve.telephone };
  const aujourdhui = dateAuBenin(new Date(maintenant));
  const deja = identiteVide(identite) ? null : reductionDejaEue(avecReduction, [identite], maintenant);
  const normale = identiteVide(identite)
    ? undefined
    : auPrixNormal.findLast(
        (reservation) =>
          reservation.reductionXof === 0 &&
          (reservation.creeLe >= preuve.creeLe || (reservation.date !== undefined && reservation.date >= aujourdhui)) &&
          reservationRetenue(reservation, maintenant) &&
          memeClient(identite, reservation),
      );
  return {
    ...(deja ? { dejaEue: deja.reference } : {}),
    ...(normale ? { prixNormal: { reference: normale.reference, payee: normale.statut !== "EN_ATTENTE_PAIEMENT" } } : {}),
  };
}

/* --------------------------------------------------------- Réception */

/**
 * POST preuves : la capture (champ « capture ») et le téléphone et l'email du
 * client. Réponse 201 avec le statut : « en_attente » tant que personne n'a
 * vérifié (sans agent IA, toujours), sinon la décision de l'agent. Une
 * capture qui attend sa vérification prévient Bike Land par email, après la
 * réponse au client (décision 24). Le client qui a déjà eu la réduction,
 * reconnu à son numéro ou à son email, l'apprend tout de suite (409
 * REDUCTION_DEJA_EUE), rien n'est gardé ni envoyé (décision 25). La même
 * capture renvoyée juste après (envoi interrompu) rend la première (200),
 * sans doublon. Réduction réglée à 0 % : refusée (409 SANS_REDUCTION).
 */
export async function recevoirPreuve(
  formulaire: FormData | null,
  appelant: { ip: string },
  deps: DependancesPreuves,
): Promise<Reponse<ReponsePreuve | ReponseErreur>> {
  if (!(await deps.lireOuverture()).offresGroupeActives) {
    return erreur(403, "FERME", "Les offres de groupe ne se réservent pas en ligne pour le moment.");
  }
  if (!formulaire) return erreur(400, "SAISIE", "Joignez la capture d'écran, puis réessayez.");
  const champs = schemaChampsPreuve.safeParse({
    telephone: formulaire.get("telephone"),
    email: formulaire.get("email"),
  });
  if (!champs.success) {
    return erreur(400, "SAISIE", "Vérifiez votre numéro Mobile Money (8 chiffres au moins) et votre email, puis réessayez.");
  }
  // L'offre aux abonnés arrêtée (0 % dans les réglages), par exemple depuis
  // une carte ouverte avant le changement : rien n'est gardé, personne n'est
  // dérangé.
  const taux = await lireTaux(deps);
  if (taux.inactive) return erreur(409, "SANS_REDUCTION", MESSAGE_REDUCTION_INACTIVE);

  // Limite de débit : par adresse (par heure et par jour), par numéro et par
  // boîte aux lettres (un alias Gmail compte pour la même boîte).
  const parAdresse = await compter(deps, `preuve:${appelant.ip}`, 60 * 60);
  const parAdresseJour = await compter(deps, `preuve-jour:${appelant.ip}`, 24 * 60 * 60);
  const numero = finDeNumero(champs.data.telephone);
  const parNumero = numero ? await compter(deps, `preuve-numero:${numero}`, 24 * 60 * 60) : 0;
  const parEmail = await compter(deps, `preuve-email:${boiteAuxLettres(champs.data.email)}`, 24 * 60 * 60);
  if (
    parAdresse > PREUVES_PAR_HEURE_ADRESSE ||
    parAdresseJour > PREUVES_PAR_JOUR_ADRESSE ||
    parNumero > PREUVES_PAR_JOUR_NUMERO ||
    parEmail > PREUVES_PAR_JOUR_EMAIL
  ) {
    return erreur(429, "TROP_DE_DEMANDES", "Trop de captures envoyées. Réessayez plus tard, ou écrivez-nous sur WhatsApp.");
  }
  const enAttente = await deps.depot.listerPreuves({ statut: "en_attente", limite: PREUVES_EN_ATTENTE_MAX });
  if (enAttente.length >= PREUVES_EN_ATTENTE_MAX) {
    console.error(`[offres-groupe] ${PREUVES_EN_ATTENTE_MAX} captures attendent d'être vérifiées : les nouvelles sont refusées.`);
    return erreur(
      429,
      "TROP_DE_DEMANDES",
      "Nous avons beaucoup de captures à vérifier en ce moment. Réessayez un peu plus tard, ou réservez sans la réduction.",
    );
  }

  const fichier = formulaire.get("capture");
  if (!fichier || typeof fichier === "string") return erreur(400, "SAISIE", "Joignez la capture d'écran, puis réessayez.");
  if (fichier.size === 0) return erreur(400, "SAISIE", "Cette image est vide : envoyez une autre capture.");
  if (fichier.size > TAILLE_MAX_CAPTURE_OCTETS) {
    return erreur(413, "SAISIE", "Cette image est trop lourde : 4 Mo au plus. Envoyez une capture d'écran, sans la retoucher.");
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (octets.byteLength > TAILLE_MAX_CAPTURE_OCTETS) {
    return erreur(413, "SAISIE", "Cette image est trop lourde : 4 Mo au plus. Envoyez une capture d'écran, sans la retoucher.");
  }
  // Le type se lit dans le fichier lui-même : un nom ou un type annoncé ne prouvent rien.
  if (!typeDeLImage(octets)) return erreur(400, "SAISIE", "Envoyez une capture d'écran en JPEG, PNG ou WebP.");

  let capture: CaptureReencodee;
  try {
    capture = await deps.reencoder(octets);
  } catch {
    return erreur(400, "SAISIE", "Cette image ne se lit pas : envoyez une autre capture d'écran.");
  }
  // Même réduite, trop lourde : ce n'est pas une capture d'écran ordinaire.
  if (capture.octets.byteLength > TAILLE_MAX_REENCODEE_OCTETS) {
    return erreur(413, "SAISIE", "Cette image est trop chargée : envoyez une simple capture d'écran de votre profil.");
  }

  const maintenant = deps.maintenant();

  // Décision 25 : ce client a déjà eu la réduction, reconnu à son numéro OU à
  // son email, comme partout ailleurs (le contact d'une réservation réduite,
  // ou celui de la capture qui l'a réduite). Il l'apprend tout de suite et
  // continue sans elle ; rien n'est gardé, personne n'est prévenu. La
  // réservation refait ce contrôle et fait foi. Les réservations illisibles
  // n'empêchent pas l'envoi.
  try {
    const reductions = await deps.depot.listerReservationsRoadTripGroupe({ avecReduction: true });
    if (reductionDejaEue(reductions, [champs.data], maintenant)) {
      return erreur(409, "REDUCTION_DEJA_EUE", phraseReductionDejaEue(taux.texte));
    }
  } catch (e) {
    console.error("[offres-groupe] réservations illisibles : capture reçue sans le contrôle « une réduction par client »", e);
  }

  // La même capture vient d'arriver de ce numéro, avec cet email (un envoi
  // interrompu, puis repris) : la première suffit, sans doublon ni second
  // email à Bike Land. L'image se compare octet pour octet à celle gardée.
  const email = emailDuClient(champs.data.email);
  const candidates = enAttente.filter(
    (preuve) =>
      numero !== "" &&
      finDeNumero(preuve.telephone ?? "") === numero &&
      emailDuClient(preuve.email) === email &&
      preuve.tailleOctets === capture.octets.byteLength &&
      maintenant - Date.parse(preuve.creeLe) < DOUBLON_MINUTES * MINUTE_MS,
  );
  for (const candidate of candidates) {
    const gardee = await deps.stockage.lire(candidate).catch(() => null);
    if (gardee && memesOctets(gardee, capture.octets)) {
      return {
        statut: 200,
        corps: {
          ok: true,
          preuveId: candidate.id,
          statut: "en_attente",
          message: messagePreuve("en_attente", taux.texte, { email: candidate.email ?? champs.data.email }),
        },
      };
    }
  }

  // Rangée en privé : dans le magasin privé s'il est réglé, sinon dans la base, avec la preuve.
  const champsPreuve = {
    typeMime: capture.typeMime,
    tailleOctets: capture.octets.byteLength,
    email: champs.data.email,
    telephone: champs.data.telephone,
  };
  let preuve: PreuveReduction;
  if (deps.stockage.mode === "blob") {
    const fichierCle = await deps.stockage.ranger(capture.octets, capture.typeMime);
    try {
      preuve = await deps.depot.creerPreuve({ ...champsPreuve, fichierCle });
    } catch (e) {
      // Pas de fichier sans sa preuve : il ne serait jamais effacé.
      await deps.stockage.effacer({ id: "", fichierCle }).catch(() => undefined);
      throw e;
    }
  } else {
    preuve = await deps.depot.creerPreuve({ ...champsPreuve, octets: capture.octets });
  }

  // L'agent IA, s'il est activé : il voit la capture réencodée, sans
  // métadonnées. Au moindre doute, elle reste à vérifier à la main.
  let statut: StatutPreuve = "en_attente";
  if (deps.analyser) {
    const resultat = await deps.analyser({ image: capture.octets, typeMime: capture.typeMime });
    if (resultat.statut !== "en_attente") {
      const decidee = await deps.depot.deciderPreuve(preuve.id, {
        statut: resultat.statut,
        par: "agent IA",
        motif: resultat.motif,
        // Le réseau et le compte de Bike Land reconnus, jamais celui du client.
        verdict: {
          ...(resultat.reseau ? { reseau: resultat.reseau } : {}),
          ...(resultat.identifiantVu ? { compteBikeLand: resultat.identifiantVu } : {}),
        },
      });
      if (decidee) {
        statut = decidee.statut;
        // Décidée : la capture part tout de suite.
        await effacerFichier(decidee, deps);
      }
    }
  }

  // Décision 24 : une capture qui attend une personne, Bike Land le sait tout
  // de suite, par un email parti après la réponse au client. Un email qui ne
  // part pas ne fait jamais échouer l'envoi.
  if (statut === "en_attente") {
    const alerte: AlerteCapture = { recueLe: preuve.creeLe, enAttente: enAttente.length + 1 };
    const tache = () => alerterBikeLand(alerte, preuve.id, deps);
    if (deps.differer) deps.differer(tache);
    else await tache();
  }

  return {
    statut: 201,
    corps: { ok: true, preuveId: preuve.id, statut, message: messagePreuve(statut, taux.texte, { email: champs.data.email }) },
  };
}

/**
 * L'email « Capture à vérifier » à Bike Land (décision 24), dix par heure
 * au plus (ALERTES_PAR_HEURE). Ne lève jamais : un échec est noté au
 * journal du serveur, sans le contact du client.
 */
async function alerterBikeLand(alerte: AlerteCapture, preuveId: string, deps: Pick<DependancesPreuves, "depot" | "alerterBikeLand">) {
  try {
    if ((await compter(deps, "preuve-alertes", 60 * 60)) > ALERTES_PAR_HEURE) {
      console.info(`[offres-groupe] preuve ${preuveId} : déjà ${ALERTES_PAR_HEURE} emails à Bike Land cette heure-ci, pas d'email de plus.`);
      return;
    }
    await deps.alerterBikeLand(alerte);
  } catch (e) {
    console.error(`[offres-groupe] preuve ${preuveId} : email à Bike Land non envoyé`, e);
  }
}

/**
 * GET preuve : où en est une preuve, pour le chatbot qui attend (le bouton
 * « Est-ce que c'est validé ? » ou le lien de l'email). Une capture validée
 * qui ne peut plus servir le dit (« deja-utilisee », « deja-eue ») : le
 * chatbot n'annonce alors jamais « C'est validé ! ». Une capture validée
 * dont le contact a été effacé (30 jours après la décision) ne sert plus :
 * 404, comme une capture inconnue. Refusée à la main, le message dit ce que
 * Bike Land a vu, s'il l'a écrit. Ne rend jamais le contact du client.
 */
export async function statutPreuve(
  preuveId: string,
  deps: Pick<DependancesPreuves, "depot" | "lireReglages" | "maintenant">,
): Promise<Reponse<ReponsePreuve | ReponseErreur>> {
  const preuve = preuveId.length <= 64 ? await deps.depot.trouverPreuve(preuveId) : null;
  if (!preuve) return erreur(404, "SAISIE", "Cette preuve est introuvable : envoyez de nouveau votre capture.");
  let statut: EtatPreuveClient = preuve.statut;
  if (preuve.statut === "validee") {
    try {
      const usage = await usageDUnePreuveValidee(preuve, deps.depot, deps.maintenant());
      if (usage === "inconnue") return erreur(404, "SAISIE", "Cette capture n'est plus valable : envoyez-en une nouvelle.");
      // Sans le contact de la réservation, « autre-client » ne peut pas venir ici.
      statut = usage === "autre-client" ? "validee" : usage;
    } catch (e) {
      // La réservation refera ce contrôle, et c'est elle qui fait foi.
      console.error(`[offres-groupe] preuve ${preuve.id} : réservations illisibles, statut donné sans elles`, e);
    }
  }
  // Le motif écrit par Bike Land en refusant (jamais celui du site ni de l'agent IA).
  const motif = preuve.statut === "refusee" && preuve.decidePar?.startsWith("admin") ? preuve.motif : undefined;
  return {
    statut: 200,
    corps: {
      ok: true,
      preuveId: preuve.id,
      statut,
      message: messagePreuve(statut, await tauxDeReduction(deps), { suivi: true, ...(motif ? { motif } : {}) }),
    },
  };
}

/* ---------------------------------------------------- Administration */

const schemaDecision = z.object({
  action: z.enum(["valider", "refuser"]),
  id: z.string().min(1).max(64),
  prenom: schemaPrenom,
  motif: z.string().trim().max(300, "300 signes au plus.").optional(),
});

/** Ce que l'écran des preuves reçoit après une décision. */
export type ReponseDecisionPreuve =
  | {
      ok: true;
      preuve: { id: string; statut: StatutPreuve };
      fichierEfface: boolean;
      emailEnvoye: boolean;
      /** Validée : la réservation au prix normal que ce client avait déjà faite après sa capture (décision 24). */
      prixNormal?: string;
      /** Validée : la réservation où ce client avait déjà eu la réduction (décision 25). */
      dejaEue?: string;
    }
  | { ok?: false; erreur: string; champs?: Record<string, string> };

/**
 * La décision prise à la main dans l'administration (« Valider » ou
 * « Refuser »), signée du prénom de qui décide (journal). La capture est
 * effacée aussitôt, et le client reçoit la réponse : validée, avec le lien
 * qui rouvre le chatbot sur le road trip avec cette preuve ; refusée, un mot
 * poli et ce qu'il peut faire. Une validation tient compte de ce que le
 * client a déjà réservé : une réservation au prix normal faite pendant
 * l'attente garde ce prix, et la réduction servira sur un prochain road trip
 * (décision 24) ; un client qui l'a déjà eue ne l'a pas une seconde fois
 * (décision 25). Un email qui ne part pas est noté au journal.
 */
export async function deciderPreuveParAdmin(
  corps: unknown,
  deps: Pick<DependancesPreuves, "depot" | "stockage" | "lireReglages" | "emailDecision" | "urlSite" | "maintenant">,
): Promise<Reponse<ReponseDecisionPreuve>> {
  const analyse = schemaDecision.safeParse(corps, { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    const champs = champsEnErreur(analyse.error);
    return { statut: 422, corps: { erreur: Object.values(champs)[0] ?? "Demande invalide.", champs } };
  }
  const { action, id, prenom, motif } = analyse.data;
  const statut = action === "valider" ? "validee" : "refusee";
  const decidee = await deps.depot.deciderPreuve(id, { statut, par: auteurAdmin(prenom), motif });
  if (!decidee) {
    return { statut: 409, corps: { erreur: "Cette preuve est introuvable, ou elle a déjà été décidée." } };
  }

  const fichierEfface = await effacerFichier(decidee, deps);

  // Ce que le client a déjà réservé, pour lui dire la vérité : la réduction
  // déjà eue, ou un road trip au prix normal fait après la capture ou encore
  // à venir.
  let situation: SituationClient = {};
  const maintenant = deps.maintenant();
  if (statut === "validee") {
    try {
      const [avecReduction, auPrixNormal] = await Promise.all([
        deps.depot.listerReservationsRoadTripGroupe({ avecReduction: true }),
        deps.depot.listerReservationsRoadTripGroupe({ avecReduction: false, departDepuis: departsALire([decidee], maintenant) }),
      ]);
      situation = situationDuClient(decidee, avecReduction, auPrixNormal, maintenant);
    } catch (e) {
      console.error(`[offres-groupe] preuve ${decidee.id} : réservations du client illisibles, email ordinaire`, e);
    }
  }

  let emailEnvoye = false;
  if (decidee.email) {
    const taux = await lireTaux(deps);
    // Réduction réglée à 0 % : rien à appliquer, l'email le dit sans pourcentage ni lien de reprise.
    const sansReduction = statut === "validee" && taux.inactive;
    // Le lien rouvre la discussion avec la preuve tant que la réduction peut encore servir à ce client.
    const avecLaPreuve = statut === "validee" && !situation.dejaEue && !sansReduction;
    const envoi = await deps
      .emailDecision({
        email: decidee.email,
        statut,
        lienReprise: lienDeReprise(deps.urlSite(), avecLaPreuve ? decidee.id : undefined),
        ...(taux.texte && !sansReduction ? { reduction: taux.texte } : {}),
        ...(statut === "refusee" && motif ? { motif } : {}),
        ...(sansReduction ? { sansReduction: true } : {}),
        ...(avecLaPreuve ? { valableJours: JOURS_CONSERVATION_CONTACT } : {}),
        ...(!sansReduction && situation.dejaEue ? { reductionDejaEue: situation.dejaEue } : {}),
        ...(!sansReduction && !situation.dejaEue && situation.prixNormal ? { reservationPrixNormal: situation.prixNormal.reference } : {}),
      })
      .catch((e: unknown) => {
        console.error(`[offres-groupe] preuve ${decidee.id} : email de décision non envoyé`, e);
        return { envoye: false };
      });
    emailEnvoye = envoi.envoye;
  }
  // L'email n'est pas parti : l'écran des preuves le rappelle sous « Décidées », pour prévenir le client autrement.
  // Le journal garde les quatre derniers chiffres du numéro : de quoi savoir qui prévenir, sans tout le contact.
  if (!emailEnvoye) {
    const numero = numeroDuClient(decidee.telephone);
    await deps.depot
      .journaliser({
        type: "preuve-email-non-envoye",
        details: { preuveId: decidee.id, statut, ...(numero ? { finNumero: numero.slice(-4) } : {}) },
        auteur: auteurAdmin(prenom),
      })
      .catch((e: unknown) => console.error(`[offres-groupe] preuve ${decidee.id} : échec de l'email non noté au journal`, e));
  }

  return {
    statut: 200,
    corps: {
      ok: true,
      preuve: { id: decidee.id, statut: decidee.statut },
      fichierEfface,
      emailEnvoye,
      ...(situation.prixNormal ? { prixNormal: situation.prixNormal.reference } : {}),
      ...(situation.dejaEue ? { dejaEue: situation.dejaEue } : {}),
    },
  };
}

/* -------------------------------------------------- Tâche quotidienne */

/**
 * L'effacement quotidien des captures : celles qui sont décidées et dont le
 * fichier est encore là (un effacement qui avait échoué), et toutes celles
 * reçues il y a plus de 30 jours. Une capture restée 30 jours sans
 * vérification ne pourra plus l'être : elle est refusée par le site, sans
 * email, et le journal le garde. Si ce refus ne s'écrit pas, son fichier
 * reste : une capture encore « à vérifier » garde son image.
 */
export async function effacerFichiersPreuves(
  deps: Pick<DependancesPreuves, "depot" | "stockage" | "maintenant">,
): Promise<{ effaces: number; echecs: number; expirees: number }> {
  const avant = new Date(deps.maintenant() - JOURS_CONSERVATION_MAX * JOUR_MS).toISOString();
  const preuves = await deps.depot.listerFichiersPreuvesAEffacer(avant);
  let effaces = 0;
  let echecs = 0;
  let expirees = 0;
  for (const preuve of preuves) {
    if (preuve.statut === "en_attente") {
      const refusee = await deps.depot
        .deciderPreuve(preuve.id, {
          statut: "refusee",
          par: "site",
          motif: `Capture restée ${JOURS_CONSERVATION_MAX} jours sans vérification : effacée.`,
        })
        .catch(() => null);
      // Pas refusée (base injoignable, ou décidée entre-temps) : le fichier
      // reste pour ce soir, la tâche de demain reprendra.
      if (!refusee) {
        echecs += 1;
        continue;
      }
      expirees += 1;
    }
    if (await effacerFichier(preuve, deps)) effaces += 1;
    else echecs += 1;
  }
  return { effaces, echecs, expirees };
}

/**
 * L'effacement quotidien du contact des captures : l'email et le téléphone
 * d'une capture décidée il y a plus de 30 jours. Une capture validée qui n'a
 * pas servi ne peut plus servir ensuite (on ne sait plus à qui elle est) ;
 * celle qui a servi a laissé son contact sur la réservation qu'elle a
 * réduite, où la règle « une réduction par client » le retrouve.
 */
export async function effacerContactsPreuves(
  deps: { depot: Pick<Depot, "effacerContactsPreuves">; maintenant: () => number },
): Promise<number> {
  return deps.depot.effacerContactsPreuves(new Date(deps.maintenant() - JOURS_CONSERVATION_CONTACT * JOUR_MS).toISOString());
}
