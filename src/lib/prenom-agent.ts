/**
 * Le prénom de l'agent qui encaisse une vente au comptoir, ou qui la modifie.
 *
 * Trois ventes réelles portaient un montant dans ce champ (« 3500 »,
 * « 1500 », « 1500 ») : son ancien libellé, « Argent reçu par », se lisait
 * « argent reçu ». Le champ dit maintenant ce qu'il attend, et un nombre
 * seul est refusé, dans le navigateur comme sur le serveur. Là où la valeur
 * s'affiche (ventes du jour, journal, réservations), elle se lit « Encaissé
 * par ». Une ancienne vente qui porte « 3500 » s'affiche toujours ; elle se
 * corrige en modifiant la vente.
 */

/** Le libellé du champ, partout où il se saisit. */
export const LIBELLE_AGENT = "Agent qui a encaissé (votre prénom)";

/** Ce que lit l'agent qui a tapé un montant, ou rien qui ressemble à un prénom. */
export const MESSAGE_PRENOM_ATTENDU = "Écrivez votre prénom, pas un montant.";

/** Deux lettres au moins : « 3500 » n'est pas un prénom. */
export function ressembleAUnPrenom(valeur: string): boolean {
  return (valeur.match(/\p{L}/gu) ?? []).length >= 2;
}
