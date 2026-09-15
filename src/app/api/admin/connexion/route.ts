import { NextResponse } from "next/server";

import { NOM_COOKIE, creerJeton, modeAcces, motDePasseCorrect } from "@/lib/admin";
import {
  delaiAvantNouvelEssai,
  enregistrerEchec,
  identifiantAppelant,
  reinitialiser,
} from "@/lib/anti-force-brute";

/** Ouverture et fermeture de session de l'espace d'exploitation. */
export async function POST(requete: Request) {
  if (modeAcces() !== "protege") {
    return NextResponse.json(
      { erreur: "Aucun mot de passe d'administration n'est configuré." },
      { status: 503 },
    );
  }

  // Un mot de passe unique et partagé se casse par essais successifs : on
  // borne donc le nombre d'essais avant même de regarder ce qui est saisi.
  const appelant = identifiantAppelant(requete);
  const attente = delaiAvantNouvelEssai(appelant);
  if (attente !== null) {
    return NextResponse.json(
      {
        erreur: `Trop de tentatives. Réessayez dans ${Math.ceil(attente / 60)} minute${
          attente > 60 ? "s" : ""
        }.`,
      },
      { status: 429, headers: { "Retry-After": String(attente) } },
    );
  }

  const corps = (await requete.json().catch(() => ({}))) as { motDePasse?: string };
  if (typeof corps.motDePasse !== "string" || !motDePasseCorrect(corps.motDePasse)) {
    enregistrerEchec(appelant);
    // Délai fixe : évite de distinguer « mauvais mot de passe » de
    // « traitement rapide » par le temps de réponse.
    await new Promise((resoudre) => setTimeout(resoudre, 400));
    return NextResponse.json({ erreur: "Mot de passe incorrect." }, { status: 401 });
  }

  reinitialiser(appelant);
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
