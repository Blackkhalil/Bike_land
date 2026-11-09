/**
 * Les contrôles communs aux trois offres de groupe (cahier des charges,
 * étape 3 : « le formulaire doit refuser tout de suite ce qui ne respecte
 * pas les conditions »), et les messages de refus, polis et simples, à
 * montrer tels quels au client.
 *
 * Chaque contrôle rend `null` quand tout va bien, sinon le refus.
 */

import type { ReglagesOffres } from "@/data/reglages-offres";
import { estDateISOValide, type DateISO } from "@/lib/dates";

import {
  dateAuBeninDe,
  dateLimiteDuWeekend,
  dureeEnClair,
  heureDe,
  heureEnClair,
  instantAuBenin,
  jourDeLaSemaine,
  joursEnClair,
  minutesDe,
  NOMS_JOURS,
} from "./calendrier";
import type { CanalVente, ChampOffre, CodeOffreGroupe, ContexteOffre, HeureMinute, Refus } from "./types";

const MINUTE_MS = 60 * 1000;

/** Le nom de l'offre en tête de phrase : « Bike for All se réserve… ». */
export const SUJETS_OFFRES: Record<CodeOffreGroupe, string> = {
  "bike-for-all": "Bike for All",
  "road-trip-groupe": "Le road trip en groupe",
  "gbashi-groupe": "Gbashi Bike",
};

const MESSAGES_SAISIE: Record<ChampOffre, string> = {
  personnes: "Indiquez le nombre de personnes, en chiffres.",
  budgetXof: "Indiquez le budget du groupe en francs, en chiffres.",
  minutes: "Indiquez la durée de vélo en minutes.",
  coco: "Choisissez le coco : aucun, petit format ou grand format.",
  gateauxParPersonne: "Indiquez le nombre de gâteaux par personne, en chiffres (0 si vous n'en voulez pas).",
  accompagnateur: "Dites-nous si vous souhaitez un accompagnateur.",
  reductionValidee: "Dites-nous si la réduction a été validée.",
  velos: "Indiquez le nombre de vélos de chaque gamme, en chiffres.",
  date: "Choisissez une date dans le calendrier.",
  depart: "Choisissez une heure de départ, par exemple 08:00.",
};

/** Le refus d'une saisie illisible, rattaché à son champ. */
export function refusSaisie(champ: ChampOffre): Refus {
  return { code: "SAISIE", champ, message: MESSAGES_SAISIE[champ] };
}

/** Un entier positif ou nul, sans perte de précision. */
export function estEntierPositif(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
}

/** « 1 vélo », « 8 vélos » : un nom compté, au singulier ou au pluriel. */
export function compte(nombre: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}

/**
 * L'instant présent, en millisecondes. Une horloge illisible est une
 * erreur du serveur, pas du client : elle lève une erreur au lieu de
 * refuser en silence toutes les réservations.
 */
export function lireMaintenant(contexte: ContexteOffre): number {
  const instant = contexte.maintenant instanceof Date ? contexte.maintenant.getTime() : contexte.maintenant;
  if (typeof instant !== "number" || !Number.isFinite(instant)) {
    throw new TypeError("Offres de groupe : l'instant présent (contexte.maintenant) est illisible.");
  }
  return instant;
}

/**
 * Le canal de la vente, « en-ligne » ou « comptoir ». Comme l'horloge, c'est
 * le serveur qui le fixe : absent ou inconnu, c'est une erreur du serveur,
 * qui lève une erreur au lieu de vendre avec ou sans les frais au hasard.
 */
export function lireCanal(contexte: ContexteOffre): CanalVente {
  const canal: unknown = contexte.canal;
  if (canal !== "en-ligne" && canal !== "comptoir") {
    throw new TypeError("Offres de groupe : le canal de vente (contexte.canal) doit valoir « en-ligne » ou « comptoir ».");
  }
  return canal;
}

/** Un nombre de vélos libres : un entier positif, zéro s'il est inconnu. */
export function velosLibres(valeur: unknown): number {
  return typeof valeur === "number" && Number.isFinite(valeur) ? Math.max(0, Math.floor(valeur)) : 0;
}

/**
 * Les options communes : les gâteaux (zéro par défaut, sans plafond). Rend
 * le refus d'une saisie illisible, ou `null`. Le mode de paiement n'est pas
 * une saisie du client : il découle du canal (contexte).
 */
