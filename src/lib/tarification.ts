/**
 * Calcul du devis de location.
 *
 * Un seul endroit calcule un prix dans tout le projet : le parcours de
 * réservation, l'API et l'espace d'administration appellent tous
 * `calculerDevis`. Le montant affiché au client est donc, par construction,
 * celui qui sera enregistré.
 */

import { optionsLocation, reglesPrix } from "@/data/catalogue";
import { estHauteSaison, nombreDeJours, type DateISO } from "./dates";
import type { OptionLocation, Velo } from "./types";

/** Majoration appliquée en saison sèche, période de forte demande (§2.2). */
export const MAJORATION_HAUTE_SAISON = 0.1;

export interface OptionChoisie {
  code: string;
  quantite: number;
}

export interface LigneDevis {
  libelle: string;
  detail: string;
  montantXof: number;
}

export interface Devis {
  jours: number;
  prixJourXof: number;
  sousTotalXof: number;
  majorationSaisonXof: number;
  remiseXof: number;
  remisePourcent: number;
  libelleRemise: string | null;
  optionsXof: number;
  cautionXof: number;
  totalXof: number;
  /** Montant réellement débité maintenant : total hors caution pré-autorisée. */
  aPayerXof: number;
  lignes: LigneDevis[];
  optionsDetaillees: { option: OptionLocation; quantite: number; montantXof: number }[];
}

export function regleApplicable(jours: number) {
  return (
    reglesPrix.find((regle) => jours >= regle.minJours && (regle.maxJours === null || jours <= regle.maxJours)) ??
    reglesPrix[0]
  );
}

export function calculerDevis(
  velo: Pick<Velo, "prixJourXof" | "cautionXof">,
  dateDebut: DateISO,
  dateFin: DateISO,
  optionsChoisies: OptionChoisie[] = [],
  avecAssuranceRemplacantCaution = true,
): Devis {
  const jours = Math.max(1, nombreDeJours(dateDebut, dateFin));
  const base = velo.prixJourXof * jours;

  // La majoration ne s'applique qu'aux jours effectivement en haute saison,
  // pour ne pas pénaliser une location à cheval sur deux périodes.
  const joursHauteSaison = compterJoursHauteSaison(dateDebut, jours);
  const majorationSaisonXof = Math.round(velo.prixJourXof * joursHauteSaison * MAJORATION_HAUTE_SAISON);

  const sousTotalXof = base + majorationSaisonXof;

  const regle = regleApplicable(jours);
  const remiseXof = Math.round((sousTotalXof * regle.remisePourcent) / 100);

  const optionsDetaillees = optionsChoisies
    .map((choix) => {
      const option = optionsLocation.find((o) => o.code === choix.code);
      if (!option || choix.quantite < 1) return null;
      const quantite = option.quantifiable ? Math.min(choix.quantite, 6) : 1;
      const multiplicateur = option.unite === "jour" ? jours : 1;
      return {
        option,
        quantite,
        montantXof: option.prixXof * quantite * multiplicateur,
      };
    })
    .filter((ligne): ligne is NonNullable<typeof ligne> => ligne !== null);

  const optionsXof = optionsDetaillees.reduce((total, ligne) => total + ligne.montantXof, 0);

  // L'assurance sérénité couvre la casse et le vol : la caution n'a plus
  // lieu d'être pré-autorisée (cf. FAQ « Une caution est-elle demandée ? »).
  const assuranceSouscrite = optionsDetaillees.some((ligne) => ligne.option.code === "assurance");
  const cautionXof = assuranceSouscrite && avecAssuranceRemplacantCaution ? 0 : velo.cautionXof;

  const totalXof = sousTotalXof - remiseXof + optionsXof;

  const lignes: LigneDevis[] = [
    {
      libelle: `${jours} jour${jours > 1 ? "s" : ""} de location`,
      detail: `${velo.prixJourXof.toLocaleString("fr-FR")} FCFA par jour`,
      montantXof: base,
    },
  ];

  if (majorationSaisonXof > 0) {
    lignes.push({
      libelle: "Haute saison",
      detail: `${joursHauteSaison} jour${joursHauteSaison > 1 ? "s" : ""} entre novembre et mars`,
      montantXof: majorationSaisonXof,
    });
  }

  if (remiseXof > 0) {
    lignes.push({
      libelle: regle.libelle,
      detail: `− ${regle.remisePourcent} % sur la location`,
      montantXof: -remiseXof,
    });
  }

  for (const ligne of optionsDetaillees) {
    lignes.push({
      libelle: ligne.option.libelle + (ligne.quantite > 1 ? ` × ${ligne.quantite}` : ""),
      detail: ligne.option.unite === "jour" ? `${ligne.option.prixXof.toLocaleString("fr-FR")} FCFA / jour` : "Forfait",
      montantXof: ligne.montantXof,
    });
  }

  return {
    jours,
    prixJourXof: velo.prixJourXof,
    sousTotalXof,
    majorationSaisonXof,
    remiseXof,
    remisePourcent: regle.remisePourcent,
    libelleRemise: remiseXof > 0 ? regle.libelle : null,
    optionsXof,
    cautionXof,
    totalXof,
    aPayerXof: totalXof,
    lignes,
    optionsDetaillees,
  };
}

function compterJoursHauteSaison(dateDebut: DateISO, jours: number): number {
  let compte = 0;
  const depart = new Date(`${dateDebut}T00:00:00.000Z`).getTime();
  for (let i = 0; i < jours; i += 1) {
    const jour = new Date(depart + i * 86_400_000).toISOString().slice(0, 10);
    if (estHauteSaison(jour)) compte += 1;
  }
  return compte;
}

/** Prix affiché « à partir de » sur les cartes du catalogue. */
export function prixIndicatifSemaine(velo: Pick<Velo, "prixJourXof">): number {
  const regle = regleApplicable(7);
  const brut = velo.prixJourXof * 7;
  return brut - Math.round((brut * regle.remisePourcent) / 100);
}
