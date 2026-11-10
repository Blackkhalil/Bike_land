/**
 * Les preuves de réduction du road trip en groupe (lot 5b ; décisions 8 et
 * 21) : la capture envoyée depuis le chatbot, contrôlée (type lu dans ses
 * premiers octets, taille), réencodée (tournée, réduite, sans métadonnées :
 * ni EXIF, ni XMP, ni position GPS), rangée en privé, puis vérifiée : par
 * l'agent IA quand il est activé, sinon à la main dans l'administration,
 * qui répond au client par email. Le fichier est effacé dès la décision, et
 * 30 jours au plus tard (tâche quotidienne). Jamais de réduction par défaut.
 *
 * Comme le service des réservations, ces fonctions reçoivent leurs
 * dépendances : les routes passent les vraies, les tests des faux.
 */

import { z } from "zod";

import type { LectureReglagesOffres } from "@/data/reglages-offres";
import type { ResultatCapture } from "@/lib/agent-ia/capture";
import type { Depot } from "@/lib/db/contrat";
import { auteurAdmin } from "@/lib/journal";
import { formatPourcentage } from "@/lib/offres";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";
import type { PreuveReduction } from "@/lib/types";

import {
  schemaChampsPreuve,
  TAILLE_MAX_CAPTURE_OCTETS,
  TYPES_CAPTURE,
  type ReponseErreur,
  type ReponsePreuve,
  type StatutPreuve,
} from "./api";
import type { Reponse } from "./service";
import type { StockagePreuves } from "./stockage-preuves";

/* ---------------------------------------------------------- Réglages */

/** Captures acceptées par heure depuis une même adresse. */
export const PREUVES_PAR_HEURE_ADRESSE = 10;
/** Captures acceptées par jour pour un même numéro. */
export const PREUVES_PAR_JOUR_NUMERO = 5;
/** Le plus long côté d'une capture réencodée, en pixels. */
export const COTE_MAX_PIXELS = 2576;
/** Au-delà, l'image n'est pas décodée (une image piège qui gonflerait en mémoire). */
export const PIXELS_MAX = 40_000_000;
/** Un fichier de preuve ne vit pas plus longtemps. */
export const JOURS_CONSERVATION_MAX = 30;
/**
 * Au-delà de tant de captures qui attendent d'être vérifiées, les nouvelles
 * sont refusées pour un temps : un garde-fou contre qui enverrait des images
 * à la chaîne depuis beaucoup d'adresses (elles pèsent dans la base).
 */
export const PREUVES_EN_ATTENTE_MAX = 200;

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
 * 2 576 pixels au plus sur son plus grand côté, en WebP. Le réencodage ne
 * garde aucune métadonnée (sharp n'en recopie aucune sans qu'on le lui
 * demande) : ni EXIF, ni XMP, ni position GPS. Lève une erreur si l'image ne
 * se décode pas.
 */
export async function reencoderCapture(octets: Uint8Array): Promise<CaptureReencodee> {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(octets, { limitInputPixels: PIXELS_MAX, failOn: "error" })
    .autoOrient()
    .resize({ width: COTE_MAX_PIXELS, height: COTE_MAX_PIXELS, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { octets: new Uint8Array(data), typeMime: "image/webp", largeur: info.width, hauteur: info.height };
}

/* ------------------------------------------------------- Dépendances */

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
  }) => Promise<{ envoye: boolean }>;
  /** L'adresse du site (sur un aperçu, celle de la branche). */
  urlSite: () => string;
}

/* ---------------------------------------------------------- Messages */

function erreur(statut: number, code: ReponseErreur["code"], message: string): Reponse<ReponseErreur> {
  return { statut, corps: { ok: false, code, message } };
}

/** « 4 % », lu dans les réglages ; rien s'ils ne se lisent pas. */
async function tauxDeReduction(deps: Pick<DependancesPreuves, "lireReglages">): Promise<string | undefined> {
  try {
    const lecture = await deps.lireReglages();
    return lecture.source === "illisible" ? undefined : formatPourcentage(lecture.reglages.roadTrip.reduction);
  } catch {
    return undefined;
  }
}

/** Le message au client, selon où en est sa preuve. */
export function messagePreuve(statut: StatutPreuve, reduction?: string): string {
  const laReduction = reduction ? `la réduction de ${reduction}` : "la réduction";
  if (statut === "validee") return `Votre capture est validée : ${laReduction} s'applique à votre road trip en groupe.`;
  if (statut === "refusee") {
    return "Nous n'avons pas pu valider cette capture. Vous pouvez en envoyer une autre, ou réserver sans la réduction.";
  }
  return (
    "Merci, votre capture est bien reçue. Nous la vérifions et vous écrivons par email dès que c'est fait. " +
    "Vous pouvez réserver tout de suite sans la réduction, ou attendre notre réponse."
  );
}

/** Le lien qui rouvre le chatbot sur le road trip en groupe, avec cette preuve s'il y en a une validée. */
export function lienDeReprise(urlSite: string, preuveId?: string): string {
  const parametres = new URLSearchParams({ "reserver-en-groupe": "road-trip-groupe" });
  if (preuveId) parametres.set("preuve", preuveId);
  return `${urlSite.replace(/\/+$/, "")}/?${parametres.toString()}`;
}

/** Les huit derniers chiffres d'un numéro : « +229 01 97… » et « 0197… » se reconnaissent. */
const finDeNumero = (telephone: string) => telephone.replace(/[^0-9]/g, "").slice(-8);

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

