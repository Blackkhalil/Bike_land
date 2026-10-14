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

import { heureAuBenin, type CodeCreneau } from "@/data/offres";
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
 * La sortie Octobre rose, telle qu'elle est fixée.
 *
 * Tant qu'une valeur vaut `null`, la page et l'annonce disent qu'elle sera
 * donnée très bientôt, plutôt que d'inventer une date ou un prix. Pour
 * publier la sortie, il suffit de remplir ces champs : la carte et
 * l'annonce les affichent, et l'annonce s'ouvre une fois de plus chez ceux
 * qui l'avaient fermée, puisqu'elle a du nouveau à leur dire.
 *
 * Une fois la sortie partie (à son heure, ou le soir de sa date si
 * l'heure manque), la carte et l'annonce s'effacent sans attendre la fin
 * du mois.
 *
 * La campagne vaut pour l'octobre de `annee`, et pour lui seul : le site
 * n'annoncera pas de lui-même, l'an prochain, une sortie que personne n'a
 * décidée. Pour l'octobre suivant, changer l'année et la date.
 */
export const OCTOBRE_ROSE: {
  /** L'année de la campagne. */
  annee: number;
  /** Le jour de la sortie, AAAA-MM-JJ. */
  date: DateISO | null;
  /** L'heure du départ, heure du Bénin. */
  heureDepart: number | null;
  /** Le prix par personne, en FCFA ; 0 pour une sortie gratuite. */
  prixXof: number | null;
} = {
  annee: 2026,
  date: null,
  heureDepart: null,
  prixXof: null,
};

/**
 * Octobre rose est-il en cours à cet instant ?
 *
 * Jugé à l'heure du Bénin (`heureAuBenin`), jamais à celle de l'appareil
 * ni du serveur : tout octobre de l'année de la campagne, et jusqu'au
 * départ de la sortie quand il est fixé. Appelée dans le navigateur, par
 * l'annonce et par la page, et par la page à chacune de ses régénérations.
 */
export function octobreRoseEnCours(maintenant: Date): boolean {
  const ici = heureAuBenin(maintenant);
  if (ici.date.slice(0, 7) !== `${OCTOBRE_ROSE.annee}-10`) return false;
  const { date, heureDepart } = OCTOBRE_ROSE;
  if (date === null || ici.date < date) return true;
  if (ici.date > date) return false;
  // Le jour même : jusqu'au départ, ou toute la journée si l'heure manque.
  return heureDepart === null || ici.heure < heureDepart;
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
 * Le tarif en toutes lettres : « Gratuit », « 3 000 FCFA par personne »,
 * ou `null` tant qu'il n'est pas fixé.
 */
export function tarifOctobreRose(): string | null {
  if (OCTOBRE_ROSE.prixXof === null) return null;
  return OCTOBRE_ROSE.prixXof === 0 ? "Gratuit" : `${formatXof(OCTOBRE_ROSE.prixXof)} par personne`;
}

/**
 * Ce qui identifie l'annonce telle qu'on l'a vue : l'année, et la date de
 * la sortie quand elle est fixée. Une annonce fermée ne revient pas, sauf
 * quand la date est enfin connue, ou pour une nouvelle campagne.
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
