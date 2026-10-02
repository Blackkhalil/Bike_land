/**
 * Le rapport du tableau de bord, sous une forme que l'on peut exporter.
 *
 * La page d'administration, l'export PDF et l'export CSV doivent dire la
 * même chose. Tant que chacun refaisait ses calculs, ils divergeaient : les
 * premiers exports ne reprenaient que la liste des réservations, sans
 * aucun des indicateurs de la page. Ce module assemble une fois tout ce que
 * la page affiche, section par section, et les deux exports le mettent en
 * forme chacun à leur façon. Aucun calcul métier n'est fait ici : les
 * chiffres viennent de `calculerStatistiques`, et ceux de la journée de
 * `indicateursDuJour`, que la page utilise aussi.
 */

import { aujourdhui } from "@/lib/dates";
import { estEnAttente, seulementPayees } from "@/lib/reservations";
import {
  calculerStatistiques,
  construirePeriode,
  type Granularite,
  type IndicateurCompare,
  type Statistiques,
} from "@/lib/statistiques";
import type { Client, Reservation, Velo } from "@/lib/types";

/* ------------------------------------------------------- La journée */

/**
 * Ce que l'atelier a à faire aujourd'hui.
 *
 * Partagé avec la page d'administration, pour que l'écran et l'export
 * annoncent toujours les mêmes chiffres. On se fie à l'état de la
 * réservation et non à ses dates : un vélo déjà remis n'est plus « à
 * préparer », un vélo pas encore parti n'est pas « attendu au retour ».
 */
export function indicateursDuJour(reservations: Reservation[], jour = aujourdhui()) {
  const actives = seulementPayees(reservations);
  const departs = actives.filter((r) => r.dateDebut <= jour && r.statut === "CONFIRMEE");
  const retours = actives.filter((r) => r.dateFin <= jour && r.statut === "EN_COURS");
  const aPayer = reservations.filter(estEnAttente);
  const participants = departs
    .filter((r) => r.offre === "road-trip")
    .reduce((total, r) => total + r.nombrePersonnes, 0);
  const cautions = departs
    .filter((r) => r.offre === "location-libre")
    .reduce((total, r) => total + r.cautionXof, 0);
  return { departs, retours, aPayer, participants, cautions };
}

/* ---------------------------------------------------- La structure */

export interface LigneRapport {
  libelle: string;
  valeur: string;
  /** Valeur de la période précédente, quand l'indicateur se compare. */
  precedente?: string;
  /** Évolution, « +12,5 % », ou un mot quand elle n'a pas de sens. */
  variation?: string;
  aide?: string;
}

export interface SectionRapport {
  titre: string;
  question: string;
  lignes: LigneRapport[];
}

export interface TableauRapport {
  titre: string;
  sousTitre: string;
  colonnes: string[];
  /** Colonnes alignées à droite : les nombres. */
  aDroite: number[];
  lignes: string[][];
}

export interface Rapport {
  titre: string;
  periodeLibelle: string;
  /** Fenêtre réellement mesurée, en clair. */
  fenetre: string;
  comparaison: string;
  editeLe: string;
  sections: SectionRapport[];
  tableaux: TableauRapport[];
  /** Les réservations de la période, pour le détail. */
  detail: Reservation[];
  statistiques: Statistiques;
}

/* -------------------------------------------------- Mise en forme */

/**
 * Les nombres sont écrits avec une espace ordinaire, pas l'espace fine
 * insécable de la mise en forme française : les polices standard du PDF
 * ne la connaissent pas, et certains tableurs la lisent comme du texte.
 */
