/**
 * Encaissement des paiements.
 *
 * Le cahier des charges (§6.1, §7.2) retient un agrégateur béninois —
 * FedaPay ou KkiaPay — parce que le Mobile Money y est très majoritaire
 * devant la carte bancaire, et que Stripe ou PayPal ne le couvrent pas.
 *
 * Ce module expose une interface unique et trois implémentations :
 *  - FedaPay et KkiaPay, activées par leurs clés d'API respectives ;
 *  - un mode « démonstration » utilisé tant qu'aucune clé n'est configurée,
 *    qui simule une transaction réussie pour que le parcours complet reste
 *    testable de bout en bout.
 *
 * Aucune coordonnée bancaire ne transite par notre serveur : l'agrégateur
 * héberge la page de paiement, nous ne manipulons que des identifiants de
 * transaction.
 */

import type { MoyenPaiement } from "./types";

export type FournisseurActif = "fedapay" | "kkiapay" | "demo";

export interface DemandePaiement {
  montantXof: number;
  moyen: MoyenPaiement;
  reference: string;
  description: string;
  client: { prenom: string; nom: string; email: string; telephone?: string };
  urlRetour: string;
}

export interface ResultatPaiement {
  statut: "REUSSI" | "EN_ATTENTE" | "ECHOUE";
  fournisseur: FournisseurActif;
  referenceTransaction: string;
  /** Page de paiement hébergée, quand l'agrégateur en impose une. */
  urlPaiement?: string;
  message?: string;
}

export function fournisseurActif(): FournisseurActif {
  if (process.env.FEDAPAY_SECRET_KEY) return "fedapay";
  if (process.env.KKIAPAY_PRIVATE_KEY) return "kkiapay";
  return "demo";
}

/** Moyens de paiement proposés au client, dans l'ordre d'usage au Bénin. */
export const moyensDisponibles: { code: MoyenPaiement; libelle: string; detail: string }[] = [
  { code: "MTN_MONEY", libelle: "MTN MoMo", detail: "Paiement par mobile" },
  { code: "MOOV_MONEY", libelle: "Moov Money", detail: "Paiement par mobile" },
  { code: "CARTE_BANCAIRE", libelle: "Carte bancaire", detail: "Visa · Mastercard" },
];

export async function encaisser(demande: DemandePaiement): Promise<ResultatPaiement> {
  switch (fournisseurActif()) {
    case "fedapay":
      return encaisserFedaPay(demande);
    case "kkiapay":
      return encaisserKkiaPay(demande);
    default:
      return encaisserEnDemonstration(demande);
  }
}

// ------------------------------------------------------------------ FedaPay

async function encaisserFedaPay(demande: DemandePaiement): Promise<ResultatPaiement> {
  const base =
    process.env.FEDAPAY_ENVIRONMENT === "live"
      ? "https://api.fedapay.com/v1"
      : "https://sandbox-api.fedapay.com/v1";

  const reponse = await fetch(`${base}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: demande.description,
      amount: demande.montantXof,
      currency: { iso: "XOF" },
      callback_url: demande.urlRetour,
      customer: {
        firstname: demande.client.prenom,
        lastname: demande.client.nom,
        email: demande.client.email,
        ...(demande.client.telephone
          ? { phone_number: { number: demande.client.telephone, country: "bj" } }
          : {}),
      },
    }),
  });

  if (!reponse.ok) {
    return {
      statut: "ECHOUE",
      fournisseur: "fedapay",
      referenceTransaction: "",
      message: `FedaPay a refusé la transaction (HTTP ${reponse.status}).`,
    };
  }

  const donnees = (await reponse.json()) as {
    "v1/transaction"?: { id: number; reference: string };
  };
  const transaction = donnees["v1/transaction"];

  return {
    statut: "EN_ATTENTE",
    fournisseur: "fedapay",
    referenceTransaction: transaction?.reference ?? String(transaction?.id ?? ""),
  };
}

// ------------------------------------------------------------------ KkiaPay

async function encaisserKkiaPay(demande: DemandePaiement): Promise<ResultatPaiement> {
  // KkiaPay initie le paiement côté navigateur via son widget ; le serveur
  // ne fait que vérifier la transaction une fois le widget revenu.
  return {
    statut: "EN_ATTENTE",
    fournisseur: "kkiapay",
    referenceTransaction: demande.reference,
    message: "Transaction à confirmer par le widget KkiaPay.",
  };
}

export async function verifierKkiaPay(identifiantTransaction: string): Promise<ResultatPaiement> {
  const reponse = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.KKIAPAY_PUBLIC_KEY ?? "",
      "x-private-key": process.env.KKIAPAY_PRIVATE_KEY ?? "",
      "x-secret-key": process.env.KKIAPAY_SECRET ?? "",
    },
    body: JSON.stringify({ transactionId: identifiantTransaction }),
  });

  const donnees = (await reponse.json().catch(() => ({}))) as { status?: string };
  return {
    statut: donnees.status === "SUCCESS" ? "REUSSI" : "ECHOUE",
    fournisseur: "kkiapay",
    referenceTransaction: identifiantTransaction,
  };
}

// -------------------------------------------------------------- Démonstration

async function encaisserEnDemonstration(demande: DemandePaiement): Promise<ResultatPaiement> {
  // Aucune clé configurée : on simule un encaissement réussi pour que le
  // parcours de réservation reste testable sans compte marchand.
  return {
    statut: "REUSSI",
    fournisseur: "demo",
    referenceTransaction: `DEMO-${demande.reference}`,
    message:
      "Mode démonstration : aucun paiement réel n'a été effectué. " +
      "Renseignez FEDAPAY_SECRET_KEY ou KKIAPAY_PRIVATE_KEY pour encaisser réellement.",
  };
}
