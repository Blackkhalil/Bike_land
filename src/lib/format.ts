/**
 * Formatage des montants et des dates.
 *
 * Les montants sont manipulés en FCFA entiers dans tout le projet : le franc
 * CFA n'a pas de subdivision utilisée, donc aucun arrondi flottant à gérer.
 */

import { formatHoraire, sortieDeLaReservation } from "@/data/octobre-rose";
import { formatHeureMinute } from "@/data/reglages";
import { creneauDuDepart, DERNIER_GBASHI_DU_DIMANCHE, estOffreGroupe, OFFRES_GROUPE } from "@/data/offres";

import { DECALAGE_BENIN_MS } from "./dates";
import type { CodeOffre, MoyenPaiement } from "./types";

const libellesMoyens: Record<MoyenPaiement, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS_CASH: "Celtiis Cash",
  ESPECES: "Espèces",
};

/** Le nom d'un moyen de paiement, tel que le client le connaît. */
export function libelleMoyen(moyen: MoyenPaiement): string {
  return libellesMoyens[moyen] ?? moyen;
}

/**
 * Le règlement tel que la facture le nomme : « Espèces » au comptoir,
 * « Mobile Money » en ligne. L'opérateur n'y figure pas : une relance du
 * paiement peut changer d'opérateur sans que la ligne de paiement le note,
 * et une facture ne doit pas affirmer ce qu'on ne sait pas.
 */
export function libelleReglement(moyen: MoyenPaiement): string {
  return moyen === "ESPECES" ? "Espèces" : "Mobile Money";
}

/**
 * L'intitulé d'une remise sur la facture. Seul un code de parrainage en
 * accorde aujourd'hui ; les remises de durée d'avant n'avaient pas de code.
 */
export function libelleRemise(reservation: { codeParrainage?: string }): string {
  return reservation.codeParrainage ? `Remise (code ${reservation.codeParrainage})` : "Remise";
}

const formatteurMontant = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

/**
 * L'espace insécable entre un nombre et son unité : « 1 625 FCFA »,
 * « 8 h », « 20 % » ne se coupent jamais en fin de ligne, où l'unité
 * seule au début de la suivante se lisait mal sur téléphone. Les
 * milliers, eux, sont déjà séparés par l'espace fine insécable d'Intl.
 */
const INSECABLE = String.fromCharCode(0xa0);

export function formatXof(montant: number): string {
  return `${formatteurMontant.format(Math.round(montant))}${INSECABLE}FCFA`;
}

export function formatXofCourt(montant: number): string {
  if (montant >= 1_000_000) {
    const millions = montant / 1_000_000;
    return `${formatteurMontant.format(Number(millions.toFixed(millions < 10 ? 1 : 0)))}${INSECABLE}M`;
  }
  if (montant >= 1_000) {
    return `${formatteurMontant.format(Math.round(montant / 1000))}${INSECABLE}k`;
  }
  return formatteurMontant.format(montant);
}

const formatteurDateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatteurDateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const formatteurJourMois = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const formatteurDateComplete = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * « 1 novembre » devient « 1er novembre », comme l'écrit le français :
 * Intl ne le fait pas. Les autres jours ne bougent pas.
 */
function premierDuMois(texte: string): string {
  return texte.replace(/(^|\s)1(?=\s)/u, (_, avant: string) => `${avant}1er`);
}

export function formatDate(valeur: string | Date): string {
  return premierDuMois(formatteurDateLongue.format(versDate(valeur)));
}

export function formatDateCourte(valeur: string | Date): string {
  return formatteurDateCourte.format(versDate(valeur));
}

export function formatDateAvecJour(valeur: string | Date): string {
  return premierDuMois(formatteurJourMois.format(versDate(valeur)));
}

/**
 * « samedi 24 octobre 2026 » : le jour de la semaine et l'année. Pour une
 * sortie Octobre rose, le jour de la semaine compte : le client a choisi
 * entre le samedi et le dimanche.
 */
export function formatDateComplete(valeur: string | Date): string {
  return premierDuMois(formatteurDateComplete.format(versDate(valeur)));
}

export function formatPeriode(debut: string | Date, fin: string | Date): string {
  const d = versDate(debut);
  const f = versDate(fin);
  if (d.getUTCFullYear() === f.getUTCFullYear() && d.getUTCMonth() === f.getUTCMonth()) {
    return `${d.getUTCDate()} - ${formatDate(f)}`;
  }
  return `${formatDateCourte(d)} - ${formatDate(f)}`;
}

