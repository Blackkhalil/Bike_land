/**
 * Le client de l'agent IA des offres de groupe : Claude Fable 5.1, chez
 * Anthropic (décision 13 du responsable, voir docs/bike-land/SUIVI.md).
 *
 * Module serveur uniquement, comme src/lib/saspay.ts : il lit la clé
 * ANTHROPIC_API_KEY, une variable du serveur et non NEXT_PUBLIC_, que Next
 * ne met donc jamais dans le JavaScript envoyé aux visiteurs. Seuls les
 * routes d'API et les modules serveur l'importent.
 *
 * Ce que l'agent a le droit de faire est fixé ici et dans son seul usage,
 * capture.ts : dire ce qu'il voit sur une capture d'écran. Il ne reçoit
 * jamais les réglages des prix, ne calcule rien, et n'appelle aucun réseau
 * social. Le récapitulatif envoyé au client n'est pas de lui : c'est le
 * texte fixe de src/lib/offres/recapitulatif.ts (décision 21).
 *
 * Sans clé, rien ne casse : la capture est vérifiée à la main dans
 * l'administration. Chaque fonction accepte un client injecté, pour que les
 * tests ne touchent jamais le réseau.
 *
 * Ce modèle exige que l'organisation Anthropic de Bike Land garde les
 * données 30 jours (pas de « zéro conservation ») : sinon chaque appel est
 * refusé (erreur 400) et le repli s'applique. C'est cette durée que la page
 * « Protection des données » annonce.
 *
 * Réglages du modèle, tirés de la référence de l'API Claude : la réflexion
 * est toujours active sur Claude Fable 5.1, on n'envoie donc aucun réglage
 * `thinking` (max_tokens lui laisse de la place) ; aucun paramètre
 * d'échantillonnage (temperature, top_p, top_k), aucun préremplissage de la
 * réponse, aucun outil imposé ; la profondeur se règle par l'effort.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Le modèle choisi par le responsable (décision 13). */
export const MODELE_AGENT_IA = "claude-fable-5-1";

/**
 * Le repli côté serveur quand Claude Fable 5.1 décline une demande pour
 * raison de sécurité : Anthropic relance alors la même demande sur le
 * modèle de repli qu'il recommande, dans le même appel. Forme « default »,
 * celle que la documentation d'Anthropic recommande, avec son en-tête bêta
 * exact : l'autre forme (une liste de modèles) a son propre en-tête, et
 * mélanger les deux est refusé.
 */
export const REPLI_SERVEUR = "default" as const;
export const ENTETE_REPLI_SERVEUR = "server-side-fallback-2026-07-01" as const;

/** Une seule nouvelle tentative au plus : le client attend la réponse. */
export const NOUVELLES_TENTATIVES_MAX = 1;

/**
 * Le délai par défaut d'un appel, nouvelle tentative comprise. Claude Fable
 * 5.1 réfléchit avant de répondre : quelques secondes à quelques dizaines
 * de secondes. capture.ts fixe le sien (DELAI_CAPTURE_MS).
 */
export const DELAI_PAR_DEFAUT_MS = 30_000;

export type ParametresAgentIa = Anthropic.Beta.MessageCreateParamsNonStreaming;
export type ReponseAgentIa = Anthropic.Beta.BetaMessage;
export type OptionsRequeteIa = Anthropic.RequestOptions;

/**
 * Ce dont l'agent a besoin d'un client Anthropic : créer un message. Un
 * vrai client (`new Anthropic()`) convient tel quel ; les tests passent un
 * faux client qui enregistre la demande et rend une réponse écrite à la main.
 */
export interface ClientAgentIa {
  beta: {
    messages: {
      create(parametres: ParametresAgentIa, options?: OptionsRequeteIa): PromiseLike<ReponseAgentIa>;
    };
  };
}

/** Les options communes aux fonctions de l'agent. */
export interface OptionsAgentIa {
  /**
   * Le client à utiliser. Absent : celui de la clé ANTHROPIC_API_KEY, s'il
   * y en a une. `null` : pas d'agent IA, le repli s'applique sans appel.
   */
  client?: ClientAgentIa | null;
  /** Le délai maximal de l'appel, en millisecondes. */
  delaiMs?: number;
}

