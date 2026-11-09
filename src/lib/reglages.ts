/**
 * Les réglages des produits, côté serveur : lus dans la base (table
 * ParametreAdmin), sur les valeurs par défaut de src/data/reglages.ts, et
 * enregistrés depuis l'administration.
 *
 * Les pages publiques les lisent à chaque régénération ; l'administration,
 * après chaque enregistrement, demande au site public de se régénérer
 * (rafraichirSitePublic), pour que le nouveau réglage s'y voie tout de suite.
 */

import { CLES_REGLAGES, lireReglagesAvec, type ReglagesProduits } from "@/data/reglages";
import { depot } from "@/lib/db";

/** Les réglages de tous les produits. */
export function lireReglages(): Promise<ReglagesProduits> {
  return lireReglagesAvec((cle) => depot.lireParametreAdmin(cle));
}

/** Enregistre les réglages d'un produit, déjà validés par son schéma. */
export async function enregistrerReglages<P extends keyof ReglagesProduits>(
  produit: P,
  valeur: ReglagesProduits[P],
): Promise<void> {
  await depot.ecrireParametreAdmin(CLES_REGLAGES[produit], JSON.stringify(valeur));
}
