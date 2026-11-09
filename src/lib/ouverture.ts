/**
 * L'ouverture des réservations, telle que l'exploitant l'a réglée.
 *
 * Deux réglages, faits depuis le tableau de bord. Les créneaux du road
 * trip s'ouvrent et se ferment pour toutes les semaines : le samedi fermé
 * parce que complet se rouvre d'un clic. Gbashi bike, le dimanche, n'a pas
 * ce réglage : il se commande sur WhatsApp, jamais en ligne (`enLigne`
 * dans CRENEAUX_ROAD_TRIP). Des jours précis se ferment quand ils sont
 * complets, pour une formule ou pour les deux.
 *
 * Tout ce qui propose ou accepte une réservation passe par ce module : le
 * widget de la fiche vélo, le tunnel, et surtout le serveur, qui refuse
 * une réservation sur un créneau ou un jour fermé même si une page
 * restée ouverte la propose encore.
 */

import {
  clotureInscriptionsOctobreRose,
  codeOctobreRose,
  creneauOctobreRose,
  formatHoraire,
  inscriptionOctobreRoseOuverte,
  OCTOBRE_ROSE,
  sortieOctobreRoseDu,
  sortieOctobreRosePartie,
  type SortieOctobreRose,
} from "@/data/octobre-rose";
import {
  clotureRoadTrip,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  estJourFerme,
  FERMETURE_HEURE,
  motifDepartSurCommande,
  motifHoraireLocation,
  OUVERTURE_HEURE,
  personnesMinRoadTrip,
  roadTripPossible,
  roadTripsDuJour,
  velosEnEtatDe,
  type GammeVelo,
  type OuvertureCreneaux,
} from "@/data/offres";
import { depot } from "@/lib/db";
import { listerJours, type DateISO } from "@/lib/dates";
import { formatDate, formatDateAvecJour } from "@/lib/format";
import { estEnAttente } from "@/lib/reservations";
import type { CodeOffre, JourFerme, Velo } from "@/lib/types";

/** L'espace insécable de la typographie française, avant « : ». */
const INSECABLE = String.fromCharCode(0xa0);

export interface Ouverture extends OuvertureCreneaux {
  joursFermes: JourFerme[];
}

/**
 * Les réglages, valeurs par défaut comprises.
 *
 * L'inscription en ligne à chaque sortie Octobre rose s'ouvre et se ferme
 * comme un créneau, sous son propre code, daté (`codeOctobreRose`) : chaque
 * jour se règle seul. Ouverte tant que l'exploitant n'y a pas touché, elle
 * figure alors parmi les `creneauxActifs`.
 *
 * Un départ sur commande (Gbashi bike) n'y figure jamais, même ouvert en
 * base avant qu'il ne passe sur commande : il ne se réserve pas en ligne.
 */
export async function lireOuverture(): Promise<Ouverture> {
  const brut = await depot.lireOuverture();
  const actifs: string[] = CRENEAUX_ROAD_TRIP.filter(
    (c) => c.enLigne && (brut.creneaux[c.code] ?? c.actifParDefaut),
  ).map((c) => c.code);
  for (const sortie of OCTOBRE_ROSE.sorties) {
    const code = codeOctobreRose(sortie);
    if (brut.creneaux[code] ?? true) actifs.push(code);
  }
  return { creneauxActifs: new Set(actifs), joursFermes: brut.joursFermes };
}

/**
 * L'inscription en ligne à cette sortie Octobre rose est-elle ouverte
 * depuis le tableau de bord ? Fermée sous son code, ou son jour fermé pour
 * toutes les formules (pluie, imprévu) : « Sold out ». Les autres sorties ne
 * sont pas concernées.
 */
export function octobreRoseOuvertEnLigne(ouverture: OuvertureCreneaux, sortie: SortieOctobreRose): boolean {
  const jourFerme = ouverture.joursFermes.some((j) => j.date === sortie.date && j.formule === "toutes");
  return ouverture.creneauxActifs.has(codeOctobreRose(sortie)) && !jourFerme;
}

/**
 * Une sortie Octobre rose chevauche-t-elle ces heures ce jour-là ? Les
 * vélos d'un road trip de plusieurs personnes ne sont pas tous inscrits
 * dans la base (une ligne par réservation) : la sortie compterait comme
 * libres des vélos partis avec le groupe. Une telle configuration est
 * refusée des deux côtés plutôt que de surréserver.
 */
function octobreRoseChevaucheRoadTrip(date: DateISO, heureDebut: number, heureFin: number): boolean {
  return OCTOBRE_ROSE.sorties.some((sortie) => {
    const creneau = creneauOctobreRose(sortie);
    return creneau.date === date && heureDebut < creneau.heureFin && heureFin > creneau.heureDebut;
  });
}

