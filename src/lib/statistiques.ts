/**
 * Indicateurs du tableau de bord (§2.3 du cahier des charges).
 *
 * Tout est calculé ici, à partir des réservations : les composants
 * d'affichage ne font aucun calcul métier. Une réservation annulée
 * n'entre ni dans le chiffre d'affaires ni dans l'occupation, mais elle
 * compte dans le taux d'annulation.
 */

import {
  ajouterJours,
  aujourdhui,
  listerJours,
  moisDe,
  nombreDeJours,
  periodesSeChevauchent,
  type DateISO,
} from "./dates";
import type { Client, MoyenPaiement, PointDeRetrait, Reservation, Velo } from "./types";

export type Granularite = "jour" | "semaine" | "mois" | "annee";

export interface Periode {
  debut: DateISO;
  fin: DateISO;
  libelle: string;
}

export interface Serie {
  etiquette: string;
  valeur: number;
  /** Clé technique, utile pour les liens et les infobulles. */
  clef: string;
}

export interface IndicateurCompare {
  valeur: number;
  precedente: number;
  /** Variation en pourcentage ; `null` quand la période précédente est vide. */
  variation: number | null;
}

export interface Statistiques {
  /** Période demandée, telle quelle (le mois entier, l'année entière…). */
  periode: Periode;
  /**
   * Fenêtre réellement mesurée : la période demandée tronquée à
   * aujourd'hui. Pour un mois en cours, c'est le début du mois à ce jour.
   */
  fenetreCourante: Periode;
  periodePrecedente: Periode;
  /** Vrai quand la période demandée n'est pas encore terminée. */
  periodeEnCours: boolean;

  // --- Indicateurs financiers
  chiffreAffaires: IndicateurCompare;
  revenuMoyenParReservation: IndicateurCompare;
  cautionsEncaissees: number;
  cautionsRestituees: number;
  repartitionPaiements: Serie[];

  // --- Indicateurs de réservation
  nombreReservations: IndicateurCompare;
  tauxOccupation: number;
  dureeMoyenne: IndicateurCompare;
  tauxAnnulation: IndicateurCompare;
  saisonnalite: Serie[];
  evolutionChiffreAffaires: Serie[];

  // --- Indicateurs sur le parc
  velosLesPlusLoues: Serie[];
  velosDisponibles: number;
  velosEnLocation: number;
  velosEnEntretien: number;

  // --- Indicateurs clients
  nouveauxClients: number;
  clientsRecurrents: number;
  originesReservations: Serie[];
  noteMoyenne: number | null;
  nombreAvis: number;
}

const libellesMoyens: Record<MoyenPaiement, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CARTE_BANCAIRE: "Carte bancaire",
  ESPECES: "Espèces",
};

/** Bornes de la période demandée, à partir d'une granularité. */
export function construirePeriode(granularite: Granularite, reference = aujourdhui()): Periode {
  const date = new Date(`${reference}T00:00:00Z`);

  switch (granularite) {
    case "jour":
      return { debut: reference, fin: reference, libelle: "Aujourd'hui" };
    case "semaine": {
      // La semaine commence le lundi.
      const decalage = (date.getUTCDay() + 6) % 7;
      const debut = ajouterJours(reference, -decalage);
      return { debut, fin: ajouterJours(debut, 6), libelle: "Cette semaine" };
    }
    case "annee": {
      const annee = reference.slice(0, 4);
      return { debut: `${annee}-01-01`, fin: `${annee}-12-31`, libelle: "Cette année" };
    }
    case "mois":
    default: {
      const mois = reference.slice(0, 7);
      const dernierJour = new Date(
        Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0),
      ).getUTCDate();
      return { debut: `${mois}-01`, fin: `${mois}-${String(dernierJour).padStart(2, "0")}`, libelle: "Ce mois-ci" };
    }
  }
}

/**
 * Période de comparaison, de même **durée écoulée** que la période courante.
 *
 * Un mois en cours ne compte que ses jours déjà passés : le comparer à un
 * mois complet ferait apparaître une chute de chiffre d'affaires qui
 * n'existe pas. On aligne donc les deux fenêtres sur le nombre de jours
 * réellement écoulés.
 */
