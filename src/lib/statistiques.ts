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
  dateAuBenin,
  listerJours,
  moisDe,
  nombreDeJours,
  periodesSeChevauchent,
  type DateISO,
} from "./dates";
import { OFFRES } from "@/data/offres";
import { fraisEncaissement } from "./paiement";
import { estPayee, seulementPayees } from "./reservations";
import type { Client, CodeOffre, MoyenPaiement, Reservation, Velo } from "./types";

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
  /** Période demandée, telle quelle (le mois entier, l'année entière, etc.). */
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
  /**
   * Frais d'encaissement retenus par SasPay sur la période.
   *
   * Ils sont compris dans les tarifs affichés : le client paie le prix
   * annoncé, et SasPay en prélève sa part avant que l'argent arrive. Le
   * chiffre d'affaires ci-dessus est donc ce que les clients ont payé, pas
   * ce qui est arrivé dans le portefeuille, d'où cette ligne.
   *
   * Les frais de retrait n'y sont pas : ils se paient par versement, pas
   * par réservation.
   */
  fraisRetenus: number;
  /** Ce qui arrive dans le portefeuille SasPay, frais d'encaissement déduits. */
  encaisseNet: number;
  revenuMoyenParReservation: IndicateurCompare;
  repartitionPaiements: Serie[];
  /**
   * Cautions actuellement entre les mains du coordinateur : locations
   * libres parties et pas encore rendues. C'est de l'argent liquide à
   * rendre, pas du chiffre d'affaires, d'où sa place à part.
   */
  cautionsEnCirculation: number;

  // --- Indicateurs de réservation
  nombreReservations: IndicateurCompare;
  tauxOccupation: number;
  tauxAnnulation: IndicateurCompare;
  saisonnalite: Serie[];
  evolutionChiffreAffaires: Serie[];

  /**
   * Répartition entre les deux formules. C'est la lecture principale de
   * l'activité : le road trip se facture au participant, la location
   * libre à l'heure, et les deux ne se pilotent pas de la même façon.
   */
  parOffre: {
    code: CodeOffre;
    nom: string;
    reservations: number;
    chiffreAffaires: number;
    /** Participants pour le road trip, heures vendues pour la location libre. */
    volume: number;
    uniteVolume: string;
  }[];
  /** Total de participants emmenés en road trip sur la période. */
  participants: IndicateurCompare;
  /** Total d'heures vendues en location libre sur la période. */
  heuresVendues: IndicateurCompare;

  // --- Indicateurs sur le parc
  velosLesPlusLoues: Serie[];
  velosDisponibles: number;
  velosEnLocation: number;
  velosEnEntretien: number;

  // --- Indicateurs clients
  nouveauxClients: number;
  clientsRecurrents: number;
  noteMoyenne: number | null;
  nombreAvis: number;
}

