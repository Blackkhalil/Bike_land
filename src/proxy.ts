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
 */
export function proxy(requete: NextRequest) {
  const role = process.env.BIKELAND_ROLE?.trim().toLowerCase();
  const { pathname } = requete.nextUrl;
  const cheminAdmin = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");

  if (role === "site" && cheminAdmin) {
    return NextResponse.rewrite(new URL("/page-introuvable", requete.url), { status: 404 });
  }

  if (role === "admin" && !cheminAdmin) {
    if (pathname === "/") return NextResponse.redirect(new URL("/admin", requete.url));
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erreur: "Introuvable." }, { status: 404 });
    }
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bike-land.vercel.app";
    return NextResponse.redirect(new URL(`${pathname}${requete.nextUrl.search}`, site));
  }

  const reponse = NextResponse.next();
  // L'administration ne doit jamais apparaître dans un moteur de recherche.
  if (cheminAdmin || role === "admin") reponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  return reponse;
}

export const config = {
  // Tout sauf les fichiers servis tels quels : scripts, images optimisées
  // et fichiers de `public`, que les deux déploiements servent pareil.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|webp|avif|svg|ico|mp4|webm|woff2?|txt|xml|webmanifest)$).*)"],
};
