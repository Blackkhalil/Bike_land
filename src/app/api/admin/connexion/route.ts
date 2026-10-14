import { NextResponse } from "next/server";

import { NOM_COOKIE, creerJeton, identifiantsCorrects, modeAcces } from "@/lib/admin";
import { identifiantAppelant } from "@/lib/anti-force-brute";
import { depot } from "@/lib/db";
import { roleDuDeploiement } from "@/lib/deploiement";
import { etatDoubleAuthentification, verifierCode } from "@/lib/securite-admin";

/** Huit essais de connexion par appelant sur un quart d'heure. */
const MAX_ESSAIS = 8;
const FENETRE_SECONDES = 15 * 60;

/**
 * Durée de toute réponse d'échec, mesurée depuis l'arrivée de la requête.
 * Un délai fixe ajouté après coup laissait voir, au temps de réponse, le
 * travail fait avant lui : la vérification du code n'a lieu qu'avec le bon
 * mot de passe.
 */
const DUREE_ECHEC_MS = 1000;

/**
 * Vrai pour une requête partie d'une page d'un autre site.
 *
 * Le navigateur de l'exploitant envoie la requête depuis son adresse : une
 * page piégée pouvait donc faire compter des essais à son nom, et
 * l'enfermer dehors un quart d'heure. Le formulaire de connexion appelle
 * depuis la même origine. L'hôte d'Origin est comparé à celui de la
 * requête, comme Next le fait pour ses actions serveur, et non à une
 * adresse configurée : une préversion ou un alias du projet doivent
 * pouvoir se connecter. Un client sans ces en-têtes (curl) passe, et reste
 * compté.
 */
function requeteEtrangere(requete: Request): boolean {
  const provenance = requete.headers.get("sec-fetch-site");
  if (provenance === "cross-site" || provenance === "same-site") return true;
  const origine = requete.headers.get("origin");
  if (!origine) return false;
  const hote = requete.headers.get("x-forwarded-host") ?? requete.headers.get("host");
  try {
    return new URL(origine).host !== hote;
  } catch {
    return true;
  }
}

/** Ouverture et fermeture de session de l'espace d'exploitation. */
export async function POST(requete: Request) {
  const debut = Date.now();
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
  // Refusée avant d'être comptée : une page tierce ne doit pas pouvoir
  // épuiser les essais de l'exploitant.
  if (requeteEtrangere(requete)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
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
  // Trop de codes faux avec le bon mot de passe : la réponse reste celle
  // d'un échec ordinaire. Un 429 propre à ce cas, qui ne survient qu'avec
  // les bons identifiants, aurait confirmé à un tiers qu'ils sont justes.
  // Le journal, lui, le dit : c'est le signe que le mot de passe est connu.
  if (verdictCode === "bloque") {
    console.warn(
      "[connexion] codes faux à répétition avec le bon mot de passe : le mot de passe est probablement connu d'un tiers.",
    );
  }

  // Un seul message d'erreur, quel que soit le champ fautif : préciser
  // « adresse inconnue » ou « code faux » indiquerait ce qui est juste.
  if (!identifiantsBons || verdictCode !== "accepte") {
    // L'essai est déjà compté, avant l'examen. Toute réponse d'échec prend
    // la même durée totale : le temps de réponse ne distingue plus un
    // mauvais mot de passe d'un bon mot de passe avec un mauvais code.
    await new Promise((resoudre) => setTimeout(resoudre, Math.max(0, DUREE_ECHEC_MS - (Date.now() - debut))));
    return NextResponse.json(
      {
        erreur:
          deuxFacteurs.etat === "active"
            ? "Adresse, mot de passe ou code incorrect. Après plusieurs erreurs, l'accès est suspendu un quart d'heure."
            : "Adresse ou mot de passe incorrect. Après plusieurs erreurs, l'accès est suspendu un quart d'heure.",
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
