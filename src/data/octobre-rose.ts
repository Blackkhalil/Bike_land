/**
 * Les sorties Octobre rose : ce qui est fixé, et ce qui s'en déduit.
 *
 * Octobre rose est le mois de sensibilisation au cancer du sein. Bike Land
 * soutient la cause par des sorties à vélo en rose, au même prix pour tous
 * les vélos : on ne choisit pas sa machine, on choisit son jour, on clique
 * et on paie. Un vélo libre du parc est attribué à chaque participant au
 * moment de l'inscription (voir `creerReservation` dans src/lib/db).
 *
 * Ce module ne dépend que des dates, pour que les offres puissent s'en
 * servir sans dépendance circulaire : la location libre ne se réserve pas
 * pendant une sortie (voir `motifHoraireLocation`). Les textes de la page et
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
   * Prix par personne payé en ligne, le même pour tous les vélos. Les frais
   * du paiement en ligne s'y ajoutent au moment de payer, comme pour toute
   * réservation du site.
   */
  prixXof: number;
  /**
   * Prix par personne en espèces, au comptoir. Pour les autres formules, le
   * comptoir retire les frais du paiement en ligne (FRAIS_PAIEMENT_EN_LIGNE_XOF
   * dans src/data/offres.ts) ; Octobre rose a son prix au comptoir écrit
   * ici, décidé par Bike Land.
   */
  prixComptoirXof: number;
  /** La tenue demandée à tous. */
  tenue: string;
  /**
   * Le circuit roulé, quand un seul est annoncé : le slug d'un itinéraire
   * de src/data/contenus.ts. Sans lui, ni les pages ni les emails ne parlent
   * d'itinéraire : en 2026, les sorties en prennent plusieurs.
   */
  itineraire?: string;
  /** Fin des inscriptions en ligne, le jour même. Au comptoir, on vend jusqu'au départ. */
  finInscriptions: Horaire;
}

/** Ce que chaque participant reçoit, offert, avec son vélo et son casque. */
export interface OffertOctobreRose {
  cocos: number;
  gateaux: number;
  eaux: number;
}

/** Ce que toutes les sorties de la campagne ont en commun. */
const SORTIE_TYPE = {
  rassemblement: "16:00",
  depart: "16:30",
  retour: "17:30",
  prixXof: 2125,
  prixComptoirXof: 2125,
  tenue: "Tout le monde en rose",
  finInscriptions: "14:00",
} as const satisfies Omit<SortieOctobreRose, "date">;

/**
 * La campagne de l'année.
 *
 * `sorties` est vide tant que rien n'est fixé : la page et l'annonce
 * disent que la date sera donnée très bientôt, et l'inscription passe par
 * WhatsApp. Remplie, chaque sortie se réserve et se paie en ligne ; le
 * client choisit son jour. Ouvrir un jour de plus, si la demande le
 * justifie, c'est ajouter une sortie à la liste.
 *
 * Une seule sortie par jour : c'est le jour qui distingue deux sorties dans
 * les réservations, les places et le tableau de bord.
 *
 * La campagne vaut pour l'octobre de `annee`, et pour lui seul : le site
 * n'annoncera pas de lui-même, l'an prochain, une sortie que personne n'a
 * décidée. Pour l'octobre suivant, changer l'année et les sorties.
 *
 * Ne pas déplacer une date une fois des inscriptions prises : elles
 * garderaient l'ancienne date et ses vélos, et les places du nouveau jour
 * les ignoreraient. Une sortie reportée se traite avec les inscrits, puis
 * dans la base. Et une sortie ne doit pas chevaucher un road trip (8 h -
 * 11 h le week-end) : le serveur refuserait alors toute inscription, plutôt
 * que d'attribuer des vélos déjà partis avec le groupe.
 */
export const OCTOBRE_ROSE: {
  annee: number;
  sorties: readonly SortieOctobreRose[];
  offertParPersonne: OffertOctobreRose;
} = {
  annee: 2026,
  sorties: [
    { date: "2026-10-24", ...SORTIE_TYPE },
    { date: "2026-10-25", ...SORTIE_TYPE },
  ],
  offertParPersonne: { cocos: 2, gateaux: 2, eaux: 2 },
};

/** La sortie de ce jour, s'il y en a une. */
export function sortieOctobreRoseDu(date: DateISO | string): SortieOctobreRose | null {
  return OCTOBRE_ROSE.sorties.find((sortie) => sortie.date === date.slice(0, 10)) ?? null;
}

/**
 * La sortie d'une réservation, retrouvée par son jour parmi celles de la
 * campagne. `null` pour une autre formule, ou pour une inscription d'une
 * campagne passée : elle garde alors les heures qu'elle a enregistrées.
 */
export function sortieDeLaReservation(reservation: {
  offre: string;
  dateDebut: string | Date;
}): SortieOctobreRose | null {
  if (reservation.offre !== "octobre-rose") return null;
  const jour =
    typeof reservation.dateDebut === "string"
      ? reservation.dateDebut
      : reservation.dateDebut.toISOString();
  return sortieOctobreRoseDu(jour);
}

