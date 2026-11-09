/**
 * Les contrôles communs aux trois offres de groupe (cahier des charges,
 * étape 3 : « le formulaire doit refuser tout de suite ce qui ne respecte
 * pas les conditions »), et les messages de refus, polis et simples, à
 * montrer tels quels au client.
 *
 * Chaque contrôle rend `null` quand tout va bien, sinon le refus.
 */

import type { ReglagesOffres } from "@/data/reglages-offres";
import { estDateISOValide } from "@/lib/dates";

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
import type { ChampOffre, CodeOffreGroupe, ContexteOffre, HeureMinute, Refus } from "./types";

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
  paiementElectronique: "Précisez le mode de paiement : en ligne ou en espèces.",
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

/** Un nombre de vélos libres : un entier positif, zéro s'il est inconnu. */
export function velosLibres(valeur: unknown): number {
  return typeof valeur === "number" && Number.isFinite(valeur) ? Math.max(0, Math.floor(valeur)) : 0;
}

/**
 * Les options communes : gâteaux (zéro par défaut, sans plafond), mode de
 * paiement (toujours précisé). Rend le premier champ illisible, ou `null`.
 */
export function controlerOptions(demande: { gateauxParPersonne?: unknown; paiementElectronique?: unknown }): Refus | null {
  if (demande.gateauxParPersonne !== undefined && !estEntierPositif(demande.gateauxParPersonne)) {
    return refusSaisie("gateauxParPersonne");
  }
  if (typeof demande.paiementElectronique !== "boolean") return refusSaisie("paiementElectronique");
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

/**
 * Le jour et l'heure de départ face au calendrier : départ déjà passé, jour
 * où l'offre ne part pas, réservation du week-end après la date limite
 * (vendredi 19 h, décision 11 : pour les trois offres).
 *
 * `joursPermis` à `null` : tous les jours (Bike for All). `heureChoisie` :
 * le client a choisi l'heure (Bike for All), sinon elle est fixée.
 */
export function controlerCalendrier(
  offre: CodeOffreGroupe,
  contexte: ContexteOffre,
  depart: HeureMinute,
  joursPermis: readonly number[] | null,
  reglages: Pick<ReglagesOffres, "dateLimiteWeekend">,
  heureChoisie: boolean,
): Refus | null {
  const maintenant = lireMaintenant(contexte);
  const { date } = contexte;
  if (typeof date !== "string" || !estDateISOValide(date)) return refusSaisie("date");

  if (instantAuBenin(date, depart) <= maintenant) {
    const message =
      date < dateAuBeninDe(maintenant)
        ? "Cette date est déjà passée : choisissez un jour à venir."
        : heureChoisie
          ? "Cette heure de départ est déjà passée : choisissez-en une plus tardive, ou un autre jour."
          : "Le départ de ce jour-là est déjà passé : choisissez une autre date.";
    return { code: "DATE_PASSEE", champ: heureChoisie && date >= dateAuBeninDe(maintenant) ? "depart" : "date", message };
  }

  if (joursPermis && !joursPermis.includes(jourDeLaSemaine(date))) {
    const message = joursPermis.length
      ? `${SUJETS_OFFRES[offre]} a lieu ${joursEnClair(joursPermis)} : choisissez une autre date.`
      : `${SUJETS_OFFRES[offre]} n'a pas de départ prévu pour le moment.`;
    return { code: "JOUR", champ: "date", message };
  }

  const limite = dateLimiteDuWeekend(date, reglages.dateLimiteWeekend);
  if (limite !== null && maintenant > limite) {
    const { jour, heure } = reglages.dateLimiteWeekend;
    return {
      code: "DATE_LIMITE",
      champ: "date",
      message: `Les réservations du week-end se font au plus tard le ${NOMS_JOURS[jour]} à ${heureEnClair(heure)}, et ce délai est passé pour cette date : choisissez un autre jour.`,
    };
  }
  return null;
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
 * des départs, au plus tard au dernier départ réglé. `null` s'il n'y en a
 * aucun.
 */
export function dernierDepartPour(minutesDeVelo: number, reglages: Pick<ReglagesOffres, "bikeForAll">): HeureMinute | null {
  const { premierDepart, dernierDepart, retourAuPlusTard, pasMinutes } = reglages.bikeForAll;
  const auPlusTard = Math.min(minutesDe(dernierDepart), minutesDe(retourAuPlusTard) - minutesDeVelo);
  const surLaGrille = Math.floor(auPlusTard / pasMinutes) * pasMinutes;
  return surLaGrille >= minutesDe(premierDepart) && surLaGrille >= 0 ? heureDe(surLaGrille) : null;
}

/**
 * Le retour d'un Bike for All : au plus tard à l'heure réglée (22 h). Le
 * message propose le dernier départ possible, ou une demande plus courte.
 */
export function controlerRetour(
  depart: HeureMinute,
  minutesDeVelo: number,
  mode: "budget" | "duree",
  reglages: Pick<ReglagesOffres, "bikeForAll">,
): Refus | null {
  const { retourAuPlusTard } = reglages.bikeForAll;
  if (minutesDe(depart) + minutesDeVelo <= minutesDe(retourAuPlusTard)) return null;
  const debut =
    mode === "budget"
      ? `Votre budget offre ${dureeEnClair(minutesDeVelo)} de vélo :`
      : `Avec ${dureeEnClair(minutesDeVelo)} de vélo,`;
  const possible = dernierDepartPour(minutesDeVelo, reglages);
  if (possible) {
    return {
      code: "HEURE",
      champ: "depart",
      message: `${debut} le retour se ferait après ${heureEnClair(retourAuPlusTard)}, l'heure limite. Choisissez un départ au plus tard à ${heureEnClair(possible)}.`,
      dernierDepartPossible: possible,
    };
  }
  return {
    code: "HEURE",
    champ: mode === "budget" ? "budgetXof" : "minutes",
    message: `${debut} le retour se ferait après ${heureEnClair(retourAuPlusTard)}, l'heure limite, même au premier départ. Choisissez ${mode === "budget" ? "un budget plus petit" : "une durée plus courte"}.`,
  };
}
