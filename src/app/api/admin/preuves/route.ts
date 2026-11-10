import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { repondre } from "@/lib/offres-groupe/dependances";
import { dependancesPreuves } from "@/lib/offres-groupe/dependances-preuves";
import { deciderPreuveParAdmin } from "@/lib/offres-groupe/preuves";

/**
 * Valider ou refuser une capture de réduction, depuis la page « Preuves de
 * réduction » (décision 21 : sans agent IA, chaque capture est vérifiée à la
 * main). La décision est signée du prénom saisi (journal), sous condition :
 * deux clics ne décident pas deux fois. La capture est effacée aussitôt, et
 * le client reçoit la réponse par email.
 */
export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const corps: unknown = await requete.json().catch(() => null);
  try {
    return repondre(await deciderPreuveParAdmin(corps, dependancesPreuves()));
  } catch (e) {
    console.error("[admin/preuves] décision impossible", e);
    return NextResponse.json({ erreur: "La décision n'a pas pu être enregistrée. Réessayez dans un instant." }, { status: 500 });
  }
}
