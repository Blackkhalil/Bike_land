import type { MetadataRoute } from "next";

import { velos } from "@/data/catalogue";
import { itineraires } from "@/data/contenus";
import { site } from "@/lib/site";

/** Plan du site : uniquement les pages publiques et indexables. */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();

  const pages = [
    { chemin: "", priorite: 1, frequence: "weekly" as const },
    { chemin: "/velos", priorite: 0.9, frequence: "daily" as const },
    { chemin: "/itineraires", priorite: 0.8, frequence: "monthly" as const },
    { chemin: "/comment-ca-marche", priorite: 0.7, frequence: "monthly" as const },
    { chemin: "/a-propos", priorite: 0.6, frequence: "yearly" as const },
    { chemin: "/contact", priorite: 0.7, frequence: "monthly" as const },
    { chemin: "/reservation/suivi", priorite: 0.4, frequence: "yearly" as const },
    { chemin: "/mentions-legales", priorite: 0.2, frequence: "yearly" as const },
    { chemin: "/cgv", priorite: 0.3, frequence: "yearly" as const },
    { chemin: "/donnees-personnelles", priorite: 0.3, frequence: "yearly" as const },
  ];

  return [
    ...pages.map((page) => ({
      url: `${site.url}${page.chemin}`,
      lastModified: maintenant,
      changeFrequency: page.frequence,
      priority: page.priorite,
    })),
    ...velos.map((velo) => ({
      url: `${site.url}/velos/${velo.slug}`,
      lastModified: maintenant,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...itineraires.map((itineraire) => ({
      url: `${site.url}/itineraires/${itineraire.slug}`,
      lastModified: maintenant,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
