/**
 * Ce que le chatbot calcule pour négocier : il ne calcule rien lui-même, il
 * fait tourner le moteur des offres de groupe (src/lib/offres), identique au
 * tableur du responsable, sur les choix du client et sur des variantes de
 * ces choix. Chaque proposition faite au client est donc un vrai résultat du
 * moteur, avec son vrai total ; le serveur le confirme ensuite (POST devis)
 * avant toute réservation.
 *
 * On y trouve :
 *  - l'évaluation des choix du client (`evaluer`) ;
 *  - les jours, les heures, les budgets et les durées à proposer en puces ;
 *  - les autres choix qui marchent quand le moteur refuse
 *    (`alternativesDuRefus`) ;
 *  - les variantes moins chères pour le même groupe (`variantesMoinsCheres`).
 *
 * Module pur : l'instant présent arrive en paramètre, rien ne touche au
 * réseau, au navigateur ni à l'horloge.
 */

import { ajouterJours, type DateISO } from "@/lib/dates";
import {
  budgetMinimumBikeForAllXof,
  calculerBikeForAllBudget,
  calculerBikeForAllDuree,
  calculerGbashi,
  calculerRoadTrip,
  formatMontant,
  formatPourcentage,
  heureEnClair,
  NOMS_GAMMES,
  ORDRE_GAMMES,
  type CodeOffreGroupe,
  type CodeRefus,
  type ContexteOffre,
  type GammeVelo,
  type HeureMinute,
  type IssueOffre,
  type Refus,
  type ResultatOffre,
} from "@/lib/offres";
import { dateAuBeninDe, dureeEnClair, heureDe, minutesDe } from "@/lib/offres/calendrier";

import type { ProchainCreneau } from "./api";
import type { Alternative, Choix, FaitsChat } from "./conversation";
import { jourEnClair, majuscule, personnesEnClair, personnesMinDe, velosEnClair } from "./textes-chat";

/** Assez de vélos pour qu'un calcul de calendrier ne bute jamais sur le parc. */
const PARC_ILLIMITE = 100_000;

/** Les refus qui disent seulement que ce jour ou cette heure ne se réserve pas en ligne. */
const REFUS_CALENDRIER: readonly CodeRefus[] = ["JOUR", "DATE_PASSEE", "DATE_LIMITE", "DELAI", "SAISIE"];

/** Le parc à prendre pour un calcul : les vélos libres connus, sinon ceux en état. */
export interface ParcConnu {
  velosDisponibles: number;
  stockParGamme: Partial<Record<GammeVelo, number>>;
}

/** Le contexte d'une vente en ligne, pour le moteur. Le serveur, lui, fixe le canal tout seul. */
function contexte(date: DateISO, maintenant: number, parc: ParcConnu): ContexteOffre {
  return {
    canal: "en-ligne",
    date,
    maintenant,
    velosDisponibles: parc.velosDisponibles,
    stockParGamme: parc.stockParGamme,
  };
}

/** Le parc en état, tel que le serveur l'a donné au chargement. */
export function parcDesFaits(faits: FaitsChat): ParcConnu {
  return { velosDisponibles: faits.velosEnEtat, stockParGamme: faits.parGamme };
}

/** La somme des vélos d'une répartition Gbashi Bike. */
export function totalVelos(velos: Partial<Record<GammeVelo, number>> | null): number {
  if (!velos) return 0;
  return ORDRE_GAMMES.reduce((total, gamme) => total + (velos[gamme] ?? 0), 0);
}

/**
 * Les choix du client suffisent-ils au moteur ? Les options pas encore
 * demandées prennent leur valeur par défaut : aucun gâteau, pas
 * d'accompagnateur, pas de coco (mode durée), pas de réduction. Rend `null`
 * tant qu'il manque l'essentiel (le jour, l'heure, le budget ou la durée).
 */
