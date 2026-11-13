/**
 * Le moteur de calcul des offres de groupe : Bike for All (par budget ou
 * par durée), Road trip en groupe et Gbashi Bike.
 *
 * Module pur : aucune lecture de base, d'horloge ni de réseau. Chaque
 * calcul reçoit la demande du client, les réglages des offres
 * (src/data/reglages-offres.ts) et le contexte de la vente (canal, date,
 * instant présent, vélos libres), et rend un résultat chiffré ou un refus
 * motivé. Le site et le comptoir lisent tous deux ces mêmes chiffres.
 *
 * Le canal est fixé par le serveur selon la route, jamais par le client :
 * « en-ligne » sur le site (frais de paiement électronique, date limite du
 * week-end, délai minimum avant le départ), « comptoir » dans
 * l'administration (espèces, sans ces frais ni ces règles).
 *
 *     const issue = calculerBikeForAllBudget(
 *       { personnes: 10, budgetXof: 10000, depart: "08:00" },
 *       reglages,
 *       { canal: "en-ligne", date: "2026-11-14", maintenant: Date.now(), velosDisponibles: 18 },
 *     );
 *     if (issue.ok) issue.resultat.totalXof; // 11 250 (10 000 F au comptoir)
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
  CanalVente,
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
