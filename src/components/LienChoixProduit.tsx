"use client";

import type { ComponentProps } from "react";

import { BoutonLien } from "@/components/Bouton";
import { CLE_CHOIX_PRODUIT, type ChoixProduit } from "@/data/produits";

/**
 * Un bouton de la page Nos produits qui retient, le temps de la visite, le
 * produit choisi : la fiche vélo ouvrira son encart de réservation dessus
 * (le road trip du samedi, ou la location libre), au lieu de son choix
 * par défaut. Gbashi bike et Padel bike, sur commande, n'en ont pas besoin.
 */
export function LienChoixProduit({
  choix,
  ...props
}: ComponentProps<typeof BoutonLien> & { choix: ChoixProduit }) {
  return (
    <BoutonLien
      {...props}
      onClick={() => {
        try {
          window.sessionStorage.setItem(CLE_CHOIX_PRODUIT, choix);
        } catch {
          // Stockage indisponible : l'encart s'ouvrira sur son choix par défaut.
        }
      }}
    />
  );
}
