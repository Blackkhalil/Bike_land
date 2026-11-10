/**
 * Ouvrir le chatbot des offres de groupe depuis n'importe où sur le site.
 *
 *  - Un bouton d'une page (Nos produits, la réservation d'une gamme, le
 *    tunnel) envoie un événement du navigateur que la bulle écoute
 *    (`ouvrirChatGroupe`).
 *  - Un lien porte l'offre dans l'adresse : c'est la convention du lien
 *    envoyé par email après la vérification à la main d'une capture de
 *    réduction, « /?reserver-en-groupe=road-trip-groupe&preuve=<id> »
 *    (`lienChatGroupe`). La bulle le lit à l'arrivée sur la page, ouvre la
 *    discussion sur l'offre, puis retire ces paramètres de l'adresse.
 *
 * Rien ici ne dépend du serveur.
 */

import type { CodeOffreGroupe } from "@/lib/offres";

import { estCodeOffreGroupe } from "./textes-chat";

/** L'événement que la bulle écoute. */
export const EVENEMENT_CHAT_GROUPE = "bikeland:chat-groupe";

/** Les paramètres d'adresse qui ouvrent le chatbot. */
export const PARAMETRE_OFFRE = "reserver-en-groupe";
export const PARAMETRE_PREUVE = "preuve";

/** Posé sur la racine du document tant que la bulle écoute : un bouton sait alors qu'il peut l'ouvrir. */
export const ATTRIBUT_CHAT_PRET = "data-chat-groupe";

export interface DemandeOuverture {
  offre?: CodeOffreGroupe;
  preuveId?: string;
}

/** Un identifiant de preuve plausible : celui du contrat (64 signes au plus). */
function preuveLisible(valeur: unknown): string | undefined {
  return typeof valeur === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(valeur) ? valeur : undefined;
}

/** Une demande d'ouverture nettoyée : une offre connue, une preuve plausible. */
export function demandeOuverture(brute: unknown): DemandeOuverture {
  if (typeof brute !== "object" || brute === null) return {};
  const { offre, preuveId } = brute as Record<string, unknown>;
  return {
    ...(estCodeOffreGroupe(offre) ? { offre } : {}),
    ...(preuveLisible(preuveId) ? { preuveId: preuveLisible(preuveId) } : {}),
  };
}

/** Ouvre le chatbot, sur une offre si elle est donnée. Faux si la bulle n'est pas là. */
export function ouvrirChatGroupe(demande: DemandeOuverture = {}): boolean {
  if (typeof window === "undefined" || !document.documentElement.hasAttribute(ATTRIBUT_CHAT_PRET)) return false;
  window.dispatchEvent(new CustomEvent(EVENEMENT_CHAT_GROUPE, { detail: demandeOuverture(demande) }));
  return true;
}

/** Le lien qui ouvre le chatbot sur une offre : « /?reserver-en-groupe=road-trip-groupe&preuve=… ». */
export function lienChatGroupe(offre?: CodeOffreGroupe, preuveId?: string, chemin = "/"): string {
  const parametres = new URLSearchParams();
  parametres.set(PARAMETRE_OFFRE, offre ?? "");
  if (preuveId) parametres.set(PARAMETRE_PREUVE, preuveId);
  return `${chemin}?${parametres.toString()}`;
}

/**
 * La demande portée par une adresse, ou `null` si elle n'en porte pas.
 * `reserver-en-groupe` vide ouvre le chatbot sur le choix de l'offre.
 */
export function demandeDeLAdresse(recherche: string): DemandeOuverture | null {
  const parametres = new URLSearchParams(recherche);
  if (!parametres.has(PARAMETRE_OFFRE)) return null;
  return demandeOuverture({ offre: parametres.get(PARAMETRE_OFFRE), preuveId: parametres.get(PARAMETRE_PREUVE) });
}

/** L'adresse sans les paramètres du chatbot, pour ne pas le rouvrir à chaque rechargement. */
export function adresseSansChat(chemin: string, recherche: string, ancre: string): string {
  const parametres = new URLSearchParams(recherche);
  parametres.delete(PARAMETRE_OFFRE);
  parametres.delete(PARAMETRE_PREUVE);
  const reste = parametres.toString();
  return `${chemin}${reste ? `?${reste}` : ""}${ancre}`;
}
