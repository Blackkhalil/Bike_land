"use client";

import { useEffect } from "react";

/** Les éléments protégés : photos, affiches et vidéos du site. */
const MEDIAS = "img, picture, video";

/**
 * Freine la copie des photos et des vidéos : pas de menu « Enregistrer
 * l'image sous » au clic droit ou à l'appui long, pas de glisser-déposer
 * vers le bureau. Le texte, lui, reste sélectionnable : le client doit
 * pouvoir copier un numéro de téléphone ou une adresse.
 *
 * Ce n'est qu'un frein : une capture d'écran reste possible. Les vrais
 * remparts sont ailleurs : le pare-feu Vercel, qui écarte les robots
 * aspirateurs, l'en-tête Cross-Origin-Resource-Policy, qui interdit aux
 * autres sites d'afficher nos fichiers (next.config.ts), et la mention de
 * propriété intellectuelle.
 *
 * Un seul écouteur pour toute la page, monté une fois dans le layout.
 */
export function ProtectionMedias() {
  useEffect(() => {
    const bloquer = (evenement: Event) => {
      if (evenement.target instanceof Element && evenement.target.closest(MEDIAS)) {
        evenement.preventDefault();
      }
    };
    document.addEventListener("contextmenu", bloquer);
    document.addEventListener("dragstart", bloquer);
    return () => {
      document.removeEventListener("contextmenu", bloquer);
      document.removeEventListener("dragstart", bloquer);
    };
  }, []);

  return null;
}