/**
 * Le client Anthropic, ou `null` quand la clé manque. Ne lève jamais
 * d'erreur et n'écrit jamais la clé nulle part.
 *
 * Journal du SDK limité aux avertissements, et traces OpenTelemetry
 * coupées, quelles que soient les variables d'environnement
 * (ANTHROPIC_LOG, ANTHROPIC_OPEN_TELEMETRY_*) : en mode « debug », le SDK
 * écrirait le corps de chaque demande, donc la capture d'écran du client,
 * dans les journaux de Vercel.
 */
export function creerClientAgentIa(): ClientAgentIa | null {
  const cle = process.env.ANTHROPIC_API_KEY?.trim();
  if (!cle) return null;
  return new Anthropic({
    apiKey: cle,
    maxRetries: NOUVELLES_TENTATIVES_MAX,
    timeout: DELAI_PAR_DEFAUT_MS,
    logLevel: "warn",
    openTelemetry: false,
  });
}

/**
 * L'agent IA est-il activé (une clé est réglée) ? Sans lui, chaque capture
 * de réduction est vérifiée à la main dans l'administration (décision 21).
 */
export function agentIaActif(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Le client injecté, ou celui de la clé, ou `null`. */
export function clientDeLAgent(options: OptionsAgentIa | undefined): ClientAgentIa | null {
  return options?.client === undefined ? creerClientAgentIa() : options.client;
}

/** Le délai de l'appel est dépassé : on n'attend pas davantage. */
export class DelaiAgentIaDepasseError extends Error {
  constructor(delaiMs: number) {
    super(`L'agent IA n'a pas répondu en ${delaiMs} ms.`);
    this.name = "DelaiAgentIaDepasseError";
  }
}

/**
 * Envoie la demande, en bornant l'attente à `delaiMs`, nouvelle tentative
 * comprise. Passé ce délai, la requête est annulée (on ne la laisse pas
 * tourner pour rien) et la promesse échoue, même si le client ignorait le
 * signal d'annulation.
 */
export async function envoyerAgentIa(
  client: ClientAgentIa,
  parametres: ParametresAgentIa,
  delaiMs: number,
): Promise<ReponseAgentIa> {
  const annulation = new AbortController();
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, echouer) => {
    minuterie = setTimeout(() => {
      // Échouer d'abord, annuler ensuite : la course est gagnée par le délai,
      // pas par l'erreur d'annulation que le client lèvera après.
      echouer(new DelaiAgentIaDepasseError(delaiMs));
      annulation.abort();
    }, delaiMs);
  });
  try {
    return await Promise.race([
      client.beta.messages.create(parametres, {
        timeout: delaiMs,
        maxRetries: NOUVELLES_TENTATIVES_MAX,
        signal: annulation.signal,
      }),
      delai,
    ]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** Pourquoi un appel a échoué : délai dépassé, ou toute autre erreur. */
export function causeDeLEchec(erreur: unknown): "delai" | "erreur" {
  if (
    erreur instanceof DelaiAgentIaDepasseError ||
    erreur instanceof Anthropic.APIConnectionTimeoutError ||
    erreur instanceof Anthropic.APIUserAbortError
  ) {
    return "delai";
  }
  return "erreur";
}

/**
 * Ce qu'on peut écrire dans les journaux d'une erreur : son type, son statut
 * HTTP, le code stable d'Anthropic et l'identifiant de la demande (utile au
 * support d'Anthropic). Jamais le message complet, qui pourrait reprendre une
 * partie de la demande.
 */
export function resumeErreur(erreur: unknown): string {
  if (erreur instanceof Anthropic.APIError) {
    return [erreur.name, erreur.status, erreur.errorCode, erreur.requestID].filter(Boolean).join(" ");
  }
  if (erreur instanceof Error) return erreur.name;
  return "erreur inconnue";
}

/**
 * Le texte de la réponse, blocs de réflexion et de repli écartés. À lire
 * seulement après avoir écarté un refus (`stop_reason` « refusal ») : un
 * refus peut laisser un texte partiel, qui ne doit jamais servir.
 */
export function texteDeLaReponse(reponse: ReponseAgentIa): string {
  return reponse.content
    .flatMap((bloc) => (bloc.type === "text" ? [bloc.text] : []))
    .join("")
    .trim();
}