export function evaluer(choix: Choix, faits: FaitsChat, maintenant: number, parc: ParcConnu = parcDesFaits(faits)): IssueOffre | null {
  const { offre, date } = choix;
  if (!offre || !date) return null;
  const reglages = faits.reglages;
  const ctx = contexte(date, maintenant, parc);
  const gateauxParPersonne = choix.gateauxParPersonne ?? 0;

  if (offre === "bike-for-all") {
    if (choix.personnes === null || !choix.depart || !choix.mode) return null;
    const accompagnateur = choix.accompagnateur ?? false;
    if (choix.mode === "budget") {
      if (choix.budgetXof === null) return null;
      return calculerBikeForAllBudget(
        { personnes: choix.personnes, budgetXof: choix.budgetXof, depart: choix.depart, gateauxParPersonne, accompagnateur },
        reglages,
        ctx,
      );
    }
    if (choix.minutes === null) return null;
    return calculerBikeForAllDuree(
      {
        personnes: choix.personnes,
        minutes: choix.minutes,
        depart: choix.depart,
        coco: choix.coco ?? "aucun",
        gateauxParPersonne,
        accompagnateur,
      },
      reglages,
      ctx,
    );
  }

  if (offre === "road-trip-groupe") {
    if (choix.personnes === null) return null;
    return calculerRoadTrip(
      { personnes: choix.personnes, gateauxParPersonne, reductionValidee: choix.reduction.etat === "validee" },
      reglages,
      ctx,
    );
  }

  if (!choix.velos) return null;
  return calculerGbashi({ velos: choix.velos, gateauxParPersonne }, reglages, ctx);
}

/* ------------------------------------------------------- Jours et heures */

/**
 * Pourquoi ce jour ne se réserve pas en ligne pour cette offre, ou `null`
 * s'il se réserve. On le demande au moteur lui-même, avec le plus petit
 * groupe et un parc sans limite : seul le calendrier peut alors refuser (jour
 * de départ, jour passé, date limite du week-end, délai avant le départ). Le
 * refus est celui du moteur, son message compris.
 */
export function refusDuJour(offre: CodeOffreGroupe, date: DateISO, faits: FaitsChat, maintenant: number): Refus | null {
  const reglages = faits.reglages;
  const parc: ParcConnu = {
    velosDisponibles: PARC_ILLIMITE,
    stockParGamme: { CLASSIQUE: PARC_ILLIMITE, PREMIUM: PARC_ILLIMITE, PRESTIGE: PARC_ILLIMITE },
  };
  const ctx = contexte(date, maintenant, parc);
  const minimum = personnesMinDe(offre, reglages);
  if (offre === "road-trip-groupe") {
    const issue = calculerRoadTrip({ personnes: minimum }, reglages, ctx);
    return issue.ok ? null : issue.refus;
  }
  if (offre === "gbashi-groupe") {
    const issue = calculerGbashi({ velos: { CLASSIQUE: minimum } }, reglages, ctx);
    return issue.ok ? null : issue.refus;
  }
  const bfa = reglages.bikeForAll;
  const issue = calculerBikeForAllDuree(
    { personnes: minimum, minutes: bfa.dureeMinMinutes, depart: bfa.premierDepart, coco: "aucun" },
    reglages,
    ctx,
  );
  if (issue.ok) return null;
  // Le premier départ est passé ou trop proche, mais un départ plus tard le peut.
  const plusTard = Boolean(issue.refus.premierDepartPossible) && (issue.refus.code === "DELAI" || issue.refus.code === "DATE_PASSEE");
  return plusTard ? null : issue.refus;
}

/** Le jour se réserve-t-il en ligne pour cette offre ? (voir `refusDuJour`) */
export function jourOuvert(offre: CodeOffreGroupe, date: DateISO, faits: FaitsChat, maintenant: number): boolean {
  return refusDuJour(offre, date, faits, maintenant) === null;
}

/** Le jour d'aujourd'hui au Bénin. */
export function aujourdhuiAuBenin(maintenant: number): DateISO {
  return dateAuBeninDe(maintenant);
}

/**
 * Les prochains jours où l'offre se réserve en ligne, à partir d'aujourd'hui
 * (ou du lendemain de `apres`), sur trois mois au plus.
 */
