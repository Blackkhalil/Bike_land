/**
 * Bike for All : le client donne son budget (cahier des charges, 4.1) ou
 * sa durée (4.2), avec l'accompagnateur en option (4.3).
 *
 * Le calcul suit le pseudo-code du cahier, ligne pour ligne et dans le
 * même ordre, avec les réglages à la place des chiffres :
 *
 *     frais      = (B >= 15000) ? 2000 : 1000
 *     par_pers   = B * 0.20 / N
 *     coco       = par_pers >= 275 ? "grand" : par_pers >= 175 ? "petit" : "aucun"
 *     cout_coco  = prix(coco) * N
 *     minutes    = arrondi_bas_15((B - frais - cout_coco) * 60 / (N * 800))
 *     si minutes < 30 et coco != "aucun" : coco = "aucun" ; cout_coco = 0 ; recalculer minutes
 *     si minutes < 30 : refuser ("budget insuffisant pour ce groupe")
 *     heures     = max(1, arrondi_haut(minutes / 60))
 *     accomp     = accompagnateur ? borner(1500 + 200*(N-5) + 250*(heures-1), 1500, 5000) : 0
 *     gateaux    = N * gateaux_par_pers * 150
 *     paiement   = paiement_electronique ? 125 * N : 0
 *     total      = B + gateaux + accomp + paiement
 *     prix_barre = N * minutes * 25 + cout_coco + 3000 + gateaux + accomp + paiement
 *
 * Le tableur, lui, ne refuse pas sous 30 minutes : le refus est une
 * décision du responsable (décision 16), avec le budget minimum calculé.
 *
 * Les comparaisons et les arrondis se font en nombres entiers (dix-
 * millièmes pour les taux) : 20 % de 13 750 F pour 10 personnes donne
 * exactement 275 F, donc un grand coco, sans dépendre d'un arrondi
 * flottant.
 */

import type { ReglagesOffres } from "@/data/reglages-offres";

import { dureeEnClair, estHeureValide, heureDe, minutesDe } from "./calendrier";
import {
  compte,
  controlerCalendrier,
  controlerDepart,
  controlerOptions,
  controlerPersonnes,
  controlerRetour,
  estEntierPositif,
  refusSaisie,
  velosLibres,
} from "./controles";
import { fraisPaiementDe, gateauxDe, ligneAccompagnateur, ligneFraisPaiement, ligneGateaux } from "./lignes";
import { arrondiDivision, enDixMilliemes, formatMontant } from "./montants";
import { recapBikeForAll } from "./recapitulatif";
import type {
  Coco,
  ContexteOffre,
  DemandeBikeForAllBudget,
  DemandeBikeForAllDuree,
  IssueOffre,
  LigneOffre,
  Refus,
  ResultatOffre,
} from "./types";

type Reglages = Pick<
  ReglagesOffres,
  "tarifNormalHeureXof" | "bikeForAll" | "accompagnateur" | "consommables" | "paiement" | "dateLimiteWeekend" | "retard"
>;

const COCOS: readonly Coco[] = ["aucun", "petit", "grand"];

/** Les frais d'organisation : 1 000 F, ou 2 000 F dès le seuil (15 000 F). */
export function fraisOrganisationXof(montantXof: number, reglages: Pick<ReglagesOffres, "bikeForAll">): number {
  const { seuilGrosBudgetXof, fraisOrganisationGrosXof, fraisOrganisationXof: frais } = reglages.bikeForAll;
  return montantXof >= seuilGrosBudgetXof ? fraisOrganisationGrosXof : frais;
}

/** Le prix d'un coco de ce format, zéro pour « aucun ». */
export function prixCocoXof(coco: Coco, reglages: Pick<ReglagesOffres, "consommables">): number {
  if (coco === "grand") return reglages.consommables.cocoGrandXof;
  if (coco === "petit") return reglages.consommables.cocoPetitXof;
  return 0;
}