export function controlerOptions(demande: { gateauxParPersonne?: unknown }): Refus | null {
  if (demande.gateauxParPersonne !== undefined && !estEntierPositif(demande.gateauxParPersonne)) {
    return refusSaisie("gateauxParPersonne");
  }
  return null;
}

/**
 * La taille du groupe : le minimum de l'offre, et au plus les vélos libres
 * ce jour-là, toutes gammes confondues (décision 10 : pas d'autre plafond).
 */
export function controlerPersonnes(
  offre: CodeOffreGroupe,
  personnes: number,
  personnesMin: number,
  velosDisponibles: number,
  champ: ChampOffre = "personnes",
): Refus | null {
  if (personnes < personnesMin) {
    return {
      code: "PERSONNES_MIN",
      champ,
      message: `${SUJETS_OFFRES[offre]} se réserve pour ${compte(personnesMin, "personne")} au moins, un vélo par personne.`,
    };
  }
  if (personnes > velosDisponibles) {
    const message =
      velosDisponibles === 0
        ? "Tous nos vélos sont déjà pris ce jour-là : choisissez un autre jour."
        : velosDisponibles < personnesMin
          ? `Il ne nous reste que ${compte(velosDisponibles, "vélo libre", "vélos libres")} ce jour-là, pas assez pour un groupe de ${compte(personnesMin, "personne")} : choisissez un autre jour.`
          : `Nous avons ${compte(velosDisponibles, "vélo libre", "vélos libres")} ce jour-là : votre groupe peut compter ${compte(velosDisponibles, "personne")} au plus.`;
    return { code: "PARC", champ, message, maximum: velosDisponibles };
  }
  return null;
}

/** La grille des départs qu'on choisit (Bike for All) : du premier au dernier départ, au pas réglé. */
export type GrilleDeparts = Pick<ReglagesOffres["bikeForAll"], "premierDepart" | "dernierDepart" | "pasMinutes">;

/**
 * En ligne, un départ se réserve s'il vient après maintenant, et au moins
 * `delaiMinimumMinutes` après. Vrai aussi pour un départ réglé à 0 minute
 * de délai : un départ à l'instant même est déjà passé.
 */
function departReservable(instantDepart: number, maintenant: number, delaiMinimumMinutes: number): boolean {
  const avantDepart = instantDepart - maintenant;
  return avantDepart > 0 && avantDepart >= delaiMinimumMinutes * MINUTE_MS;
}

/**
 * En ligne, le premier départ de la grille qu'on peut encore réserver ce
 * jour-là (la même règle que departReservable). `null` s'il n'y en a plus
 * ce jour-là. Ne regarde ni la date limite du week-end, ni l'heure de
 * retour : les contrôles qui l'appellent s'en chargent.
 */
export function premierDepartReservable(
  date: DateISO,
  maintenant: number,
  delaiMinimumMinutes: number,
  grille: GrilleDeparts,
): HeureMinute | null {
  // En minutes depuis minuit ce jour-là : la première minute qui respecte le
  // délai, et qui vient après maintenant.
  const minuit = instantAuBenin(date, "00:00");
  const auPlusTot = Math.max(
    Math.ceil((maintenant + delaiMinimumMinutes * MINUTE_MS - minuit) / MINUTE_MS),
    Math.floor((maintenant - minuit) / MINUTE_MS) + 1,
  );
  const premier = Math.ceil(Math.max(minutesDe(grille.premierDepart), auPlusTot) / grille.pasMinutes) * grille.pasMinutes;
  return premier <= minutesDe(grille.dernierDepart) ? heureDe(premier) : null;
}

/** « aujourd'hui » ou « ce jour-là », selon que la date demandée est celle du jour au Bénin. */
function ceJourLa(date: DateISO, maintenant: number): string {
  return date === dateAuBeninDe(maintenant) ? "aujourd'hui" : "ce jour-là";
}

/** La même chose en tête de phrase : « Aujourd'hui », « Ce jour-là ». */
function enTete(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Le jour et l'heure de départ face au calendrier et au canal de la vente :
 *
 *  - partout : une date lisible, pas un jour passé, un jour où l'offre part ;
 *  - en ligne seulement : la date limite du week-end (vendredi 19 h,
 *    décision 11 : pour les trois offres), un départ pas encore passé, et le
 *    délai minimum avant le départ (2 h, le temps de tout préparer) ;
 *  - au comptoir, rien de plus : la vente se saisit aussi après coup, un
 *    départ plus tôt le jour même est donc accepté.
 *
 * `joursPermis` à `null` : tous les jours (Bike for All). `grille` : les
 * départs que le client choisit (Bike for All), qui servent à lui proposer
 * le premier départ encore possible ; `null` quand l'heure est fixée (road
 * trip, Gbashi Bike).
 */
