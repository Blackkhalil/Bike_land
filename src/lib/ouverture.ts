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

import {
  clotureRoadTrip,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  estJourFerme,
  FERMETURE_HEURE,
  motifHoraireLocation,
  OUVERTURE_HEURE,
  type OuvertureCreneaux,
} from "@/data/offres";
import { depot } from "@/lib/db";
import { listerJours, type DateISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { JourFerme, Velo } from "@/lib/types";

export interface Ouverture extends OuvertureCreneaux {
  joursFermes: JourFerme[];
}

/** Les réglages, valeurs par défaut comprises. */
export async function lireOuverture(): Promise<Ouverture> {
  const brut = await depot.lireOuverture();
  const actifs = CRENEAUX_ROAD_TRIP.filter((c) => brut.creneaux[c.code] ?? c.actifParDefaut).map(
    (c) => c.code,
  );
  return { creneauxActifs: new Set(actifs), joursFermes: brut.joursFermes };
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
    offre: "road-trip" | "location-libre";
    dateDebut: DateISO;
    dateFin: DateISO;
    heureDebut: number;
    dureeHeures?: number;
  },
): string | null {
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
