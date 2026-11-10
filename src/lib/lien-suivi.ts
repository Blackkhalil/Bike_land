/**
 * Le lien de suivi d'une réservation, reconstitué côté serveur.
 *
 * Le jeton se déduit de la référence et du secret de signature (voir
 * `genererToken`). On vérifie qu'il ouvre bien la réservation : celles
 * créées avant ce calcul portent un jeton tiré au hasard, impossible à
 * reconstituer, et reçoivent alors la page générique de suivi.
 */

import { depot } from "@/lib/db";
import { urlDuSite } from "@/lib/site";
import { genererToken } from "@/lib/tokens";

export async function lienDeSuivi(reference: string): Promise<string> {
  const jeton = genererToken(reference);
  // Sur un aperçu, la branche : c'est elle qui a la réservation (base de test).
  return (await depot.trouverReservationParToken(jeton))
    ? `${urlDuSite()}/reservation/${jeton}`
    : `${urlDuSite()}/reservation/suivi`;
}
