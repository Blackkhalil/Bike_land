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
 *  - **road trip** : forfait par personne, selon la gamme du vélo ;
 *  - **location libre** : grille horaire, selon la gamme du vélo ;
 *  - **Octobre rose** : un prix par personne, le même pour tous les vélos
 *    (src/data/octobre-rose.ts).
 *
 * La tarification journalière (majoration de haute saison, remises de
 * durée) a été retirée : elle ne correspondait plus à l'activité.
 */

import { optionsLocation } from "@/data/catalogue";
import { OCTOBRE_ROSE } from "@/data/octobre-rose";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  COCOS_ROAD_TRIP,
  FRAIS_PAIEMENT_EN_LIGNE_XOF,
  PRIX_ROAD_TRIP_XOF,
  prixLocationLibre,
  type CodeOffre,
  type GammeVelo,
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
  /**
   * Gamme du velo choisi : c'est elle qui commande le prix.
   *
   * Obligatoire pour le road trip et la location libre depuis que la
   * plaquette distingue Classique, Premium et Prestige. Sans elle, il n'y
   * a pas de tarif a appliquer, et en inventer un serait pire que
   * d'echouer. Octobre rose s'en passe : son prix ne depend pas du velo.
   */
  gamme?: GammeVelo;
  /** Road trip et Octobre rose : nombre de participants. Un par défaut. */
  nombrePersonnes?: number;
  /** Location libre : durée en heures, telle que publiée dans la grille. */
  dureeHeures?: number;
  options?: OptionChoisie[];
  /**
   * Code de parrainage déjà vérifié par l'appelant.
   *
   * Le devis ne le valide pas : il ne sait rien des dates de validité ni
   * des quotas, et un module de tarification qui interrogerait la base ne
   * serait plus une fonction pure. C'est le dépôt qui vérifie, dans la
   * transaction qui crée la réservation, puis passe ici le montant retenu.
   */
  remise?: { code: string; montantXof: number };
  /**
   * Vente réglée en espèces au comptoir : au prix de la plaquette, sans les
   * frais du paiement en ligne que portent les tarifs du site (cf.
   * `FRAIS_PAIEMENT_EN_LIGNE_XOF`). Le serveur ne l'accorde qu'à une vente
   * saisie dans l'administration, jamais à une réservation en ligne.
   */
  especes?: boolean;
}

export interface Devis {
  offre: CodeOffre;
  /** `null` pour Octobre rose, dont le prix ne dépend pas du vélo. */
  gamme: GammeVelo | null;
  nombrePersonnes: number;
  dureeHeures: number | null;
  sousTotalXof: number;
  optionsXof: number;
  /** Réduction accordée par un code de parrainage, zéro sans code. */
  remiseXof: number;
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

/** Erreur métier : rien ne fixe le prix demandé (gamme absente, sortie non fixée). */
export class TarifIntrouvableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarifIntrouvableError";
  }
}

export function calculerDevis(parametres: ParametresDevis): Devis {
  const { offre } = parametres;
  const gamme = parametres.gamme ?? null;
  const nombrePersonnes = Math.max(1, Math.min(parametres.nombrePersonnes ?? 1, 12));

  const lignes: LigneDevis[] = [];
  let sousTotalXof: number;
  let cautionXof: number;
  let dureeHeures: number | null = null;
  // En espèces au comptoir : le prix de la plaquette, sans les frais du
  // paiement en ligne que portent les tarifs du site.
  const fraisRetires = parametres.especes ? FRAIS_PAIEMENT_EN_LIGNE_XOF : 0;

  if (offre === "octobre-rose") {
    const sortie = OCTOBRE_ROSE.sortie;
    if (!sortie) throw new TarifIntrouvableError("La sortie Octobre rose n'est pas encore fixée.");
    // Un prix par personne, quel que soit le vélo attribué. Une sortie
    // gratuite ne coûte rien, même au comptoir.
    const prixUnitaire = Math.max(0, sortie.prixXof - (sortie.prixXof > 0 ? fraisRetires : 0));
    sousTotalXof = prixUnitaire * nombrePersonnes;
    cautionXof = 0;
    lignes.push({
      libelle:
        nombrePersonnes > 1 ? `Octobre rose, ${nombrePersonnes} personnes` : "Octobre rose, 1 personne",
      detail: `${prixUnitaire.toLocaleString("fr-FR")} FCFA par personne, vélo, casque, eau et coco compris`,
      montantXof: sousTotalXof,
    });
  } else if (!gamme) {
    throw new TarifIntrouvableError("La gamme du vélo est nécessaire pour fixer ce prix.");
  } else if (offre === "road-trip") {
    const prixUnitaire = PRIX_ROAD_TRIP_XOF[gamme] - fraisRetires;
    const cocos = COCOS_ROAD_TRIP[gamme];
    sousTotalXof = prixUnitaire * nombrePersonnes;
    cautionXof = 0;
    lignes.push({
      libelle:
        nombrePersonnes > 1 ? `Road trip, ${nombrePersonnes} personnes` : "Road trip, 1 personne",
      detail:
        `${prixUnitaire.toLocaleString("fr-FR")} FCFA par personne, eau et ` +
        `${cocos > 1 ? `${cocos} cocos` : "1 coco"} compris`,
      montantXof: sousTotalXof,
    });
  } else {
    dureeHeures = parametres.dureeHeures ?? 1;
    const prix = prixLocationLibre(gamme, dureeHeures);
    // Une durée hors grille n'est pas arrondie en silence : elle est
    // refusée. Inventer un prix serait pire que de renvoyer une erreur.
    if (prix === null) throw new DureeNonTarifeeError(dureeHeures);

    sousTotalXof = prix - fraisRetires;
    cautionXof = CAUTION_LOCATION_LIBRE_XOF;
    lignes.push({
      libelle: `Location libre, ${dureeHeures} h`,
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

  // La réduction s'applique après les options, sur le total : c'est ce que
  // le client comprend d'un « −1 % », et elle est plafonnée par
  // `reductionPour`, donc jamais de total négatif ni de montant trop bas
  // pour être encaissé.
  const avantRemise = sousTotalXof + optionsXof;
  const remiseXof = Math.min(Math.max(parametres.remise?.montantXof ?? 0, 0), avantRemise);

  if (remiseXof > 0 && parametres.remise) {
    lignes.push({
      libelle: `Code ${parametres.remise.code}`,
      detail: "Parrainage partenaire",
      // Négatif : le récapitulatif l'affiche avec un signe moins, sans
      // avoir à connaître la nature de la ligne.
      montantXof: -remiseXof,
    });
  }

  const totalXof = avantRemise - remiseXof;

  return {
    offre,
    gamme,
    nombrePersonnes,
    dureeHeures,
    sousTotalXof,
    optionsXof,
    remiseXof,
    cautionXof,
    totalXof,
    aPayerXof: totalXof,
    lignes,
    optionsDetaillees,
  };
}
