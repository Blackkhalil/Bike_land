/**
 * Calcul du devis.
 *
 * Un seul endroit calcule un prix dans tout le projet : le parcours de
 * réservation, l'API et l'espace d'exploitation appellent tous
 * `calculerDevis`. Le montant affiché au client est donc, par
 * construction, celui qui sera enregistré.
 *
 * Le prix ne dépend plus du vélo mais de l'offre choisie :
 *
 *  - **road trip** : forfait par personne, quel que soit le vélo ;
 *  - **location libre** : grille horaire, quel que soit le vélo.
 *
 * La tarification journalière (majoration de haute saison, remises de
 * durée) a été retirée : elle ne correspondait plus à l'activité.
 */

import { optionsLocation } from "@/data/catalogue";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  PRIX_ROAD_TRIP_XOF,
  prixLocationLibre,
  type CodeOffre,
} from "@/data/offres";
import type { OptionLocation } from "./types";

export interface OptionChoisie {
  code: string;
  quantite: number;
}

export interface LigneDevis {
  libelle: string;
  detail: string;
  montantXof: number;
}

export interface ParametresDevis {
  offre: CodeOffre;
  /** Road trip : nombre de participants. Un par défaut. */
  nombrePersonnes?: number;
  /** Location libre : durée en heures, telle que publiée dans la grille. */
  dureeHeures?: number;
  options?: OptionChoisie[];
}

export interface Devis {
  offre: CodeOffre;
  nombrePersonnes: number;
  dureeHeures: number | null;
  sousTotalXof: number;
  optionsXof: number;
  /**
   * Caution demandée. Elle n'est PAS encaissée en ligne : elle est
   * remise en espèces au départ, en même temps que la pièce d'identité,
   * et rendue à la restitution du vélo.
   */
  cautionXof: number;
  totalXof: number;
  /** Montant réellement débité en ligne : le total, hors caution. */
  aPayerXof: number;
  lignes: LigneDevis[];
  optionsDetaillees: { option: OptionLocation; quantite: number; montantXof: number }[];
}

/** Erreur métier : durée hors de la grille publiée. */
export class DureeNonTarifeeError extends Error {
  constructor(heures: number) {
    super(`Aucun tarif publié pour ${heures} heures de location libre.`);
    this.name = "DureeNonTarifeeError";
  }
}

export function calculerDevis(parametres: ParametresDevis): Devis {
  const { offre } = parametres;
  const nombrePersonnes = Math.max(1, Math.min(parametres.nombrePersonnes ?? 1, 12));

  const lignes: LigneDevis[] = [];
  let sousTotalXof: number;
  let cautionXof: number;
  let dureeHeures: number | null = null;

  if (offre === "road-trip") {
    sousTotalXof = PRIX_ROAD_TRIP_XOF * nombrePersonnes;
    cautionXof = 0;
    lignes.push({
      libelle:
        nombrePersonnes > 1 ? `Road trip — ${nombrePersonnes} personnes` : "Road trip — 1 personne",
      detail: `${PRIX_ROAD_TRIP_XOF.toLocaleString("fr-FR")} FCFA par personne, eau et coco compris`,
      montantXof: sousTotalXof,
    });
  } else {
    dureeHeures = parametres.dureeHeures ?? 1;
    const prix = prixLocationLibre(dureeHeures);
    // Une durée hors grille n'est pas arrondie en silence : elle est
    // refusée. Inventer un prix serait pire que de renvoyer une erreur.
    if (prix === null) throw new DureeNonTarifeeError(dureeHeures);

    sousTotalXof = prix;
    cautionXof = CAUTION_LOCATION_LIBRE_XOF;
    lignes.push({
      libelle: `Location libre — ${dureeHeures} h`,
      detail: "Vélo, casque et antivol compris",
      montantXof: sousTotalXof,
    });
  }

  const optionsDetaillees = (parametres.options ?? [])
    .map((choix) => {
      const option = optionsLocation.find((o) => o.code === choix.code);
      if (!option || choix.quantite < 1) return null;
      const quantite = option.quantifiable ? Math.min(choix.quantite, 6) : 1;
      return { option, quantite, montantXof: option.prixXof * quantite };
    })
    .filter((ligne): ligne is NonNullable<typeof ligne> => ligne !== null);

  const optionsXof = optionsDetaillees.reduce((total, ligne) => total + ligne.montantXof, 0);

  for (const ligne of optionsDetaillees) {
    lignes.push({
      libelle: ligne.option.libelle + (ligne.quantite > 1 ? ` × ${ligne.quantite}` : ""),
      detail: ligne.option.description,
      montantXof: ligne.montantXof,
    });
  }

  const totalXof = sousTotalXof + optionsXof;

  return {
    offre,
    nombrePersonnes,
    dureeHeures,
    sousTotalXof,
    optionsXof,
    cautionXof,
    totalXof,
    aPayerXof: totalXof,
    lignes,
    optionsDetaillees,
  };
}
