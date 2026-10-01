import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";

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
  title: {
    default: `${site.nom}, location de vélos pour road trips au Bénin`,
    template: `%s · ${site.nom}`,
  },
  description: site.description,
  keywords: [
    "location vélo Bénin",
    "location vélo Cotonou",
    "road trip vélo Bénin",
    "vélo route des Pêches",
    "cyclotourisme Bénin",
  ],
  openGraph: {
    type: "website",
    locale: "fr_BJ",
    siteName: site.nom,
    title: `${site.nom}, ${site.baseline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
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
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-BJ" className={`${oswald.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