export function nombre(n: number, decimales = 0): string {
  const [entier, frac] = Math.abs(n).toFixed(decimales).split(".");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}${groupe}${frac ? `,${frac}` : ""}`;
}

export const montant = (xof: number) => `${nombre(Math.round(xof))} F`;

export function dateCourte(iso: string | undefined): string {
  if (!iso) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

function variation(indicateur: IndicateurCompare, baisseSouhaitable = false): string {
  if (indicateur.variation === null) {
    return indicateur.valeur === 0 ? "-" : "nouveau";
  }
  const signe = indicateur.variation > 0 ? "+" : "";
  const sens =
    indicateur.variation === 0
      ? ""
      : (indicateur.variation > 0) !== baisseSouhaitable
        ? " (mieux)"
        : " (moins bien)";
  return `${signe}${nombre(indicateur.variation, 1)} %${sens}`;
}

function compare(
  libelle: string,
  indicateur: IndicateurCompare,
  formater: (n: number) => string,
  aide?: string,
  baisseSouhaitable = false,
): LigneRapport {
  return {
    libelle,
    valeur: formater(indicateur.valeur),
    precedente: formater(indicateur.precedente),
    variation: variation(indicateur, baisseSouhaitable),
    aide,
  };
}

/* ----------------------------------------------------- Assemblage */

export function construireRapport(entrees: {
  reservations: Reservation[];
  velos: Velo[];
  clients: Client[];
  granularite: Granularite;
}): Rapport {
  const { reservations, velos, clients, granularite } = entrees;
  const periode = construirePeriode(granularite);
  const stats = calculerStatistiques(reservations, velos, clients, periode);
  const jour = indicateursDuJour(reservations);
  const totalClients = stats.nouveauxClients + stats.clientsRecurrents;

  const sections: SectionRapport[] = [
    {
      titre: `Aujourd'hui, ${dateCourte(aujourdhui())}`,
      question: "Ce que l'atelier a à faire dans la journée.",
      lignes: [
        { libelle: "Départs à préparer", valeur: nombre(jour.departs.length) },
        { libelle: "Retours attendus", valeur: nombre(jour.retours.length) },
        {
          libelle: "Paiements en attente",
          valeur: nombre(jour.aPayer.length),
          aide: "Paniers encore dans leur délai, vélo retenu.",
        },
        {
          libelle: "Cocos et eaux à prévoir",
          valeur: nombre(jour.participants),
          aide: "Un coco et une eau par participant au road trip.",
        },
        {
          libelle: "Cautions à encaisser",
          valeur: montant(jour.cautions),
          aide: "En espèces au départ, rendues au retour du vélo.",
        },
        {
          libelle: "Vélos disponibles",
          valeur: `${nombre(stats.velosDisponibles)} sur ${nombre(velos.length)}`,
        },
      ],
    },
    {
      titre: "L'argent",
      question: "Ce que la période a rapporté, et si c'est mieux qu'avant.",
      lignes: [
        compare("Chiffre d'affaires", stats.chiffreAffaires, montant, "Réservations payées seulement."),
        {
          libelle: "Encaissé net",
          valeur: montant(stats.encaisseNet),
          aide: `Après ${montant(stats.fraisRetenus)} de frais d'encaissement SasPay (3,25 %).`,
        },
        { libelle: "Frais d'encaissement", valeur: montant(stats.fraisRetenus) },
        compare("Panier moyen", stats.revenuMoyenParReservation, montant),
        compare("Réservations payées", stats.nombreReservations, (n) => nombre(n), "Annulations exclues."),
        {
          libelle: "Cautions en circulation",
          valeur: montant(stats.cautionsEnCirculation),
          aide: "Espèces à rendre, hors chiffre d'affaires.",
        },
      ],
    },
    {
      titre: "Comment tournent les vélos",
      question: "Si le parc travaille assez, et si les clients vont au bout.",
      lignes: [
        {
          libelle: "Taux d'occupation",
          valeur: `${nombre(stats.tauxOccupation, 1)} %`,
          aide: `Part des journées-vélo utilisées, pour un parc de ${velos.length} vélos.`,
        },
        compare("Participants emmenés", stats.participants, (n) => nombre(n)),
        compare("Heures vendues", stats.heuresVendues, (n) => `${nombre(n)} h`),
        compare("Taux d'annulation", stats.tauxAnnulation, (n) => `${nombre(n, 1)} %`, undefined, true),
        { libelle: "Vélos en location", valeur: nombre(stats.velosEnLocation) },
        { libelle: "Vélos immobilisés", valeur: nombre(stats.velosEnEntretien), aide: "À l'atelier." },
        {
          libelle: "Note moyenne",
          valeur: stats.noteMoyenne !== null ? `${nombre(stats.noteMoyenne, 2)} / 5` : "aucune note",
          aide: `${stats.nombreAvis} avis sur la période.`,
        },
      ],
    },
    {
      titre: "Les clients",
      question: "Nouveaux ou habitués.",
      lignes: [
        { libelle: "Clients ayant réservé", valeur: nombre(totalClients) },
        { libelle: "Première location", valeur: nombre(stats.nouveauxClients) },
        { libelle: "Déjà venus", valeur: nombre(stats.clientsRecurrents) },
      ],
    },
  ];

  // Les séries sur douze mois partagent les mêmes mois : un seul tableau.
  const departsParMois = new Map(stats.saisonnalite.map((s) => [s.clef, s.valeur]));
  const tableaux: TableauRapport[] = [
    {
      titre: "Les deux formules",
      sousTitre: "Laquelle fait tourner l'activité sur la période.",
      colonnes: ["Formule", "Réservations", "Volume", "Chiffre d'affaires"],
      aDroite: [1, 2, 3],
      lignes: stats.parOffre.map((o) => [
        o.nom,
        nombre(o.reservations),
        `${nombre(o.volume)} ${o.uniteVolume}`,
        montant(o.chiffreAffaires),
      ]),
    },
    {
      titre: "Moyens de paiement",
      sousTitre: "Montant encaissé par moyen sur la période.",
      colonnes: ["Moyen", "Montant"],
      aDroite: [1],
      lignes: stats.repartitionPaiements.map((s) => [s.etiquette, montant(s.valeur)]),
    },
    {
      titre: "Vélos les plus loués",
      sousTitre: "Nombre de sorties sur la période.",
      colonnes: ["Vélo", "Sorties"],
      aDroite: [1],
      lignes: stats.velosLesPlusLoues.map((s) => [s.etiquette, nombre(s.valeur)]),
    },
    {
      titre: "Sur douze mois",
      sousTitre: "La tendance de fond, indépendante de la période choisie. Payé seulement.",
      colonnes: ["Mois", "Chiffre d'affaires", "Départs"],
      aDroite: [1, 2],
      lignes: stats.evolutionChiffreAffaires.map((s) => [
        s.etiquette,
        montant(s.valeur),
        nombre(departsParMois.get(s.clef) ?? 0),
      ]),
    },
  ];

  const detail = reservations
    .filter((r) => r.dateFin >= periode.debut && r.dateDebut <= periode.fin)
    .sort((a, b) =>
      a.dateDebut === b.dateDebut
        ? a.reference.localeCompare(b.reference)
        : a.dateDebut.localeCompare(b.dateDebut),
    );

  return {
    titre: "Tableau de bord",
    periodeLibelle: periode.libelle,
    fenetre: `Du ${dateCourte(stats.fenetreCourante.debut)} au ${dateCourte(stats.fenetreCourante.fin)}`,
    comparaison: `Comparé au ${dateCourte(stats.periodePrecedente.debut)} - ${dateCourte(stats.periodePrecedente.fin)}`,
    editeLe: dateCourte(new Date().toISOString()),
    sections,
    tableaux,
    detail,
    statistiques: stats,
  };
}