const libellesMoyens: Record<MoyenPaiement, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS_CASH: "Celtiis Cash",
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

  // Deux lectures, et il ne faut pas les mêler.
  //
  // L'activité se compte au jour de la sortie : qui a roulé, combien de
  // vélos sont sortis, quelles heures ont été vendues.
  //
  // L'argent se compte au jour où il est encaissé. Compté au jour de la
  // sortie, comme autrefois, un client qui payait le samedi un road trip
  // du dimanche ne faisait apparaître son argent au tableau de bord que le
  // lendemain, alors qu'il était déjà sur le compte SasPay. C'est arrivé.
  //
  // Seules les réservations payées entrent dans les comptes : un panier
  // non réglé n'est pas une vente.
  const roulees = seulementPayees(courantes);
  const rouleesAvant = seulementPayees(anciennes);

  const payees = seulementPayees(reservations);
  const encaisseesDans = (bornes: Periode) =>
    payees.filter((r) => {
      const jour = dateEncaissement(r);
      return jour >= bornes.debut && jour <= bornes.fin;
    });
  const facturees = encaisseesDans(fenetreCourante);
  const factureesAvant = encaisseesDans(precedente);

  const ca = somme(facturees.map((r) => r.totalXof));
  const caAvant = somme(factureesAvant.map((r) => r.totalXof));

  // Seuls les frais d'encaissement sont comptés ici : ils se paient sur
  // chaque paiement, donc réservation par réservation. Les frais de
  // retrait, eux, dépendent du rythme des versements et non des
  // réservations, les mêler donnerait un chiffre qu'aucun relevé ne
  // confirmerait jamais.
  const fraisRetenus = somme(facturees.map((r) => fraisEncaissement(r.totalXof)));

  const moyenne = facturees.length ? Math.round(ca / facturees.length) : 0;
  const moyenneAvant = factureesAvant.length ? Math.round(caAvant / factureesAvant.length) : 0;

  const paiements = facturees.flatMap((r) => r.paiements);

  // --- Répartition par formule. Le volume ne se compte pas de la même
  //     façon des deux côtés : le road trip se facture au participant,
  //     la location libre à l'heure. Les additionner n'aurait aucun sens,
  //     on les garde donc côte à côte avec leur unité.
  const participantsDe = (liste: Reservation[]) =>
    somme(liste.filter((r) => r.offre === "road-trip").map((r) => r.nombrePersonnes));
  const heuresDe = (liste: Reservation[]) =>
    somme(liste.filter((r) => r.offre === "location-libre").map((r) => r.dureeHeures ?? 0));

  const parOffre = OFFRES.map((offre) => {
    const lignes = facturees.filter((r) => r.offre === offre.code);
    const roadTrip = offre.code === "road-trip";
    return {
      code: offre.code,
      nom: offre.nom,
      reservations: lignes.length,
      chiffreAffaires: somme(lignes.map((r) => r.totalXof)),
      volume: roadTrip ? participantsDe(lignes) : heuresDe(lignes),
      uniteVolume: roadTrip ? "participants" : "heures",
    };
  });

  // --- Cautions en circulation : locations libres sorties et pas encore
  //     rendues. Cet argent est en espèces chez le coordinateur, il n'est
  //     jamais encaissé en ligne, ce n'est donc pas du chiffre d'affaires.
  const cautionsEnCirculation = somme(
    reservations
      .filter((r) => r.statut === "EN_COURS" && r.offre === "location-libre")
      .map((r) => r.cautionXof),
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
  for (const reservation of roulees) {
    for (const jour of listerJours(reservation.dateDebut, reservation.dateFin)) {
      if (jour >= fenetreCourante.debut && jour <= fenetreCourante.fin) {
        joursLoues += reservation.lignes.length;
      }
    }
  }
  const tauxOccupation = capacite > 0 ? (joursLoues / capacite) * 100 : 0;

  // La durée moyenne en jours a été retirée : toutes les sorties tiennent
  // désormais dans la journée, elle valait donc 1,0 en permanence. Ce qui
  // varie, et qu'on mesure à la place, ce sont les participants emmenés et
  // les heures vendues.
  // Le taux d'annulation se rapporte aux réservations réelles,
  // annulations comprises, et jamais aux paniers abandonnés : un
  // panier qu'on n'a pas payé n'a pas été annulé, il n'a pas existé.
  const courantesReelles = courantes.filter((r) => estPayee(r) || r.statut === "ANNULEE");
  const anciennesReelles = anciennes.filter((r) => estPayee(r) || r.statut === "ANNULEE");
  const tauxAnnulation = courantesReelles.length
    ? (courantes.filter((r) => r.statut === "ANNULEE").length / courantesReelles.length) * 100
    : 0;
  const tauxAnnulationAvant = anciennesReelles.length
    ? (anciennes.filter((r) => r.statut === "ANNULEE").length / anciennesReelles.length) * 100
    : 0;

  // --- Séries temporelles sur les douze derniers mois, indépendantes du
  //     filtre de période : elles servent à lire la tendance de fond.
  const finSeries = fenetreCourante.fin;
  const debutDouzeMois = ajouterJours(finSeries, -364);
  const surDouzeMois = reservations.filter(
    (r) => estPayee(r) && r.dateDebut >= debutDouzeMois && r.dateDebut <= finSeries,
  );
  const encaisseesSurDouzeMois = payees.filter((r) => {
    const jour = dateEncaissement(r);
    return jour >= debutDouzeMois && jour <= finSeries;
  });

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
    reservationsParMois.set(mois, (reservationsParMois.get(mois) ?? 0) + 1);
  }
  for (const reservation of encaisseesSurDouzeMois) {
    const mois = moisDe(dateEncaissement(reservation));
    caParMois.set(mois, (caParMois.get(mois) ?? 0) + reservation.totalXof);
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
  for (const reservation of roulees) {
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
      .filter((r) => estPayee(r) && r.dateDebut <= maintenant && r.dateFin >= maintenant)
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
    if (!estPayee(reservation)) continue;
    const connue = premiereReservation.get(reservation.clientId);
    if (!connue || reservation.dateDebut < connue) {
      premiereReservation.set(reservation.clientId, reservation.dateDebut);
    }
  }
  const clientsDeLaPeriode = new Set(roulees.map((r) => r.clientId));
  let nouveauxClients = 0;
  for (const clientId of clientsDeLaPeriode) {
    const premiere = premiereReservation.get(clientId);
    if (premiere && premiere >= fenetreCourante.debut && premiere <= fenetreCourante.fin) {
      nouveauxClients += 1;
    }
  }
  const clientsRecurrents = clientsDeLaPeriode.size - nouveauxClients;

  // La répartition par point de départ a été retirée : il n'y en a qu'un,
  // sur la route des Pêches. Un graphique à une seule barre n'apprend rien.

  const notes = roulees.map((r) => r.note).filter((note): note is number => typeof note === "number");

  return {
    periode,
    fenetreCourante,
    periodeEnCours,
    periodePrecedente: precedente,
    chiffreAffaires: comparer(ca, caAvant),
    fraisRetenus,
    encaisseNet: ca - fraisRetenus,
    revenuMoyenParReservation: comparer(moyenne, moyenneAvant),
    repartitionPaiements,
    cautionsEnCirculation,
    nombreReservations: comparer(facturees.length, factureesAvant.length),
    tauxOccupation,
    tauxAnnulation: comparer(tauxAnnulation, tauxAnnulationAvant),
    parOffre,
    participants: comparer(participantsDe(roulees), participantsDe(rouleesAvant)),
    heuresVendues: comparer(heuresDe(roulees), heuresDe(rouleesAvant)),
    saisonnalite,
    evolutionChiffreAffaires,
    velosLesPlusLoues,
    velosDisponibles: Math.max(velosDisponibles, 0),
    velosEnLocation,
    velosEnEntretien,
    nouveauxClients,
    clientsRecurrents: Math.max(clientsRecurrents, 0),
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
  const libelle = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(annee, numero - 1, 1)))
    .replace(".", "");
  // La fenêtre glissante de 12 mois couvre presque toujours 13 mois
  // calendaires : sans l'année, le mois de bord (ex. « sept ») apparaît deux
  // fois et devient ambigu sur le graphique comme dans son repli textuel.
  return `${libelle} ${String(annee).slice(2)}`;
}

