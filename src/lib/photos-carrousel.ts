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
  // Les doubles extensions des exports de téléphone, « .JPG.jpeg »,
  // partent toutes les deux.
  const sansExtension = fichier.replace(/(\.[a-z0-9]{2,4})+$/i, "");

  // Un nom donné par l'appareil ne décrit rien, et il serait lu à voix
  // haute à qui ne voit pas l'image : « WhatsApp Image 2026 09 29 at 19
  // 21 36 ». Mieux vaut une description neutre et vraie qu'une suite de
  // chiffres.
  if (NOM_D_APPAREIL.test(sansExtension)) return DESCRIPTION_NEUTRE;

  const sansPrefixe = sansExtension.replace(/^\d+[-_\s]*/, "");
  const mots = sansPrefixe.replace(/[-_]+/g, " ").trim();
  if (!mots) return DESCRIPTION_NEUTRE;
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/**
 * Les noms que posent les téléphones et les messageries, et qui ne
 * disent rien de la photo.
 */
const NOM_D_APPAREIL =
  /^(IMG|DSC|DSCN|DCIM|PXL|MVIMG|PHOTO|IMAGE|SCREENSHOT|CAPTURE)[-_\s]?\d|^WhatsApp\s+Image|^\d{8}[-_]\d{6}|^Screenshot/i;

const DESCRIPTION_NEUTRE = "Une sortie Bike Land sur la route des Pêches";

/**
 * Combien de photos le carrousel montre au plus.
 *
 * Le dossier peut en contenir autant qu'on veut, la page n'en publie
 * que les premières. Chaque photo coûte une figure et un jeu complet de
 * tailles dans le HTML : à vingt-cinq, cela représentait dix-sept pour
 * cent du poids de la page d'accueil, pour des images que personne ne
 * fait défiler jusqu'au bout.
 *
 * Pour changer l'ordre, préfixez les fichiers par un nombre.
 */
const MAXIMUM_AFFICHE = 12;

export async function photosDuCarrousel(): Promise<PhotoCarrousel[]> {
  try {
    const fichiers = await readdir(DOSSIER);
    return fichiers
      .filter((fichier) => EXTENSIONS.has(path.extname(fichier).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
      .slice(0, MAXIMUM_AFFICHE)
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
