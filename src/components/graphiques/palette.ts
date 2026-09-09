/**
 * Palette des graphiques du tableau de bord.
 *
 * Chaque valeur a été vérifiée avec le validateur de la méthode de
 * visualisation (bandes de clarté, plancher de chroma, séparation sous
 * protanopie et deutéranopie, contraste sur le fond) — et non choisie à
 * l'œil. Les résultats, sur fond blanc :
 *
 *  - `categoriel` (3 emplacements, paires adjacentes) : tout au vert,
 *    pire paire ΔE 20,5 en protanopie, 25,7 en vision normale.
 *  - `categoriel` limité aux deux premiers emplacements dès qu'une forme
 *    met n'importe quelle paire côte à côte : la paire terre/soleil ne
 *    tient pas le plancher de vision normale sur ce test-là.
 *  - `sequentiel` : rampe monotone d'une seule teinte, extrémité claire à
 *    2,07:1 sur le fond.
 *
 * L'application déclare `color-scheme: light` : il n'y a donc qu'un mode
 * à valider. Une variante sombre demanderait de refaire passer la rampe
 * sur le fond sombre, jamais une simple inversion.
 */

/** Identité d'une série. Assignation dans l'ordre, jamais en boucle. */
export const categoriel = ["#b04726", "#2a6fb0", "#c07813"] as const;

/** Magnitude : une seule teinte, du clair au foncé. */
export const sequentiel = ["#e6a687", "#d87d57", "#c75c34", "#b04726", "#90371f"] as const;

/** Couleur unique des séries nominales (une barre = une catégorie sans ordre). */
export const teinteUnique = categoriel[0];

/** Statuts : sens réservé, toujours accompagnés d'un libellé. */
export const statuts = {
  bon: "#4e6630",
  attention: "#c07813",
  critique: "#b04726",
} as const;

export const encreTexte = "#1c1714";
export const encreSecondaire = "#6b6058";
export const grille = "#e6ded3";
export const surface = "#ffffff";
