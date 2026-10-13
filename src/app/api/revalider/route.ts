import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Vide le cache des pages publiques, à la demande de l'administration.
 *
 * Appelée par le projet d'administration après un changement qui se voit
 * sur le site (vélo ajouté, jour fermé, avis publié…), avec le secret
 * REVALIDATION_SECRET que les deux projets partagent. Sans ce secret,
 * l'adresse ne fait rien : un inconnu ne peut pas vider le cache à
 * répétition pour ralentir le site.
 */
export async function POST(requete: Request) {
  const secret = process.env.REVALIDATION_SECRET;
  const recu = Buffer.from(requete.headers.get("authorization") ?? "");
  const attendu = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ revalide: true });
}
