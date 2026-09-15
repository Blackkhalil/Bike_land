/**
 * Palette des graphiques du tableau de bord.
 *
 * Reprise sur la charte « noir / orange signal », en conservant la
 * méthode d'origine : trois teintes catégorielles nettement séparées en
 * teinte ET en clarté, une rampe séquentielle monotone d'une seule
 * teinte, et jamais de sens porté par la seule couleur.
 *
 * ATTENTION — ces valeurs n'ont PAS été repassées dans le validateur
 * (bandes de clarté, plancher de chroma, séparation sous protanopie et
 * deutéranopie). Elles ont été choisies pour préserver les propriétés
 * qui avaient été validées :
 *  - l'orange sourd et le vert lagune sont éloignés en teinte comme en
 *    clarté, et le bleu reste le troisième repère le plus sûr sous
 *    deutéranopie ;
 *  - la rampe séquentielle ne fait varier que la clarté.
 * Avant une mise en production, refaire tourner le validateur.
 */

/** Identité d'une série. Assignation dans l'ordre, jamais en boucle. */
export const categoriel = ["#c44a04", "#1f6f5c", "#2a6fb0"] as const;

/** Magnitude : une seule teinte, du clair au foncé. */
export const sequentiel = ["#fbdfcb", "#f8c19b", "#f79b63", "#f4762f", "#c44a04"] as const;

/** Couleur unique des séries nominales (une barre = une catégorie sans ordre). */
export const teinteUnique = categoriel[0];

/** Statuts : sens réservé, toujours accompagnés d'un libellé. */
export const statuts = {
  bon: "#1f6f5c",
  attention: "#c07813",
  critique: "#c44a04",
} as const;

export const encreTexte = "#0e0e0e";
export const encreSecondaire = "#6b6b6b";
export const grille = "#e0dcd3";
export const surface = "#ffffff";
