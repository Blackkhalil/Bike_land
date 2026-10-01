/**
 * Encaissement des paiements, via SasPay.
 *
 * Le Mobile Money est très majoritaire au Bénin devant la carte bancaire,
 * et ni Stripe ni PayPal ne le couvrent : le cahier des charges retient
 * donc un agrégateur local. SasPay a remplacé KkiaPay, dont le compte
 * n'était pas validé.
 *
 * Le changement d'agrégateur a changé l'architecture, et en mieux : là où
 * KkiaPay faisait payer le client dans une fenêtre ouverte par son
 * navigateur, SasPay reçoit la demande de **notre serveur** et pousse une
 * notification sur le téléphone du client. Le navigateur n'a donc plus
 * rien à nous apprendre, il demande seulement « où en est-on ? ».
 *
 * Deux modes :
 *
 *  - **saspay** dès que `SASPAY_API_KEY` est présente ;
 *  - **démonstration** en développement local sans clé, pour que le
 *    parcours reste testable de bout en bout.
 *
 * En production, l'absence de clé ne bascule PAS en démonstration : elle
 * rend le paiement indisponible. Simuler un encaissement réussi sur un
 * site en ligne reviendrait à distribuer les vélos gratuitement.
 */

import { configurationSasPay, pousserPaiement } from "./saspay";
import type { MoyenPaiement } from "./types";

export type FournisseurActif = "saspay" | "demo" | "indisponible";

export interface DemandePaiement {
  montantXof: number;
  /** Référence de la réservation : c'est elle que le webhook renverra. */
  reference: string;
  /**
   * Clé d'idempotence de cette tentative, quand elle diffère de la
   * référence. Une relance depuis le lien de suivi doit pousser une
   * nouvelle demande sur la même réservation : sans clé distincte, SasPay
   * reconnaîtrait la première et le client attendrait une notification
   * qui ne viendrait jamais.
   */
  cleIdempotence?: string;
  moyen: MoyenPaiement;
  client: { prenom: string; nom: string; email: string; telephone?: string };
}

/**
 * Ce que le navigateur doit savoir pour suivre un paiement en cours.
 *
 * Il n'y a plus de clé publique ni de fenêtre à ouvrir : seul
 * l'identifiant SasPay, que le navigateur renvoie pour demander où en est
 * la validation sur le téléphone.
 */
export interface SuiviPaiement {
  /** Identifiant SasPay du paiement. */
  paiementId: string;
  /** L'opérateur sur lequel la demande a été poussée. */
  moyen: MoyenPaiement;
  /** Numéro sur lequel la notification est partie, pour le rappeler au client. */
  telephone: string;
  /**
   * Page hébergée à ouvrir, quand le réseau en exige une. Vide pour MTN
   * et Moov Bénin, où tout se joue sur le téléphone.
   */
  urlCheckout?: string;
}

export interface ResultatPaiement {
  statut: "REUSSI" | "EN_ATTENTE" | "ECHOUE";
  fournisseur: FournisseurActif;
  referenceTransaction: string;
  /** Présent en mode SasPay : le navigateur suit la validation avec ceci. */
  suivi?: SuiviPaiement;
  message?: string;
}

export function fournisseurActif(): FournisseurActif {
  if (configurationSasPay()) return "saspay";

  // Le mode démonstration confirme sans encaisser : tolérable en
  // développement, jamais en ligne. `PAIEMENT_DEMO_AUTORISE` existe pour
  // les vitrines de démonstration délibérées, et pour elles seules.
  if (process.env.NODE_ENV === "production" && process.env.PAIEMENT_DEMO_AUTORISE !== "true") {
    return "indisponible";
  }
  return "demo";
}

/**
 * Moyens de paiement proposés au client.
 *
 * Mobile Money uniquement : la carte bancaire a été retirée de l'offre.
 * Elle est très minoritaire au Bénin, et la proposer obligeait à afficher
 * un moyen que presque personne n'utilise.
 *
 * Les trois opérateurs du pays sont proposés. Ils coûtent le même taux
 * chez SasPay, donc aucun n'est avantagé : le client prend celui dont il
 * a le portefeuille.
 */
export const moyensDisponibles: { code: MoyenPaiement; libelle: string; detail: string }[] = [
  { code: "MTN_MONEY", libelle: "MTN MoMo", detail: "Validation sur votre téléphone" },
  { code: "MOOV_MONEY", libelle: "Moov Money", detail: "Validation sur votre téléphone" },
  { code: "CELTIIS_CASH", libelle: "Celtiis Cash", detail: "Validation sur votre téléphone" },
];

