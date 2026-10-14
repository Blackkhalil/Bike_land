"use client";

import { useEffect, useState, type ReactNode } from "react";

import { octobreRoseEnCours } from "@/data/produits";
import { aujourdhui } from "@/lib/dates";

/**
 * Ce qui ne doit paraître qu'en saison, sur une page rendue à l'avance.
 *
 * La page Nos produits décide de la saison à chacune de ses
 * régénérations. Mais une page régénérée le 31 octobre peut encore être
 * servie une fois le 1er novembre, le temps que la suivante se prépare.
 * Relu dans le navigateur après l'affichage, le jour du Bénin efface
 * alors ce qui n'a plus lieu d'être. Le premier rendu reste celui du
 * serveur : rien ne diffère à l'hydratation.
 */
export function EnSaisonOctobreRose({ children }: { children: ReactNode }) {
  const [enSaison, setEnSaison] = useState(true);

  useEffect(() => {
    const verification = setTimeout(() => setEnSaison(octobreRoseEnCours(aujourdhui())), 0);
    return () => clearTimeout(verification);
  }, []);

  return enSaison ? children : null;
}
