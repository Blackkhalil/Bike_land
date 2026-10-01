import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";

/**
 * Y a-t-il une session d'exploitation ouverte ?
 *
 * Existe pour une seule raison : sortir la lecture du cookie hors du
 * rendu des pages publiques. Tant que la mise en page appelait
 * `sessionAdminValide()` côté serveur, Next devait rendre **chaque**
 * page à chaque visite, y compris « À propos », qui ne consulte
 * pourtant aucune donnée. Le site entier devenait incachable pour un
 * bandeau destiné à une seule personne.
 *
 * La réponse ne dit rien d'autre que « oui » ou « non » : ni identité,
 * ni jeton, ni durée de session. Un visiteur non connecté y lit
 * exactement ce qu'il sait déjà.
 */
export async function GET() {
  return NextResponse.json({ ouverte: await sessionAdminValide() });
}
