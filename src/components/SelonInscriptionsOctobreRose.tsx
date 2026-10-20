"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { clotureInscriptionsOctobreRose, OCTOBRE_ROSE } from "@/data/octobre-rose";
import { inscriptionsOctobreRoseOuvertes } from "@/data/produits";

/**
 * L'horloge : un rendu de plus à chaque heure limite des inscriptions, jour
 * après jour. Le minuteur suivant se pose quand le précédent sonne : une
 * page restée ouverte bascule le samedi, puis le dimanche.
 */
export function abonnementClotures(rappel: () => void) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const programmer = () => {
    const maintenant = new Date().getTime();
    const prochaine = OCTOBRE_ROSE.sorties
      .map(clotureInscriptionsOctobreRose)
      .filter((cloture) => cloture > maintenant)
      .sort((a, b) => a - b)[0];
    if (prochaine === undefined) return;
    const delai = prochaine - maintenant + 1000;
    if (delai >= 2 ** 31 - 1) return;
    minuteur = setTimeout(() => {
      rappel();
      programmer();
    }, delai);
  };
  programmer();
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
    abonnementClotures,
    () => inscriptionsOctobreRoseOuvertes(new Date()),
    () => ouvertesAuServeur,
  );
  return enCours ? ouvertes : closes;
}
