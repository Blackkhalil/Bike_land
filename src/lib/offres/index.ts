/**
 * Le moteur de calcul des offres de groupe : Bike for All (par budget ou
 * par durée), Road trip en groupe et Gbashi Bike.
 *
 * Module pur : aucune lecture de base, d'horloge ni de réseau. Chaque
 * calcul reçoit la demande du client, les réglages des offres
 * (src/data/reglages-offres.ts) et le contexte du jour (date, instant
 * présent, vélos libres), et rend un résultat chiffré ou un refus motivé.
 * Le site, le comptoir et l'agent IA lisent tous ces mêmes chiffres :
 * l'agent ne calcule jamais (cahier des charges, étape 4).
 *
 *     const issue = calculerBikeForAllBudget(
 *       { personnes: 10, budgetXof: 10000, depart: "08:00", paiementElectronique: true },
 *       reglages,
 *       { date: "2026-11-14", maintenant: Date.now(), velosDisponibles: 18 },
 *     );
 *     if (issue.ok) issue.resultat.totalXof; // 11 250
 *     else issue.refus.message;
 */

export {
  budgetMinimumBikeForAllXof,
  calculerBikeForAllBudget,
  calculerBikeForAllDuree,
  cocoDuBudget,
  fraisOrganisationXof,
  minutesAchetees,
  prixAccompagnateurXof,
  prixCocoXof,
} from "./bike-for-all";
export { calculerRoadTrip, reductionRoadTripXof } from "./road-trip";
export { calculerGbashi } from "./gbashi";
export { penaliteRetardXof } from "./retard";
export { arrondiDivision, ESPACE_MONTANT, extraireMontants, formatMontant, formatNombre, formatPourcentage } from "./montants";
export { dateLimiteDuWeekend, heureDuRecap, heureEnClair, JOURS_WEEKEND } from "./calendrier";
export { NOMS_GAMMES, ORDRE_GAMMES } from "./recapitulatif";
export type {
  ChampOffre,
  Coco,
  CodeLigne,
  CodeOffreGroupe,
  CodeRefus,
  ContexteOffre,
  DemandeBikeForAllBudget,
  DemandeBikeForAllDuree,
  DemandeGbashi,
  DemandeRoadTrip,
  GammeVelo,
  HeureMinute,
  IssueOffre,
  LigneOffre,
  Refus,
  ResultatOffre,
} from "./types";