export function joursProposes(
  offre: CodeOffreGroupe,
  faits: FaitsChat,
  maintenant: number,
  combien = 6,
  apres: DateISO | null = null,
): DateISO[] {
  const premier = apres ? ajouterJours(apres, 1) : aujourdhuiAuBenin(maintenant);
  const jours: DateISO[] = [];
  for (let ecart = 0; ecart < 92 && jours.length < combien; ecart += 1) {
    const date = ajouterJours(premier, ecart);
    if (jourOuvert(offre, date, faits, maintenant)) jours.push(date);
  }
  return jours;
}

/**
 * Les départs de Bike for All encore possibles ce jour-là, au pas réglé
 * (le quart d'heure), du premier au dernier départ des réglages. Un départ
 * passé ou trop proche (délai minimum en ligne) n'est pas proposé.
 */
export function departsProposes(date: DateISO, faits: FaitsChat, maintenant: number): HeureMinute[] {
  const reglages = faits.reglages;
  const bfa = reglages.bikeForAll;
  const parc: ParcConnu = { velosDisponibles: PARC_ILLIMITE, stockParGamme: {} };
  const departs: HeureMinute[] = [];
  for (let minute = minutesDe(bfa.premierDepart); minute <= minutesDe(bfa.dernierDepart); minute += bfa.pasMinutes) {
    const depart = heureDe(minute);
    const issue = calculerBikeForAllDuree(
      { personnes: bfa.personnesMin, minutes: bfa.dureeMinMinutes, depart, coco: "aucun" },
      reglages,
      contexte(date, maintenant, parc),
    );
    if (issue.ok || !REFUS_CALENDRIER.includes(issue.refus.code)) departs.push(depart);
  }
  return departs;
}

/** Un budget proposé en puce, avec ce qu'il achète d'après le moteur. */
export interface BudgetPropose {
  budgetXof: number;
  minutes: number;
  coco: ResultatOffre["coco"];
}

/**
 * Les budgets proposés au groupe : le plus petit budget accepté (calculé
 * par le moteur), puis des montants ronds au-dessus. Seuls ceux que le
 * moteur accepte sont proposés (le trou du seuil des 15 000 F, un retour
 * après l'heure limite, en sont écartés).
 */
export function budgetsProposes(choix: Choix, faits: FaitsChat, maintenant: number): BudgetPropose[] {
  if (choix.personnes === null) return [];
  const minimum = budgetMinimumBikeForAllXof(choix.personnes, faits.reglages);
  const montants = [minimum];
  for (let rond = Math.ceil((minimum + 1) / 5000) * 5000; montants.length < 7; rond += 5000) montants.push(rond);
  const proposes: BudgetPropose[] = [];
  for (const budgetXof of montants) {
    const issue = evaluer({ ...choix, mode: "budget", budgetXof, gateauxParPersonne: 0, accompagnateur: false }, faits, maintenant);
    if (issue?.ok) proposes.push({ budgetXof, minutes: issue.resultat.minutes, coco: issue.resultat.coco });
  }
  return proposes;
}

/** Les durées proposées, au pas réglé, de la durée minimale jusqu'au retour à l'heure limite. */
export function dureesProposees(choix: Choix, faits: FaitsChat, maintenant: number): number[] {
  if (!choix.depart) return [];
  const bfa = faits.reglages.bikeForAll;
  const durees: number[] = [];
  const longueurMax = minutesDe(bfa.retourAuPlusTard) - minutesDe(choix.depart);
  for (let minutes = bfa.dureeMinMinutes; minutes <= longueurMax; minutes += bfa.pasMinutes) {
    const issue = evaluer({ ...choix, mode: "duree", minutes, coco: "aucun", gateauxParPersonne: 0, accompagnateur: false }, faits, maintenant);
    if (issue?.ok) durees.push(minutes);
  }
  return durees;
}

/**
 * La répartition proposée d'office pour Gbashi Bike : les vélos les moins
 * chers d'abord, dans la limite de ce qu'il reste de chaque gamme. S'il n'y
 * en a pas assez, la répartition compte moins de vélos que de personnes : le
 * client la complète ou choisit un autre jour.
 */