/**
 * Le coco que permet le budget : on y consacre au plus 20 % du budget. S'il
 * en reste au moins le prix d'un grand coco par personne, c'est un grand ;
 * au moins le prix d'un petit, un petit ; sinon aucun.
 */
export function cocoDuBudget(budgetXof: number, personnes: number, reglages: Pick<ReglagesOffres, "bikeForAll" | "consommables">): Coco {
  // budget × part / personnes ≥ prix, écrit sans division ni flottant.
  const partCocos = budgetXof * enDixMilliemes(reglages.bikeForAll.partMaxCocos);
  if (partCocos >= reglages.consommables.cocoGrandXof * personnes * 10000) return "grand";
  if (partCocos >= reglages.consommables.cocoPetitXof * personnes * 10000) return "petit";
  return "aucun";
}

/** Les minutes de vélo qu'achète un montant au tarif Bike for All, arrondies au pas inférieur (15 min). */
export function minutesAchetees(montantXof: number, personnes: number, reglages: Pick<ReglagesOffres, "bikeForAll">): number {
  const { tarifHeurePersonneXof, pasMinutes } = reglages.bikeForAll;
  return pasMinutes * Math.floor((Math.max(0, montantXof) * 60) / (personnes * tarifHeurePersonneXof * pasMinutes));
}

/**
 * Le prix de l'accompagnateur : 1 500 F + 200 F par personne au-delà des 5
 * comprises dans ce minimum + 250 F par heure entamée après la première ;
 * jamais moins de 1 500 F, jamais plus de 5 000 F (cahier, 4.3 ; tableur,
 * « B4-5 » : les 5 personnes sont le réglage `personnesIncluses`).
 */
export function prixAccompagnateurXof(personnes: number, minutes: number, reglages: Pick<ReglagesOffres, "accompagnateur">): number {
  const { minXof, personnesIncluses, parPersonneXof, parHeureXof, plafondXof } = reglages.accompagnateur;
  const heures = Math.max(1, Math.ceil(minutes / 60));
  const prix = minXof + parPersonneXof * (personnes - personnesIncluses) + parHeureXof * (heures - 1);
  return Math.min(plafondXof, Math.max(minXof, prix));
}

/**
 * Le budget minimum d'un groupe : ce qui paie la durée minimale (30 min)
 * au tarif Bike for All, plus les frais d'organisation, sans coco (le coco
 * saute avant le refus). Avec les réglages de départ : 1 000 F + 400 F par
 * personne, soit 8 200 F pour 18 personnes, et jamais moins que le budget
 * minimum réglé (5 000 F).
 *
 * Le seuil des frais à 2 000 F (15 000 F) fait un trou à 33 et 34
 * personnes. Pour 34 : 14 600 F passent (1 000 F de frais), 15 000 F non
 * (2 000 F de frais, il ne reste plus de quoi rouler 30 minutes), 15 600 F
 * de nouveau. D'où `auMoinsXof` : le plus petit budget accepté à partir de
 * ce montant, celui qu'on propose au client qui vient d'en proposer un.
 * Dès 35 personnes, le minimum est 2 000 F + le temps (16 000 F pour 35).
 */
export function budgetMinimumBikeForAllXof(
  personnes: number,
  reglages: Pick<ReglagesOffres, "bikeForAll">,
  auMoinsXof = 0,
): number {
  const bfa = reglages.bikeForAll;
  const temps = Math.ceil((bfa.dureeMinMinutes * personnes * bfa.tarifHeurePersonneXof) / 60);
  const plancher = Math.max(bfa.budgetMinXof, auMoinsXof);
  // Sous le seuil, frais ordinaires : accepté dès frais + temps.
  const avecPetitsFrais = Math.max(plancher, bfa.fraisOrganisationXof + temps);
  if (avecPetitsFrais < bfa.seuilGrosBudgetXof) return avecPetitsFrais;
  // À partir du seuil, frais du gros budget.
  return Math.max(plancher, bfa.seuilGrosBudgetXof, bfa.fraisOrganisationGrosXof + temps);
}

