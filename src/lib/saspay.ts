/**
 * Dialogue serveur avec SasPay.
 *
 * SasPay fonctionne autrement que KkiaPay, et c'est une simplification :
 * au lieu d'ouvrir une fenêtre dans le navigateur du client, **notre
 * serveur** demande à SasPay de pousser une notification sur le téléphone
 * du client (« softpay »). Le client valide sur son téléphone, sans
 * jamais quitter notre page. Aucune coordonnée de paiement ne transite
 * par nous : nous n'envoyons qu'un numéro et un montant.
 *
 * Conséquence sur l'architecture : le navigateur n'a plus rien à nous
 * apprendre. Il ne fait que demander « où en est-on ? », et c'est
 * toujours SasPay qui répond, par `verifierPaiement` ou par webhook.
 *
 * Adresses et contrats repris de https://docs.saspay.me :
 *  - `POST /payments/softpay/`        pousse la demande sur le téléphone
 *  - `GET  /payments/{id}/verify/`    état réel, revérifié chez l'opérateur
 *  - webhook signé HMAC-SHA256 sur `horodatage.corps_brut`
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { estReferenceDeTest } from "./tokens";
import type { MoyenPaiement } from "./types";

const API_BASE = "https://api.saspay.me/api/v1";

/** Tolérance sur l'horodatage d'un webhook, imposée par SasPay. */
const TOLERANCE_WEBHOOK_SECONDES = 300;

/**
 * Codes réseau de SasPay pour le Bénin.
 *
 * Aucun des trois ne demande de code de confirmation : la validation se
 * fait entièrement sur le téléphone du client. Seul Coris Bénin exige un
 * OTP, et nous ne le proposons pas.
 *
 * Les trois réseaux sont facturés au même taux par SasPay, 3,25 % à
 * l'encaissement, donc le choix de l'opérateur ne change rien au prix.
 */
const RESEAUX: Record<Exclude<MoyenPaiement, "ESPECES">, string> = {
  MTN_MONEY: "mtn_bj",
  MOOV_MONEY: "moov_bj",
  CELTIIS_CASH: "celtiis_bj",
};

export interface ConfigurationSasPay {
  cleApi: string;
  /** Déduit du préfixe de la clé : SasPay choisit le mode, pas nous. */
  sandbox: boolean;
}

/**
 * Configuration, ou `null` si la clé manque.
 *
 * Le mode bac à sable n'est pas une variable à régler : SasPay le déduit
 * du préfixe de la clé (`sk_test_` ou `sk_live_`). Une variable séparée
 * aurait permis de croire qu'on teste alors qu'on manipule de l'argent
 * réel, ou l'inverse.
 */
export function configurationSasPay(): ConfigurationSasPay | null {
  const cleApi = process.env.SASPAY_API_KEY?.trim();
  if (!cleApi) return null;

  return { cleApi, sandbox: !cleApi.startsWith("sk_live_") };
}

/** Le code réseau SasPay correspondant au moyen choisi par le client. */
export function reseauPour(moyen: MoyenPaiement): string | null {
  return moyen === "ESPECES" ? null : RESEAUX[moyen];
}

/** Un paiement SasPay, ramené à ce qui nous sert. */
export interface PaiementSasPay {
  /** Identifiant SasPay du paiement, notre seule prise sur la transaction. */
  id: string;
  /** PENDING, SUCCESS, FAILED ou CANCELLED. */
  statut: string;
  /** Montant demandé, celui que nous avons annoncé au client. */
  montantDemandeXof: number;
  /** Ce qui a réellement été débité du compte du client. */
  montantDebiteXof: number;
  /** Ce qui nous revient, frais de SasPay déduits. */
  montantNetXof: number;
  /**
   * Page de paiement hébergée, quand le réseau en exige une.
   *
   * Vide pour MTN et Moov Bénin, la validation se fait sur le téléphone.
   * Non vide, il faut y envoyer le client : c'est le cas de la carte, que
   * nous ne proposons pas, mais autant ne pas l'ignorer silencieusement.
   */
  urlCheckout: string;
  /**
   * La référence de réservation attachée au paiement quand nous l'avons
   * poussé (`metadata.reference`, à défaut la description), telle que
   * SasPay la renvoie. Elle lie le paiement à SA réservation : un paiement
   * ne doit jamais en confirmer une autre.
   */
  reference?: string;
}

