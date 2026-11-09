import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";

import { MesureAudience } from "@/components/MesureAudience";
import { IMAGE_PARTAGE } from "@/lib/seo";
import { site } from "@/lib/site";
import "./globals.css";

// Titres : grotesque condensée à graisse lourde (brief §2). Oswald tient
// le très grand corps sans s'étaler en largeur, ce qui compte quand le
// titre doit déborder de son bloc, et garde une bas-de-casse lisible,
// puisque la casse phrase est imposée et les capitales proscrites.
const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Texte courant : sans-serif neutre, lisible en petit corps.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // Le titre et la description de repli, pour une page qui n'en donne
  // pas ; chaque page publique a les siens (src/lib/seo.ts).
  title: {
    default: `${site.nom}, location de vélos à Cotonou`,
    template: `%s · ${site.nom}`,
  },
  description: site.description,
  applicationName: site.nom,
  keywords: [
    "location vélo Cotonou",
    "location de vélos Cotonou",
    "louer un vélo à Cotonou",
    "balade à vélo Cotonou",
    "road trip vélo Bénin",
    "vélo route des Pêches",
    "sortie vélo week-end Cotonou",
    "Gbashi bike",
    "Padel bike",
  ],
  openGraph: {
    type: "website",
    locale: "fr_BJ",
    siteName: site.nom,
    title: `${site.nom}, location de vélos à Cotonou`,
    description: site.description,
    images: [IMAGE_PARTAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.nom}, location de vélos à Cotonou`,
    description: site.description,
    images: [IMAGE_PARTAGE.url],
  },
  // La balise de validation de Google Search Console, dès que le gérant
  // l'a obtenue (src/lib/site.ts).
  ...(site.verificationGoogle ? { verification: { google: site.verificationGoogle } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#0e0e0e",
  width: "device-width",
  initialScale: 1,
};

/**
 * Enveloppe racine : uniquement la langue, les polices et les styles.
 *
 * L'en-tête et le pied de page appartiennent au groupe `(site)` : ils ne
 * doivent apparaître ni dans l'espace d'exploitation, ni sur la page de
 * connexion.
 *
 * La mesure d'audience est posée ici, donc sur toutes les pages.
 * Volontairement : savoir que personne n'atteint l'étape du paiement
 * vaut autant que savoir combien de gens arrivent sur l'accueil, et
 * c'est le parcours entier qui renseigne.
 *
 * Elle ne pose aucun cookie et n'établit pas d'identifiant durable, ce
 * qui lui évite la bannière de consentement. Elle est tout de même
 * déclarée dans la page sur les données personnelles : ne pas poser de
 * cookie ne dispense pas de dire qu'on mesure.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-BJ" className={`${oswald.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <MesureAudience />
      </body>
    </html>
  );
}
