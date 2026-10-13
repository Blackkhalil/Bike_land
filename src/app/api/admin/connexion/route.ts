import { NextResponse } from "next/server";

import { NOM_COOKIE, creerJeton, identifiantsCorrects, modeAcces } from "@/lib/admin";
import { identifiantAppelant } from "@/lib/anti-force-brute";
import { depot } from "@/lib/db";
import { roleDuDeploiement } from "@/lib/deploiement";
import { etatDoubleAuthentification, verifierCode } from "@/lib/securite-admin";

/** Huit essais de connexion par appelant sur un quart d'heure. */
const MAX_ESSAIS = 8;
const FENETRE_SECONDES = 15 * 60;

/** Ouverture et fermeture de session de l'espace d'exploitation. */
export async function POST(requete: Request) {
  // Le site public n'ouvre jamais de session d'administration.
  if (roleDuDeploiement() === "site") {
    return NextResponse.json({ erreur: "Introuvable." }, { status: 404 });
  }
  if (modeAcces() !== "protege") {
    return NextResponse.json(
      { erreur: "Aucun mot de passe d'administration n'est configuré." },
      { status: 503 },
    );
  }

  // Un mot de passe unique et partagé se casse par essais successifs : on
  // borne donc le nombre d'essais, et chaque essai est compté AVANT d'être
  // examiné, en base, pour tous les serveurs à la fois. Compté en mémoire
  // après coup, chaque nouvelle instance de Vercel repartait de zéro et
  // des essais simultanés passaient tous.
  const compteur = `connexion:${identifiantAppelant(requete)}`;
  let essais: number;
  try {
    essais = await depot.compterEssai(compteur, FENETRE_SECONDES);
  } catch (erreur) {
    console.error("[connexion] compteur d'essais injoignable", erreur);
    return NextResponse.json(
      { erreur: "Vérification impossible pour le moment. Réessayez dans un instant." },
      { status: 503 },
    );
  }
  if (essais > MAX_ESSAIS) {
    return NextResponse.json(
      { erreur: "Trop de tentatives. Réessayez dans un quart d'heure." },
      { status: 429, headers: { "Retry-After": String(FENETRE_SECONDES) } },
    );
  }

  const corps = (await requete.json().catch(() => ({}))) as {
    email?: string;
    motDePasse?: string;
    code?: string;
  };

  const deuxFacteurs = await etatDoubleAuthentification();
  if (deuxFacteurs.etat === "indeterminee") {
    return NextResponse.json(
      { erreur: "Vérification impossible pour le moment. Réessayez dans un instant." },
      { status: 503 },
    );
  }

  const identifiantsBons =
    typeof corps.email === "string" &&
    typeof corps.motDePasse === "string" &&
    identifiantsCorrects(corps.email, corps.motDePasse);

  // Le code n'est vérifié, et un échec compté contre lui, qu'avec le bon
  // mot de passe : sinon n'importe qui épuiserait les essais de code et
  // bloquerait l'exploitant sans rien connaître.
  let verdictCode: "accepte" | "refuse" | "bloque" = "accepte";
  if (identifiantsBons && deuxFacteurs.etat === "active") {
    verdictCode = typeof corps.code === "string"
      ? await verifierCode(deuxFacteurs.secret, corps.code)
      : "refuse";
  }
  if (verdictCode === "bloque") {
    return NextResponse.json(
      { erreur: "Trop de codes incorrects. Réessayez dans un quart d'heure." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  // Un seul message d'erreur, quel que soit le champ fautif : préciser
  // « adresse inconnue » ou « code faux » indiquerait ce qui est juste.
  if (!identifiantsBons || verdictCode !== "accepte") {
    // L'essai est déjà compté, avant l'examen. Délai fixe : évite de
    // distinguer « mauvais mot de passe » de « traitement rapide » par le
    // temps de réponse.
    await new Promise((resoudre) => setTimeout(resoudre, 400));
    return NextResponse.json(
      {
        erreur:
          deuxFacteurs.etat === "active"
            ? "Adresse, mot de passe ou code incorrect."
            : "Adresse ou mot de passe incorrect.",
      },
      { status: 401 },
    );
  }

  await depot.effacerCompteur(compteur);
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