export type ResultatSasPay =
  | { issue: "ok"; paiement: PaiementSasPay }
  /** SasPay a refusé la demande : montant, numéro ou réseau invalide. */
  | { issue: "refusee"; detail: string }
  /** SasPay ne connaît pas ce paiement : identifiant inventé ou erroné. */
  | { issue: "introuvable" }
  /** Panne réseau ou API muette : l'état reste inconnu, il faut réessayer. */
  | { issue: "indisponible"; detail: string };

/**
 * Pousse une demande de paiement sur le téléphone du client.
 *
 * `fee_charge_mode` : on demande « DEDUCTED », mais **SasPay l'ignore**.
 * Vérifié le 28 septembre 2026 sur deux transactions réelles : la règle
 * tarifaire du compte impose « ADD_ON », et la réponse le confirme,
 * demandé 1 125 F, débité 1 162 F, net 1 125 F.
 *
 * On l'envoie quand même : le jour où le compte passera en « DEDUCTED »
 * chez SasPay, le comportement voulu s'appliquera sans rien changer ici.
 * En attendant, c'est l'affichage qui dit la vérité au client, le
 * tunnel annonce le montant réellement débité, frais compris.
 *
 * `Idempotency-Key` protège contre le double débit : si le réseau coupe
 * et que nous réessayons, SasPay reconnaît la demande au lieu de débiter
 * le client deux fois. Elle est distincte de `reference`, une relance
 * volontaire depuis le lien de suivi doit pousser une **nouvelle**
 * demande, tout en désignant la même réservation.
 */
