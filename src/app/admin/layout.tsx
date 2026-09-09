import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s — Administration Bike Land" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Enveloppe commune à tout /admin, page de connexion comprise : elle ne
 * porte que les métadonnées. Le contrôle d'accès est dans le groupe
 * `(protege)`, pour que la page de connexion n'ait pas à s'en exclure
 * elle-même.
 */
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return children;
}