export function repartitionParDefaut(
  personnes: number,
  stock: Partial<Record<GammeVelo, number>>,
  faits: FaitsChat,
): Record<GammeVelo, number> {
  const parPrix = [...ORDRE_GAMMES].sort((a, b) => faits.reglages.gbashi.prixXof[a] - faits.reglages.gbashi.prixXof[b]);
  const repartition: Record<GammeVelo, number> = { CLASSIQUE: 0, PREMIUM: 0, PRESTIGE: 0 };
  let reste = personnes;
  for (const gamme of parPrix) {
    const pris = Math.max(0, Math.min(reste, stock[gamme] ?? 0));
    repartition[gamme] = pris;
    reste -= pris;
  }
  return repartition;
}

/* ---------------------------------------------------- Quand le moteur refuse */

/** Le libellé d'un total, dans une proposition : « 11 250 F ». */
function avecTotal(libelle: string, issue: IssueOffre | null): string {
  return issue?.ok ? `${libelle} : ${formatMontant(issue.resultat.totalXof)}` : libelle;
}

/** Une proposition que le moteur accepte, ou `null`. */
function proposition(
  cle: string,
  libelle: string,
  changement: Partial<Choix>,
  choix: Choix,
  faits: FaitsChat,
  maintenant: number,
  parc?: ParcConnu,
): Alternative | null {
  const issue = evaluer({ ...choix, ...changement }, faits, maintenant, parc);
  if (!issue?.ok) return null;
  return { cle, libelle: avecTotal(libelle, issue), totalXof: issue.resultat.totalXof, changement };
}

/** Les deux prochains jours ouverts après celui demandé, comme propositions. */
function autresJours(choix: Choix, faits: FaitsChat, maintenant: number, combien = 2): Alternative[] {
  if (!choix.offre) return [];
  const apres = choix.date && choix.date >= aujourdhuiAuBenin(maintenant) ? choix.date : null;
  const jours = joursProposes(choix.offre, faits, maintenant, combien + 1, apres).filter((jour) => jour !== choix.date);
  const alternatives: Alternative[] = [];
  for (const date of jours.slice(0, combien)) {
    // Bike for All : le départ choisi, s'il se réserve encore ce jour-là ; sinon le premier possible.
    let changement: Partial<Choix> = { date };
    if (choix.offre === "bike-for-all" && choix.depart) {
      const departs = departsProposes(date, faits, maintenant);
      if (!departs.includes(choix.depart) && departs.length > 0) changement = { date, depart: departs[0] };
    }
    const issue = evaluer({ ...choix, ...changement }, faits, maintenant);
    const libelle = majuscule(jourEnClair(date));
    // Seul le serveur connaît les vélos libres de ce jour-là : un refus du
    // parc n'écarte pas le jour, le devis le dira.
    if (issue && !issue.ok && issue.refus.code !== "PARC" && issue.refus.code !== "STOCK_GAMME") continue;
    alternatives.push({
      cle: `jour-${date}`,
      libelle: issue?.ok ? avecTotal(libelle, issue) : libelle,
      ...(issue?.ok ? { totalXof: issue.resultat.totalXof } : {}),
      changement,
    });
  }
  return alternatives;
}

/** « Choisir une autre date » : on repose la question du jour. */
function autreDate(): Alternative {
  return { cle: "autre-date", libelle: "Choisir une autre date", changement: { date: null } };
}

/**
 * Le plus grand budget, sous celui proposé, que le moteur accepte, par pas
 * de 500 F : quand le budget offre trop de temps pour rentrer à l'heure.
 */
function plusGrandBudgetAccepte(choix: Choix, faits: FaitsChat, maintenant: number): number | null {
  if (choix.budgetXof === null || choix.personnes === null) return null;
  const minimum = budgetMinimumBikeForAllXof(choix.personnes, faits.reglages);
  for (let budget = Math.floor((choix.budgetXof - 1) / 500) * 500; budget >= minimum; budget -= 500) {
    if (evaluer({ ...choix, budgetXof: budget }, faits, maintenant)?.ok) return budget;
  }
  return evaluer({ ...choix, budgetXof: minimum }, faits, maintenant)?.ok ? minimum : null;
}

/**
 * Les autres choix à proposer quand le moteur (ou le serveur) refuse :
 * chacun est recalculé par le moteur et n'est proposé que s'il passe. Le
 * créneau libre le plus proche vient du serveur (`prochainCreneau`) : lui
 * seul connaît les vélos déjà pris.
 */
