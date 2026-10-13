import { NextResponse, type NextRequest } from "next/server";

/**
 * Sépare le site public et l'administration, selon le rôle du déploiement
 * (`BIKELAND_ROLE`, voir src/lib/deploiement.ts).
 *
 *  - Sur le site public, /admin et /api/admin n'existent pas : « page
 *    introuvable », comme pour n'importe quelle adresse inventée. Rien
 *    n'indique qu'une administration existe.
 *  - Sur l'administration, la racine mène à /admin, et toute page
 *    publique renvoie vers le site public. Les tâches planifiées et le
 *    webhook de paiement n'y tournent pas : c'est le site qui les tient.
 *
 * Sans rôle défini, rien n'est filtré : le déploiement sert tout, comme
 * avant la séparation.
 *
 * Le chemin est comparé décodé et en minuscules : « /%61dmin » ou
 * « /ADMIN » ne doivent pas passer là où « /admin » est refusé. Et le
 * proxy voit toutes les adresses, fichiers compris, pour qu'une route
 * dynamique d'admin appelée avec une extension (« /api/admin/velos/x.png »)
 * ne lui échappe pas. Les pages d'admin refusent en plus d'elles-mêmes le
 * rôle « site » (src/lib/admin.ts).
 */
function cheminNormalise(pathname: string): string {
  let chemin = pathname;
  try {
    chemin = decodeURIComponent(pathname);
  } catch {
    // Encodage invalide : on garde le chemin tel quel, il sera refusé plus loin.
  }
  return chemin.toLowerCase().replace(/\/{2,}/g, "/");
}

export function proxy(requete: NextRequest) {
  const role = process.env.BIKELAND_ROLE?.trim().toLowerCase();
  const { pathname } = requete.nextUrl;
  const chemin = cheminNormalise(pathname);
  const cheminAdmin =
    chemin === "/admin" || chemin.startsWith("/admin/") || chemin === "/api/admin" || chemin.startsWith("/api/admin/");

  if (role === "site" && cheminAdmin) {
    return NextResponse.rewrite(new URL("/page-introuvable", requete.url), { status: 404 });
  }

  if (role === "admin" && !cheminAdmin) {
    // Les fichiers du site (images, polices, robots.txt…) restent servis :
    // les pages d'admin en ont besoin.
    if (/\.[a-z0-9]+$/.test(chemin) && !chemin.startsWith("/api/")) return NextResponse.next();
    if (chemin === "/") return NextResponse.redirect(new URL("/admin", requete.url));
    if (chemin.startsWith("/api/")) {
      return NextResponse.json({ erreur: "Introuvable." }, { status: 404 });
    }
    // Le chemin est posé sur l'adresse du site, jamais résolu contre elle :
    // `new URL("//autre-site.com/x", site)` mènerait à autre-site.com, et
    // l'administration deviendrait une redirection ouverte.
    const cible = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://bike-land.vercel.app");
    cible.pathname = pathname;
    cible.search = requete.nextUrl.search;
    return NextResponse.redirect(cible);
  }

  const reponse = NextResponse.next();
  // L'administration ne doit jamais apparaître dans un moteur de recherche.
  if (cheminAdmin || role === "admin") reponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  return reponse;
}

export const config = {
  // Tout, sauf les fichiers que Next sert lui-même et que les deux
  // déploiements servent pareil.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
