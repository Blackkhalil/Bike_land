/**
 * Padel bike en ligne : la page /padel-bike, où l'on réserve et paie sa
 * sortie (décision de l'exploitant, 9 novembre 2026). On pédale ensemble
 * jusqu'au terrain de padel, puis on joue au padel ; les vélos sont
 * attribués d'office, toutes gammes confondues, un par personne.
 *
 * Tout ce qui règle la sortie se change depuis l'administration (page
 * « Réglages des produits », src/data/reglages.ts) : l'heure du départ, le
 * soir à 18 h 30 au lancement, et celle du retour, les jours, le prix, le
 * nombre de personnes, la date d'ouverture, le délai de réservation. La
 * sortie part certains jours seulement, que l'équipe programme elle-même :
 * des jours de chaque semaine, des dates une à une, ou les deux. Les règles
 * ci-dessous reçoivent ces réglages en paramètre.
 *
 * Avant l'ouverture (le vendredi 20 novembre 2026 au lancement), la page
 * présente la sortie et renvoie vers WhatsApp, et le serveur refuse toute
 * réservation en ligne. Le jour venu, tout s'ouvre seul, à minuit heure du
 * Bénin, sans redéploiement. Le comptoir, lui, vend déjà.
 */

import { heureAuBenin, motifHoraireLocation } from "@/data/offres";
import { blocPadel, formatHeureMinute, minutesDe, programmeEnClair, type ReglagesPadel } from "@/data/reglages";
import { ajouterJours, DECALAGE_BENIN_MS, type DateISO } from "@/lib/dates";
import { formatDateAvecJour } from "@/lib/format";

/**
 * Le code sous lequel le tableau de bord ouvre et ferme la réservation en
 * ligne de Padel bike, comme un créneau de road trip. Ouverte tant que
 * l'exploitant n'y a pas touché.
 */
export const CODE_PADEL_BIKE = "padel-bike";

/** On réserve jusqu'à soixante jours à l'avance, comme au comptoir. */
export const JOURS_RESERVABLES_PADEL = 60;

/** La réservation en ligne de Padel bike est-elle ouverte, à l'heure du Bénin ? */
export function padelBikeOuvert(reglages: Pick<ReglagesPadel, "ouverture">, maintenant: Date | number = new Date()): boolean {
  return heureAuBenin(new Date(maintenant)).date >= reglages.ouverture;
}

/** L'instant de l'ouverture, minuit heure du Bénin, en millisecondes : la page s'y ouvre d'elle-même. */
export function instantOuverturePadel(reglages: Pick<ReglagesPadel, "ouverture">): number {
  return Date.parse(`${reglages.ouverture}T00:00:00Z`) - DECALAGE_BENIN_MS;
}

/** « vendredi 20 novembre » : le jour de l'ouverture, en toutes lettres. */
export function jourOuverturePadel(reglages: Pick<ReglagesPadel, "ouverture">): string {
  return formatDateAvecJour(reglages.ouverture);
}

/** « 18 h 30 » : l'heure du départ. */
export function horairePadel(reglages: Pick<ReglagesPadel, "depart">): string {
  return formatHeureMinute(reglages.depart);
}

/** « 18 h 30 - 22 h 30 » : du départ au retour des vélos. */
export function plageHorairePadel(reglages: Pick<ReglagesPadel, "depart" | "retour">): string {
  return `${formatHeureMinute(reglages.depart)} - ${formatHeureMinute(reglages.retour)}`;
}

/** L'instant du départ ce jour-là, heure du Bénin, en millisecondes UTC. */
export function instantDepartPadel(reglages: Pick<ReglagesPadel, "depart">, date: DateISO): number {
  return Date.parse(`${date}T00:00:00Z`) + minutesDe(reglages.depart) * 60_000 - DECALAGE_BENIN_MS;
}

