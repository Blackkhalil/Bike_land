import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Outfit } from "next/font/google";

import { site } from "@/lib/site";
import "./globals.css";

// Grotesque humaniste pour les titres : la typographie « lisible, arrondie,
// humaine » demandée au §4.1, qui tient aussi en très grand corps.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.nom} — Location de vélos pour road trips au Bénin`,
    template: `%s · ${site.nom}`,
  },
  description: site.description,
  keywords: [
    "location vélo Bénin",
    "road trip vélo",
    "cyclotourisme Bénin",
    "vélo électrique Cotonou",
    "gravel Atacora",
  ],
  openGraph: {
    type: "website",
    locale: "fr_BJ",
    siteName: site.nom,
    title: `${site.nom} — ${site.baseline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#1c1714",
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
    <html lang="fr" className={`${bricolage.variable} ${outfit.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
