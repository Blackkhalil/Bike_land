import type { MetadataRoute } from "next";

import { velos as catalogue } from "@/data/catalogue";
import { itineraires } from "@/data/contenus";
import { depot } from "@/lib/db";
import { roleDuDeploiement } from "@/lib/deploiement";
import { site } from "@/lib/site";
import type { Velo } from "@/lib/types";

/** Relu toutes les heures : un vélo ajouté depuis l'admin y entre seul. */
export const revalidate = 3600;

/** Les pages publiques et indexables, hors fiches vélo et itinéraires. */
const PAGES: { chemin: string; priorite: number; frequence: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { chemin: "", priorite: 1, frequence: "weekly" },
  { chemin: "/velos", priorite: 0.9, frequence: "daily" },
  { chemin: "/produits", priorite: 0.9, frequence: "weekly" },
  { chemin: "/octobre-rose", priorite: 0.6, frequence: "monthly" },
  { chemin: "/itineraires", priorite: 0.7, frequence: "monthly" },
  { chemin: "/comment-ca-marche", priorite: 0.7, frequence: "monthly" },
  { chemin: "/contact", priorite: 0.7, frequence: "monthly" },
  { chemin: "/a-propos", priorite: 0.6, frequence: "yearly" },
  { chemin: "/reservation/suivi", priorite: 0.3, frequence: "yearly" },
  { chemin: "/cgv", priorite: 0.3, frequence: "yearly" },
  { chemin: "/mentions-legales", priorite: 0.2, frequence: "yearly" },
  { chemin: "/donnees-personnelles", priorite: 0.2, frequence: "yearly" },
];

/** Une image en adresse complète, comme Google la demande. */
function adresseComplete(chemin: string): string {
  return /^https?:\/\//.test(chemin) ? chemin : `${site.url}${chemin}`;
}

/**
 * Les vélos du parc, lus en base : ceux que l'exploitant ajoute depuis
 * l'admin y entrent d'eux-mêmes, les vélos retirés en sortent. Si la base
 * ne répond pas, le catalogue de départ fait l'affaire plutôt que de
 * publier un plan sans aucun vélo.
 */
async function velosDuParc(): Promise<Velo[]> {
  try {
    return await depot.listerVelos();
  } catch {
    return catalogue;
  }
}

/**
 * Plan du site pour Google et Bing : les pages publiques et indexables,
 * avec les photos des vélos.
 *
 * Pas de date de mise à jour : nous n'en avons pas de fiable par page, et
 * Google cesse de lire `lastmod` dès qu'il constate qu'elle change à
 * chaque publication sans que la page change.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Le domaine d'administration n'a rien à faire indexer.
  if (roleDuDeploiement() === "admin") return [];

  const velos = await velosDuParc();

  return [
    ...PAGES.map((page) => ({
      url: `${site.url}${page.chemin}`,
      changeFrequency: page.frequence,
      priority: page.priorite,
    })),
    ...velos.map((velo) => ({
      url: `${site.url}/velos/${velo.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      ...(velo.photo ? { images: [adresseComplete(velo.photo)] } : {}),
    })),
    ...itineraires.map((itineraire) => ({
      url: `${site.url}/itineraires/${itineraire.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