/**
 * Le créneau d'une réservation : jour et horaire d'un seul tenant.
 *
 * Écrit une fois ici plutôt que recopié dans chaque écran : la facture,
 * le suivi client et la fiche du jour doivent annoncer exactement le même
 * horaire, sinon le coordinateur et le client ne s'attendent pas au même
 * moment au point de départ.
 *
 * Une sortie Octobre rose s'annonce par son jour, de la semaine compris,
 * son rendez-vous et son départ, à la minute près, plutôt que par les
 * heures pleines qu'elle retient sur les vélos (voir `sortieDe`) :
 * « samedi 24 octobre 2026, rassemblement à 16 h, départ 16 h 30 ».
 *
 * Une sortie réglée à la minute (Padel bike) s'annonce par l'horaire
 * retenu à la réservation : « 21 novembre 2026, de 18 h 30 à 22 h 30 ».
 * Une offre de groupe au quart d'heure, par ses minutes : « de 8 h à 8 h 45 ».
 */
export function formatCreneau(reservation: {
  dateDebut: string | Date;
  heureDebut: number;
  heureFin: number;
  offre?: CodeOffre;
  horaire?: { depart: string; retour: string };
  minuteDebut?: number;
  minuteFin?: number;
}): string {
  const sortie = sortieDe(reservation);
  if (sortie) {
    return (
      `${formatDateComplete(reservation.dateDebut)}, rassemblement à ${formatHoraire(sortie.rassemblement)}, ` +
      `départ ${formatHoraire(sortie.depart)}`
    );
  }
  const horaire = horaireExact(reservation);
  if (horaire) {
    return `${formatDate(reservation.dateDebut)}, de ${formatHeureMinute(horaire.depart)} à ${formatHeureMinute(horaire.retour)}`;
  }
  return `${formatDate(reservation.dateDebut)}, de ${reservation.heureDebut}${INSECABLE}h à ${reservation.heureFin}${INSECABLE}h`;
}

/** Le seul horaire, sans le jour : « 8 h - 11 h ». */
export function formatPlageHoraire(heureDebut: number, heureFin: number): string {
  return `${heureDebut}${INSECABLE}h - ${heureFin}${INSECABLE}h`;
}

/**
 * La sortie Octobre rose d'une réservation, retrouvée par son jour parmi
 * celles de la campagne décrite (src/data/octobre-rose.ts) : ses horaires à
 * la minute près ne valent que pour elle. Une inscription d'une campagne
 * passée garde ses heures enregistrées.
 */
function sortieDe(reservation: { offre?: CodeOffre; dateDebut: string | Date }) {
  return reservation.offre ? sortieDeLaReservation({ offre: reservation.offre, dateDebut: reservation.dateDebut }) : null;
}

/**
 * L'horaire d'une réservation, sans le jour : « 8 h - 11 h » ; pour
 * Octobre rose, du rassemblement au retour, « 16 h - 17 h 30 » ; pour une
 * sortie réglée à la minute, l'horaire retenu, « 18 h 30 - 22 h 30 » ; pour
 * une offre de groupe, ses minutes, « 8 h - 8 h 45 ».
 */
export function formatPlageReservation(reservation: {
  offre?: CodeOffre;
  dateDebut: string | Date;
  heureDebut: number;
  heureFin: number;
  horaire?: { depart: string; retour: string };
  minuteDebut?: number;
  minuteFin?: number;
}): string {
  const sortie = sortieDe(reservation);
  const horaire = horaireExact(reservation);
  return sortie
    ? `${formatHoraire(sortie.rassemblement)} - ${formatHoraire(sortie.retour)}`
    : horaire
      ? `${formatHeureMinute(horaire.depart)} - ${formatHeureMinute(horaire.retour)}`
      : formatPlageHoraire(reservation.heureDebut, reservation.heureFin);
}

export function formatNombre(valeur: number, decimales = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur);
}

export function formatPourcentage(valeur: number, decimales = 0): string {
  return `${formatNombre(valeur, decimales)}${INSECABLE}%`;
}

/**
 * « 16 h 05 » : l'heure d'un instant à Cotonou (UTC+1 toute l'année, sans
 * heure d'été), quel que soit le fuseau du serveur ou du navigateur.
 */
export function formatHeureAuBenin(instant: string | Date): string {
  const benin = new Date(new Date(instant).getTime() + DECALAGE_BENIN_MS);
  const minutes = benin.getUTCMinutes();
  return minutes
    ? `${benin.getUTCHours()}${INSECABLE}h${INSECABLE}${String(minutes).padStart(2, "0")}`
    : `${benin.getUTCHours()}${INSECABLE}h`;
}

