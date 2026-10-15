/**
 * L'ouverture des réservations, telle que l'exploitant l'a réglée.
 *
 * Deux réglages, faits depuis le tableau de bord. Les créneaux du road
 * trip s'ouvrent et se ferment pour toutes les semaines : le dimanche est
 * fermé parce que complet, il se rouvre d'un clic. Des jours précis se
 * ferment quand ils sont complets, pour une formule ou pour les deux.
 *
 * Tout ce qui propose ou accepte une réservation passe par ce module : le
 * widget de la fiche vélo, le tunnel, et surtout le serveur, qui refuse
 * une réservation sur un créneau ou un jour fermé même si une page
 * restée ouverte la propose encore.
 */

import { codeOctobreRose, creneauOctobreRose, OCTOBRE_ROSE } from "@/data/octobre-rose";
import {
  clotureRoadTrip,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  estJourFerme,
  FERMETURE_HEURE,
  motifHoraireLocation,
  OUVERTURE_HEURE,
  roadTripsDuJour,
  type OuvertureCreneaux,
} from "@/data/offres";
import { inscriptionsOctobreRoseOuvertes } from "@/data/produits";
import { depot } from "@/lib/db";
import { listerJours, type DateISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { CodeOffre, JourFerme, Velo } from "@/lib/types";

export interface Ouverture extends OuvertureCreneaux {
  joursFermes: JourFerme[];
}

/**
 * Les réglages, valeurs par défaut comprises.
 *
 * L'inscription en ligne à Octobre rose s'ouvre et se ferme comme un
 * créneau, sous son propre code (`codeOctobreRose`, daté) : ouverte tant
 * que l'exploitant n'y a pas touché, elle figure alors parmi les
 * `creneauxActifs`.
 */
export async function lireOuverture(): Promise<Ouverture> {
  const brut = await depot.lireOuverture();
  const actifs: string[] = CRENEAUX_ROAD_TRIP.filter((c) => brut.creneaux[c.code] ?? c.actifParDefaut).map(
    (c) => c.code,
  );
  const codeRose = codeOctobreRose();
  if (brut.creneaux[codeRose] ?? true) actifs.push(codeRose);
  return { creneauxActifs: new Set(actifs), joursFermes: brut.joursFermes };
}

/**
 * L'inscription en ligne à Octobre rose est-elle ouverte depuis le tableau
 * de bord ? Fermée sous son code, ou le jour de la sortie fermé pour
 * toutes les formules (pluie, imprévu) : « Sold out ».
 */
export function octobreRoseOuvertEnLigne(ouverture: OuvertureCreneaux): boolean {
  const date = OCTOBRE_ROSE.sortie?.date;
  const jourFerme = ouverture.joursFermes.some((j) => j.date === date && j.formule === "toutes");
  return ouverture.creneauxActifs.has(codeOctobreRose()) && !jourFerme;
}

/**
 * La sortie Octobre rose chevauche-t-elle un road trip ce jour-là ? Les
 * vélos d'un road trip de plusieurs personnes ne sont pas tous inscrits
 * dans la base (une ligne par réservation) : la sortie compterait comme
 * libres des vélos partis avec le groupe. Une telle configuration est
 * refusée des deux côtés plutôt que de surréserver.
 */
function octobreRoseChevaucheRoadTrip(date: DateISO, heureDebut: number, heureFin: number): boolean {
  const creneau = creneauOctobreRose();
  return (
    creneau !== null &&
    creneau.date === date &&
    heureDebut < creneau.heureFin &&
    heureFin > creneau.heureDebut
  );
}

/** Les départs de road trip à proposer en ce moment. */
export async function creneauxOuverts(maintenant = new Date()) {
  return creneauxDisponibles(maintenant, await lireOuverture());
}

/**
 * Les jours fermés à la location libre, sous la forme que comprend le
 * calendrier : une journée entière occupée. Le calendrier les barre
 * alors comme un jour complet, sans rien lui apprendre de nouveau.
 */
export function joursFermesCommeOccupes(ouverture: Ouverture) {
  return ouverture.joursFermes
    .filter((j) => j.formule !== "road-trip")
    .map((j) => ({ debut: j.date, fin: j.date, heureDebut: OUVERTURE_HEURE, heureFin: FERMETURE_HEURE }));
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Pourquoi cette réservation ne peut pas être prise, ou `null` si elle le
 * peut. C'est la vérification du serveur, appelée avant toute écriture.
 *
 * Avec la durée, l'heure de départ d'une location libre est vérifiée
 * aussi : pas pendant le road trip du week-end, pas dans le passé. La page
 * de réservation l'appelle sans durée, le tunnel recalculant les heures
 * proposées à chaque changement de durée.
 */
export function motifDeRefus(
  ouverture: Ouverture,
  demande: {
    offre: CodeOffre;
    dateDebut: DateISO;
    dateFin: DateISO;
    heureDebut: number;
    dureeHeures?: number;
  },
): string | null {
  if (demande.offre === "octobre-rose") {
    const creneau = creneauOctobreRose();
    const conflitRoadTrip =
      creneau !== null &&
      roadTripsDuJour(creneau.date).some((c) => octobreRoseChevaucheRoadTrip(creneau.date, c.heureDebut, c.heureFin));
    if (conflitRoadTrip) {
      console.error("[ouverture] la sortie Octobre rose chevauche un road trip : inscriptions refusées. Corrigez src/data/octobre-rose.ts.");
      return "Les inscriptions en ligne ne sont pas ouvertes pour le moment. Écrivez-nous sur WhatsApp.";
    }
    if (!inscriptionsOctobreRoseOuvertes(new Date())) {
      return "Les inscriptions en ligne à Octobre rose sont closes. Écrivez-nous sur WhatsApp pour une dernière place.";
    }
    if (!octobreRoseOuvertEnLigne(ouverture)) {
      return "La sortie Octobre rose est complète en ligne. Écrivez-nous sur WhatsApp : nous vous dirons s'il reste de la place.";
    }
    return null;
  }

  if (demande.offre === "road-trip") {
    const jourSemaine = new Date(`${demande.dateDebut}T12:00:00Z`).getUTCDay();
    const creneau = CRENEAUX_ROAD_TRIP.find(
      (c) => c.jourSemaine === jourSemaine && c.heureDebut === demande.heureDebut,
    );
    if (!creneau || !ouverture.creneauxActifs.has(creneau.code)) {
      return "Ce départ de road trip n'est pas ouvert à la réservation. Choisissez une autre date.";
    }
    if (estJourFerme(ouverture.joursFermes, demande.dateDebut, "road-trip")) {
      return "Le road trip de ce jour est complet. Choisissez une autre date.";
    }
    if (octobreRoseChevaucheRoadTrip(demande.dateDebut, creneau.heureDebut, creneau.heureFin)) {
      return "Ce jour-là, les vélos sont à la sortie Octobre rose. Choisissez une autre date.";
    }
    if (Date.now() >= clotureRoadTrip(demande.dateDebut)) {
      return (
        `Les réservations du road trip du ${creneau.libelle.toLowerCase()} ` +
        `${formatDate(demande.dateDebut)} sont closes depuis ${JOURS[(jourSemaine + 6) % 7]} ` +
        `22 h. Réservez le départ de la semaine suivante.`
      );
    }
    return null;
  }

  for (const jour of listerJours(demande.dateDebut, demande.dateFin)) {
    if (estJourFerme(ouverture.joursFermes, jour, "location-libre")) {
      return "Ce jour est complet en location libre. Choisissez une autre date.";
    }
  }
  if (demande.dureeHeures !== undefined) {
    return motifHoraireLocation(demande.dateDebut, demande.heureDebut, demande.dureeHeures);
  }
  return null;
}

/**
 * Combien de personnes une réservation peut emmener sur ce vélo.
 *
 * Une personne, un vélo. Le client choisit un vélo, et ses compagnons
 * roulent sur des vélos de la même gamme : le nombre de personnes ne peut
 * donc pas dépasser le nombre de vélos de cette gamme en état de rouler.
 * Le Prestige n'existant qu'en un exemplaire, il ne se réserve que pour
 * une personne. Une réservation de trois personnes sur le Prestige a été
 * acceptée avant cette limite, alors qu'un seul vélo pouvait les porter.
 */
export function personnesMaxPour(velo: Velo, parc: Velo[]): number {
  const enEtat = parc.filter(
    (v) => v.gamme === velo.gamme && v.statut !== "RETIRE" && v.statut !== "MAINTENANCE",
  ).length;
  return Math.max(1, enEtat);
}