export async function pousserPaiement(demande: {
  montantXof: number;
  /** Référence de la réservation : c'est elle que le webhook nous renverra. */
  reference: string;
  /** Clé d'idempotence de cette tentative. À défaut, la référence. */
  cleIdempotence?: string;
  moyen: MoyenPaiement;
  client: { prenom: string; nom: string; email: string; telephone: string };
}): Promise<ResultatSasPay> {
  const configuration = configurationSasPay();
  if (!configuration) return { issue: "indisponible", detail: "SASPAY_API_KEY absente." };

  const reseau = reseauPour(demande.moyen);
  if (!reseau) {
    return { issue: "refusee", detail: `Moyen non encaissable en ligne : ${demande.moyen}.` };
  }

  try {
    const reponse = await fetch(`${API_BASE}/payments/softpay/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.cleApi}`,
        "Idempotency-Key": demande.cleIdempotence ?? demande.reference,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // SasPay attend une chaîne décimale. Le franc CFA n'a pas de
        // subdivision utilisée, d'où les deux zéros systématiques.
        amount: `${demande.montantXof}.00`,
        currency: "XOF",
        country: "BJ",
        network: reseau,
        // Un essai (référence « BL-T… », hors production, décision 17) se
        // lit comme tel dans le tableau de bord SasPay ; la référence reste
        // en place, `referenceDepuisCharge` la retrouve de même.
        description: `Bike Land, ${estReferenceDeTest(demande.reference) ? "essai" : "réservation"} ${demande.reference}`,
        // Ignoré par SasPay tant que le compte est en ADD_ON (cf. ci-dessus).
        fee_charge_mode: "DEDUCTED",
        // Notre référence voyage avec le paiement : c'est elle que le
        // webhook nous renverra pour savoir quelle réservation confirmer.
        metadata: { reference: demande.reference },
        customer: {
          email: demande.client.email,
          first_name: demande.client.prenom,
          last_name: demande.client.nom,
          phone: demande.client.telephone,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;

    if (!reponse.ok) {
      return { issue: "refusee", detail: messageErreur(corps, reponse.status) };
    }

    const paiement = versPaiement(corps);
    if (!paiement) {
      return { issue: "indisponible", detail: "Réponse SasPay illisible." };
    }
    return { issue: "ok", paiement };
  } catch (erreur) {
    return {
      issue: "indisponible",
      detail: erreur instanceof Error ? erreur.message : "Appel SasPay impossible.",
    };
  }
}

/**
 * Demande à SasPay l'état réel d'un paiement.
 *
 * SasPay reinterroge l'opérateur avant de répondre : un `PENDING` ici
 * veut dire que le client n'a pas encore validé, pas qu'une réponse
 * traîne dans un cache.
 */
export async function verifierPaiement(paiementId: string): Promise<ResultatSasPay> {
  const configuration = configurationSasPay();
  if (!configuration) return { issue: "indisponible", detail: "SASPAY_API_KEY absente." };

  try {
    const reponse = await fetch(
      `${API_BASE}/payments/${encodeURIComponent(paiementId)}/verify/`,
      {
        headers: { Authorization: `Bearer ${configuration.cleApi}` },
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (reponse.status === 404) return { issue: "introuvable" };

    const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
    if (!reponse.ok) {
      return { issue: "indisponible", detail: messageErreur(corps, reponse.status) };
    }

    const paiement = versPaiement(corps);
    if (!paiement) return { issue: "indisponible", detail: "Réponse SasPay illisible." };
    return { issue: "ok", paiement };
  } catch (erreur) {
    return {
      issue: "indisponible",
      detail: erreur instanceof Error ? erreur.message : "Appel SasPay impossible.",
    };
  }
}

/**
 * Ce paiement autorise-t-il à confirmer cette réservation ?
 *
 * Fonction pure, sans appel réseau : elle est le seul endroit qui décide,
 * et elle est donc lisible d'un bloc.
 *
 * Le montant est comparé avec un « au moins ». En `DEDUCTED`, le débité
 * égale le demandé, mais un client qui paie plus que dû ne doit pas voir
 * sa réservation refusée, il faut le rembourser, pas le bloquer.
 */
export function controlerPaiement(
  paiement: PaiementSasPay,
  attendu: { montantXof: number },
): { valide: true } | { valide: false; raison: string } {
  if (paiement.statut !== "SUCCESS") {
    return { valide: false, raison: `Paiement non abouti (${paiement.statut}).` };
  }
  if (paiement.montantDebiteXof < attendu.montantXof) {
    return {
      valide: false,
      raison: `Montant insuffisant : ${paiement.montantDebiteXof} F reçus pour ${attendu.montantXof} F attendus.`,
    };
  }
  return { valide: true };
}

/**
 * Vérifie la signature d'un webhook SasPay.
 *
 * Trois contrôles, et les trois comptent :
 *
 *  1. L'horodatage doit être récent. Sans cela, une notification
 *     interceptée aujourd'hui serait rejouable dans six mois.
 *  2. La signature est recalculée sur le **corps brut reçu**, jamais sur
 *     une re-sérialisation : `JSON.stringify(JSON.parse(x))` ne rend pas
 *     toujours `x`, et la moindre différence d'espace invaliderait tout.
 *  3. La comparaison est à temps constant : un `===` laisserait mesurer,
 *     octet par octet, à quel endroit la signature diverge.
 */
export function signatureWebhookValide(parametres: {
  corpsBrut: string;
  signature: string | null;
  horodatage: string | null;
  maintenant?: number;
}): { valide: true } | { valide: false; raison: string } {
  const secret = process.env.SASPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return { valide: false, raison: "SASPAY_WEBHOOK_SECRET absent." };

  const { corpsBrut, signature, horodatage } = parametres;
  if (!signature || !horodatage) {
    return { valide: false, raison: "En-têtes de signature manquants." };
  }

  const secondes = Number(horodatage);
  if (!Number.isFinite(secondes)) {
    return { valide: false, raison: "Horodatage illisible." };
  }

  const maintenant = Math.floor((parametres.maintenant ?? Date.now()) / 1000);
  if (Math.abs(maintenant - secondes) > TOLERANCE_WEBHOOK_SECONDES) {
    return { valide: false, raison: "Horodatage hors tolérance." };
  }

  const attendue = createHmac("sha256", secret)
    .update(`${horodatage}.${corpsBrut}`)
    .digest("hex");

  if (!comparaisonConstante(signature, attendue)) {
    return { valide: false, raison: "Signature invalide." };
  }
  return { valide: true };
}

/**
 * Notre référence de réservation, telle que le webhook la porte.
 *
 * On la cherche dans `metadata`, où nous l'avons mise, puis à la racine :
 * la charge d'un webhook n'a pas exactement la même forme que celle de
 * `verify`, et se tromper de champ ferait échouer la confirmation
 * automatique sans que personne ne s'en aperçoive.
 *
 * Puis dans la description, que nous posons à « Bike Land, réservation
 * BL-XXXXXX » en poussant le paiement. Relevé le 13 octobre 2026 sur deux
 * paiements réels : `verify` renvoie `metadata.reference` et cette
 * description. La description n'est qu'un second filet, si `metadata`
 * venait à manquer.
 */
export function referenceDepuisCharge(donnees: unknown): string | null {
  if (!donnees || typeof donnees !== "object") return null;
  const objet = donnees as Record<string, unknown>;

  const metadonnees = objet.metadata;
  if (metadonnees && typeof metadonnees === "object") {
    const reference = (metadonnees as Record<string, unknown>).reference;
    if (typeof reference === "string" && reference.trim()) return reference.trim();
  }

  const directe = objet.reference;
  if (typeof directe === "string" && directe.trim().toUpperCase().startsWith("BL-")) {
    return directe.trim();
  }

  // Alphabet des références : lettres et chiffres sans I, O, 0 ni 1.
  const description = objet.description;
  if (typeof description === "string") {
    const trouvee = description.match(/\bBL-[A-HJ-NP-Z2-9]{6}\b/);
    if (trouvee) return trouvee[0];
  }
  return null;
}

/* ------------------------------------------------------------- Utilitaires */

/** Traduit la réponse de SasPay, quelle que soit la profondeur de l'enveloppe. */
function versPaiement(corps: Record<string, unknown> | null): PaiementSasPay | null {
  if (!corps) return null;

  // SasPay répond tantôt à plat, tantôt sous `data` selon l'endpoint.
  const donnees =
    corps.data && typeof corps.data === "object"
      ? (corps.data as Record<string, unknown>)
      : corps;

  const id = donnees.id;
  const statut = donnees.status;
  if (typeof id !== "string" || typeof statut !== "string") return null;

  const demande = nombre(donnees.requested_amount ?? donnees.amount);
  const debite = nombre(donnees.debited_amount ?? donnees.charged ?? donnees.amount);
  const net = nombre(donnees.net_amount ?? donnees.amount);

  return {
    id,
    statut: statut.toUpperCase(),
    montantDemandeXof: demande,
    montantDebiteXof: debite,
    montantNetXof: net,
    urlCheckout: typeof donnees.checkout_url === "string" ? donnees.checkout_url : "",
    reference: referenceDepuisCharge(donnees) ?? undefined,
  };
}

/** « 2500.00 » comme 2500 donnent 2500 ; tout le reste donne 0. */
function nombre(valeur: unknown): number {
  if (typeof valeur === "number" && Number.isFinite(valeur)) return Math.round(valeur);
  if (typeof valeur === "string") {
    const analyse = Number.parseFloat(valeur);
    if (Number.isFinite(analyse)) return Math.round(analyse);
  }
  return 0;
}

/**
 * Le message d'erreur de SasPay, sans jamais exposer sa réponse brute.
 *
 * Elle finirait sinon sous les yeux du client, et pourrait contenir des
 * détails d'infrastructure qui ne le concernent pas.
 */
function messageErreur(corps: Record<string, unknown> | null, statut: number): string {
  const erreur = corps?.error;
  if (erreur && typeof erreur === "object") {
    const message = (erreur as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof corps?.message === "string" && corps.message.trim()) return corps.message.trim();
  return `SasPay a répondu ${statut}.`;
}

function comparaisonConstante(a: string, b: string): boolean {
  const tamponA = Buffer.from(a);
  const tamponB = Buffer.from(b);
  if (tamponA.length !== tamponB.length) return false;
  return timingSafeEqual(tamponA, tamponB);
}
