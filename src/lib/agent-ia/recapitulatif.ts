/**
 * Le récapitulatif d'une réservation de groupe, rédigé par l'agent IA
 * (cahier des charges, étape 7) : un message court et chaleureux, à partir
 * des chiffres déjà calculés par le moteur des offres.
 *
 * Règles du responsable : l'agent ne calcule JAMAIS ; avant envoi, le code
 * vérifie que chaque montant du texte rédigé correspond au calcul
 * (verification.ts) ; sinon, repli automatique sur le texte modèle fixe,
 * celui du tableur, que le moteur fournit toujours. Même repli quand la clé
 * manque, quand l'agent refuse, se trompe de format, échoue ou tarde.
 *
 * Minimisation des données : l'agent reçoit le prénom du client, l'offre et
 * les faits de la réservation. Jamais son nom, son téléphone ni son email.
 *
 * Module serveur uniquement (voir client.ts).
 */

import {
  causeDeLEchec,
  clientDeLAgent,
  ENTETE_REPLI_SERVEUR,
  envoyerAgentIa,
  MODELE_AGENT_IA,
  REPLI_SERVEUR,
  resumeErreur,
  texteDeLaReponse,
  type OptionsAgentIa,
  type ParametresAgentIa,
  type ReponseAgentIa,
} from "./client";
import { controlerNombres, verifierTexteIa, type FaitCalcule } from "./verification";

export {
  controlerNombres,
  lireNombres,
  verifierTexteIa,
  type ChiffresAttendus,
  type FaitCalcule,
  type VerificationTexte,
} from "./verification";

/** Les trois offres de groupe. */
export type CodeOffreGroupe = "bike-for-all" | "road-trip-groupe" | "gbashi-groupe";

export const NOMS_OFFRES_GROUPE: Record<CodeOffreGroupe, string> = {
  "bike-for-all": "Bike for All",
  "road-trip-groupe": "Road trip en groupe",
  "gbashi-groupe": "Gbashi Bike",
};

export interface EntreeRecapitulatif {
  offre: CodeOffreGroupe;
  /** Le prénom du client. Seul son premier mot part chez l'agent ; absent, le message dit simplement « Bonjour ». */
  prenom?: string | null;
  /** Le texte modèle fixe du moteur (celui du tableur), toujours juste : c'est le repli. */
  texteModele: string;
  /**
   * Les faits calculés et mis en forme par le moteur : total, détail,
   * personnes, date, heures de départ et de retour, cocos, gâteaux, règle de
   * retard. Toute heure et tout nombre que le texte peut citer y figure, y
   * compris ceux du texte modèle (« 25 km », « 20 gâteaux »). Les dates
   * s'écrivent en toutes lettres (« samedi 21 novembre 2026 »). Marquer
   * `obligatoire` ce que le message doit reprendre (total, règle de retard).
   */
  faits: readonly FaitCalcule[];
  /** Le total à payer, qui doit figurer dans le texte. */
  totalXof: number;
  /** Tous les montants que le texte peut citer, y compris ceux des faits et du texte modèle. */
  montantsXof: readonly number[];
}

/**
 * Pourquoi le texte modèle a été envoyé à la place du texte de l'agent :
 * clé absente ; coordonnées dans les faits (rien n'est envoyé) ; texte modèle
 * ou faits qui citent un chiffre hors du calcul (rien n'est envoyé) ; refus,
 * erreur ou délai dépassé chez l'agent ; texte de l'agent refusé par le
 * contrôle (montant inconnu, ou forme).
 */
export type MotifRepliRecapitulatif =
  | "cle-absente"
  | "coordonnees"
  | "faits"
  | "refus"
  | "erreur"
  | "delai"
  | "montant-inconnu"
  | "format";

export interface ResultatRecapitulatif {
  texte: string;
  source: "ia" | "modele";
  motifRepli?: MotifRepliRecapitulatif;
}

/**
 * Le récapitulatif part après le paiement : personne n'attend devant
 * l'écran, on laisse à l'agent le temps de réfléchir puis d'écrire.
 */
export const DELAI_RECAPITULATIF_MS = 30_000;
/** De quoi réfléchir (toujours actif sur ce modèle) puis écrire un message court. */
export const MAX_TOKENS_RECAPITULATIF = 4096;
/** Reformuler des faits donnés est un travail simple : effort faible, réponse plus rapide et moins chère. */
export const EFFORT_RECAPITULATIF = "low" as const;

export const CONSIGNES_RECAPITULATIF = `Tu es l'assistant de réservation de Bike Land, une entreprise de location de vélos à Fidjrossè, Cotonou (Bénin). Tu écris le message de récapitulatif qu'un client reçoit pour sa réservation d'une offre de groupe.

Règles à respecter sans exception :
- Tu ne calcules jamais rien. Tu reprends uniquement les chiffres des faits fournis, tels qu'ils sont écrits : mêmes montants, mêmes heures, même date. Tu n'en ajoutes aucun et tu n'en arrondis aucun.
- Les montants s'écrivent en chiffres, avec une espace entre les milliers, suivis de F : 11 250 F.
- Les heures s'écrivent en chiffres, comme dans les faits : 8 h, 8 h 45, 12 h. Jamais « midi » ni « minuit ».
- Aucun nombre en lettres : écris les nombres en chiffres, comme dans les faits.
- Reprends toutes les informations des faits, en particulier le total à payer et la règle de retard.
- N'invente rien : aucune remise, aucune promesse, aucun lien, aucun numéro, aucune adresse.
- Pas de tiret long, pas de titre, pas de liste à puces, pas de gras, pas d'emoji.

Ton : chaleureux, simple et clair, comme un membre de l'équipe qui écrit à son client. Vouvoiement. Phrases courtes et naturelles, sans formules toutes faites.
Longueur : 60 à 150 mots, en deux ou trois paragraphes.
Commence par « Bonjour » suivi du prénom du client s'il est donné, sinon par « Bonjour, ». Termine en remerciant le client de sa confiance.
Réponds uniquement par le texte du message.`;

