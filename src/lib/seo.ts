import type { Metadata } from "next";

import { site } from "@/lib/site";

/**
 * Référencement : ce que Google et les aperçus de liens (WhatsApp,
 * Facebook) lisent de chaque page.
 *
 * Repères, d'après les consignes de Google :
 *  - le titre affiché tient en 60 caractères, gabarit « · Bike Land »
 *    compris (au-delà, Google le coupe ou le réécrit) ;
 *  - la description fait 120 à 158 caractères, et dit à la fois ce que la
 *    page offre et un fait concret (prix, lieu, jour).
 */

/** Ce que le gabarit du layout ajoute à chaque titre de page. */
export const SUFFIXE_TITRE = ` · ${site.nom}`;

/** Longueurs visées, au caractère près (voir plus haut). */
export const TITRE_MAX = 60;
export const DESCRIPTION_MAX = 158;

/**
 * L'image d'aperçu par défaut : une vraie sortie Bike Land sur la route
 * des Pêches, au format 1200 × 630 qu'attendent WhatsApp, Facebook et
 * Google. Rangée hors de /images : elle doit rester lisible par les
 * aperçus de liens, qui la chargent depuis leurs serveurs.
 */
export const IMAGE_PARTAGE = {
  url: "/partage/bike-land-sortie.jpg",
  width: 1200,
  height: 630,
  alt: "Une sortie Bike Land à vélo sur la route des Pêches, à Cotonou",
} as const;

/** Le premier texte qui tient dans la longueur donnée, sinon le dernier. */
export function premierQuiTient(candidats: string[], longueurMax: number): string {
  return candidats.find((texte) => texte.length <= longueurMax) ?? candidats[candidats.length - 1];
}

interface ParametresPage {
  /** Le titre de la page ; le gabarit y ajoute « · Bike Land ». */
  titre: string;
  /** Vrai pour un titre complet, sans gabarit (l'accueil). */
  titreAbsolu?: boolean;
  description: string;
  /** Le chemin canonique, « / » pour l'accueil. */
  chemin: string;
  /** Une image propre à la page (photo du vélo) ; à défaut, l'image de partage. */
  image?: { url: string; alt: string; width?: number; height?: number };
}

/**
 * Les métadonnées d'une page publique : titre, description, adresse
 * canonique, et l'aperçu des réseaux aligné sur eux.
 *
 * Un `openGraph` de page remplace celui du layout en entier, Next ne
 * fusionnant pas ses sous-champs : chaque page redonne donc le nom du
 * site, la langue et l'image. Sans cela, un lien de /velos partagé sur
 * WhatsApp affichait le titre et la description de l'accueil.
 */
export function metadonneesPage({ titre, titreAbsolu = false, description, chemin, image }: ParametresPage): Metadata {
  const titreAffiche = titreAbsolu ? titre : `${titre}${SUFFIXE_TITRE}`;
  const apercu = image ?? IMAGE_PARTAGE;
  return {
    title: titreAbsolu ? { absolute: titre } : titre,
    description,
    alternates: { canonical: chemin },
    openGraph: {
      type: "website",
      locale: "fr_BJ",
      siteName: site.nom,
      url: chemin,
      title: titreAffiche,
      description,
      images: [apercu],
    },
    twitter: {
      card: "summary_large_image",
      title: titreAffiche,
      description,
      images: [apercu.url],
    },
  };
}
