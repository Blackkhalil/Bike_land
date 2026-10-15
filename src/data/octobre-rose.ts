/**
 * La sortie Octobre rose : ce qui est fixé, et ce qui s'en déduit.
 *
 * Octobre rose est le mois de sensibilisation au cancer du sein. Bike Land
 * soutient la cause par une sortie à vélo en rose, à prix réduit, le même
 * pour tous les vélos : on ne choisit pas sa machine, on clique et on paie.
 * Un vélo libre du parc est attribué à chaque participant au moment de
 * l'inscription (voir `creerReservation` dans src/lib/db).
 *
 * Ce module ne dépend que des dates, pour que les offres puissent s'en
 * servir sans dépendance circulaire : la location libre ne se réserve pas
 * pendant la sortie (voir `motifHoraireLocation`). Les textes de la page et
 * de l'annonce sont dans src/data/produits.ts.
 */

import { DECALAGE_BENIN_MS, type DateISO } from "@/lib/dates";

/** Une heure de la journée, « HH:MM », heure du Bénin. */
type Horaire = `${number}:${number}`;

export interface SortieOctobreRose {
  /** Le jour de la sortie, AAAA-MM-JJ, heure du Bénin. */
  date: DateISO;
  /** Rassemblement au point de départ. */
  rassemblement: Horaire;
  /** Départ du groupe. */
  depart: Horaire;
  /** Retour au point de départ. */
  retour: Horaire;
  /**
   * Prix par personne payé en ligne, le même pour tous les vélos, frais du
   * paiement en ligne compris comme tous les tarifs du site. Au comptoir,
   * en espèces, ces frais en sont retirés comme pour toute vente
   * (FRAIS_PAIEMENT_EN_LIGNE_XOF dans src/data/offres.ts).
   */
  prixXof: number;
  /** La tenue demandée à tous. */
  tenue: string;
  /** Le circuit roulé : le slug d'un itinéraire de src/data/contenus.ts. */
  itineraire: string;
  /** Fin des inscriptions en ligne, le jour même. Au comptoir, on vend jusqu'au départ. */
  finInscriptions: Horaire;
}

/**
 * La campagne de l'année.
 *
 * `sortie` vaut `null` tant que rien n'est fixé : la page et l'annonce
 * disent que la date sera donnée très bientôt, et l'inscription passe par
 * WhatsApp. Remplie, la sortie se réserve et se paie en ligne.
 *
 * La campagne vaut pour l'octobre de `annee`, et pour lui seul : le site
 * n'annoncera pas de lui-même, l'an prochain, une sortie que personne n'a
 * décidée. Pour l'octobre suivant, changer l'année et la sortie.
 *
 * Ne pas déplacer la date une fois des inscriptions prises : elles
 * garderaient l'ancienne date et ses vélos, et les places du nouveau jour
 * les ignoreraient. Une sortie reportée se traite avec les inscrits, puis
 * dans la base. Et la sortie ne doit pas chevaucher un road trip (8 h -
 * 11 h le week-end) : le serveur refuserait alors toute inscription, plutôt
 * que d'attribuer des vélos déjà partis avec le groupe.
 */
export const OCTOBRE_ROSE: { annee: number; sortie: SortieOctobreRose | null } = {
  annee: 2026,
  sortie: {
    date: "2026-10-24",
    rassemblement: "16:00",
    depart: "16:30",
    retour: "18:30",
    prixXof: 1625,
    tenue: "Tout le monde en rose",
    itineraire: "route-des-peches-amazone",
    finInscriptions: "14:00",
  },
};

/**
 * Le code sous lequel l'exploitant ouvre ou ferme l'inscription en ligne
 * depuis le tableau de bord, comme un créneau de road trip. Fermée, la
 * sortie s'affiche « Sold out ». La date en fait partie : une sortie
 * fermée une année ne s'ouvre pas déjà « complète » l'année suivante.
 */
export function codeOctobreRose(sortie: SortieOctobreRose | null = OCTOBRE_ROSE.sortie): string {
  return sortie ? `octobre-rose-${sortie.date}` : "octobre-rose";
}

/**
 * Places au plus par inscription en ligne. Un participant inscrit ses
 * proches d'un seul paiement, sans retenir à lui seul la moitié du parc
 * le temps de valider sur son téléphone.
 */
export const PLACES_MAX_PAR_INSCRIPTION = 5;

/** « 16:30 » en minutes depuis minuit. */
export function minutesDe(horaire: Horaire): number {
  const [heures, minutes] = horaire.split(":").map(Number);
  return heures * 60 + minutes;
}

/** L'espace insécable : « 16 h 30 » ne se coupe jamais en fin de ligne. */
const INSECABLE = String.fromCharCode(0xa0);

/** « 16 h » ou « 16 h 30 », d'un seul tenant. */
export function formatHoraire(horaire: Horaire): string {
  const [heures, minutes] = horaire.split(":").map(Number);
  return minutes
    ? `${heures}${INSECABLE}h${INSECABLE}${String(minutes).padStart(2, "0")}`
    : `${heures}${INSECABLE}h`;
}

/**
 * Les heures pleines que la sortie retient sur les vélos : du
 * rassemblement à l'heure pleine qui suit le retour, 16 h - 19 h pour un
 * rassemblement à 16 h et un retour à 18 h 30. C'est ce créneau
 * qu'enregistre la réservation, et qu'aucune location libre ne peut
 * chevaucher ce jour-là.
 */
export function creneauOctobreRose(
  sortie: SortieOctobreRose | null = OCTOBRE_ROSE.sortie,
): { date: DateISO; heureDebut: number; heureFin: number } | null {
  if (!sortie) return null;
  return {
    date: sortie.date,
    heureDebut: Math.floor(minutesDe(sortie.rassemblement) / 60),
    heureFin: Math.ceil(minutesDe(sortie.retour) / 60),
  };
}

/** L'instant, en millisecondes UTC, d'un horaire du jour de la sortie, heure du Bénin. */
function instantDuJour(sortie: SortieOctobreRose, horaire: Horaire): number {
  return Date.parse(`${sortie.date}T00:00:00Z`) + minutesDe(horaire) * 60_000 - DECALAGE_BENIN_MS;
}

/** Quand les inscriptions en ligne se ferment, en millisecondes UTC. */
export function clotureInscriptionsOctobreRose(
  sortie: SortieOctobreRose | null = OCTOBRE_ROSE.sortie,
): number | null {
  return sortie ? instantDuJour(sortie, sortie.finInscriptions) : null;
}

/** Le départ du groupe, en millisecondes UTC. */
export function departOctobreRose(sortie: SortieOctobreRose | null = OCTOBRE_ROSE.sortie): number | null {
  return sortie ? instantDuJour(sortie, sortie.depart) : null;
}
