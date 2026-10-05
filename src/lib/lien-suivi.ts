/**
 * Le lien de suivi d'une réservation, reconstitué côté serveur.
 *
 * Le jeton se déduit de la référence et du secret de signature (voir
 * `genererToken`). On vérifie qu'il ouvre bien la réservation : celles
 * créées avant ce calcul portent un jeton tiré au hasard, impossible à
 * reconstituer, et reçoivent alors la page générique de suivi.
 */

import { depot } from "@/lib/db";
import { site } from "@/lib/site";
import { genererToken } from "@/lib/tokens";

export async function lienDeSuivi(reference: string): Promise<string> {
  const jeton = genererToken(reference);
  return (await depot.trouverReservationParToken(jeton))
    ? `${site.url}/reservation/${jeton}`
    : `${site.url}/reservation/suivi`;
}