export function alternativesDuRefus(
  choix: Choix,
  refus: Refus,
  prochainCreneau: ProchainCreneau | null,
  faits: FaitsChat,
  maintenant: number,
): Alternative[] {
  const offre = choix.offre;
  if (!offre) return [];
  const alternatives: (Alternative | null)[] = [];
  const minimum = personnesMinDe(offre, faits.reglages);

  switch (refus.code) {
    case "BUDGET_MIN":
    case "BUDGET_INSUFFISANT": {
      const budgets = [refus.budgetInferieurXof, refus.budgetMinimumXof].filter(
        (budget, index, liste): budget is number => typeof budget === "number" && liste.indexOf(budget) === index,
      );
      for (const budgetXof of budgets) {
        const issue = evaluer({ ...choix, budgetXof }, faits, maintenant);
        if (!issue?.ok) continue;
        alternatives.push({
          cle: `budget-${budgetXof}`,
          libelle: `Budget de ${formatMontant(budgetXof)}, ${dureeEnClair(issue.resultat.minutes)} de vélo : ${formatMontant(issue.resultat.totalXof)}`,
          totalXof: issue.resultat.totalXof,
          changement: { budgetXof },
        });
      }
      break;
    }
    case "PERSONNES_MIN": {
      if (offre === "gbashi-groupe") {
        alternatives.push({ cle: "velos", libelle: "Revoir le nombre de vélos", changement: { velos: null, personnes: minimum } });
      } else {
        alternatives.push(
          proposition(`personnes-${minimum}`, `Passer à ${personnesEnClair(minimum)}`, { personnes: minimum }, choix, faits, maintenant),
        );
      }
      break;
    }
    case "PARC":
    case "STOCK_GAMME": {
      const maximum = refus.maximum ?? 0;
      if (refus.code === "STOCK_GAMME" || (offre === "gbashi-groupe" && maximum >= minimum)) {
        alternatives.push({ cle: "velos", libelle: "Changer la répartition des vélos", changement: { velos: null } });
      } else if (offre !== "gbashi-groupe" && maximum >= minimum && choix.personnes !== null && maximum < choix.personnes) {
        // Le serveur a compté ces vélos libres sur ce créneau : le moteur refait le prix pour eux.
        alternatives.push(
          proposition(
            `personnes-${maximum}`,
            `Passer à ${personnesEnClair(maximum)}`,
            { personnes: maximum },
            choix,
            faits,
            maintenant,
            { velosDisponibles: maximum, stockParGamme: faits.parGamme },
          ),
        );
      }
      let prochainPropose = false;
      if (prochainCreneau) {
        const changement: Partial<Choix> =
          offre === "bike-for-all" ? { date: prochainCreneau.date, depart: prochainCreneau.depart } : { date: prochainCreneau.date };
        const issue = evaluer({ ...choix, ...changement }, faits, maintenant);
        const quand =
          offre === "bike-for-all"
            ? `${majuscule(jourEnClair(prochainCreneau.date))} à ${heureEnClair(prochainCreneau.depart)}`
            : majuscule(jourEnClair(prochainCreneau.date));
        if (issue?.ok) {
          alternatives.push({ cle: "prochain-creneau", libelle: avecTotal(quand, issue), totalXof: issue.resultat.totalXof, changement });
          prochainPropose = true;
        } else if (offre === "gbashi-groupe" && choix.velos === null) {
          // Gbashi Bike, vélos pas encore répartis : le jour seul, la répartition suit.
          alternatives.push({ cle: "prochain-creneau", libelle: quand, changement });
          prochainPropose = true;
        }
      }
      alternatives.push(
        ...autresJours(choix, faits, maintenant).filter((jour) => !prochainPropose || jour.changement.date !== prochainCreneau?.date),
      );
      alternatives.push(autreDate());
      break;
    }
    case "DELAI":
    case "DATE_PASSEE": {
      if (refus.premierDepartPossible && offre === "bike-for-all") {
        alternatives.push(
          proposition(
            `depart-${refus.premierDepartPossible}`,
            `Partir à ${heureEnClair(refus.premierDepartPossible)}`,
            { depart: refus.premierDepartPossible },
            choix,
            faits,
            maintenant,
          ),
        );
      }
      alternatives.push(...autresJours(choix, faits, maintenant), autreDate());
      break;
    }
    case "DATE_LIMITE":
    case "JOUR": {
      alternatives.push(...autresJours(choix, faits, maintenant), autreDate());
      break;
    }
    case "HEURE": {
      if (refus.dernierDepartPossible) {
        alternatives.push(
          proposition(
            `depart-${refus.dernierDepartPossible}`,
            `Partir à ${heureEnClair(refus.dernierDepartPossible)}`,
            { depart: refus.dernierDepartPossible },
            choix,
            faits,
            maintenant,
          ),
        );
      }
      if (offre === "bike-for-all" && choix.depart) {
        const bfa = faits.reglages.bikeForAll;
        if (choix.mode === "duree") {
          const place = minutesDe(bfa.retourAuPlusTard) - minutesDe(choix.depart);
          const minutes = Math.floor(place / bfa.pasMinutes) * bfa.pasMinutes;
          if (minutes >= bfa.dureeMinMinutes && minutes !== choix.minutes) {
            alternatives.push(
              proposition(`duree-${minutes}`, `Rouler ${dureeEnClair(minutes)}`, { minutes }, choix, faits, maintenant),
            );
          }
        } else {
          const budgetXof = plusGrandBudgetAccepte(choix, faits, maintenant);
          if (budgetXof !== null) {
            const issue = evaluer({ ...choix, budgetXof }, faits, maintenant);
            if (issue?.ok) {
              alternatives.push({
                cle: `budget-${budgetXof}`,
                libelle: `Budget de ${formatMontant(budgetXof)}, ${dureeEnClair(issue.resultat.minutes)} de vélo : ${formatMontant(issue.resultat.totalXof)}`,
                totalXof: issue.resultat.totalXof,
                changement: { budgetXof },
              });
            }
          }
        }
      }
      alternatives.push(...autresJours(choix, faits, maintenant), autreDate());
      break;
    }
    case "DUREE": {
      alternatives.push({ cle: "duree", libelle: "Choisir une autre durée", changement: { minutes: null } });
      break;
    }
    case "SAISIE":
      break;
  }

  // Sans doublon, dans l'ordre.
  const vues = new Set<string>();
  return alternatives.filter((alternative): alternative is Alternative => {
    if (!alternative || vues.has(alternative.cle)) return false;
    vues.add(alternative.cle);
    return true;
  });
}

