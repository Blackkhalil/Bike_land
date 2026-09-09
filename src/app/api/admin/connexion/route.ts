import { NextResponse } from "next/server";

import { NOM_COOKIE, creerJeton, modeAcces, motDePasseCorrect } from "@/lib/admin";

/** Ouverture et fermeture de session de l'espace d'administration. */
export async function POST(requete: Request) {
  if (modeAcces() !== "protege") {
    return NextResponse.json(
      { erreur: "Aucun mot de passe d'administration n'est configuré." },
      { status: 503 },
    );
  }

  const corps = (await requete.json().catch(() => ({}))) as { motDePasse?: string };
  if (typeof corps.motDePasse !== "string" || !motDePasseCorrect(corps.motDePasse)) {
    // Délai fixe : évite de distinguer « mauvais mot de passe » de
    // « traitement rapide » par le temps de réponse.
    await new Promise((resoudre) => setTimeout(resoudre, 400));
    return NextResponse.json({ erreur: "Mot de passe incorrect." }, { status: 401 });
  }

  const reponse = NextResponse.json({ connecte: true });
  reponse.cookies.set(NOM_COOKIE, creerJeton(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return reponse;
}

export async function DELETE() {
  const reponse = NextResponse.json({ connecte: false });
  reponse.cookies.delete(NOM_COOKIE);
  return reponse;
}
