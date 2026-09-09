"use client";

import { useEffect } from "react";

/**
 * Révélation des blocs `.reveal` à l'entrée dans le viewport.
 *
 * Un seul observateur pour toute la page, monté une fois dans le layout :
 * les composants n'ont qu'à porter la classe. Si l'utilisateur a demandé
 * moins d'animations, tout est affiché immédiatement.
 */
export function Reveal() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(".reveal:not([data-visible])");
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduit || typeof IntersectionObserver === "undefined") {
      elements.forEach((element) => element.setAttribute("data-visible", "true"));
      return;
    }

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          const cible = entree.target as HTMLElement;
          const delai = Number(cible.dataset.delai ?? 0);
          window.setTimeout(() => cible.setAttribute("data-visible", "true"), delai);
          observateur.unobserve(cible);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    elements.forEach((element) => observateur.observe(element));
    return () => observateur.disconnect();
  });

  return null;
}
