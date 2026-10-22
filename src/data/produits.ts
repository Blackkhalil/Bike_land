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
 *  - **Octobre rose** : des sorties aux couleurs d'Octobre rose, le mois de
 *    sensibilisation au cancer du sein, fixées dans src/data/octobre-rose.ts.
 *    Elles se réservent et se paient en ligne sur leur propre page,
 *    /octobre-rose : on choisit son jour, pas son vélo. Elles n'existent
 *    qu'en octobre : la carte de la page, l'annonce du site et l'inscription
 *    s'effacent d'elles-mêmes au départ du dernier groupe, heure du Bénin,
 *    sans redéploiement.
 *
 * Les prix ne sont pas ici : ils viennent de src/data/offres.ts, et celui
 * d'Octobre rose de src/data/octobre-rose.ts.
 */

import {
  campagneOctobreRoseEnCours,
  formatHoraire,
  inscriptionOctobreRoseOuverte,
  OCTOBRE_ROSE,
  type SortieOctobreRose,
} from "@/data/octobre-rose";
import type { CodeCreneau } from "@/data/offres";
import type { DateISO } from "@/lib/dates";
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
 * tout octobre de l'année de la campagne, et jusqu'au départ du dernier
 * groupe quand les sorties sont fixées. Une fois le dernier groupe parti,
 * la carte et l'annonce s'effacent sans attendre la fin du mois. Appelée
 * dans le navigateur, par l'annonce et par les pages, et par les pages à
 * chacune de leurs régénérations.
 */
export function octobreRoseEnCours(maintenant: Date): boolean {
  return campagneOctobreRoseEnCours(maintenant);
}

/**
 * L'inscription en ligne est-elle ouverte à cet instant, pour au moins un
 * jour ? Il faut une sortie fixée, avec un prix à payer, et l'heure de fin
 * des inscriptions de ce jour pas encore passée. Le tableau de bord peut en
 * plus fermer un jour (« Sold out ») : c'est `lireOuverture` qui le dit,
 * pas cette fonction.
 */
export function inscriptionsOctobreRoseOuvertes(maintenant: Date): boolean {
  return OCTOBRE_ROSE.sorties.some((sortie) => inscriptionOctobreRoseOuverte(sortie, maintenant));
}

/** « a », « a et b », « a, b et c ». */
function enumerer(elements: string[]): string {
  return elements.length < 2
    ? (elements[0] ?? "")
    : `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`;
}

/**
 * Les jours des sorties, le mois dit une seule fois quand ils tombent dans
 * le même : « samedi 24 et dimanche 25 octobre ».
 */
function joursDesSorties(): string | null {
  const sorties = OCTOBRE_ROSE.sorties;
  if (sorties.length === 0) return null;
  const jours = sorties.map((sortie) => formatDateAvecJour(sortie.date));
  const memeMois = sorties.every((sortie) => sortie.date.slice(0, 7) === sorties[0].date.slice(0, 7));
  if (!memeMois) return enumerer(jours);
  // « samedi 24 octobre » perd son mois, sauf le dernier jour.
  return enumerer(jours.map((jour, i) => (i < jours.length - 1 ? jour.replace(/\s+\S+$/u, "") : jour)));
}

/** « Samedi 24 et dimanche 25 octobre » : les jours des sorties, avec leur majuscule. */
export function jourOctobreRose(): string | null {
  const jours = joursDesSorties();
  return jours ? jours.charAt(0).toUpperCase() + jours.slice(1) : null;
}

/** « Samedi 24 octobre » : le jour d'une sortie, avec sa majuscule. */
export function jourDeLaSortie(sortie: SortieOctobreRose): string {
  const jour = formatDateAvecJour(sortie.date);
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

/** « 16 h 30 - 17 h 30 » : du départ au retour d'une sortie. */
export function horaireDeLaSortie(sortie: SortieOctobreRose): string {
  return `${formatHoraire(sortie.depart)} - ${formatHoraire(sortie.retour)}`;
}

/**
 * Le rendez-vous en toutes lettres : « samedi 24 et dimanche 25 octobre,
 * rassemblement à 16 h, départ 16 h 30 », ou `null` tant que rien n'est
 * fixé. Des sorties aux horaires différents sont dites une à une.
 */
export function rendezVousOctobreRose(): string | null {
  const sorties = OCTOBRE_ROSE.sorties;
  if (sorties.length === 0) return null;
  const horaires = (sortie: SortieOctobreRose) =>
    `rassemblement à ${formatHoraire(sortie.rassemblement)}, départ ${formatHoraire(sortie.depart)}`;
  const memesHoraires = sorties.every((sortie) => horaires(sortie) === horaires(sorties[0]));
  if (memesHoraires) return `${joursDesSorties()}, ${horaires(sorties[0])}`;
  return sorties.map((sortie) => `${formatDateAvecJour(sortie.date)}, ${horaires(sortie)}`).join(" ; ");
}

/**
 * Le tarif en toutes lettres : « 2 125 FCFA par personne », « Gratuit »,
 * ou `null` tant qu'il n'est pas fixé. Si les jours n'ont pas le même
 * prix, le moins cher est annoncé : « dès … ».
 */
export function tarifOctobreRose(): string | null {
  const prix = OCTOBRE_ROSE.sorties.map((sortie) => sortie.prixXof);
  if (prix.length === 0) return null;
  const minimum = Math.min(...prix);
  if (minimum === 0 && prix.every((p) => p === 0)) return "Gratuit";
  return `${prix.every((p) => p === minimum) ? "" : "dès "}${formatXof(minimum)} par personne`;
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