export function controlerCalendrier(
  offre: CodeOffreGroupe,
  contexte: ContexteOffre,
  depart: HeureMinute,
  joursPermis: readonly number[] | null,
  reglages: Pick<ReglagesOffres, "dateLimiteWeekend" | "delaiMinimumMinutes">,
  grille: GrilleDeparts | null,
): Refus | null {
  const maintenant = lireMaintenant(contexte);
  const canal = lireCanal(contexte);
  const { date } = contexte;
  if (typeof date !== "string" || !estDateISOValide(date)) return refusSaisie("date");

  if (date < dateAuBeninDe(maintenant)) {
    return { code: "DATE_PASSEE", champ: "date", message: "Cette date est déjà passée : choisissez un jour à venir." };
  }

  if (joursPermis && !joursPermis.includes(jourDeLaSemaine(date))) {
    const message = joursPermis.length
      ? `${SUJETS_OFFRES[offre]} a lieu ${joursEnClair(joursPermis)} : choisissez une autre date.`
      : `${SUJETS_OFFRES[offre]} n'a pas de départ prévu pour le moment.`;
    return { code: "JOUR", champ: "date", message };
  }

  if (canal === "comptoir") return null;

  const limite = dateLimiteDuWeekend(date, reglages.dateLimiteWeekend);
  if (limite !== null && maintenant > limite) {
    const { jour, heure } = reglages.dateLimiteWeekend;
    return {
      code: "DATE_LIMITE",
      champ: "date",
      message: `Les réservations du week-end se font au plus tard le ${NOMS_JOURS[jour]} à ${heureEnClair(heure)}, et ce délai est passé pour cette date : choisissez un autre jour.`,
    };
  }

  const delai = reglages.delaiMinimumMinutes;
  const instantDepart = instantAuBenin(date, depart);
  if (departReservable(instantDepart, maintenant, delai)) return null;

  // Départ passé ou trop proche. Quand le client choisit son heure, on lui
  // propose le premier départ encore possible ce jour-là, s'il en reste un.
  const premier = grille ? premierDepartReservable(date, maintenant, delai, grille) : null;
  const proposition = premier ? { champ: "depart" as const, premierDepartPossible: premier } : { champ: "date" as const };
  const jour = ceJourLa(date, maintenant);

  if (instantDepart <= maintenant) {
    if (!grille) {
      return { code: "DATE_PASSEE", champ: "date", message: "Le départ de ce jour-là est déjà passé : choisissez une autre date." };
    }
    const raison = delai > 0 ? ` : en ligne, la réservation se fait au moins ${dureeEnClair(delai)} avant le départ` : "";
    return {
      code: "DATE_PASSEE",
      message: premier
        ? `Cette heure de départ est déjà passée. ${enTete(jour)}, le premier départ encore possible est à ${heureEnClair(premier)}${raison}.`
        : `Cette heure de départ est déjà passée, et il n'y a plus de départ possible ${jour} : choisissez un autre jour.`,
      ...proposition,
    };
  }

  const regle = `En ligne, la réservation se fait au moins ${dureeEnClair(delai)} avant le départ, le temps de tout préparer`;
  return {
    code: "DELAI",
    message: !grille
      ? `${regle} : pour ${jour}, c'est trop tard. Choisissez une autre date.`
      : premier
        ? `${regle}. ${enTete(jour)}, le premier départ encore possible est à ${heureEnClair(premier)}.`
        : `${regle} : il n'y a plus de départ possible ${jour}. Choisissez un autre jour.`,
    ...proposition,
  };
}

/** « au quart d'heure » : le pas des départs, dans une phrase. */
function pasDesDeparts(pas: number): string {
  if (pas === 15) return "au quart d'heure";
  if (pas === 30) return "à la demi-heure";
  return `toutes les ${pas} minutes`;
}

