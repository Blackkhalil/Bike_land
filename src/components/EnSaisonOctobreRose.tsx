"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { octobreRoseEnCours } from "@/data/produits";

/** Rien à écouter : la saison se relit à chaque rendu. */
const sansAbonnement = () => () => {};

/**
 * Ce qui ne doit paraître qu'en saison, sur une page rendue à l'avance.
 *
 * La page Nos produits décide de la saison à chacune de ses
 * régénérations ; mais une copie en cache ou préchargée peut dater d'avant
 * la bascule : celle du 31 octobre servie le 1er novembre au matin, ou
 * celle du 30 septembre le 1er octobre. Le serveur envoie donc toujours ce
 * contenu, et le navigateur tranche à l'heure du Bénin.
 *
 * À l'hydratation, React reprend la valeur du serveur (`enSaisonAuServeur`) :
 * rien ne diffère. Il relit aussitôt celle du navigateur, et corrige.
 */
export function EnSaisonOctobreRose({
  enSaisonAuServeur,
  children,
}: {
  enSaisonAuServeur: boolean;
  children: ReactNode;
}) {
  const enSaison = useSyncExternalStore(
    sansAbonnement,
    () => octobreRoseEnCours(new Date()),
    () => enSaisonAuServeur,
  );
  return enSaison ? children : null;
}