/** Quand la réservation en ligne de ce départ se ferme : le délai réglé avant le départ. */
export function cloturePadel(reglages: Pick<ReglagesPadel, "depart" | "clotureHeuresAvant">, date: DateISO): number {
  return instantDepartPadel(reglages, date) - reglages.clotureHeuresAvant * 3_600_000;
}

/** Ce jour-là, les vélos sont-ils pris par une autre sortie (road trip, Octobre rose) aux heures de Padel bike ? */
function departEnConflit(reglages: ReglagesPadel, date: DateISO): boolean {
  const bloc = blocPadel(reglages);
  // L'instant zéro : seuls les chevauchements comptent ici, le délai de
  // réservation se vérifie à part.
  return motifHoraireLocation(date, bloc.heureDebut, bloc.heureFin - bloc.heureDebut, 0) !== null;
}

/** Ce jour est-il programmé : un jour de chaque semaine coché, ou une date ajoutée ? */
export function jourProgrammePadel(reglages: Pick<ReglagesPadel, "jours" | "dates">, date: DateISO): boolean {
  return reglages.jours.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) || reglages.dates.includes(date);
}

/** Padel bike part-il ce jour-là ? Un jour programmé, sans autre sortie sur ses heures. */
export function departPadelCeJour(reglages: ReglagesPadel, date: DateISO): boolean {
  return jourProgrammePadel(reglages, date) && !departEnConflit(reglages, date);
}

/** « ven. 21 nov. » : un jour de départ, en bref. */
const formatteurJourCourt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export function jourCourtPadel(date: DateISO): string {
  return formatteurJourCourt.format(new Date(`${date}T12:00:00Z`));
}

/**
 * Les prochains départs, pour les annoncer : les jours programmés des
 * soixante prochains jours, à partir de l'ouverture, dont l'heure n'est pas
 * passée. Sans le délai de réservation : on les dit même quand ils ne se
 * réservent plus en ligne.
 */
export function prochainsDepartsPadel(
  reglages: ReglagesPadel,
  maintenant: Date | number = new Date(),
  combien = 3,
): DateISO[] {
  const instant = new Date(maintenant).getTime();
  const ici = heureAuBenin(new Date(instant)).date;
  const dernier = ajouterJours(ici, JOURS_RESERVABLES_PADEL);
  const departs: DateISO[] = [];
  for (let jour = ici > reglages.ouverture ? ici : reglages.ouverture; jour <= dernier && departs.length < combien; jour = ajouterJours(jour, 1)) {
    if (departPadelCeJour(reglages, jour) && instantDepartPadel(reglages, jour) > instant) departs.push(jour);
  }
  return departs;
}

/**
 * Quand la sortie part, pour les repères des pages : « Le samedi et le
 * dimanche, 18 h 30 - 22 h 30 » quand seuls des jours de chaque semaine sont
 * programmés ; sinon les prochains départs, « Ven. 21 nov., sam. 29 nov.,
 * 18 h 30 - 22 h 30 » ; « Dates bientôt annoncées » quand rien n'est
 * programmé.
 */
export function quandPadel(reglages: ReglagesPadel, maintenant: Date | number = new Date()): string {
  const plage = plageHorairePadel(reglages);
  const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
  if (reglages.dates.length === 0 && reglages.jours.length > 0) return `${majuscule(programmeEnClair(reglages))}, ${plage}`;
  const prochains = prochainsDepartsPadel(reglages, maintenant);
  if (prochains.length === 0) return `Dates bientôt annoncées, ${plage}`;
  return `${majuscule(prochains.map(jourCourtPadel).join(", "))}, ${plage}`;
}

/**
 * Les jours qu'on peut encore réserver en ligne : les jours de départ des
 * soixante prochains jours dont la réservation n'est pas close, à partir
 * de l'ouverture. Aucun avant l'ouverture.
 */