/**
 * Le prénom tel qu'il part chez l'agent : lettres seulement, premier mot
 * seulement (un nom de famille saisi à la suite ne part pas), 30 caractères
 * au plus. `null` s'il ne reste rien.
 */
export function prenomPourLAgent(prenom: string | null | undefined): string | null {
  const premierMot = (prenom ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}'’-]+/gu, " ")
    .trim()
    .split(" ")[0];
  const propre = (premierMot ?? "").replace(/^['’-]+|['’-]+$/g, "").slice(0, 30);
  return propre ? propre : null;
}

/**
 * Une adresse email ou un numéro de téléphone (8 chiffres ou plus, espacés
 * ou non) : rien de tel ne part chez l'agent. Une date au format 2026-11-21
 * n'en est pas un.
 */
function contientDesCoordonnees(texte: string): boolean {
  const sansDates = texte.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  return /@/.test(sansDates) || /\+?\d(?:[\s.-]?\d){7,}/.test(sansDates);
}

/** La demande envoyée à l'agent, sans rien d'autre que l'offre, le prénom et les faits. */
export function demandeRecapitulatif(entree: EntreeRecapitulatif, prenom: string | null): ParametresAgentIa {
  const message = [
    `Offre : ${NOMS_OFFRES_GROUPE[entree.offre]}`,
    `Prénom du client : ${prenom ?? "non donné"}`,
    "",
    "Faits calculés par le site, à reprendre tels quels :",
    ...entree.faits.map((fait) => `- ${fait.libelle} : ${fait.valeur}`),
    "",
    "Texte modèle, juste mais sec, à reformuler sans changer aucune information :",
    entree.texteModele,
  ].join("\n");
  return {
    model: MODELE_AGENT_IA,
    max_tokens: MAX_TOKENS_RECAPITULATIF,
    betas: [ENTETE_REPLI_SERVEUR],
    fallbacks: REPLI_SERVEUR,
    output_config: { effort: EFFORT_RECAPITULATIF },
    system: CONSIGNES_RECAPITULATIF,
    messages: [{ role: "user", content: message }],
  };
}

/**
 * Le récapitulatif à envoyer au client : le texte de l'agent s'il passe le
 * contrôle, le texte modèle sinon. Ne lève jamais d'erreur.
 */
export async function redigerRecapitulatif(
  entree: EntreeRecapitulatif,
  options?: OptionsAgentIa,
): Promise<ResultatRecapitulatif> {
  const modele = (motifRepli: MotifRepliRecapitulatif, detail?: string): ResultatRecapitulatif => {
    if (detail) console.warn(`[agent-ia] récapitulatif : texte modèle envoyé (${motifRepli} : ${detail}).`);
    return { texte: entree.texteModele, source: "modele", motifRepli };
  };

  const client = clientDeLAgent(options);
  if (!client) return modele("cle-absente");

  const attendus = { totalXof: entree.totalXof, montantsXof: entree.montantsXof, faits: entree.faits };
  const envoye = [entree.texteModele, ...entree.faits.flatMap((fait) => [fait.libelle, fait.valeur])];
  if (envoye.some(contientDesCoordonnees)) {
    return modele("coordonnees", "un email ou un numéro figure dans les faits, rien n'est envoyé à l'agent");
  }
  // Le texte modèle et les faits doivent citer les mêmes chiffres : sinon
  // l'agent, qui part du texte modèle, serait refusé à coup sûr.
  for (const texte of envoye) {
    const concordance = controlerNombres(texte, attendus);
    if (!concordance.ok) return modele("faits", `texte modèle ou faits hors du calcul, ${concordance.detail}`);
  }

  let reponse: ReponseAgentIa;
  try {
    const prenom = prenomPourLAgent(entree.prenom);
    reponse = await envoyerAgentIa(client, demandeRecapitulatif(entree, prenom), options?.delaiMs ?? DELAI_RECAPITULATIF_MS);
  } catch (erreur) {
    return modele(causeDeLEchec(erreur), resumeErreur(erreur));
  }

  // Un refus d'abord : son contenu, vide ou partiel, ne doit jamais servir.
  if (reponse.stop_reason === "refusal") return modele("refus", "l'agent a décliné la demande");
  if (reponse.stop_reason !== "end_turn") return modele("format", `réponse interrompue (${reponse.stop_reason})`);

  // Les caractères invisibles (espaces de largeur nulle, marques de sens
  // d'écriture) sont retirés : le texte contrôlé est exactement celui qui part.
  const texte = texteDeLaReponse(reponse)
    .replace(/\p{Cf}/gu, "")
    .replace(/\n{3,}/g, "\n\n");
  const verification = verifierTexteIa(texte, attendus);
  if (!verification.ok) return modele(verification.motif, verification.detail);
  return { texte, source: "ia" };
}
