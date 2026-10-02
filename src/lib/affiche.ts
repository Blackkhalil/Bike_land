import { getImageProps } from "next/image";

/**
 * L'adresse optimisée d'une affiche de vidéo.
 *
 * L'attribut `poster` d'une vidéo échappe à l'optimiseur d'images : il
 * prend une adresse, et le navigateur la charge telle quelle. Les
 * affiches partaient donc en JPEG brut, de 66 à 117 Ko chacune, et sur
 * la page d'accueil elles représentaient 401 Ko, soit plus de la moitié
 * de ce qui passait avant que la page devienne cliquable.
 *
 * Rien n'empêche pourtant de donner à `poster` l'adresse de
 * l'optimiseur. On obtient la même image, réduite à la taille utile et
 * servie en AVIF ou en WebP selon ce que le navigateur accepte : 71 Ko
 * devient 11 Ko pour l'affiche d'un vélo, sans toucher au fichier
 * source. Remplacer une affiche dans `public/` suffit, rien n'est à
 * régénérer à la main.
 *
 * `getImageProps` construit l'adresse plutôt qu'une chaîne écrite à la
 * main : il respecte la configuration du projet, les largeurs et les
 * qualités autorisées. Next 16 refuse toute qualité non déclarée, et une
 * adresse fabriquée avec `q=70` répondait 400.
 *
 * Une affiche n'accepte qu'une adresse, pas de `srcset` : on prend celle
 * destinée aux écrans à haute densité, qui reste nette partout. C'est
 * aussi celle que la plupart des téléphones béninois demanderaient.
 */
export function afficheOptimisee(
  chemin: string | undefined,
  /** Largeur à laquelle l'affiche est réellement affichée, en pixels CSS. */
  largeurAffichee: number,
): string | undefined {
  if (!chemin) return undefined;
  // Une adresse distante ou déjà optimisée est laissée telle quelle.
  if (!chemin.startsWith("/") || chemin.startsWith("/_next/")) return chemin;

  const { props } = getImageProps({
    src: chemin,
    alt: "",
    width: largeurAffichee,
    height: Math.round(largeurAffichee * 0.75),
  });
  return props.src;
}
