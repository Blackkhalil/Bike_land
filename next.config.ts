import type { NextConfig } from "next";

/**
 * Le stockage Vercel Blob de Bike Land (bikeland-photos), et lui seul.
 *
 * Autoriser tous les magasins Blob laissait n'importe qui faire
 * optimiser, servir et facturer ses propres images par le site, jusqu'à
 * épuiser son quota d'optimisation d'images. Même valeur dans
 * src/lib/validation.ts (fichierDuParc).
 */
const HOTE_BLOB = "plbf2xjc382kgpsz.public.blob.vercel-storage.com";
const BLOB = `https://${HOTE_BLOB}`;
const IMAGES = `'self' data: blob: ${BLOB}`;
const MEDIAS = `'self' blob: ${BLOB}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Les photos de vélos déposées depuis l'admin : notre magasin Blob, son
    // dossier velos/, sans paramètres d'adresse.
    remotePatterns: [{ protocol: "https", hostname: HOTE_BLOB, pathname: "/velos/**", search: "" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Impose HTTPS pendant deux ans. Le site ne sert que des pages
          // publiques et une administration par mot de passe : laisser une
          // seule requête passer en clair exposerait le cookie de session.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Droits réservés sur la fouille de textes et de données (protocole
          // TDMRep du W3C) et consigne aux robots d'IA de ne pas reprendre
          // textes ni images. Sans effet sur Google : il ignore `noai` et
          // `noimageai` et continue d'indexer le site.
          { key: "TDM-Reservation", value: "1" },
          { key: "X-Robots-Tag", value: "noai, noimageai" },
          // La fenêtre du site ne partage rien avec une page qui l'ouvrirait.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Coupe l'accès aux capteurs, dont aucune page n'a besoin.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Politique de contenu.
          //
          // `script-src` tolère l'inline parce que Next pose lui-même les
          // scripts d'hydratation dans la page. S'en passer demanderait de
          // signer chaque balise par un nonce calculé à la requête, ce qui
          // rendrait toutes les pages dynamiques et ferait perdre le cache
          // qui permet au site de tenir la charge. Le compromis est
          // assumé : le site n'affiche aucun HTML écrit par un visiteur,
          // React échappe tout ce qu'il rend, et le seul bloc inséré
          // directement est un JSON-LD dont les `<` sont échappés.
          //
          // Les directives qui suivent, elles, bloquent sans contrepartie :
          // plus de script chargé depuis un domaine tiers, plus de balise
          // `base` détournée, plus de formulaire renvoyé ailleurs, plus de
          // greffon, et plus d'encadrement du site dans une page étrangère.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              `img-src ${IMAGES}`,
              `media-src ${MEDIAS}`,
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
      // Photos, affiches et vidéos : aucun autre site ne peut les afficher
      // chez lui en pointant vers nos fichiers. Les aperçus de liens
      // (WhatsApp, Facebook) et Google Images les lisent depuis leurs
      // serveurs, que cet en-tête ne concerne pas ; aucun email n'en charge.
      ...["/images/:path*", "/Video/:path*", "/carrousel/:path*", "/logo/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }],
      })),
      // L'administration a besoin de deux choses de plus, et elle seule :
      // déposer les fichiers directement dans Vercel Blob, et lire les
      // affiches, dont la bibliothèque (WebAssembly, travailleur, données
      // de langue) se charge depuis jsDelivr au premier dépôt. Cette
      // règle vient après la précédente : pour les pages /admin, son en-tête
      // remplace celui du site.
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              `img-src ${IMAGES}`,
              `media-src ${MEDIAS}`,
              "connect-src 'self' https://cdn.jsdelivr.net https://vercel.com https://blob.vercel-storage.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
