/**
 * Nos produits : les façons de rouler avec Bike Land, présentées ensemble
 * sur la page /produits.
 *
 * Trois sont permanents, un est de saison :
 *
 *  - **Gbashi bike** : le road trip du dimanche, version sport. Même
 *    réservation et même prix que le road trip ; à l'arrivée, séance de
 *    sport devant la plage. C'est le créneau « dimanche-matin » de
 *    CRENEAUX_ROAD_TRIP : l'ouvrir ou le fermer dans le tableau de bord
 *    ouvre ou ferme Gbashi bike.
 *  - **Road trip** : la sortie encadrée du samedi, créneau « samedi-matin ».
 *  - **Location libre** : le vélo pour soi, à l'heure.
 *  - **Octobre rose** : une sortie aux couleurs d'Octobre rose, le mois de
 *    sensibilisation au cancer du sein. Elle n'existe qu'en octobre : la
 *    carte de la page et l'annonce du site s'effacent d'elles-mêmes le
 *    1er novembre, heure du Bénin, sans redéploiement.
 *
 * Les prix ne sont pas ici : ils viennent de src/data/offres.ts, la seule
 * source de prix du site.
 */

import type { CodeCreneau } from "@/data/offres";
import type { DateISO } from "@/lib/dates";
import { formatDateAvecJour } from "@/lib/format";

/** Le créneau qui porte Gbashi bike, et celui du road trip du samedi. */
export const CRENEAU_GBASHI_BIKE: CodeCreneau = "dimanche-matin";
export const CRENEAU_ROAD_TRIP: CodeCreneau = "samedi-matin";

/**
 * La sortie Octobre rose, telle qu'elle est fixée.
 *
 * Tant qu'une valeur vaut `null`, la page et l'annonce disent qu'elle sera
 * donnée très bientôt, plutôt que d'inventer une date ou un prix. Pour
 * publier la sortie, il suffit de remplir ces champs : la carte et
 * l'annonce les affichent, et l'annonce s'ouvre une fois de plus chez ceux
 * qui l'avaient fermée, puisqu'elle a du nouveau à leur dire.
 *
 * Une fois la date passée, la carte et l'annonce s'effacent sans attendre
 * la fin du mois. Une date d'une année passée les efface aussi : c'est la
 * garantie de ne jamais annoncer une sortie déjà faite, à remettre à jour
 * pour l'octobre suivant.
 */
export const OCTOBRE_ROSE: {
  /** Le jour de la sortie, AAAA-MM-JJ. */
  date: DateISO | null;
  /** L'heure du départ, heure du Bénin. */
  heureDepart: number | null;
  /** Le prix par personne, en FCFA. */
  prixXof: number | null;
} = {
  date: null,
  heureDepart: null,
  prixXof: null,
};

/**
 * Octobre rose est-il en cours ce jour-là ?
 *
 * Le jour est celui du Bénin (`aujourdhui()`), jamais celui de l'appareil
 * ni du serveur. Appelée dans le navigateur par l'annonce, et par la page
 * à chacune de ses régénérations.
 */
export function octobreRoseEnCours(jour: DateISO): boolean {
  if (jour.slice(5, 7) !== "10") return false;
  return OCTOBRE_ROSE.date === null || jour <= OCTOBRE_ROSE.date;
}

/**
 * Le rendez-vous en toutes lettres : « samedi 17 octobre, départ 8 h »,
 * ou `null` tant que la date n'est pas fixée.
 */
export function rendezVousOctobreRose(): string | null {
  if (!OCTOBRE_ROSE.date) return null;
  const jour = formatDateAvecJour(OCTOBRE_ROSE.date);
  return OCTOBRE_ROSE.heureDepart === null ? jour : `${jour}, départ ${OCTOBRE_ROSE.heureDepart} h`;
}

/**
 * Ce qui identifie l'annonce telle qu'on l'a vue : l'année, et la date de
 * la sortie quand elle est fixée. Une annonce fermée ne revient pas, sauf
 * l'octobre suivant, ou quand la date est enfin connue.
 */
export function signatureOctobreRose(jour: DateISO): string {
  return `${jour.slice(0, 4)}|${OCTOBRE_ROSE.date ?? "date-a-venir"}`;
}

/** Les messages WhatsApp déjà écrits des boutons de la page. */
export const MESSAGES_WHATSAPP = {
  octobreRose: "Bonjour Bike Land, je souhaite participer à la sortie Octobre rose.",
  gbashiBike: "Bonjour Bike Land, je souhaite réserver Gbashi bike, le road trip sport du dimanche.",
  roadTrip: "Bonjour Bike Land, je souhaite réserver le road trip du samedi.",
  question: "Bonjour Bike Land, j'ai une question.",
} as const;