/**
 * Export comptable : une ligne par réservation, séparateur point-virgule.
 *
 * La colonne `jours` a été retirée, toutes les sorties tiennent dans la
 * journée, au profit de ce qui détermine réellement le montant :
 * la formule, le nombre de participants (road trip) et la durée en heures
 * (location libre).
 *
 * `caution_especes_xof` porte ce nom pour lever toute ambiguïté
 * comptable : cette somme n'est jamais encaissée en ligne, elle est
 * remise en liquide au départ et rendue au retour du vélo. Elle ne fait
 * donc pas partie du chiffre d'affaires.
 */
export function exporterCsv(reservations: Reservation[]): string {
  const entetes = [
    "reference",
    "statut",
    "offre",
    "nombre_personnes",
    "duree_heures",
    "client",
    "email",
    "telephone",
    "velo",
    "date_debut",
    "sous_total_xof",
    "options_xof",
    "total_xof",
    "caution_especes_xof",
    "moyen_paiement",
    "code_parrainage",
    "remise_parrainage_xof",
    "commission_partenaire_xof",
    "cree_le",
    "confirme_le",
  ];

  const lignes = reservations.map((reservation) =>
    [
      reservation.reference,
      reservation.statut,
      reservation.offre,
      reservation.offre === "road-trip" ? reservation.nombrePersonnes : "",
      reservation.offre === "location-libre" ? (reservation.dureeHeures ?? "") : "",
      `${reservation.client.prenom} ${reservation.client.nom}`,
      reservation.client.email,
      reservation.client.telephone ?? "",
      reservation.lignes.map((ligne) => ligne.veloNom).join(" + "),
      reservation.dateDebut,
      reservation.sousTotalXof,
      reservation.optionsXof,
      reservation.totalXof,
      reservation.cautionXof,
      reservation.paiements.find((p) => !p.estCaution)?.moyen ?? "",
      reservation.codeParrainage ?? "",
      reservation.codeParrainage ? reservation.remiseXof : "",
      reservation.commissionParrainageXof ?? "",
      reservation.creeLe.slice(0, 10),
      reservation.confirmeLe?.slice(0, 10) ?? "",
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

/**
 * Le jour où l'argent d'une réservation est entré, à l'heure de Cotonou.
 *
 * C'est la confirmation du paiement qui fait foi. Une réservation
 * ancienne, d'avant que cette date soit enregistrée, retombe sur sa date
 * de création.
 */
export function dateEncaissement(reservation: Reservation): DateISO {
  return dateAuBenin(reservation.confirmeLe ?? reservation.creeLe);
}