/* --------------------------------------------------------- Le CSV */

/**
 * Le rapport complet en CSV, lisible par Excel.
 *
 * Un CSV n'a qu'une grille, mais un tableur affiche sans peine plusieurs
 * blocs séparés par une ligne vide. Le fichier reprend donc la page dans
 * son ordre : chaque section d'indicateurs avec la période précédente et
 * l'évolution, chaque tableau de répartition, puis le détail des
 * réservations, colonne pour colonne comme l'ancien export, pour que le
 * comptable retrouve ses repères.
 *
 * Les montants y sont des nombres bruts, sans « F » ni espace : un
 * tableur doit pouvoir les additionner.
 */
export function exporterRapportCsv(rapport: Rapport, detailCsv: string): string {
  const cellule = (v: string | number) => {
    const t = String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const ligne = (...valeurs: (string | number)[]) => valeurs.map(cellule).join(";");
  // « 12 500 F » devient 12500 ; « 7,5 % » devient 7,5. Le reste est laissé.
  const brut = (v: string) =>
    /^-?[\d ]+(,\d+)?( F| %| h)?$/.test(v) ? v.replace(/ (F|%|h)$/, "").replace(/ /g, "") : v;

  const blocs: string[] = [
    [
      ligne(`${rapport.titre} - ${rapport.periodeLibelle}`),
      ligne(rapport.fenetre),
      ligne(rapport.comparaison),
      ligne(`Édité le ${rapport.editeLe}`),
    ].join("\n"),
  ];

  for (const section of rapport.sections) {
    blocs.push(
      [
        ligne(section.titre),
        ligne("Indicateur", "Valeur", "Période précédente", "Évolution", "Précision"),
        ...section.lignes.map((l) =>
          ligne(l.libelle, brut(l.valeur), l.precedente ? brut(l.precedente) : "", l.variation ?? "", l.aide ?? ""),
        ),
      ].join("\n"),
    );
  }

  for (const tableau of rapport.tableaux) {
    blocs.push(
      [
        ligne(tableau.titre),
        ligne(...tableau.colonnes),
        ...(tableau.lignes.length
          ? tableau.lignes.map((l) => ligne(...l.map((v, i) => (i === 0 ? v : brut(v)))))
          : [ligne("Aucune donnée sur la période")]),
      ].join("\n"),
    );
  }

  blocs.push(`${ligne("Détail des réservations de la période")}\n${detailCsv.replace(/^\uFEFF/, "").trimEnd()}`);

  // BOM UTF-8 : sans lui, Excel affiche « Ã© » à la place des accents.
  return `\uFEFF${blocs.join("\n\n")}\n`;
}