/** Pourquoi l'inscription en ligne à une sortie est refusée, et sous quel code. */
export interface RefusOctobreRose {
  erreur: string;
  /**
   * `FERME` : pas ou plus d'inscription en ligne à cette heure (heure limite
   * du jour passée, avant octobre, sortie gratuite, configuration à
   * corriger). `COMPLET` : la sortie est fermée depuis le tableau de bord.
   */
  code: "FERME" | "COMPLET";
}

/**
 * Pourquoi l'inscription en ligne à cette sortie ne peut pas être prise en
 * ce moment, ou `null` si elle le peut : l'heure limite de son jour, et son
 * réglage au tableau de bord. Les places se comptent à part, dans la base.
 * Le comptoir n'y est pas soumis : il vend jusqu'au départ.
 */
export function refusInscriptionOctobreRose(
  ouverture: OuvertureCreneaux,
  sortie: SortieOctobreRose,
  maintenant: Date = new Date(),
): RefusOctobreRose | null {
  const creneau = creneauOctobreRose(sortie);
  const conflitRoadTrip = roadTripsDuJour(sortie.date).some(
    (c) => creneau.heureDebut < c.heureFin && creneau.heureFin > c.heureDebut,
  );
  if (conflitRoadTrip) {
    console.error(
      `[ouverture] la sortie Octobre rose du ${sortie.date} chevauche un road trip : inscriptions refusées. Corrigez src/data/octobre-rose.ts.`,
    );
    return {
      erreur: "Les inscriptions en ligne ne sont pas ouvertes pour le moment. Écrivez-nous sur WhatsApp.",
      code: "FERME",
    };
  }
  const jour = formatDateAvecJour(sortie.date);
  if (!inscriptionOctobreRoseOuverte(sortie, maintenant)) {
    if (sortie.prixXof <= 0) {
      return { erreur: "Cette sortie ne se réserve pas en ligne. Écrivez-nous sur WhatsApp.", code: "FERME" };
    }
    if (maintenant.getTime() >= clotureInscriptionsOctobreRose(sortie)) {
      return {
        erreur:
          `Les inscriptions en ligne à la sortie du ${jour} sont closes depuis ` +
          `${formatHoraire(sortie.finInscriptions)}. Écrivez-nous sur WhatsApp pour une dernière place.`,
        code: "FERME",
      };
    }
    // Avant octobre : la campagne n'a pas commencé.
    return {
      erreur: "Les inscriptions en ligne à Octobre rose ouvrent en octobre. Écrivez-nous sur WhatsApp en attendant.",
      code: "FERME",
    };
  }
  if (!octobreRoseOuvertEnLigne(ouverture, sortie)) {
    return {
      erreur:
        `La sortie du ${jour} est complète en ligne. Écrivez-nous sur WhatsApp${INSECABLE}: ` +
        "nous vous dirons s'il reste de la place.",
      code: "COMPLET",
    };
  }
  return null;
}

/** Où en est une sortie Octobre rose, pour la page, l'inscription et le tableau de bord. */
export interface EtatSortieOctobreRose {
  sortie: SortieOctobreRose;
  /** Le code de son réglage au tableau de bord (`codeOctobreRose`). */
  code: string;
  /** Les heures pleines qu'elle retient sur les vélos (`creneauOctobreRose`). */
  creneau: { date: DateISO; heureDebut: number; heureFin: number };
  /** Les places restantes : les vélos en état et libres sur ce créneau, ce jour-là. */
  places: number;
  /** Les vélos retenus par des inscriptions en ligne qui attendent encore leur paiement. */
  placesEnAttente: number;
  /** Ni la sortie ni son jour ne sont fermés depuis le tableau de bord. */
  ouverteEnLigne: boolean;
  /** À l'horloge : mois de la campagne, prix à payer, heure limite du jour pas encore passée. */
  inscriptionsOuvertes: boolean;
  /** Le groupe est parti : la sortie ne se vend plus, ni en ligne ni au comptoir. */
  partie: boolean;
  /**
   * « Sold out » : fermée depuis le tableau de bord, ou plus aucun vélo, ni
   * libre, ni retenu par un paiement qui peut encore échouer. Avec
   * `places === 0` et des places en attente, la sortie n'est complète que
   * pour le moment.
   */
  complete: boolean;
  /** Tout est réuni pour s'inscrire en ligne à cet instant. */
  enVente: boolean;
}

/**
 * L'état de chaque sortie de la campagne, dans l'ordre des jours, sorties
 * passées comprises (`partie`). Vide tant qu'aucune sortie n'est fixée.
 * Lit la base : réservé au serveur. Le serveur recompte tout de même à
 * chaque inscription ; ceci sert à l'affichage.
 */
