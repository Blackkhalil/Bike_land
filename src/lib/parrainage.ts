/**
 * Parrainage partenaires.
 *
 * Un partenaire, hôtel, agence, restaurant, guide, reçoit un code qu'il
 * donne à ses clients. Le code répond à une question et une seule : qui
 * nous a envoyé ce client. C'est de là que tout découle.
 *
 * Deux taux, et ils ne jouent pas le même rôle :
 *
 *  - le **client** obtient 1 % de réduction. C'est peu, et c'est voulu :
 *    la réduction est là pour donner au client une raison de citer le
 *    code, pas pour acheter sa réservation.
 *  - le **partenaire** touche 5 % de ce que son client a payé. C'est sa
 *    rémunération, et elle se paie en dehors du site, le tableau de bord
 *    dit combien lui est dû, il ne le verse pas.
 *
 * Les deux taux sont des constantes plutôt que des champs par code :
 * c'est une politique commerciale, la même pour tous les partenaires. Un
 * taux saisissable code par code laisserait s'installer des écarts que
 * personne ne saurait plus justifier six mois plus tard.
 *
 * Ce module ne contient que des fonctions pures : tout ce qui décide
 * qu'un code est utilisable, de combien il réduit et de ce qu'il rapporte
 * au partenaire se lit d'un bloc, et se teste sans base de données.
 *
 * Le code saisi par le client n'est jamais cru sur parole : réduction et
 * commission sont recalculées côté serveur au moment de créer la
 * réservation, dans la même transaction que la vérification du quota.
 */

import { MONTANT_MINIMUM_XOF } from "./paiement";

/** Réduction accordée au client qui présente un code de parrainage. */
export const TAUX_REDUCTION_CLIENT = 0.01;

/** Commission due au partenaire sur ce que son client a payé. */
export const TAUX_COMMISSION_PARTENAIRE = 0.05;

export interface CodeParrainage {
  code: string;
  partenaireId: string;
  partenaireNom: string;
  /** Bornes de validité, facultatives toutes les deux. */
  debuteLe?: string;
  finitLe?: string;
  /** Utilisations autorisées. Absent : sans limite. */
  utilisationsMax?: number;
  utilisations: number;
  actif: boolean;
  creeLe: string;
}

/**
 * Pourquoi un code est refusé.
 *
 * Les motifs sont distingués parce qu'ils ne se disent pas de la même
 * façon au client : « ce code n'existe pas » et « ce code a expiré » ne
 * demandent pas la même réaction de sa part.
 */
export type MotifRefus = "introuvable" | "inactif" | "pas-encore-valide" | "expire" | "epuise";

export type VerificationParrainage =
  | { valide: true; code: CodeParrainage; remiseXof: number }
  | { valide: false; motif: MotifRefus };

/** Le message à montrer au client, par motif. */
export const MESSAGES_REFUS: Record<MotifRefus, string> = {
  introuvable: "Ce code de parrainage n'existe pas. Vérifiez l'orthographe.",
  inactif: "Ce code de parrainage n'est plus actif.",
  "pas-encore-valide": "Ce code de parrainage n'est pas encore valable.",
  expire: "Ce code de parrainage a expiré.",
  epuise: "Ce code de parrainage a atteint son nombre d'utilisations.",
};

/**
 * Normalise un code saisi.
 *
 * Majuscules et espaces retirés : un client qui tape « hotel du lac » en
 * minuscules, ou qui laisse un espace en collant depuis un SMS, doit
 * obtenir la même réduction que celui qui tape juste.
 */
export function normaliserCode(saisie: string): string {
  return saisie.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Réduction accordée au client sur ce montant.
 *
 * Arrondie à l'entier inférieur, en faveur de la maison : le franc CFA
 * n'a pas de subdivision, il faut bien trancher.
 *
 * Plafonnée pour qu'il reste au moins `MONTANT_MINIMUM_XOF` à payer,
 * parce que l'agrégateur refuse les paiements en dessous. À 1 % le cas ne
 * se présente pas, mais le plafond reste : si la politique passait un
 * jour à 100 %, une réservation à zéro franc ne partirait jamais en
 * paiement et resterait bloquée en attente, le client aurait un code,
 * pas de vélo, et rien à payer pour se débloquer.
 */
export function reductionPour(montantXof: number): number {
  if (montantXof <= 0) return 0;
  const brute = Math.floor(montantXof * TAUX_REDUCTION_CLIENT);
  return Math.min(brute, Math.max(montantXof - MONTANT_MINIMUM_XOF, 0));
}

/**
 * Commission due au partenaire sur une réservation.
 *
 * Calculée sur ce que le client a **réellement payé**, réduction déduite.
 * La calculer sur le prix avant réduction ferait payer au partenaire une
 * commission sur un argent qui n'est jamais entré.
 *
 * Arrondie au franc supérieur, en faveur du partenaire : on ne chipote
 * pas sur un franc avec quelqu'un qui nous amène des clients.
 */
export function commissionPour(montantPayeXof: number): number {
  if (montantPayeXof <= 0) return 0;
  return Math.ceil(montantPayeXof * TAUX_COMMISSION_PARTENAIRE);
}

/**
 * Ce code est-il utilisable maintenant, et de combien réduit-il ?
 *
 * L'ordre des contrôles est celui du message le plus utile au client :
 * dire « expiré » à propos d'un code désactivé serait faux, et dire
 * « épuisé » d'un code pas encore ouvert l'enverrait sur une fausse piste.
 */
export function verifierCode(
  code: CodeParrainage | null,
  montantXof: number,
  maintenant = new Date(),
): VerificationParrainage {
  if (!code) return { valide: false, motif: "introuvable" };
  if (!code.actif) return { valide: false, motif: "inactif" };

  if (code.debuteLe && new Date(code.debuteLe) > maintenant) {
    return { valide: false, motif: "pas-encore-valide" };
  }
  if (code.finitLe && new Date(code.finitLe) < maintenant) {
    return { valide: false, motif: "expire" };
  }
  if (code.utilisationsMax !== undefined && code.utilisations >= code.utilisationsMax) {
    return { valide: false, motif: "epuise" };
  }

  return { valide: true, code, remiseXof: reductionPour(montantXof) };
}

/** « 1 % », la réduction annoncée au client, sans avoir à la recopier. */
export function libelleReduction(): string {
  return `−${(TAUX_REDUCTION_CLIENT * 100).toLocaleString("fr-FR")} %`;
}

/** « 5 % », la commission annoncée au partenaire. */
export function libelleCommission(): string {
  return `${(TAUX_COMMISSION_PARTENAIRE * 100).toLocaleString("fr-FR")} %`;
}
