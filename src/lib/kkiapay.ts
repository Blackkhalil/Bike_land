/**
 * Dialogue serveur avec KkiaPay.
 *
 * KkiaPay ne fonctionne pas comme un agrégateur à page hébergée : le
 * client paie dans une fenêtre ouverte par le navigateur, et celui-ci
 * reçoit en retour un identifiant de transaction. **Cet identifiant ne
 * prouve rien tant que le serveur ne l'a pas vérifié** : n'importe qui
 * peut appeler notre API avec une chaîne inventée.
 *
 * Tout ce qui décide qu'une réservation est payée passe donc par ici, et
 * par un appel serveur à serveur authentifié par nos trois clés. Le
 * navigateur n'est jamais cru sur parole.
 *
 * Adresses et en-têtes repris du SDK officiel `@kkiapay-org/nodejs-sdk`
 * (v1.0.7) : `POST /api/v1/transactions/status`, en-têtes `x-api-key`,
 * `x-private-key` et `x-secret-key`.
 */

import { timingSafeEqual } from "node:crypto";

const API_SANDBOX = "https://api-sandbox.kkiapay.me";
const API_LIVE = "https://api.kkiapay.me";
const CHEMIN_STATUT = "/api/v1/transactions/status";

export interface ConfigurationKkiapay {
  clePublique: string;
  clePrivee: string;
  cleSecrete: string;
  /** Vrai tant qu'on travaille sur les clés de test. */
  sandbox: boolean;
}

/**
 * Configuration complète, ou `null` si les trois clés ne sont pas toutes
 * présentes. On exige les trois : avec une seule manquante, la
 * vérification échouerait systématiquement et les clients paieraient sans
 * que leur réservation soit confirmée.
 */
export function configurationKkiapay(): ConfigurationKkiapay | null {
  const clePublique = process.env.KKIAPAY_PUBLIC_KEY;
  const clePrivee = process.env.KKIAPAY_PRIVATE_KEY;
  const cleSecrete = process.env.KKIAPAY_SECRET;
  if (!clePublique || !clePrivee || !cleSecrete) return null;

  return {
    clePublique,
    clePrivee,
    cleSecrete,
    // Par défaut on suppose le mode test : se tromper dans ce sens fait
    // échouer un paiement de test, l'inverse ferait manipuler de l'argent
    // réel en croyant être en bac à sable.
    sandbox: process.env.KKIAPAY_SANDBOX !== "false",
  };
}

/** Transaction telle que KkiaPay nous la décrit, ramenée à ce qui nous sert. */
export interface TransactionKkiapay {
  transactionId: string;
  /** « SUCCESS » quand l'argent est effectivement encaissé. */
  statut: string;
  montantXof: number;
  /** Notre référence de réservation, transmise au widget via `partnerId`. */
  partnerId?: string;
  moyen?: string;
  motifEchec?: string;
}

export type ResultatVerification =
  | { issue: "verifiee"; transaction: TransactionKkiapay }
  /** KkiaPay ne connaît pas cette transaction : identifiant inventé ou erroné. */
  | { issue: "introuvable" }
  /** Panne réseau ou API indisponible : l'état reste inconnu, il faut réessayer. */
  | { issue: "indisponible"; detail: string };

/**
 * Demande à KkiaPay l'état réel d'une transaction.
 *
 * On distingue soigneusement « transaction inconnue » (réponse ferme, on
 * peut refuser) de « API injoignable » (on ne sait pas, il faut réessayer
 * plus tard). Confondre les deux ferait refuser un paiement réel à cause
 * d'une coupure réseau.
 */