export async function etatsSortiesOctobreRose(
  maintenant: Date = new Date(),
  ouverture?: OuvertureCreneaux,
): Promise<EtatSortieOctobreRose[]> {
  const sorties = [...OCTOBRE_ROSE.sorties].sort((a, b) => a.date.localeCompare(b.date));
  if (sorties.length === 0) return [];
  const [reglages, libres, enAttente] = await Promise.all([
    ouverture ?? lireOuverture(),
    Promise.all(
      sorties.map((sortie) => {
        const creneau = creneauOctobreRose(sortie);
        return depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin);
      }),
    ),
    depot.listerReservations({
      statut: "EN_ATTENTE_PAIEMENT",
      depuis: sorties[0].date,
      jusqua: sorties[sorties.length - 1].date,
    }),
  ]);
  return sorties.map((sortie, index) => {
    const places = libres[index].length;
    const placesEnAttente = enAttente
      .filter((r) => r.offre === "octobre-rose" && r.dateDebut === sortie.date && estEnAttente(r))
      .reduce((total, r) => total + r.lignes.length, 0);
    const ouverteEnLigne = octobreRoseOuvertEnLigne(reglages, sortie);
    const inscriptionsOuvertes = inscriptionOctobreRoseOuverte(sortie, maintenant);
    return {
      sortie,
      code: codeOctobreRose(sortie),
      creneau: creneauOctobreRose(sortie),
      places,
      placesEnAttente,
      ouverteEnLigne,
      inscriptionsOuvertes,
      partie: sortieOctobreRosePartie(sortie, maintenant),
      complete: !ouverteEnLigne || (places === 0 && placesEnAttente === 0),
      enVente: inscriptionsOuvertes && ouverteEnLigne && places > 0,
    };
  });
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
 *
 * Elle ne connaît pas la gamme : qu'une gamme roule ou non ce départ (le
 * Classique, pas le samedi) se vérifie à part, avec `motifRoadTripGamme`,
 * une fois la gamme connue (routes de réservation et du comptoir).
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
    // Le jour désigne la sortie : chacune a son heure limite et son réglage.
    const sortie = sortieOctobreRoseDu(demande.dateDebut);
    if (!sortie) return "Aucune sortie Octobre rose ce jour-là. Choisissez l'un des jours proposés.";
    return refusInscriptionOctobreRose(ouverture, sortie)?.erreur ?? null;
  }

  if (demande.offre === "road-trip") {
    const jourSemaine = new Date(`${demande.dateDebut}T12:00:00Z`).getUTCDay();
    const creneau = CRENEAUX_ROAD_TRIP.find(
      (c) => c.jourSemaine === jourSemaine && c.heureDebut === demande.heureDebut,
    );
    // Gbashi bike se commande sur WhatsApp : le motif donne le numéro.
    if (creneau && !creneau.enLigne) return motifDepartSurCommande(creneau);
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

/**
 * Les départs encadrés vus d'une gamme.
 *
 * Un départ que la gamme ne roule pas n'apparaît pas du tout : le road trip
 * du samedi n'est pas proposé au Classique, ni ouvert ni « Sold out ». Pas
 * davantage à une gamme qui n'a pas assez de vélos en état pour son groupe
 * minimum (dix le samedi, un vélo par personne : le Prestige n'en a qu'un).
 * Un départ où il ne reste plus assez de ses vélos libres pour ce groupe
 * passe avec ceux que l'exploitant a fermés, et s'affiche « Sold out » pour
 * elle. Sans cela, l'encart de la gamme proposait encore ce départ, et le
 * client y revenait en boucle.
 */
export async function departsDeLaGamme<T extends { date: DateISO; heureDebut: number; heureFin: number }>(
  gamme: GammeVelo,
  tousLesCreneaux: T[],
  tousLesComplets: T[],
): Promise<{ creneaux: T[]; complets: T[] }> {
  const enEtat = velosEnEtatDe(gamme, await depot.listerVelos());
  const roule = (creneau: T) =>
    roadTripPossible(gamme, creneau.date) && enEtat >= personnesMinRoadTrip(creneau.date);
  const creneaux = tousLesCreneaux.filter(roule);
  const complets = tousLesComplets.filter(roule);
  const pleins = await Promise.all(
    creneaux.map(
      async (creneau) =>
        (await depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin)).filter(
          (velo) => velo.gamme === gamme,
        ).length < personnesMinRoadTrip(creneau.date),
    ),
  );
  return {
    creneaux: creneaux.filter((_, index) => !pleins[index]),
    complets: [...complets, ...creneaux.filter((_, index) => pleins[index])],
  };
}