/**
 * Tarifs réellement appliqués par SasPay au Bénin.
 *
 * Relevés sur `GET /pricing/my-rates/` le 27 septembre 2026, identiques
 * sur MTN, Moov et Celtiis. Ils se paient en deux temps, et les
 * confondre donnerait un chiffre faux :
 *
 *  - **encaissement** : prélevé sur *chaque* paiement, au moment où le
 *    client paie. C'est un coût par réservation.
 *  - **retrait** : prélevé quand on sort l'argent du portefeuille SasPay
 *    vers un compte. C'est un coût par *versement*, pas par réservation :
 *    sa part fixe se dilue d'autant plus qu'on retire en une seule fois.
 *
 * Les tarifs affichés sur le site incluent 125 F destinés à les couvrir
 * (cf. GRILLE_HORAIRE dans src/data/offres.ts). Ils les couvrent
 * largement : 37 F d'encaissement sur une location à 1 125 F.
 */
export const TAUX_ENCAISSEMENT = 0.0325;
export const TAUX_RETRAIT = 0.015;
export const FRAIS_RETRAIT_FIXE_XOF = 100;

/**
 * Montant minimum accepté par SasPay.
 *
 * Aucun tarif Bike Land n'en approche, mais le vérifier vaut mieux que de
 * laisser SasPay refuser un paiement avec un message que le client ne
 * comprendrait pas.
 */
export const MONTANT_MINIMUM_XOF = 200;

/** Frais d'encaissement sur un paiement, arrondis au franc supérieur. */
export function fraisEncaissement(montantXof: number): number {
  if (montantXof <= 0) return 0;
  return Math.ceil(montantXof * TAUX_ENCAISSEMENT);
}

/**
 * Frais d'un retrait du portefeuille SasPay.
 *
 * À ne pas appliquer par réservation : c'est un coût par versement. Un
 * seul retrait hebdomadaire coûte 100 F de part fixe, cinquante retraits
 * quotidiens en coûteraient cinquante fois plus pour la même somme.
 */
export function fraisRetrait(montantXof: number): number {
  if (montantXof <= 0) return 0;
  return Math.ceil(montantXof * TAUX_RETRAIT) + FRAIS_RETRAIT_FIXE_XOF;
}

/**
 * Lance l'encaissement.
 *
 * En mode SasPay, la demande part immédiatement sur le téléphone du
 * client et l'appel revient en `EN_ATTENTE` : c'est le client qui décide,
 * sur son téléphone, et rien ici ne peut l'anticiper.
 */
export async function encaisser(demande: DemandePaiement): Promise<ResultatPaiement> {
  const fournisseur = fournisseurActif();

  if (fournisseur === "indisponible") {
    return {
      statut: "ECHOUE",
      fournisseur,
      referenceTransaction: "",
      message:
        "Le paiement en ligne n'est pas configuré. Aucune réservation ne peut être encaissée.",
    };
  }

  if (fournisseur === "demo") {
    return {
      statut: "REUSSI",
      fournisseur,
      referenceTransaction: `DEMO-${demande.reference}`,
      message:
        "Mode démonstration : aucun paiement réel n'a été effectué. " +
        "Renseignez SASPAY_API_KEY pour encaisser réellement.",
    };
  }

  // SasPay pousse la demande sur un téléphone : sans numéro, il n'y a
  // personne à joindre. Le tunnel l'exige déjà, ce contrôle est le
  // filet de sécurité côté serveur.
  const telephone = demande.client.telephone?.trim();
  if (!telephone) {
    return {
      statut: "ECHOUE",
      fournisseur,
      referenceTransaction: "",
      message: "Un numéro de téléphone Mobile Money est nécessaire pour payer.",
    };
  }

  const resultat = await pousserPaiement({
    montantXof: demande.montantXof,
    reference: demande.reference,
    cleIdempotence: demande.cleIdempotence,
    moyen: demande.moyen,
    client: { ...demande.client, telephone },
  });

  if (resultat.issue !== "ok") {
    console.error(`[paiement] ${demande.reference} : SasPay a refusé, ${resultat.issue}`);
    return {
      statut: "ECHOUE",
      fournisseur,
      referenceTransaction: "",
      message:
        resultat.issue === "refusee"
          ? resultat.detail
          : "Le service de paiement ne répond pas. Réessayez dans un instant.",
    };
  }

  return {
    statut: "EN_ATTENTE",
    fournisseur: "saspay",
    referenceTransaction: resultat.paiement.id,
    suivi: {
      paiementId: resultat.paiement.id,
      moyen: demande.moyen,
      telephone,
      urlCheckout: resultat.paiement.urlCheckout || undefined,
    },
  };
}