/** Le prix barré : le temps au tarif normal, les cocos, les frais hors offre (3 000 F) et les options. */
function prixBarreXof(
  personnes: number,
  minutes: number,
  options: { cocosXof: number; gateauxXof: number; accompagnateurXof: number; fraisPaiementXof: number },
  reglages: Reglages,
): number {
  return (
    arrondiDivision(personnes * minutes * reglages.tarifNormalHeureXof, 60) +
    options.cocosXof +
    reglages.bikeForAll.fraisHorsOffreXof +
    options.gateauxXof +
    options.accompagnateurXof +
    options.fraisPaiementXof
  );
}

/** Les contrôles de saisie communs aux deux façons de demander. */
function controlerSaisie(demande: DemandeBikeForAllBudget | DemandeBikeForAllDuree): Refus | null {
  if (!estEntierPositif(demande.personnes)) return refusSaisie("personnes");
  if (!estHeureValide(demande.depart)) return refusSaisie("depart");
  if (demande.accompagnateur !== undefined && typeof demande.accompagnateur !== "boolean") {
    return refusSaisie("accompagnateur");
  }
  return controlerOptions(demande);
}

/**
 * Bike for All, le client donne son budget : le coco, la durée de vélo,
 * l'heure de retour, le prix et le prix barré, ou le refus motivé.
 */