/* --------------------------------------------------------- Réception */

/**
 * POST preuves : la capture (champ « capture ») et le téléphone et l'email du
 * client. Réponse 201 avec le statut : « en_attente » tant que personne n'a
 * vérifié (sans agent IA, toujours), sinon la décision de l'agent.
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
  if (!champs.success) return erreur(400, "SAISIE", "Indiquez votre numéro de téléphone et votre email, puis réessayez.");

  // Limite de débit : par adresse, et par numéro.
  const parAdresse = await compter(deps, `preuve:${appelant.ip}`, 60 * 60);
  const numero = finDeNumero(champs.data.telephone);
  const parNumero = numero ? await compter(deps, `preuve-numero:${numero}`, 24 * 60 * 60) : 0;
  if (parAdresse > PREUVES_PAR_HEURE_ADRESSE || parNumero > PREUVES_PAR_JOUR_NUMERO) {
    return erreur(429, "TROP_DE_DEMANDES", "Trop de captures envoyées. Réessayez plus tard, ou écrivez-nous sur WhatsApp.");
  }
  if ((await deps.depot.listerPreuves({ statut: "en_attente", limite: PREUVES_EN_ATTENTE_MAX })).length >= PREUVES_EN_ATTENTE_MAX) {
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
    return erreur(413, "SAISIE", "Cette image est trop lourde : 5 Mo au plus. Envoyez une capture d'écran, sans la retoucher.");
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (octets.byteLength > TAILLE_MAX_CAPTURE_OCTETS) {
    return erreur(413, "SAISIE", "Cette image est trop lourde : 5 Mo au plus. Envoyez une capture d'écran, sans la retoucher.");
  }
  // Le type se lit dans le fichier lui-même : un nom ou un type annoncé ne prouvent rien.
  if (!typeDeLImage(octets)) return erreur(400, "SAISIE", "Envoyez une capture d'écran en JPEG, PNG ou WebP.");

  let capture: CaptureReencodee;
  try {
    capture = await deps.reencoder(octets);
  } catch {
    return erreur(400, "SAISIE", "Cette image ne se lit pas : envoyez une autre capture d'écran.");
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

  return {
    statut: 201,
    corps: { ok: true, preuveId: preuve.id, statut, message: messagePreuve(statut, await tauxDeReduction(deps)) },
  };
}

/** GET preuve : où en est une preuve, pour le chatbot qui attend. */
export async function statutPreuve(
  preuveId: string,
  deps: Pick<DependancesPreuves, "depot" | "lireReglages">,
): Promise<Reponse<ReponsePreuve | ReponseErreur>> {
  const preuve = preuveId.length <= 64 ? await deps.depot.trouverPreuve(preuveId) : null;
  if (!preuve) return erreur(404, "SAISIE", "Cette preuve est introuvable : envoyez de nouveau votre capture.");
  return {
    statut: 200,
    corps: { ok: true, preuveId: preuve.id, statut: preuve.statut, message: messagePreuve(preuve.statut, await tauxDeReduction(deps)) },
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
  | { ok: true; preuve: { id: string; statut: StatutPreuve }; fichierEfface: boolean; emailEnvoye: boolean }
  | { ok?: false; erreur: string; champs?: Record<string, string> };

/**
 * La décision prise à la main dans l'administration (« Valider » ou
 * « Refuser »), signée du prénom de qui décide (journal). La capture est
 * effacée aussitôt, et le client reçoit la réponse : validée, avec le lien
 * qui rouvre le chatbot sur le road trip avec cette preuve ; refusée, un mot
 * poli et ce qu'il peut faire.
 */
export async function deciderPreuveParAdmin(
  corps: unknown,
  deps: Pick<DependancesPreuves, "depot" | "stockage" | "lireReglages" | "emailDecision" | "urlSite">,
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

  let emailEnvoye = false;
  if (decidee.email) {
    const reduction = await tauxDeReduction(deps);
    const envoi = await deps
      .emailDecision({
        email: decidee.email,
        statut,
        lienReprise: lienDeReprise(deps.urlSite(), statut === "validee" ? decidee.id : undefined),
        ...(reduction ? { reduction } : {}),
        ...(statut === "refusee" && motif ? { motif } : {}),
      })
      .catch((e: unknown) => {
        console.error(`[offres-groupe] preuve ${decidee.id} : email de décision non envoyé`, e);
        return { envoye: false };
      });
    emailEnvoye = envoi.envoye;
  }

  return { statut: 200, corps: { ok: true, preuve: { id: decidee.id, statut: decidee.statut }, fichierEfface, emailEnvoye } };
}

/* -------------------------------------------------- Tâche quotidienne */

/**
 * L'effacement quotidien des captures : celles qui sont décidées et dont le
 * fichier est encore là (un effacement qui avait échoué), et toutes celles
 * reçues il y a plus de 30 jours. Une capture restée 30 jours sans
 * vérification ne pourra plus l'être : elle est refusée par le site, sans
 * email, et le journal le garde.
 */
export async function effacerFichiersPreuves(
  deps: Pick<DependancesPreuves, "depot" | "stockage" | "maintenant">,
): Promise<{ effaces: number; echecs: number; expirees: number }> {
  const avant = new Date(deps.maintenant() - JOURS_CONSERVATION_MAX * 24 * 60 * 60 * 1000).toISOString();
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
      if (refusee) expirees += 1;
    }
    if (await effacerFichier(preuve, deps)) effaces += 1;
    else echecs += 1;
  }
  return { effaces, echecs, expirees };
}