/* ------------------------------------------------- « C'est un peu cher » */

/**
 * Les variantes moins chères pour le même groupe, chacune recalculée par le
 * moteur avec son nouveau total : une durée plus courte, sans accompagnateur,
 * sans gâteaux, un coco plus petit ou pas de coco, un budget plus petit en
 * mode budget ; au road trip, la réduction ; à Gbashi Bike, des vélos moins
 * chers. Les plus proches du prix actuel d'abord.
 */
export function variantesMoinsCheres(choix: Choix, faits: FaitsChat, maintenant: number, parc?: ParcConnu): Alternative[] {
  const actuelle = evaluer(choix, faits, maintenant, parc);
  if (!actuelle?.ok || !choix.offre) return [];
  const totalActuel = actuelle.resultat.totalXof;
  const reglages = faits.reglages;
  const candidates: { cle: string; libelle: (total: string) => string; changement: Partial<Choix> }[] = [];
  const gateaux = choix.gateauxParPersonne ?? 0;

  if (choix.offre === "bike-for-all") {
    const bfa = reglages.bikeForAll;
    if (choix.mode === "duree" && choix.minutes !== null) {
      const plusCourte = choix.minutes - bfa.pasMinutes;
      if (plusCourte >= bfa.dureeMinMinutes) {
        candidates.push({
          cle: `duree-${plusCourte}`,
          libelle: (total) => `${majuscule(dureeEnClair(plusCourte))} de vélo au lieu de ${dureeEnClair(choix.minutes ?? 0)} : ${total}`,
          changement: { minutes: plusCourte },
        });
      }
      if (bfa.dureeMinMinutes < plusCourte) {
        candidates.push({
          cle: `duree-${bfa.dureeMinMinutes}`,
          libelle: (total) => `${majuscule(dureeEnClair(bfa.dureeMinMinutes))} de vélo : ${total}`,
          changement: { minutes: bfa.dureeMinMinutes },
        });
      }
      if (choix.coco === "grand") {
        candidates.push({ cle: "coco-petit", libelle: (total) => `Petit coco au lieu du grand : ${total}`, changement: { coco: "petit" } });
      }
      if (choix.coco && choix.coco !== "aucun") {
        candidates.push({ cle: "coco-aucun", libelle: (total) => `Sans coco : ${total}`, changement: { coco: "aucun" } });
      }
    }
    if (choix.mode === "budget" && choix.budgetXof !== null && choix.personnes !== null) {
      const minimum = budgetMinimumBikeForAllXof(choix.personnes, reglages);
      const rond = Math.floor((choix.budgetXof - 1) / 5000) * 5000;
      // Le montant rond peut valoir le minimum (10 personnes, 10 000 F) : une seule variante.
      for (const budgetXof of new Set([rond, minimum])) {
        if (budgetXof >= minimum && budgetXof < choix.budgetXof) {
          candidates.push({
            cle: `budget-${budgetXof}`,
            libelle: (total) => `Budget de ${formatMontant(budgetXof)} : ${total}`,
            changement: { budgetXof },
          });
        }
      }
    }
    if (choix.accompagnateur) {
      candidates.push({ cle: "sans-accompagnateur", libelle: (total) => `Sans accompagnateur : ${total}`, changement: { accompagnateur: false } });
    }
  }

  // La réduction se propose tant qu'elle peut encore être donnée : pas à un
  // client qui l'a déjà eue (décision 25), ni avec une capture déjà servie.
  const reductionPossible = choix.reduction.etat !== "validee" && !(choix.reduction.etat === "sans" && choix.reduction.raison);
  if (choix.offre === "road-trip-groupe" && reductionPossible && reglages.roadTrip.reduction > 0) {
    candidates.push({
      cle: "reduction",
      libelle: (total) =>
        `Avec la réduction de ${formatPourcentage(reglages.roadTrip.reduction)}, une capture d'abonnement à envoyer : ${total}`,
      changement: { reduction: { etat: "validee", preuveId: "" } },
    });
  }

  if (choix.offre === "gbashi-groupe" && choix.velos) {
    const stock = parc?.stockParGamme ?? faits.parGamme;
    const moinsChere = repartitionParDefaut(totalVelos(choix.velos), stock, faits);
    if (totalVelos(moinsChere) === totalVelos(choix.velos)) {
      candidates.push({
        cle: "velos-moins-chers",
        libelle: (total) => `${majuscule(velosEnClair(moinsChere))} : ${total}`,
        changement: { velos: moinsChere },
      });
    }
  }

  if (gateaux > 1) {
    candidates.push({ cle: "gateaux-1", libelle: (total) => `Un gâteau par personne : ${total}`, changement: { gateauxParPersonne: 1 } });
  }
  if (gateaux > 0) {
    candidates.push({ cle: "sans-gateaux", libelle: (total) => `Sans gâteaux : ${total}`, changement: { gateauxParPersonne: 0 } });
  }

  const variantes: Alternative[] = [];
  for (const candidate of candidates) {
    const issue = evaluer({ ...choix, ...candidate.changement }, faits, maintenant, parc);
    if (!issue?.ok || issue.resultat.totalXof >= totalActuel) continue;
    // La réduction ne s'obtient qu'avec une capture validée : la proposer, c'est reposer la question.
    const changement: Partial<Choix> = candidate.cle === "reduction" ? { reduction: { etat: "a-demander" } } : candidate.changement;
    variantes.push({
      cle: candidate.cle,
      libelle: candidate.libelle(formatMontant(issue.resultat.totalXof)),
      totalXof: issue.resultat.totalXof,
      changement,
    });
  }
  return variantes.sort((a, b) => (b.totalXof ?? 0) - (a.totalXof ?? 0));
}

/** Le nom d'une gamme dans une phrase : « Classique ». */
export function nomGamme(gamme: GammeVelo): string {
  return NOMS_GAMMES[gamme];
}
