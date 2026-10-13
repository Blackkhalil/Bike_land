import type { NextConfig } from "next";

/** Les photos et vidéos de vélos déposées depuis l'admin, dans Vercel Blob. */
const BLOB = "https://*.public.blob.vercel-storage.com";
const IMAGES = `'self' data: blob: https://res.cloudinary.com ${BLOB}`;
const MEDIAS = `'self' blob: ${BLOB}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Les photos de vélos déposées depuis l'admin vivent dans Vercel Blob.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
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
              "connect-src 'self' https://cdn.jsdelivr.net https://vercel.com https://*.vercel-storage.com",
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
