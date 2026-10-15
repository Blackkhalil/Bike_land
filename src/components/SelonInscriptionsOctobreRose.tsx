"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { clotureInscriptionsOctobreRose } from "@/data/octobre-rose";
import { inscriptionsOctobreRoseOuvertes } from "@/data/produits";

/** L'horloge : un rendu de plus à l'heure limite des inscriptions. */
function abonnementCloture(rappel: () => void) {
  const cloture = clotureInscriptionsOctobreRose();
  const delai = cloture === null ? -1 : cloture - new Date().getTime() + 1000;
  if (delai <= 0 || delai >= 2 ** 31 - 1) return () => {};
  const minuteur = setTimeout(rappel, delai);
  return () => clearTimeout(minuteur);
}

/**
 * Ce qui dépend de l'heure limite des inscriptions en ligne, sur une page
 * rendue à l'avance.
 *
 * La page décide au moment où elle se régénère ; une copie en cache peut
 * dater d'avant l'heure limite. Le serveur envoie donc les deux versions,
 * et le navigateur montre la bonne, à l'heure du Bénin, et bascule de
 * lui-même à l'heure limite. À l'hydratation, React reprend la valeur du
 * serveur : rien ne diffère.
 */
export function SelonInscriptionsOctobreRose({
  ouvertesAuServeur,
  ouvertes,
  closes,
}: {
  ouvertesAuServeur: boolean;
  ouvertes: ReactNode;
  closes: ReactNode;
}) {
  const enCours = useSyncExternalStore(
    abonnementCloture,
    () => inscriptionsOctobreRoseOuvertes(new Date()),
    () => ouvertesAuServeur,
  );
  return enCours ? ouvertes : closes;
}