export function periodePrecedente(periode: Periode, reference = aujourdhui()): Periode {
  const finEcoulee = periode.fin > reference ? reference : periode.fin;
  const longueur = Math.max(nombreDeJours(periode.debut, finEcoulee), 1);
  const fin = ajouterJours(periode.debut, -1);
  return {
    debut: ajouterJours(fin, -(longueur - 1)),
    fin,
    libelle: "Période précédente",
  };
}

export function calculerStatistiques(
  reservations: Reservation[],
  velos: Velo[],
  clients: Client[],
  points: PointDeRetrait[],
  periode: Periode,
): Statistiques {
  const maintenant = aujourdhui();
  const periodeEnCours = periode.fin > maintenant;

  // On ne mesure que ce qui s'est déjà produit, et on compare à une fenêtre
  // de même durée : sans cela, un mois entamé perdrait mécaniquement contre
  // un mois complet.
  const fenetreCourante: Periode = periodeEnCours
    ? { debut: periode.debut, fin: maintenant, libelle: `${periode.libelle} (à ce jour)` }
    : periode;
  const precedente = periodePrecedente(periode, maintenant);

  const dansPeriode = (reservation: Reservation, bornes: Periode) =>
    periodesSeChevauchent(reservation.dateDebut, reservation.dateFin, bornes.debut, bornes.fin);

  const courantes = reservations.filter((r) => dansPeriode(r, fenetreCourante));
  const anciennes = reservations.filter((r) => dansPeriode(r, precedente));

  const facturees = courantes.filter((r) => r.statut !== "ANNULEE");
  const factureesAvant = anciennes.filter((r) => r.statut !== "ANNULEE");

  const ca = somme(facturees.map((r) => r.totalXof));
  const caAvant = somme(factureesAvant.map((r) => r.totalXof));

  const moyenne = facturees.length ? Math.round(ca / facturees.length) : 0;
  const moyenneAvant = factureesAvant.length ? Math.round(caAvant / factureesAvant.length) : 0;

  // --- Cautions : encaissées sur la période, restituées quand remboursées.
  const paiements = facturees.flatMap((r) => r.paiements);
  const cautionsEncaissees = somme(
    paiements.filter((p) => p.estCaution && p.statut !== "ECHOUE").map((p) => p.montantXof),
  );
  const cautionsRestituees = somme(
    paiements.filter((p) => p.estCaution && p.statut === "REMBOURSE").map((p) => p.montantXof),
  );

  // --- Répartition par moyen de paiement, hors cautions pour ne pas
  //     compter deux fois la même location.
  const parMoyen = new Map<MoyenPaiement, number>();
  for (const paiement of paiements) {
    if (paiement.estCaution || paiement.statut === "ECHOUE") continue;
    parMoyen.set(paiement.moyen, (parMoyen.get(paiement.moyen) ?? 0) + paiement.montantXof);
  }
  const repartitionPaiements = [...parMoyen.entries()]
    .map(([moyen, montant]) => ({ clef: moyen, etiquette: libellesMoyens[moyen], valeur: montant }))
    .sort((a, b) => b.valeur - a.valeur);

  // --- Taux d'occupation : jours-vélos loués rapportés aux jours-vélos
  //     disponibles sur la période.
  const joursPeriode = listerJours(fenetreCourante.debut, fenetreCourante.fin);
  const parcActif = velos.filter((velo) => velo.statut !== "RETIRE");
  const capacite = joursPeriode.length * Math.max(parcActif.length, 1);
  let joursLoues = 0;
  for (const reservation of facturees) {
    for (const jour of listerJours(reservation.dateDebut, reservation.dateFin)) {
      if (jour >= fenetreCourante.debut && jour <= fenetreCourante.fin) {
        joursLoues += reservation.lignes.length;
      }
    }
  }
  const tauxOccupation = capacite > 0 ? (joursLoues / capacite) * 100 : 0;

  const duree = moyenneDe(facturees.map((r) => r.jours));
  const dureeAvant = moyenneDe(factureesAvant.map((r) => r.jours));

  const tauxAnnulation = courantes.length
    ? (courantes.filter((r) => r.statut === "ANNULEE").length / courantes.length) * 100
    : 0;
  const tauxAnnulationAvant = anciennes.length
    ? (anciennes.filter((r) => r.statut === "ANNULEE").length / anciennes.length) * 100
    : 0;

  // --- Séries temporelles sur les douze derniers mois, indépendantes du
  //     filtre de période : elles servent à lire la tendance de fond.
  const finSeries = fenetreCourante.fin;
  const debutDouzeMois = ajouterJours(finSeries, -364);
  const surDouzeMois = reservations.filter(
    (r) => r.statut !== "ANNULEE" && r.dateDebut >= debutDouzeMois && r.dateDebut <= finSeries,
  );

  const caParMois = new Map<string, number>();
  const reservationsParMois = new Map<string, number>();
  for (let curseur = debutDouzeMois; curseur <= finSeries; curseur = ajouterJours(curseur, 28)) {
    caParMois.set(moisDe(curseur), 0);
    reservationsParMois.set(moisDe(curseur), 0);
  }
  caParMois.set(moisDe(finSeries), caParMois.get(moisDe(finSeries)) ?? 0);
  reservationsParMois.set(moisDe(finSeries), reservationsParMois.get(moisDe(finSeries)) ?? 0);

  for (const reservation of surDouzeMois) {
    const mois = moisDe(reservation.dateDebut);
    caParMois.set(mois, (caParMois.get(mois) ?? 0) + reservation.totalXof);
    reservationsParMois.set(mois, (reservationsParMois.get(mois) ?? 0) + 1);
  }

  const moisTries = [...caParMois.keys()].sort();
  const evolutionChiffreAffaires = moisTries.map((mois) => ({
    clef: mois,
    etiquette: etiquetteMois(mois),
    valeur: caParMois.get(mois) ?? 0,
  }));
  const saisonnalite = moisTries.map((mois) => ({
    clef: mois,
    etiquette: etiquetteMois(mois),
    valeur: reservationsParMois.get(mois) ?? 0,
  }));

  // --- Parc
  const compteurParVelo = new Map<string, number>();
  for (const reservation of facturees) {
    for (const ligne of reservation.lignes) {
      compteurParVelo.set(ligne.veloId, (compteurParVelo.get(ligne.veloId) ?? 0) + 1);
    }
  }
  const velosLesPlusLoues = velos
    .map((velo) => ({
      clef: velo.id,
      etiquette: velo.nom,
      valeur: compteurParVelo.get(velo.id) ?? 0,
    }))
    .sort((a, b) => b.valeur - a.valeur);

  const enLocation = new Set(
    reservations
      .filter((r) => r.statut !== "ANNULEE" && r.dateDebut <= maintenant && r.dateFin >= maintenant)
      .flatMap((r) => r.lignes.map((ligne) => ligne.veloId)),
  );
  const velosEnEntretien = velos.filter((velo) => velo.statut === "MAINTENANCE").length;
  const velosEnLocation = velos.filter((velo) => enLocation.has(velo.id)).length;
  const velosDisponibles = parcActif.length - velosEnLocation - velosEnEntretien;

  // --- Clients : est « nouveau » celui dont la **première location** tombe
  //     dans la période. On se fonde sur la date de départ, pas sur la date
  //     de création de la fiche : ce qui intéresse l'exploitant, c'est de
  //     savoir si la personne roulait déjà avec nous auparavant.
  const premiereReservation = new Map<string, DateISO>();
  for (const reservation of reservations) {
    if (reservation.statut === "ANNULEE") continue;
    const connue = premiereReservation.get(reservation.clientId);
    if (!connue || reservation.dateDebut < connue) {
      premiereReservation.set(reservation.clientId, reservation.dateDebut);
    }
  }
  const clientsDeLaPeriode = new Set(facturees.map((r) => r.clientId));
  let nouveauxClients = 0;
  for (const clientId of clientsDeLaPeriode) {
    const premiere = premiereReservation.get(clientId);
    if (premiere && premiere >= fenetreCourante.debut && premiere <= fenetreCourante.fin) {
      nouveauxClients += 1;
    }
  }
  const clientsRecurrents = clientsDeLaPeriode.size - nouveauxClients;

  const parPoint = new Map<string, number>();
  for (const reservation of facturees) {
    parPoint.set(reservation.pointDeRetraitId, (parPoint.get(reservation.pointDeRetraitId) ?? 0) + 1);
  }
  const originesReservations = points
    .map((point) => ({ clef: point.id, etiquette: point.ville, valeur: parPoint.get(point.id) ?? 0 }))
    .sort((a, b) => b.valeur - a.valeur);

  const notes = facturees.map((r) => r.note).filter((note): note is number => typeof note === "number");

  return {
    periode,
    fenetreCourante,
    periodeEnCours,
    periodePrecedente: precedente,
    chiffreAffaires: comparer(ca, caAvant),
    revenuMoyenParReservation: comparer(moyenne, moyenneAvant),
    cautionsEncaissees,
    cautionsRestituees,
    repartitionPaiements,
    nombreReservations: comparer(facturees.length, factureesAvant.length),
    tauxOccupation,
    dureeMoyenne: comparer(duree, dureeAvant),
    tauxAnnulation: comparer(tauxAnnulation, tauxAnnulationAvant),
    saisonnalite,
    evolutionChiffreAffaires,
    velosLesPlusLoues,
    velosDisponibles: Math.max(velosDisponibles, 0),
    velosEnLocation,
    velosEnEntretien,
    nouveauxClients,
    clientsRecurrents: Math.max(clientsRecurrents, 0),
    originesReservations,
    noteMoyenne: notes.length ? Number((somme(notes) / notes.length).toFixed(2)) : null,
    nombreAvis: notes.length,
  };
}

