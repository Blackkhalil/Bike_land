/**
 * Les photos du carrousel, lues dans `public/carrousel`.
 *
 * Aucune liste à tenir à jour : on dépose un fichier dans le dossier, il
 * apparaît sur le site. On le retire, il disparaît. C'est le seul mode de
 * fonctionnement qui ne demande pas de toucher au code pour changer une
 * photo, et donc le seul qui tiendra dans la durée.
 *
 * L'ordre suit le nom du fichier. Pour imposer un ordre précis, préfixez
 * par un nombre : `01-depart.jpg`, `02-plage.jpg`, `03-coco.jpg`.
 *
 * Le nom sert aussi de description aux lecteurs d'écran : un fichier
 * nommé `coucher-de-soleil-a-fidjrosse.jpg` devient « Coucher de soleil
 * à Fidjrossè ». Nommez donc vos fichiers en clair, `IMG_4821.jpg` ne
 * décrit rien à quelqu'un qui n'y voit pas.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

import type { PhotoCarrousel } from "@/components/accueil/CarrouselPhotos";

const DOSSIER = path.join(process.cwd(), "public", "carrousel");

/** Formats que `next/image` sait traiter. */
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

/**
 * « 02-coucher-de-soleil.jpg » devient « Coucher de soleil ».
 *
 * Le préfixe numérique sert à ordonner, pas à décrire : il est retiré.
 */
function decrire(fichier: string): string {
  const sansExtension = fichier.replace(/\.[^.]+$/, "");
  const sansPrefixe = sansExtension.replace(/^\d+[-_\s]*/, "");
  const mots = sansPrefixe.replace(/[-_]+/g, " ").trim();
  if (!mots) return "Photo Bike Land";
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

export async function photosDuCarrousel(): Promise<PhotoCarrousel[]> {
  try {
    const fichiers = await readdir(DOSSIER);
    return fichiers
      .filter((fichier) => EXTENSIONS.has(path.extname(fichier).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
      .map((fichier) => ({
        source: `/carrousel/${fichier}`,
        description: decrire(fichier),
      }));
  } catch {
    // Dossier absent : le carrousel ne s'affiche simplement pas. Une
    // page d'accueil ne doit pas tomber parce qu'un dossier de photos
    // n'a pas encore été créé.
    return [];
  }
}