/**
 * Le code sous lequel l'exploitant ouvre ou ferme l'inscription en ligne
 * d'une sortie depuis le tableau de bord, comme un créneau de road trip.
 * Fermée, la sortie s'affiche « Sold out ». La date en fait partie : chaque
 * jour s'ouvre et se ferme seul, et une sortie fermée une année ne s'ouvre
 * pas déjà « complète » l'année suivante.
 */
export function codeOctobreRose(sortie: SortieOctobreRose): string {
  return `octobre-rose-${sortie.date}`;
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
 * Ce qui est offert, pour une personne ou pour tout un groupe :
 * « 2 cocos, 2 gâteaux et 2 bouteilles d'eau ».
 */
export function texteOffertOctobreRose(personnes = 1): string {
  const { cocos, gateaux, eaux } = OCTOBRE_ROSE.offertParPersonne;
  const compte = (nombre: number, singulier: string, pluriel: string) =>
    `${nombre}${INSECABLE}${nombre > 1 ? pluriel : singulier}`;
  return (
    `${compte(cocos * personnes, "coco", "cocos")}, ` +
    `${compte(gateaux * personnes, "gâteau", "gâteaux")} et ` +
    `${compte(eaux * personnes, "bouteille d'eau", "bouteilles d'eau")}`
  );
}

/**
 * Les heures pleines qu'une sortie retient sur les vélos : du
 * rassemblement à l'heure pleine qui suit le retour, 16 h - 18 h pour un
 * rassemblement à 16 h et un retour à 17 h 30. C'est ce créneau
 * qu'enregistre la réservation, et qu'aucune location libre ne peut
 * chevaucher ce jour-là.
 */
export function creneauOctobreRose(sortie: SortieOctobreRose): {
  date: DateISO;
  heureDebut: number;
  heureFin: number;
} {
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

/** Quand les inscriptions en ligne d'une sortie se ferment, en millisecondes UTC. */
export function clotureInscriptionsOctobreRose(sortie: SortieOctobreRose): number {
  return instantDuJour(sortie, sortie.finInscriptions);
}

/** Le départ du groupe, en millisecondes UTC. */
export function departOctobreRose(sortie: SortieOctobreRose): number {
  return instantDuJour(sortie, sortie.depart);
}

/*
 * L'horloge des sorties. Tout se lit à l'heure du Bénin, jamais à celle de
 * l'appareil ni du serveur, et sans rien d'autre que les dates : ces
 * fonctions servent au navigateur (la page est en cache, l'heure limite y
 * est relue) comme au serveur, qui refait tous les contrôles.
 */

/** Sommes-nous en octobre de l'année de la campagne, à l'heure du Bénin ? */
export function estMoisOctobreRose(maintenant: Date | number): boolean {
  const mois = new Date(new Date(maintenant).getTime() + DECALAGE_BENIN_MS).toISOString().slice(0, 7);
  return mois === `${OCTOBRE_ROSE.annee}-10`;
}

/** Le groupe de cette sortie est-il parti ? */
export function sortieOctobreRosePartie(sortie: SortieOctobreRose, maintenant: Date | number): boolean {
  return new Date(maintenant).getTime() >= departOctobreRose(sortie);
}

/** Les sorties dont le groupe n'est pas encore parti, dans l'ordre des jours. */
export function sortiesOctobreRoseAVenir(maintenant: Date | number): SortieOctobreRose[] {
  return OCTOBRE_ROSE.sorties
    .filter((sortie) => !sortieOctobreRosePartie(sortie, maintenant))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** La prochaine sortie à partir, ou `null` s'il n'y en a plus (ou pas encore). */
export function prochaineSortieOctobreRose(maintenant: Date | number): SortieOctobreRose | null {
  return sortiesOctobreRoseAVenir(maintenant)[0] ?? null;
}

/**
 * La campagne est-elle en cours ? Tout octobre de son année, et jusqu'au
 * départ de la dernière sortie quand des sorties sont fixées : une fois le
 * dernier groupe parti, la page et l'annonce s'effacent sans attendre la fin
 * du mois. Sans sortie fixée, tout le mois (la date est annoncée bientôt).
 */
export function campagneOctobreRoseEnCours(maintenant: Date | number): boolean {
  if (!estMoisOctobreRose(maintenant)) return false;
  return OCTOBRE_ROSE.sorties.length === 0 || sortiesOctobreRoseAVenir(maintenant).length > 0;
}

/**
 * L'inscription en ligne à cette sortie est-elle ouverte à cet instant, à
 * l'horloge ? Il faut un prix à payer, le mois de la campagne, et l'heure
 * limite du jour (`finInscriptions`) pas encore passée. Le tableau de bord
 * peut en plus fermer la sortie (« Sold out ») : c'est
 * `octobreRoseOuvertEnLigne` qui le dit (src/lib/ouverture.ts), et les
 * places viennent de la base. Au comptoir, la sortie se vend jusqu'au départ.
 */
export function inscriptionOctobreRoseOuverte(sortie: SortieOctobreRose, maintenant: Date | number): boolean {
  return (
    sortie.prixXof > 0 &&
    estMoisOctobreRose(maintenant) &&
    new Date(maintenant).getTime() < clotureInscriptionsOctobreRose(sortie)
  );
}