function comparer(valeur: number, precedente: number): IndicateurCompare {
  return {
    valeur,
    precedente,
    variation: precedente > 0 ? ((valeur - precedente) / precedente) * 100 : null,
  };
}

function somme(valeurs: number[]): number {
  return valeurs.reduce((total, valeur) => total + valeur, 0);
}

function moyenneDe(valeurs: number[]): number {
  return valeurs.length ? somme(valeurs) / valeurs.length : 0;
}

function etiquetteMois(mois: string): string {
  const [annee, numero] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(annee, numero - 1, 1)))
    .replace(".", "");
}

/** Export comptable (§2.3) : une ligne par réservation, séparateur point-virgule. */
export function exporterCsv(reservations: Reservation[]): string {
  const entetes = [
    "reference",
    "statut",
    "client",
    "email",
    "velo",
    "date_debut",
    "date_fin",
    "jours",
    "sous_total_xof",
    "options_xof",
    "remise_xof",
    "total_xof",
    "caution_xof",
    "moyen_paiement",
    "cree_le",
  ];

  const lignes = reservations.map((reservation) =>
    [
      reservation.reference,
      reservation.statut,
      `${reservation.client.prenom} ${reservation.client.nom}`,
      reservation.client.email,
      reservation.lignes.map((ligne) => ligne.veloNom).join(" + "),
      reservation.dateDebut,
      reservation.dateFin,
      reservation.jours,
      reservation.sousTotalXof,
      reservation.optionsXof,
      reservation.remiseXof,
      reservation.totalXof,
      reservation.cautionXof,
      reservation.paiements.find((p) => !p.estCaution)?.moyen ?? "",
      reservation.creeLe.slice(0, 10),
    ]
      .map(echapperCsv)
      .join(";"),
  );

  // BOM UTF-8 : sans lui, Excel affiche « Ã© » à la place des accents.
  return `﻿${entetes.join(";")}\n${lignes.join("\n")}\n`;
}

function echapperCsv(valeur: string | number): string {
  const texte = String(valeur);
  return /[";\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}