export async function verifierTransaction(
  transactionId: string,
  configuration = configurationKkiapay(),
): Promise<ResultatVerification> {
  if (!configuration) {
    return { issue: "indisponible", detail: "Clés KkiaPay absentes." };
  }

  const base = configuration.sandbox ? API_SANDBOX : API_LIVE;

  let reponse: Response;
  try {
    reponse = await fetch(`${base}${CHEMIN_STATUT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": configuration.clePublique,
        "x-private-key": configuration.clePrivee,
        "x-secret-key": configuration.cleSecrete,
      },
      body: JSON.stringify({ transactionId }),
      // Une fenêtre de paiement laissée ouverte ne doit pas bloquer la
      // route indéfiniment.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (erreur) {
    return {
      issue: "indisponible",
      detail: erreur instanceof Error ? erreur.message : "Appel impossible.",
    };
  }

  if (reponse.status === 404 || reponse.status === 400) return { issue: "introuvable" };
  if (!reponse.ok) {
    return { issue: "indisponible", detail: `KkiaPay a répondu ${reponse.status}.` };
  }

  const donnees = (await reponse.json().catch(() => null)) as {
    transactionId?: string;
    status?: string;
    amount?: number | string;
    partnerId?: string;
    source?: string;
    failureMessage?: string;
    reason?: string;
  } | null;

  if (!donnees || typeof donnees.status !== "string") return { issue: "introuvable" };

  return {
    issue: "verifiee",
    transaction: {
      transactionId: donnees.transactionId ?? transactionId,
      statut: donnees.status,
      montantXof: Number(donnees.amount ?? 0),
      partnerId: donnees.partnerId,
      moyen: donnees.source,
      motifEchec: donnees.failureMessage ?? donnees.reason,
    },
  };
}

/**
 * Cette transaction paie-t-elle bien cette réservation ?
 *
 * Fonction pure, donc vérifiable isolément. Trois contrôles :
 *
 *  1. **Le paiement a abouti.** Un statut autre que SUCCESS — en attente,
 *     échoué — ne confirme rien.
 *  2. **Le montant couvre la réservation.** On compare au total attendu.
 *     La comparaison est un « au moins » et non une égalité stricte :
 *     lorsque les frais sont à la charge du client, KkiaPay encaisse un
 *     peu plus que le prix affiché. Payer moins, en revanche, ne confirme
 *     jamais.
 *  3. **La transaction porte notre référence.** Le widget reçoit
 *     `partnerId = référence de la réservation` et KkiaPay nous la
 *     renvoie. Sans ce contrôle, le paiement d'une réservation pourrait
 *     servir à en confirmer une autre du même montant.
 *
 * Si `partnerId` est absent de la réponse, on ne bloque pas : refuser un
 * paiement réel parce qu'un champ facultatif manque serait pire que le
 * risque couvert, d'autant que la réutilisation d'un identifiant de
 * transaction est déjà interdite par une contrainte d'unicité en base.
 */
export function controlerTransaction(
  transaction: TransactionKkiapay,
  attendu: { reference: string; montantXof: number },
): { valide: true } | { valide: false; raison: string } {
  if (transaction.statut !== "SUCCESS") {
    return {
      valide: false,
      raison:
        transaction.statut === "PENDING"
          ? "Le paiement n'est pas encore validé par l'opérateur."
          : `Paiement non abouti (${transaction.statut}${
              transaction.motifEchec ? ` : ${transaction.motifEchec}` : ""
            }).`,
    };
  }

  if (!Number.isFinite(transaction.montantXof) || transaction.montantXof < attendu.montantXof) {
    return {
      valide: false,
      raison: `Montant insuffisant : ${transaction.montantXof} FCFA reçus pour ${attendu.montantXof} FCFA attendus.`,
    };
  }

  if (transaction.partnerId && transaction.partnerId !== attendu.reference) {
    return {
      valide: false,
      raison: "Cette transaction paie une autre réservation.",
    };
  }

  return { valide: true };
}

/**
 * Vérifie le secret partagé des notifications KkiaPay.
 *
 * KkiaPay ne signe pas ses webhooks : il renvoie, dans l'en-tête
 * `x-kkiapay-secret`, le « secret hash » saisi dans le tableau de bord.
 * La comparaison est à temps constant — comparer deux chaînes avec `===`
 * laisse fuir leur préfixe commun par le temps de réponse.
 */
export function secretWebhookValide(recu: string | null): boolean {
  const attendu = process.env.KKIAPAY_WEBHOOK_SECRET;
  if (!attendu || !recu) return false;

  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
