/**
 * La demande qui attend son paiement, gardée dans l'onglet du client.
 *
 * Depuis la décision 27, aucun email ne part avant le paiement : le lien de
 * suivi d'une demande n'existe que dans le navigateur. Sur un téléphone, le
 * client part valider dans l'application Mobile Money, et le navigateur peut
 * fermer l'onglet entre-temps. Sans trace, il revenait sur un formulaire vide
 * et se voyait refuser une seconde demande pendant 30 minutes.
 *
 * La référence, le jeton et la fin du délai sont donc gardés dans le
 * `sessionStorage` de l'onglet : rien ne part ailleurs, et tout disparaît
 * avec l'onglet. Les pages de réservation proposent alors « Reprendre ma
 * demande », qui ouvre la page de suivi, où le paiement se relance. Chaque
 * accès est protégé : un navigateur qui refuse le stockage (navigation
 * privée, réglages) n'empêche jamais de réserver.
 */

export const CLE_DEMANDE_EN_ATTENTE = "bikeland.demande-en-attente";
/** Prévient les composants de l'onglet que la demande gardée a changé. */
export const EVENEMENT_DEMANDE_EN_ATTENTE = "bikeland:demande-en-attente";

export interface DemandeEnAttente {
  reference: string;
  /** Le jeton du lien de suivi, qui ouvre la demande. */
  token: string;
  /** La fin du délai de paiement, en millisecondes. */
  expireLe: number;
}

const FORME_REFERENCE = /^BL-[A-Z0-9]{6}$/;
const FORME_JETON = /^BL-[A-Z0-9]{6}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function stockage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function prevenir() {
  try {
    window.dispatchEvent(new Event(EVENEMENT_DEMANDE_EN_ATTENTE));
  } catch {
    // Rien à prévenir hors d'un navigateur.
  }
}

/** La demande lue d'un texte gardé, ou `null` si elle est illisible. */
export function lireDemande(brut: string | null): DemandeEnAttente | null {
  if (!brut) return null;
  try {
    const valeur = JSON.parse(brut) as Partial<DemandeEnAttente>;
    if (
      typeof valeur.reference !== "string" ||
      !FORME_REFERENCE.test(valeur.reference) ||
      typeof valeur.token !== "string" ||
      !FORME_JETON.test(valeur.token) ||
      !valeur.token.startsWith(`${valeur.reference}.`) ||
      typeof valeur.expireLe !== "number" ||
      !Number.isFinite(valeur.expireLe)
    ) {
      return null;
    }
    return { reference: valeur.reference, token: valeur.token, expireLe: valeur.expireLe };
  } catch {
    return null;
  }
}

/** Garde la demande qui attend son paiement, à la place de la précédente. */
export function retenirDemande(demande: DemandeEnAttente): void {
  if (!lireDemande(JSON.stringify(demande))) return;
  try {
    stockage()?.setItem(CLE_DEMANDE_EN_ATTENTE, JSON.stringify(demande));
  } catch {
    // Stockage refusé ou plein : le client garde l'écran d'attente.
  }
  prevenir();
}

/** Oublie la demande gardée : payée, annulée ou expirée. Avec une référence, seulement celle-là. */
export function oublierDemande(reference?: string): void {
  try {
    const gardee = lireDemande(stockage()?.getItem(CLE_DEMANDE_EN_ATTENTE) ?? null);
    if (reference && gardee && gardee.reference !== reference) return;
    stockage()?.removeItem(CLE_DEMANDE_EN_ATTENTE);
  } catch {
    return;
  }
  prevenir();
}

/**
 * Le texte gardé de la demande encore dans son délai, tel quel (une valeur
 * stable, que React peut comparer d'un rendu à l'autre), ou `null`.
 */
export function texteDemandeEnAttente(maintenant = Date.now()): string | null {
  try {
    const brut = stockage()?.getItem(CLE_DEMANDE_EN_ATTENTE) ?? null;
    const demande = lireDemande(brut);
    return demande && demande.expireLe > maintenant ? brut : null;
  } catch {
    return null;
  }
}