/** Le départ d'un Bike for All : entre le premier et le dernier départ, au pas réglé (décision 11). */
export function controlerDepart(depart: HeureMinute, reglages: Pick<ReglagesOffres, "bikeForAll">): Refus | null {
  const { premierDepart, dernierDepart, pasMinutes } = reglages.bikeForAll;
  const minutes = minutesDe(depart);
  if (minutes < minutesDe(premierDepart) || minutes > minutesDe(dernierDepart) || minutes % pasMinutes !== 0) {
    return {
      code: "HEURE",
      champ: "depart",
      message: `Les départs se font de ${heureEnClair(premierDepart)} à ${heureEnClair(dernierDepart)}, ${pasDesDeparts(pasMinutes)}.`,
    };
  }
  return null;
}

/**
 * Le dernier départ qui rentre à l'heure pour cette durée : sur la grille
 * des départs, au plus tard au dernier départ réglé, et pas avant
 * `auPlusTot` quand il est donné (en ligne : le premier départ encore
 * réservable ce jour-là). `null` s'il n'y en a aucun.
 */
export function dernierDepartPour(
  minutesDeVelo: number,
  reglages: Pick<ReglagesOffres, "bikeForAll">,
  auPlusTot: HeureMinute | null = null,
): HeureMinute | null {
  const { premierDepart, dernierDepart, retourAuPlusTard, pasMinutes } = reglages.bikeForAll;
  const auPlusTard = Math.min(minutesDe(dernierDepart), minutesDe(retourAuPlusTard) - minutesDeVelo);
  const surLaGrille = Math.floor(auPlusTard / pasMinutes) * pasMinutes;
  const plancher = Math.max(0, minutesDe(premierDepart), auPlusTot === null ? 0 : minutesDe(auPlusTot));
  return surLaGrille >= plancher ? heureDe(surLaGrille) : null;
}

/**
 * Le retour d'un Bike for All : au plus tard à l'heure réglée (22 h). Le
 * message propose le dernier départ possible, ou une demande plus courte.
 * En ligne, ce départ doit aussi respecter le délai minimum : s'il est déjà
 * trop tard pour lui, le message le dit et propose un autre jour.
 */
export function controlerRetour(
  depart: HeureMinute,
  minutesDeVelo: number,
  mode: "budget" | "duree",
  reglages: Pick<ReglagesOffres, "bikeForAll" | "delaiMinimumMinutes">,
  contexte: ContexteOffre,
): Refus | null {
  const { retourAuPlusTard } = reglages.bikeForAll;
  if (minutesDe(depart) + minutesDeVelo <= minutesDe(retourAuPlusTard)) return null;

  const maintenant = lireMaintenant(contexte);
  const enLigne = lireCanal(contexte) === "en-ligne";
  // Au comptoir, tout départ de la grille ; en ligne, pas avant le délai minimum.
  const premierPermis = enLigne
    ? premierDepartReservable(contexte.date, maintenant, reglages.delaiMinimumMinutes, reglages.bikeForAll)
    : reglages.bikeForAll.premierDepart;
  const debut =
    mode === "budget"
      ? `Votre budget offre ${dureeEnClair(minutesDeVelo)} de vélo :`
      : `Avec ${dureeEnClair(minutesDeVelo)} de vélo,`;
  const possible = premierPermis === null ? null : dernierDepartPour(minutesDeVelo, reglages, premierPermis);
  if (possible) {
    return {
      code: "HEURE",
      champ: "depart",
      message: `${debut} le retour se ferait après ${heureEnClair(retourAuPlusTard)}, l'heure limite. Choisissez un départ au plus tard à ${heureEnClair(possible)}.`,
      dernierDepartPossible: possible,
    };
  }
  const champ = mode === "budget" ? "budgetXof" : "minutes";
  const plusCourt = mode === "budget" ? "un budget plus petit" : "une durée plus courte";
  if (dernierDepartPour(minutesDeVelo, reglages) === null) {
    return {
      code: "HEURE",
      champ,
      message: `${debut} le retour se ferait après ${heureEnClair(retourAuPlusTard)}, l'heure limite, même au premier départ. Choisissez ${plusCourt}.`,
    };
  }
  // Un départ plus tôt rentrerait à l'heure, mais il est trop tard pour le réserver en ligne.
  return {
    code: "HEURE",
    champ,
    message: `${debut} le retour se ferait après ${heureEnClair(retourAuPlusTard)}, l'heure limite, et il est trop tard pour réserver un départ plus tôt ${ceJourLa(contexte.date, maintenant)}. Choisissez ${plusCourt}, ou un autre jour.`,
  };
}
