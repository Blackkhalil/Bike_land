/**
 * Les lignes de prix communes aux trois offres de groupe : gâteaux, frais
 * de paiement électronique, accompagnateur. Une ligne à zéro n'est pas
 * montrée : au comptoir, pas de ligne de frais de paiement (décision 12).
 */

import type { ReglagesOffres } from "@/data/reglages-offres";

import { formatMontant } from "./montants";
import type { LigneOffre } from "./types";

/** Les gâteaux : le nombre, et leur prix. */
export function gateauxDe(
  personnes: number,
  gateauxParPersonne: number,
  reglages: Pick<ReglagesOffres, "consommables">,
): { gateaux: number; gateauxXof: number; coutXof: number } {
  const gateaux = personnes * gateauxParPersonne;
  return {
    gateaux,
    gateauxXof: gateaux * reglages.consommables.gateauPrixXof,
    coutXof: gateaux * reglages.consommables.gateauCoutXof,
  };
}

/** Les frais de paiement électronique : par personne en ligne, rien au comptoir. */
export function fraisPaiementDe(
  personnes: number,
  paiementElectronique: boolean,
  reglages: Pick<ReglagesOffres, "paiement">,
): number {
  return paiementElectronique ? personnes * reglages.paiement.fraisParPersonneXof : 0;
}

export function ligneGateaux(gateaux: number, gateauxXof: number, reglages: Pick<ReglagesOffres, "consommables">): LigneOffre[] {
  if (gateauxXof <= 0) return [];
  return [
    {
      code: "gateaux",
      libelle: "Gâteaux",
      detail: `${gateaux} × ${formatMontant(reglages.consommables.gateauPrixXof)}`,
      montantXof: gateauxXof,
    },
  ];
}

export function ligneAccompagnateur(accompagnateurXof: number): LigneOffre[] {
  if (accompagnateurXof <= 0) return [];
  return [
    {
      code: "accompagnateur",
      libelle: "Accompagnateur",
      detail: "Un guide Bike Land vous montre le circuit et vous suit tout au long du trajet",
      montantXof: accompagnateurXof,
    },
  ];
}

export function ligneFraisPaiement(personnes: number, fraisPaiementXof: number, reglages: Pick<ReglagesOffres, "paiement">): LigneOffre[] {
  if (fraisPaiementXof <= 0) return [];
  return [
    {
      code: "frais-paiement",
      libelle: "Frais de paiement électronique",
      detail: `${personnes} × ${formatMontant(reglages.paiement.fraisParPersonneXof)}`,
      montantXof: fraisPaiementXof,
    },
  ];
}