/**
 * L'horaire exact d'une réservation : celui noté à la réservation (Padel
 * bike), sinon celui que donnent les minutes d'une offre de groupe
 * (480 et 525 : « 08:00 » et « 08:45 »). `undefined` : les heures pleines.
 * Tout ce qui annonce une heure de départ ou de retour passe par ici plutôt
 * que par `reservation.horaire` seul, qui ignore les minutes.
 */
export function horaireExact(reservation: {
  horaire?: { depart: string; retour: string };
  minuteDebut?: number;
  minuteFin?: number;
}): { depart: string; retour: string } | undefined {
  if (reservation.horaire) return reservation.horaire;
  if (reservation.minuteDebut === undefined || reservation.minuteFin === undefined) return undefined;
  const enHeure = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { depart: enHeure(reservation.minuteDebut), retour: enHeure(reservation.minuteFin) };
}

/** « 45 min », « 1 h », « 1 h 30 » : une durée en minutes, telle qu'on la dit. */
export function formatDureeMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}${INSECABLE}min`;
  const heures = Math.floor(total / 60);
  const reste = total % 60;
  return reste ? `${heures}${INSECABLE}h${INSECABLE}${String(reste).padStart(2, "0")}` : `${heures}${INSECABLE}h`;
}

function versDate(valeur: string | Date): Date {
  return typeof valeur === "string" ? new Date(`${valeur.slice(0, 10)}T00:00:00Z`) : valeur;
}

/**
 * Résume une réservation en une ligne : sa formule et ce qui la
 * dimensionne.
 *
 * Remplace l'ancien « N jours », qui ne veut plus rien dire, toutes les
 * sorties tiennent dans la journée. Ce qui distingue deux réservations,
 * c'est désormais la formule, et le nombre de participants ou la durée.
 */
export function resumeOffre(reservation: {
  offre: CodeOffre;
  nombrePersonnes: number;
  dureeHeures?: number;
  dateDebut?: string;
  heureDebut?: number;
  minuteDebut?: number;
  minuteFin?: number;
}): string {
  const n = reservation.nombrePersonnes;
  if (reservation.offre === "road-trip") {
    return `${nomDuRoadTrip(reservation)} · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}`;
  }
  // Les offres de groupe, à la personne ; Bike for All dit aussi sa durée,
  // au quart d'heure, quand le créneau est connu.
  if (estOffreGroupe(reservation.offre)) {
    const duree =
      reservation.offre === "bike-for-all" && reservation.minuteDebut !== undefined && reservation.minuteFin !== undefined
        ? ` · ${formatDureeMinutes(reservation.minuteFin - reservation.minuteDebut)}`
        : "";
    return `${OFFRES_GROUPE[reservation.offre].nom} · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}${duree}`;
  }
  if (reservation.offre === "octobre-rose") {
    return `Octobre rose · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}`;
  }
  // Les sorties sur commande, à la personne.
  if (reservation.offre === "gbashi-bike" || reservation.offre === "padel-bike") {
    const nom = reservation.offre === "gbashi-bike" ? "Gbashi bike" : "Padel bike";
    return `${nom} · ${n}${INSECABLE}personne${n > 1 ? "s" : ""}`;
  }
  const velos = n > 1 ? ` · ${n}${INSECABLE}vélos` : "";
  return `Location libre · ${reservation.dureeHeures ?? "?"}${INSECABLE}h${velos}`;
}

/**
 * Le nom sous lequel ce road trip est vendu : « Gbashi bike » le dimanche,
 * « Road trip » sinon. Le jour et l'heure retrouvent le créneau, qui porte
 * le nom (voir CRENEAUX_ROAD_TRIP).
 */
export function nomDuRoadTrip(reservation: { dateDebut?: string; heureDebut?: number }): string {
  if (reservation.dateDebut === undefined || reservation.heureDebut === undefined) return "Road trip";
  const creneau = creneauDuDepart(reservation.dateDebut, reservation.heureDebut);
  // Jusqu'au 8 novembre 2026, le road trip du dimanche était Gbashi bike :
  // ces réservations gardent leur nom.
  if (creneau?.code === "dimanche-matin" && reservation.dateDebut <= DERNIER_GBASHI_DU_DIMANCHE) return "Gbashi bike";
  return creneau?.produit ?? "Road trip";
}
