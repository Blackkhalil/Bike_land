import type { MetadataRoute } from "next";

import { roleDuDeploiement } from "@/lib/deploiement";
import { site } from "@/lib/site";

/**
 * Les robots qui aspirent le web pour entraîner ou nourrir une
 * intelligence artificielle. Ils n'apportent aucun client et repartent
 * avec nos textes et nos photos : ils sont priés de ne rien prendre.
 * Google, Bing et les aperçus de liens (WhatsApp, Facebook) ne sont pas
 * dans la liste : ils restent les bienvenus.
 *
 * robots.txt n'est qu'une consigne, que les robots sérieux respectent.
 * Les autres sont écartés par le pare-feu Vercel (robots d'IA refusés,
 * robots non déclarés mis au défi).
 */
const ROBOTS_IA = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "YouBot",
  "AI2Bot",
  "DuckAssistBot",
  "MistralAI-User",
  "PetalBot",
  "Scrapy",
];

export default function robots(): MetadataRoute.Robots {
  // Le domaine d'administration : rien à explorer, rien à indexer. Ses
  // pages publiques renvoient de toute façon vers le site.
  if (roleDuDeploiement() === "admin") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: [
      {
        userAgent: "*",
        // La règle la plus spécifique l'emporte : le suivi reste indexable
        // alors que les liens personnels /reservation/<token> ne le sont pas.
        allow: ["/", "/reservation/suivi"],
        // Les liens de suivi sont personnels, l'espace exploitant est privé,
        // et le tunnel de réservation n'a aucun intérêt en résultat de recherche.
        disallow: ["/admin", "/api/", "/reservation"],
      },
      { userAgent: ROBOTS_IA, disallow: "/" },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
