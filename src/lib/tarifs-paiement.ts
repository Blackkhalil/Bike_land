/**
 * Les moyens de paiement proposés et les tarifs de SasPay.
 *
 * À part de src/lib/paiement.ts, qui parle à SasPay depuis le serveur :
 * les formulaires de paiement en ont besoin dans le navigateur, et
 * importer le module du serveur y chargeait aussi le chiffrement de Node,
 * plus de cent kilooctets inutiles sur un téléphone en données mobiles.
 * Rien ici ne dépend du serveur.
 */

import type { MoyenPaiement } from "./types";

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
