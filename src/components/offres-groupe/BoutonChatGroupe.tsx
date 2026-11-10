"use client";

import type { ReactNode } from "react";

import { classesBouton } from "@/components/Bouton";
import type { CodeOffreGroupe } from "@/lib/offres";
import { lienChatGroupe, ouvrirChatGroupe } from "@/lib/offres-groupe/ouverture-chat";

/**
 * Un bouton d'une page qui ouvre le chatbot des offres de groupe, sur une
 * offre si elle est donnée : « Réserver en groupe avec notre assistant » sur
 * Nos produits, « Road trip en groupe » à la place du road trip par gamme,
 * « Réserver Gbashi Bike » à la place de la commande sur WhatsApp.
 *
 * Les pages ne le montrent que quand l'interrupteur « Offres de groupe » est
 * ouvert (décidé sur le serveur). C'est un lien : si la bulle n'écoute pas
 * encore (page pas tout à fait chargée), il suit la convention
 * « /?reserver-en-groupe=<offre> », et la bulle s'ouvre à l'arrivée sur
 * l'accueil. Une adresse relative ne suffirait pas : le tunnel renvoie
 * ailleurs une adresse sans ses paramètres.
 */
export function BoutonChatGroupe({
  offre,
  children,
  variante = "primaire",
  taille = "md",
  className = "",
}: {
  offre?: CodeOffreGroupe;
  children: ReactNode;
  variante?: "primaire" | "sombre" | "clair" | "contour";
  taille?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <a
      href={lienChatGroupe(offre)}
      aria-haspopup="dialog"
      onClick={(evenement) => {
        if (ouvrirChatGroupe(offre ? { offre } : {})) evenement.preventDefault();
      }}
      className={classesBouton(variante, taille, className)}
    >
      {children}
    </a>
  );
}