export function calculerBikeForAllBudget(demande: DemandeBikeForAllBudget, reglages: Reglages, contexte: ContexteOffre): IssueOffre {
  const saisie = controlerSaisie(demande) ?? (estEntierPositif(demande.budgetXof) ? null : refusSaisie("budgetXof"));
  if (saisie) return { ok: false, refus: saisie };

  const bfa = reglages.bikeForAll;
  const N = demande.personnes;
  const B = demande.budgetXof;
  const gateauxParPersonne = demande.gateauxParPersonne ?? 0;
  const accompagnateur = demande.accompagnateur ?? false;

  const groupe = controlerPersonnes("bike-for-all", N, bfa.personnesMin, velosLibres(contexte.velosDisponibles));
  if (groupe) return { ok: false, refus: groupe };

  if (B < bfa.budgetMinXof) {
    const minimum = budgetMinimumBikeForAllXof(N, reglages);
    const message =
      minimum > bfa.budgetMinXof
        ? `Pour ${compte(N, "personne")}, le budget commence à ${formatMontant(minimum)} : de quoi rouler ${compte(bfa.dureeMinMinutes, "minute")}.`
        : `Bike for All commence à ${formatMontant(bfa.budgetMinXof)} pour le groupe.`;
    return { ok: false, refus: { code: "BUDGET_MIN", champ: "budgetXof", message, budgetMinimumXof: minimum } };
  }

  const calendrier = controlerCalendrier("bike-for-all", contexte, demande.depart, null, reglages, true) ?? controlerDepart(demande.depart, reglages);
  if (calendrier) return { ok: false, refus: calendrier };

  // Le pseudo-code du cahier, dans son ordre.
  const fraisXof = fraisOrganisationXof(B, reglages);
  let coco = cocoDuBudget(B, N, reglages);
  let cocosXof = prixCocoXof(coco, reglages) * N;
  let minutes = minutesAchetees(B - fraisXof - cocosXof, N, reglages);
  if (minutes < bfa.dureeMinMinutes && coco !== "aucun") {
    coco = "aucun";
    cocosXof = 0;
    minutes = minutesAchetees(B - fraisXof, N, reglages);
  }
  if (minutes < bfa.dureeMinMinutes) {
    const minimum = budgetMinimumBikeForAllXof(N, reglages, B);
    return {
      ok: false,
      refus: {
        code: "BUDGET_INSUFFISANT",
        champ: "budgetXof",
        message: `Avec ${formatMontant(B)}, votre groupe de ${compte(N, "personne")} ne peut pas rouler les ${compte(bfa.dureeMinMinutes, "minute")} du minimum. Il faut un budget de ${formatMontant(minimum)} au moins.`,
        budgetMinimumXof: minimum,
      },
    };
  }

  const retour = controlerRetour(demande.depart, minutes, "budget", reglages);
  if (retour) return { ok: false, refus: retour };

  const accompagnateurXof = accompagnateur ? prixAccompagnateurXof(N, minutes, reglages) : 0;
  const { gateaux, gateauxXof, coutXof: coutGateauxXof } = gateauxDe(N, gateauxParPersonne, reglages);
  const fraisPaiementXof = fraisPaiementDe(N, demande.paiementElectronique, reglages);
  const totalXof = B + gateauxXof + accompagnateurXof + fraisPaiementXof;
  const barreXof = prixBarreXof(N, minutes, { cocosXof, gateauxXof, accompagnateurXof, fraisPaiementXof }, reglages);
  const fin = heureDe(minutesDe(demande.depart) + minutes);

  const compris = coco === "aucun" ? "" : ` et ${compte(N, "coco")} ${coco} format (${formatMontant(cocosXof)})`;
  const lignes: LigneOffre[] = [
    {
      code: "budget",
      libelle: "Budget Bike for All",
      detail: `${dureeEnClair(minutes)} de vélo pour ${compte(N, "personne")}, frais d'organisation (${formatMontant(fraisXof)})${compris} compris`,
      montantXof: B,
    },
    ...ligneGateaux(gateaux, gateauxXof, reglages),
    ...ligneAccompagnateur(accompagnateurXof),
    ...ligneFraisPaiement(N, fraisPaiementXof, reglages),
  ];

  const resultat: ResultatOffre = {
    offre: "bike-for-all",
    mode: "budget",
    personnes: N,
    date: contexte.date,
    depart: demande.depart,
    fin,
    minutes,
    coco,
    cocos: coco === "aucun" ? 0 : N,
    eaux: 0,
    gateaux,
    velosParGamme: null,
    lignes,
    paiementElectronique: demande.paiementElectronique,
    fraisOrganisationXof: fraisXof,
    cocosXof,
    gateauxXof,
    accompagnateurXof,
    fraisPaiementXof,
    reductionXof: 0,
    totalXof,
    prixBarreXof: barreXof,
    encaisseNetXof: totalXof - cocosXof - coutGateauxXof - fraisPaiementXof,
    velosBloques: N,
    recapModele: recapBikeForAll(
      { personnes: N, totalXof, prixBarreXof: barreXof, minutes, depart: demande.depart, fin, coco, gateauxParPersonne, accompagnateur },
      reglages,
    ),
  };
  return { ok: true, resultat };
}

/**
 * Bike for All, le client donne sa durée : le prix s'additionne ligne par
 * ligne (temps de vélo, frais d'organisation, cocos, options). Le seuil des
 * frais à 2 000 F se compare ici au temps de vélo, comme dans le tableur
 * (décision 16).
 */
