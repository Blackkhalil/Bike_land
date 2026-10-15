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
 *    sensibilisation au cancer du sein, fixée dans src/data/octobre-rose.ts.
 *    Elle se réserve et se paie en ligne sur sa propre page, /octobre-rose,
 *    sans choix de vélo. Elle n'existe qu'en octobre : la carte de la page,
 *    l'annonce du site et l'inscription s'effacent d'elles-mêmes au départ
 *    du groupe, heure du Bénin, sans redéploiement.
 *
 * Les prix ne sont pas ici : ils viennent de src/data/offres.ts, et celui
 * d'Octobre rose de src/data/octobre-rose.ts.
 */

import {
  clotureInscriptionsOctobreRose,
  departOctobreRose,
  formatHoraire,
  OCTOBRE_ROSE,
} from "@/data/octobre-rose";
import type { CodeCreneau } from "@/data/offres";
import { DECALAGE_BENIN_MS, type DateISO } from "@/lib/dates";
import { formatDateAvecJour, formatXof } from "@/lib/format";

/** Le créneau qui porte Gbashi bike, et celui du road trip du samedi. */
export const CRENEAU_GBASHI_BIKE: CodeCreneau = "dimanche-matin";
export const CRENEAU_ROAD_TRIP: CodeCreneau = "samedi-matin";

/**
 * Ce que le visiteur a choisi sur la page Nos produits, retenu le temps de
 * la visite : un créneau (« dimanche-matin » pour Gbashi bike) ou la
 * location libre. L'encart de réservation de la fiche vélo s'ouvre dessus,
 * sans quoi il retomberait sur le road trip du samedi.
 */
export const CLE_CHOIX_PRODUIT = "bikeland.choix-produit";
export type ChoixProduit = CodeCreneau | "location-libre";

/**
 * Octobre rose est-il en cours à cet instant ?
 *
 * Jugé à l'heure du Bénin, jamais à celle de l'appareil ni du serveur :
 * tout octobre de l'année de la campagne, et jusqu'au départ du groupe
 * quand la sortie est fixée. Une fois le groupe parti, la carte et
 * l'annonce s'effacent sans attendre la fin du mois. Appelée dans le
 * navigateur, par l'annonce et par les pages, et par les pages à chacune
 * de leurs régénérations.
 */
export function octobreRoseEnCours(maintenant: Date): boolean {
  const mois = new Date(maintenant.getTime() + DECALAGE_BENIN_MS).toISOString().slice(0, 7);
  if (mois !== `${OCTOBRE_ROSE.annee}-10`) return false;
  const depart = departOctobreRose();
  return depart === null || maintenant.getTime() < depart;
}

/**
 * L'inscription en ligne est-elle ouverte à cet instant ? Il faut une
 * sortie fixée, avec un prix à payer, et l'heure de fin des inscriptions
 * pas encore passée. Le tableau de bord peut en plus la fermer (« Sold
 * out ») : c'est `lireOuverture` qui le dit, pas cette fonction.
 */
export function inscriptionsOctobreRoseOuvertes(maintenant: Date): boolean {
  const cloture = clotureInscriptionsOctobreRose();
  return (
    cloture !== null &&
    (OCTOBRE_ROSE.sortie?.prixXof ?? 0) > 0 &&
    octobreRoseEnCours(maintenant) &&
    maintenant.getTime() < cloture
  );
}

/** « Samedi 24 octobre » : le jour de la sortie, avec sa majuscule. */
export function jourOctobreRose(): string | null {
  const sortie = OCTOBRE_ROSE.sortie;
  if (!sortie) return null;
  const jour = formatDateAvecJour(sortie.date);
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

/**
 * Le rendez-vous en toutes lettres : « samedi 24 octobre, rassemblement à
 * 16 h, départ 16 h 30 », ou `null` tant que la sortie n'est pas fixée.
 */
export function rendezVousOctobreRose(): string | null {
  const sortie = OCTOBRE_ROSE.sortie;
  if (!sortie) return null;
  return (
    `${formatDateAvecJour(sortie.date)}, rassemblement à ${formatHoraire(sortie.rassemblement)}, ` +
    `départ ${formatHoraire(sortie.depart)}`
  );
}

/**
 * Le tarif en toutes lettres : « 1 625 FCFA par personne », « Gratuit »,
 * ou `null` tant qu'il n'est pas fixé.
 */
export function tarifOctobreRose(): string | null {
  const sortie = OCTOBRE_ROSE.sortie;
  if (!sortie) return null;
  return sortie.prixXof === 0 ? "Gratuit" : `${formatXof(sortie.prixXof)} par personne`;
}

/**
 * Ce qui identifie l'annonce telle qu'on l'a vue : l'année, et la date de
 * la sortie quand elle est fixée. Une annonce fermée ne revient pas, sauf
 * quand la date est enfin connue, ou pour une nouvelle campagne.
 */
export function signatureOctobreRose(jour: DateISO): string {
  return `${jour.slice(0, 4)}|${OCTOBRE_ROSE.sortie?.date ?? "date-a-venir"}`;
}

/**
 * « Plus qu'une place. », « Plus que 3 places. », « 9 places disponibles. »
 * Une espace insécable lie le nombre au mot « places » : le « 9 » ne reste
 * plus seul en bout de ligne.
 */
export function placesRestantes(places: number): string {
  if (places === 1) return "Plus qu'une place.";
  return places <= 5 ? `Plus que ${places} places.` : `${places} places disponibles.`;
}

/** Les messages WhatsApp déjà écrits des boutons de la page. */
export const MESSAGES_WHATSAPP = {
  octobreRose: "Bonjour Bike Land, je souhaite participer à la sortie Octobre rose.",
  gbashiBike: "Bonjour Bike Land, je souhaite réserver Gbashi bike, le road trip sport du dimanche.",
  roadTrip: "Bonjour Bike Land, je souhaite réserver le road trip du samedi.",
  question: "Bonjour Bike Land, j'ai une question.",
} as const;
