import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // La règle la plus spécifique l'emporte : le suivi reste indexable
      // alors que les liens personnels /reservation/<token> ne le sont pas.
      allow: ["/", "/reservation/suivi"],
      // Les liens de suivi sont personnels, l'espace exploitant est privé,
      // et le tunnel de réservation n'a aucun intérêt en résultat de recherche.
      disallow: ["/admin", "/api/", "/reservation"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
