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
const PAGES = [
  "",
  "/velos",
  "/produits",
  "/octobre-rose",
  "/itineraires",
  "/comment-ca-marche",
  "/contact",
  "/a-propos",
  "/reservation/suivi",
  "/cgv",
  "/mentions-legales",
  "/donnees-personnelles",
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
 * Ni date de mise à jour, ni fréquence, ni priorité : nous n'avons pas de
 * date fiable par page (Google cesse de lire `lastmod` dès qu'il la voit
 * changer à chaque publication), et Google ignore les deux autres. Sans
 * elles, chaque entrée reste conforme au schéma de sitemaps.org, que Next
 * enfreint en plaçant les images avant la fréquence et la priorité.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Le domaine d'administration n'a rien à faire indexer.
  if (roleDuDeploiement() === "admin") return [];

  const velos = await velosDuParc();

  return [
    ...PAGES.map((chemin) => ({ url: `${site.url}${chemin}` })),
    ...velos.map((velo) => ({
      url: `${site.url}/velos/${velo.slug}`,
      ...(velo.photo ? { images: [adresseComplete(velo.photo)] } : {}),
    })),
    ...itineraires.map((itineraire) => ({ url: `${site.url}/itineraires/${itineraire.slug}` })),
  ];
}