export function calculerBikeForAllDuree(demande: DemandeBikeForAllDuree, reglages: Reglages, contexte: ContexteOffre): IssueOffre {
  const saisie =
    controlerSaisie(demande) ??
    (estEntierPositif(demande.minutes) ? null : refusSaisie("minutes")) ??
    (COCOS.includes(demande.coco) ? null : refusSaisie("coco"));
  if (saisie) return { ok: false, refus: saisie };

  const bfa = reglages.bikeForAll;
  const N = demande.personnes;
  const { minutes, coco } = demande;
  const gateauxParPersonne = demande.gateauxParPersonne ?? 0;
  const accompagnateur = demande.accompagnateur ?? false;

  const groupe = controlerPersonnes("bike-for-all", N, bfa.personnesMin, velosLibres(contexte.velosDisponibles));
  if (groupe) return { ok: false, refus: groupe };

  if (minutes < bfa.dureeMinMinutes || minutes % bfa.pasMinutes !== 0) {
    const pas =
      bfa.pasMinutes === 15 ? "par quart d'heure" : bfa.pasMinutes === 30 ? "par demi-heure" : `par tranches de ${bfa.pasMinutes} minutes`;
    return {
      ok: false,
      refus: {
        code: "DUREE",
        champ: "minutes",
        message: `La durée de vélo se choisit ${pas}, à partir de ${compte(bfa.dureeMinMinutes, "minute")}.`,
      },
    };
  }

  const refus =
    controlerCalendrier("bike-for-all", contexte, demande.depart, null, reglages, true) ??
    controlerDepart(demande.depart, reglages) ??
    controlerRetour(demande.depart, minutes, "duree", reglages);
  if (refus) return { ok: false, refus };

  const tempsXof = arrondiDivision(N * minutes * bfa.tarifHeurePersonneXof, 60);
  const fraisXof = fraisOrganisationXof(tempsXof, reglages);
  const prixCoco = prixCocoXof(coco, reglages);
  const cocosXof = prixCoco * N;
  const accompagnateurXof = accompagnateur ? prixAccompagnateurXof(N, minutes, reglages) : 0;
  const { gateaux, gateauxXof, coutXof: coutGateauxXof } = gateauxDe(N, gateauxParPersonne, reglages);
  const fraisPaiementXof = fraisPaiementDe(N, demande.paiementElectronique, reglages);
  const totalXof = tempsXof + fraisXof + cocosXof + gateauxXof + accompagnateurXof + fraisPaiementXof;
  const barreXof = prixBarreXof(N, minutes, { cocosXof, gateauxXof, accompagnateurXof, fraisPaiementXof }, reglages);
  const fin = heureDe(minutesDe(demande.depart) + minutes);

  const lignes: LigneOffre[] = [
    {
      code: "temps",
      libelle: "Temps de vélo",
      detail: `${compte(N, "personne")} × ${dureeEnClair(minutes)}, à ${formatMontant(bfa.tarifHeurePersonneXof)} de l'heure par personne`,
      montantXof: tempsXof,
    },
    { code: "frais-organisation", libelle: "Frais d'organisation", montantXof: fraisXof },
    ...(cocosXof > 0
      ? [{ code: "cocos" as const, libelle: `Cocos ${coco} format`, detail: `${N} × ${formatMontant(prixCoco)}`, montantXof: cocosXof }]
      : []),
    ...ligneGateaux(gateaux, gateauxXof, reglages),
    ...ligneAccompagnateur(accompagnateurXof),
    ...ligneFraisPaiement(N, fraisPaiementXof, reglages),
  ];

  const resultat: ResultatOffre = {
    offre: "bike-for-all",
    mode: "duree",
    personnes: N,
    date: contexte.date,
    depart: demande.depart,
    fin,
    minutes,
    coco,
    cocos: coco === "aucun" ? 0 : N,
    eaux: 0,
    gateaux,
    velosParGamme: null,
    lignes,
    paiementElectronique: demande.paiementElectronique,
    fraisOrganisationXof: fraisXof,
    cocosXof,
    gateauxXof,
    accompagnateurXof,
    fraisPaiementXof,
    reductionXof: 0,
    totalXof,
    prixBarreXof: barreXof,
    encaisseNetXof: totalXof - cocosXof - coutGateauxXof - fraisPaiementXof,
    velosBloques: N,
    recapModele: recapBikeForAll(
      { personnes: N, totalXof, prixBarreXof: barreXof, minutes, depart: demande.depart, fin, coco, gateauxParPersonne, accompagnateur },
      reglages,
    ),
  };
  return { ok: true, resultat };
}