export function joursPadelReservables(reglages: ReglagesPadel, maintenant: Date | number = new Date()): DateISO[] {
  if (!padelBikeOuvert(reglages, maintenant)) return [];
  const instant = new Date(maintenant).getTime();
  const ici = heureAuBenin(new Date(instant)).date;
  const dernier = ajouterJours(ici, JOURS_RESERVABLES_PADEL);
  const jours: DateISO[] = [];
  for (let jour = ici > reglages.ouverture ? ici : reglages.ouverture; jour <= dernier; jour = ajouterJours(jour, 1)) {
    if (departPadelCeJour(reglages, jour) && cloturePadel(reglages, jour) > instant) jours.push(jour);
  }
  return jours;
}

/**
 * Le prochain instant où ce qu'on peut réserver change : l'ouverture, puis
 * la clôture du premier jour proposé. La page s'y met à jour seule.
 */
export function prochainChangementPadel(reglages: ReglagesPadel, maintenant: Date | number = new Date()): number | undefined {
  const instant = new Date(maintenant).getTime();
  const ouverture = instantOuverturePadel(reglages);
  if (instant < ouverture) return ouverture;
  const premier = joursPadelReservables(reglages, instant)[0];
  return premier ? cloturePadel(reglages, premier) : undefined;
}

/** « 3 h avant le départ », « à l'heure du départ » : le délai de réservation, en clair. */
export function delaiPadelEnClair(reglages: Pick<ReglagesPadel, "clotureHeuresAvant">): string {
  return reglages.clotureHeuresAvant > 0
    ? `jusqu'à ${reglages.clotureHeuresAvant}${String.fromCharCode(0xa0)}h avant le départ`
    : "jusqu'à l'heure du départ";
}

/** Pourquoi un départ ne se réserve pas en ligne : fermé avant l'ouverture, ou le jour. */
export interface RefusPadel {
  code: "FERME" | "DATE";
  message: string;
}

/**
 * Pourquoi ce jour ne se réserve pas en ligne, ou `null` : le serveur
 * l'appelle avant toute écriture, le formulaire ne propose que les bons.
 * Le réglage du tableau de bord, le nombre de personnes et les vélos
 * libres se vérifient à part.
 */
export function motifRefusPadel(
  reglages: ReglagesPadel,
  date: DateISO,
  maintenant: Date | number = new Date(),
): RefusPadel | null {
  if (!padelBikeOuvert(reglages, maintenant)) {
    return {
      code: "FERME",
      message: `Padel bike se réserve en ligne à partir du ${jourOuverturePadel(reglages)}. D'ici là, écrivez-nous sur WhatsApp.`,
    };
  }
  const instant = new Date(maintenant).getTime();
  const ici = heureAuBenin(new Date(instant)).date;
  if (date < ici) return { code: "DATE", message: "Cette date est passée. Choisissez un autre jour." };
  if (date > ajouterJours(ici, JOURS_RESERVABLES_PADEL)) {
    return {
      code: "DATE",
      message: `Padel bike se réserve jusqu'à ${JOURS_RESERVABLES_PADEL} jours à l'avance. Choisissez une date plus proche.`,
    };
  }
  if (!jourProgrammePadel(reglages, date)) {
    const programme = programmeEnClair(reglages);
    return {
      code: "DATE",
      message:
        reglages.jours.length === 0 && reglages.dates.length === 0
          ? "Aucun départ de Padel bike n'est programmé pour le moment. Écrivez-nous sur WhatsApp."
          : `Padel bike ne part pas ce jour-là : il part ${programme}, à ${horairePadel(reglages)}. Choisissez un autre jour.`,
    };
  }
  if (departEnConflit(reglages, date)) {
    return {
      code: "DATE",
      message: "Ce jour-là, les vélos sont pris par une autre sortie à cette heure. Choisissez un autre jour.",
    };
  }
  if (cloturePadel(reglages, date) <= instant) {
    return {
      code: "DATE",
      message:
        `La réservation en ligne de ce départ est close : on réserve ${delaiPadelEnClair(reglages)}. ` +
        "Écrivez-nous sur WhatsApp, il reste peut-être de la place, ou choisissez un autre jour.",
    };
  }
  return null;
}
