/**
 * Le service des offres de groupe (lot 5b) : le devis, la réservation en
 * ligne payée par Mobile Money et la vente au comptoir de Bike for All, du
 * Road trip en groupe et de Gbashi Bike. Les routes (src/app/api/offres-groupe,
 * src/app/api/admin/offres-groupe) ne font que lire la requête et rendre ce
 * que ces fonctions répondent, statut HTTP compris.
 *
 * Tout ce dont elles ont besoin leur est passé (`DependancesOffresGroupe`) :
 * le dépôt, l'horloge, les réglages, l'interrupteur, l'encaissement et les
 * emails. Les routes passent les vrais (dependances.ts) ; les tests, des faux,
 * sans base, sans paiement ni email.
 *
 * Le navigateur ne décide de rien : le canal est fixé par la route, le prix
 * est refait par le moteur (src/lib/offres) avec les réglages et le parc du
 * moment, et la réduction du road trip ne vient que d'une preuve que le
 * serveur retrouve validée et libre (décision 8). Le total envoyé par le
 * navigateur (`attendu`) sert seulement à voir si le client a vu un autre
 * prix : il revoit alors le nouveau montant avant de payer.
 */

import { z } from "zod";

import { panierExpire } from "@/data/offres";
import type { LectureReglagesOffres, ReglagesOffres } from "@/data/reglages-offres";
import { ajouterJours, type DateISO } from "@/lib/dates";
import {
  CapaciteInsuffisanteError,
  TransactionDejaUtiliseeError,
  type DemandeReservationGroupe,
  type Depot,
  type ParcDuJour,
  type ResultatReservation,
} from "@/lib/db/contrat";
import {
  heureDeMinutes,
  minutesDeHeure,
  prochainDepartLibre,
  velosLibresSurCreneau,
  type CreneauMinutes,
  type VelosLibres,
} from "@/lib/disponibilite";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { auteurAdmin } from "@/lib/journal";
import {
  calculerBikeForAllBudget,
  calculerBikeForAllDuree,
  calculerGbashi,
  calculerRoadTrip,
  formatMontant,
  type CanalVente,
  type HeureMinute,
  type IssueOffre,
  type ResultatOffre,
} from "@/lib/offres";
import { jourDeLaSemaine } from "@/lib/offres/calendrier";
import type { DemandePaiement, FournisseurActif, ResultatPaiement } from "@/lib/paiement";
import { estPayee } from "@/lib/reservations";
import { site } from "@/lib/site";
import { fraisEncaissement } from "@/lib/tarifs-paiement";
import { genererToken } from "@/lib/tokens";
import type { DetailsOffreGroupe, GammeVelo, JourFerme, Reservation } from "@/lib/types";

import {
  schemaDemandeDevis,
  schemaDemandeReservation,
  schemaVenteComptoirGroupe,
  type CodeErreurOffresGroupe,
  type DemandeDevis,
  type ProchainCreneau,
  type ReponseDevis,
  type ReponseErreur,
  type ReponseReservation,
  type ReponseVenteComptoir,
  type StatutPreuve,
} from "./api";

/* --------------------------------------------------------- Dépendances */

/** Ce que le service lit et écrit dans le dépôt. */
export type DepotOffresGroupe = Pick<
  Depot,
  | "parcDuJour"
  | "creerReservationGroupe"
  | "listerReservations"
  | "compterEssai"
  | "confirmerPaiement"
  | "trouverPreuve"
  | "trouverReservationParReference"
  | "trouverReservationParPaiement"
  | "journaliser"
  | "listerJournal"
>;

export interface DependancesOffresGroupe {
  depot: DepotOffresGroupe;
  /** L'instant présent, en millisecondes. */
  maintenant: () => number;
  lireReglages: () => Promise<LectureReglagesOffres>;
  /** L'interrupteur « Offres de groupe », et les jours fermés à la réservation en ligne. */
  lireOuverture: () => Promise<{ offresGroupeActives: boolean; joursFermes: JourFerme[] }>;
  /** « saspay », « demo » ou « indisponible » (src/lib/paiement.ts). */
  fournisseur: () => FournisseurActif;
  encaisser: (demande: DemandePaiement) => Promise<ResultatPaiement>;
  /** Les emails : tentés, jamais bloquants (un envoi raté ne défait rien). */
  emails: {
    reception: (reservation: Reservation, lienSuivi: string) => Promise<unknown>;
    confirmation: (reservation: Reservation, lienSuivi: string) => Promise<unknown>;
    facture: (reservation: Reservation, lienSuivi: string) => Promise<unknown>;
    alerteAdmin: (reservation: Reservation) => Promise<unknown>;
  };
  /** L'adresse du site pour le lien de suivi (sur un aperçu, celle de la branche). */
  urlSite: () => string;
}

/** Ce qu'une fonction du service répond : le statut HTTP et le corps. */
export interface Reponse<T> {
  statut: number;
  corps: T;
}

/* ----------------------------------------------------------- Réglages */

/** Réservations en ligne acceptées par heure depuis une même adresse (beaucoup de clients la partagent derrière un opérateur mobile). */
export const RESERVATIONS_PAR_HEURE_ADRESSE = 12;
/** Réservations en ligne acceptées par heure pour un même numéro. */
export const RESERVATIONS_PAR_HEURE_NUMERO = 6;
/**
 * Devis acceptés par heure depuis une même adresse : large, la négociation en
 * demande beaucoup et plusieurs clients partagent l'adresse d'un opérateur
 * mobile ; assez pour qu'une boucle n'occupe pas la base de tout le site.
 */
export const DEVIS_PAR_HEURE_ADRESSE = 300;
/** Road trip et Gbashi Bike : jusqu'où chercher une date libre, en jours. */
export const JOURS_RECHERCHE_DATE = 60;
/** Bike for All : le jour demandé, puis jusqu'à tant de jours après. */
export const JOURS_RECHERCHE_BIKE_FOR_ALL = 13;

/* ------------------------------------------------------------ Réponses */

function erreur(statut: number, code: CodeErreurOffresGroupe, message: string): Reponse<ReponseErreur> {
  return { statut, corps: { ok: false, code, message } };
}

const MESSAGE_SAISIE =
  "Votre demande n'a pas pu être lue. Reprenez la conversation, puis réessayez.";

const messageFerme = () =>
  "Les offres de groupe ne se réservent pas en ligne pour le moment. " +
  `Écrivez-nous sur WhatsApp ou appelez-nous au ${site.telephone} : nous organisons votre sortie avec vous.`;

const messageReglagesIllisibles = () =>
  "La réservation des offres de groupe est momentanément indisponible. " +
  `Réessayez un peu plus tard, ou appelez-nous au ${site.telephone}.`;

/* ------------------------------------------------------- Vérifications */

/** Ce que toute demande vérifie d'abord : l'interrupteur, puis les réglages. */
interface Prealable {
  reglages: ReglagesOffres;
  /** Les jours fermés à la réservation en ligne ; aucun au comptoir. */
  joursFermes: JourFerme[];
}

async function verifierPrealable(
  deps: DependancesOffresGroupe,
  canal: CanalVente,
): Promise<Prealable | Reponse<ReponseErreur>> {
  const ouverture = await deps.lireOuverture();
  // Interrupteur coupé : plus aucune nouvelle demande de groupe, en ligne
  // comme au comptoir. Un paiement déjà lancé reste confirmé ailleurs.
  if (!ouverture.offresGroupeActives) return erreur(403, "FERME", messageFerme());
  let lecture: LectureReglagesOffres;
  try {
    lecture = await deps.lireReglages();
  } catch (e) {
    console.error("[offres-groupe] réglages des offres injoignables", e);
    return erreur(503, "REGLAGES_ILLISIBLES", messageReglagesIllisibles());
  }
  // Jamais de vente aux valeurs par défaut quand les réglages enregistrés ne se lisent plus.
  if (lecture.source === "illisible") {
    console.error(`[offres-groupe] réglages illisibles, vente refusée : ${lecture.probleme ?? "raison inconnue"}`);
    return erreur(503, "REGLAGES_ILLISIBLES", messageReglagesIllisibles());
  }
  return { reglages: lecture.reglages, joursFermes: canal === "en-ligne" ? ouverture.joursFermes : [] };
}

/* ------------------------------------------------------------- Calcul */

/** Tout ce qu'un calcul sur un jour donné doit savoir, et le parc déjà lu de chaque jour. */
interface ContexteCalcul {
  canal: CanalVente;
  reglages: ReglagesOffres;
  maintenant: number;
  joursFermes: JourFerme[];
  reductionValidee: boolean;
  depot: Pick<Depot, "parcDuJour">;
  parcs: Map<DateISO, Promise<ParcDuJour>>;
}

/** Le parc d'un jour, lu une seule fois par demande. */
function parcDu(date: DateISO, contexte: ContexteCalcul): Promise<ParcDuJour> {
  let parc = contexte.parcs.get(date);
  if (!parc) {
    parc = contexte.depot.parcDuJour(date);
    contexte.parcs.set(date, parc);
  }
  return parc;
}

/**
 * Ce jour est-il fermé à la réservation en ligne pour cette offre, depuis le
 * tableau de bord ? Un jour fermé « pour toutes les formules » ferme les
 * trois offres ; un jour fermé au road trip ferme le Road trip en groupe,
 * qui le remplace (décision 1). Le comptoir n'est pas concerné.
 */
function fermeEnLigne(offre: DemandeDevis["offre"], date: DateISO, contexte: ContexteCalcul): boolean {
  return contexte.joursFermes.some(
    (jour) => jour.date === date && (jour.formule === "toutes" || (jour.formule === "road-trip" && offre === "road-trip-groupe")),
  );
}

const AUCUN_VELO: VelosLibres = { total: 0, parGamme: { CLASSIQUE: 0, PREMIUM: 0, PRESTIGE: 0 }, ids: [] };

/** Les vélos libres sur le créneau ; aucun un jour fermé (le moteur refuse alors, faute de vélos). */
function libresSur(parc: ParcDuJour, creneau: CreneauMinutes, ferme: boolean): VelosLibres {
  return ferme ? AUCUN_VELO : velosLibresSurCreneau(parc, creneau);
}

/** Le créneau fixé par les réglages (road trip, Gbashi Bike). */
function creneauFixe(horaire: { depart: string; retour: string }): CreneauMinutes {
  return { debutMinute: minutesDeHeure(horaire.depart), finMinute: minutesDeHeure(horaire.retour) };
}

/** Bike for All : le moteur, en mode budget ou en mode durée, avec ce départ et ces vélos libres. */
function calculerBikeForAll(
  saisie: Extract<DemandeDevis, { offre: "bike-for-all" }>["saisie"],
  depart: HeureMinute,
  date: DateISO,
  contexte: ContexteCalcul,
  velos: { total: number; parGamme?: Record<GammeVelo, number> },
): IssueOffre {
  const base = {
    canal: contexte.canal,
    date,
    maintenant: contexte.maintenant,
    velosDisponibles: velos.total,
    ...(velos.parGamme ? { stockParGamme: velos.parGamme } : {}),
  };
  const commun = {
    personnes: saisie.personnes,
    depart,
    gateauxParPersonne: saisie.gateauxParPersonne,
    accompagnateur: saisie.accompagnateur,
  };
  return saisie.mode === "budget"
    ? calculerBikeForAllBudget({ ...commun, budgetXof: saisie.budgetXof }, contexte.reglages, base)
    : calculerBikeForAllDuree({ ...commun, minutes: saisie.minutes, coco: saisie.coco }, contexte.reglages, base);
}

/** Ce qu'un calcul sur un jour donne : l'issue du moteur, les vélos libres et le créneau regardé. */
interface Calcul {
  issue: IssueOffre;
  libres: VelosLibres;
  creneau: CreneauMinutes;
}

/**
 * Le calcul d'une demande sur un jour donné (et, pour Bike for All, un
 * départ donné), avec les vélos libres sur son créneau : c'est le plafond du
 * groupe (décision 10), toutes gammes, ou gamme par gamme pour Gbashi Bike.
 *
 * Bike for All par budget ne connaît son créneau qu'une fois la durée
 * achetée calculée : une première passe, avec tous les vélos du jour, donne
 * la durée ; la seconde refait le calcul avec les vélos libres sur ce
 * créneau-là. Le moteur étant pur, les deux passes ne diffèrent que par ce
 * plafond.
 */
async function calculerSur(
  demande: DemandeDevis,
  date: DateISO,
  contexte: ContexteCalcul,
  departBikeForAll?: HeureMinute,
): Promise<Calcul> {
  const parc = await parcDu(date, contexte);
  const ferme = fermeEnLigne(demande.offre, date, contexte);
  const { reglages } = contexte;
  const base = { canal: contexte.canal, date, maintenant: contexte.maintenant };

  if (demande.offre === "road-trip-groupe") {
    const creneau = creneauFixe(reglages.roadTrip);
    const libres = libresSur(parc, creneau, ferme);
    const issue = calculerRoadTrip(
      {
        personnes: demande.saisie.personnes,
        gateauxParPersonne: demande.saisie.gateauxParPersonne,
        reductionValidee: contexte.reductionValidee,
      },
      reglages,
      { ...base, velosDisponibles: libres.total, stockParGamme: libres.parGamme },
    );
    return { issue, libres, creneau };
  }

  if (demande.offre === "gbashi-groupe") {
    const creneau = creneauFixe(reglages.gbashi);
    const libres = libresSur(parc, creneau, ferme);
    const issue = calculerGbashi(
      { velos: demande.saisie.velos, gateauxParPersonne: demande.saisie.gateauxParPersonne },
      reglages,
      { ...base, velosDisponibles: libres.total, stockParGamme: libres.parGamme },
    );
    return { issue, libres, creneau };
  }

  const saisie = demande.saisie;
  const depart = departBikeForAll ?? saisie.depart;
  const premiere = calculerBikeForAll(saisie, depart, date, contexte, { total: ferme ? 0 : parc.velos.length });
  const debut = minutesDeHeure(depart);
  const creneau: CreneauMinutes = premiere.ok
    ? { debutMinute: minutesDeHeure(premiere.resultat.depart), finMinute: minutesDeHeure(premiere.resultat.fin) }
    : // Refusée avant d'avoir une durée : la capacité se lit sur la durée demandée, ou sur la plus courte.
      {
        debutMinute: debut,
        finMinute: Math.min(24 * 60, debut + (saisie.mode === "duree" ? saisie.minutes : reglages.bikeForAll.dureeMinMinutes)),
      };
  const libres = libresSur(parc, creneau, ferme);
  if (!premiere.ok) return { issue: premiere, libres, creneau };
  return { issue: calculerBikeForAll(saisie, depart, date, contexte, libres), libres, creneau };
}

/** Le refus dit-il que le créneau est plein ? */
function estPlein(issue: IssueOffre): boolean {
  return !issue.ok && (issue.refus.code === "PARC" || issue.refus.code === "STOCK_GAMME");
}

/**
 * Le créneau libre le plus proche quand celui demandé est plein.
 *
 * Bike for All : le départ de la grille des réglages le plus proche de celui
 * demandé, le même jour, où le groupe trouve ses vélos pour toute sa durée,
 * sans les départs que le moteur refuse (passés, trop proches en ligne,
 * retour trop tard) ; sinon le même horaire les jours suivants. Road trip et
 * Gbashi Bike : la prochaine date de départ permise où le groupe trouve ses
 * vélos, dans les 60 jours.
 */
async function chercherProchainCreneau(demande: DemandeDevis, contexte: ContexteCalcul): Promise<ProchainCreneau | null> {
  // Plus de vélos que le parc n'en compte ce jour-là (déjà lu pour le devis) :
  // aucune date ne conviendra, inutile de relire des dizaines de parcs.
  if (depasseLeParc(demande, await parcDu(demande.date, contexte))) return null;
  if (demande.offre === "bike-for-all") {
    const bfa = contexte.reglages.bikeForAll;
    const saisie = demande.saisie;
    const { personnes } = saisie;
    const grille = {
      premier: minutesDeHeure(bfa.premierDepart),
      dernier: minutesDeHeure(bfa.dernierDepart),
      pas: bfa.pasMinutes,
      retourAuPlusTard: minutesDeHeure(bfa.retourAuPlusTard),
    };
    const souhaite = minutesDeHeure(saisie.depart);
    // La durée du groupe : celle demandée, ou celle que son budget achète,
    // qui ne dépend pas de l'heure de départ. Elle se lit au premier départ
    // que le moteur accepte, vélos supposés libres.
    let duree: number | null = saisie.mode === "duree" ? saisie.minutes : null;
    for (let decalage = 0; decalage <= JOURS_RECHERCHE_BIKE_FOR_ALL; decalage += 1) {
      const date = ajouterJours(demande.date, decalage);
      if (fermeEnLigne(demande.offre, date, contexte)) continue;
      // Le moteur, vélos supposés libres : il ne refuse alors que pour
      // l'heure (passée, trop proche en ligne, retour trop tard) ou le jour.
      const accepte = (depart: number) => calculerBikeForAll(saisie, heureDeMinutes(depart), date, contexte, { total: personnes });
      for (let depart = grille.premier; duree === null && depart <= grille.dernier; depart += grille.pas) {
        const essai = accepte(depart);
        if (essai.ok) duree = essai.resultat.minutes;
      }
      if (duree === null) continue;
      const parc = await parcDu(date, contexte);
      const depart = prochainDepartLibre(parc, personnes, duree, souhaite, grille, (d) => !accepte(d).ok);
      if (depart !== null) return { date, depart: heureDeMinutes(depart) };
    }
    return null;
  }

  const horaire = demande.offre === "road-trip-groupe" ? contexte.reglages.roadTrip : contexte.reglages.gbashi;
  for (let decalage = 1; decalage <= JOURS_RECHERCHE_DATE; decalage += 1) {
    const date = ajouterJours(demande.date, decalage);
    if (!horaire.jours.includes(jourDeLaSemaine(date)) || fermeEnLigne(demande.offre, date, contexte)) continue;
    if ((await calculerSur(demande, date, contexte)).issue.ok) return { date, depart: horaire.depart };
  }
  return null;
}

/** Le groupe veut plus de vélos que le parc n'en a en état, au total ou dans une gamme (Gbashi Bike). */
function depasseLeParc(demande: DemandeDevis, parc: ParcDuJour): boolean {
  if (demande.offre === "gbashi-groupe") {
    return Object.entries(demande.saisie.velos).some(
      ([gamme, nombre]) => (nombre ?? 0) > parc.velos.filter((velo) => velo.gamme === gamme).length,
    );
  }
  return demande.saisie.personnes > parc.velos.length;
}

/* ---------------------------------------------------- Preuve de réduction */

/**
 * Où en est la preuve citée pour la réduction du road trip. Elle ne sert que
 * validée et libre : une preuve qui retient déjà la réduction d'une autre
 * réservation (payée, ou en attente de paiement depuis moins de 30 minutes)
 * est « deja-utilisee » ; rattachée à une réservation qui ne retient plus
 * rien (annulée, ou jamais payée), elle redevient libre, comme au dépôt.
 */
async function etatPreuve(
  preuveId: string,
  deps: DependancesOffresGroupe,
  maintenant: number,
): Promise<StatutPreuve | "inconnue" | "deja-utilisee"> {
  const preuve = await deps.depot.trouverPreuve(preuveId);
  if (!preuve) return "inconnue";
  if (preuve.statut !== "validee") return preuve.statut;
  if (!preuve.reference) return "validee";
  const liee = await deps.depot.trouverReservationParReference(preuve.reference);
  if (!liee) return "validee";
  const retient = estPayee(liee) || (liee.statut === "EN_ATTENTE_PAIEMENT" && !panierExpire(liee.creeLe, maintenant));
  return retient ? "deja-utilisee" : "validee";
}

/* -------------------------------------------------------------- Devis */

/** Un devis établi, avec ce qu'il faut pour écrire la réservation. */
interface DevisEtabli {
  reponse: ReponseDevis;
  issue: IssueOffre;
  /** La preuve dont la réduction est comptée, à consommer avec la réservation. */
  preuveRetenue?: string;
  contexte: ContexteCalcul;
}

async function etablirDevis(
  demande: DemandeDevis,
  canal: CanalVente,
  prealable: Prealable,
  deps: DependancesOffresGroupe,
): Promise<DevisEtabli> {
  const maintenant = deps.maintenant();
  const preuveId = demande.offre === "road-trip-groupe" ? demande.saisie.preuveId : undefined;
  const preuve = preuveId ? await etatPreuve(preuveId, deps, maintenant) : null;
  const contexte: ContexteCalcul = {
    canal,
    reglages: prealable.reglages,
    maintenant,
    joursFermes: prealable.joursFermes,
    // Jamais de réduction par défaut (décision 8).
    reductionValidee: preuve === "validee",
    depot: deps.depot,
    parcs: new Map(),
  };
  const { issue, libres } = await calculerSur(demande, demande.date, contexte);
  const prochainCreneau = estPlein(issue) ? await chercherProchainCreneau(demande, contexte) : null;
  // Décision 3 : la commission SasPay (3,25 %, ajoutée par SasPay au moment
  // de payer) sur une ligne visible. Au comptoir, en espèces, aucune.
  const commissionXof = issue.ok && canal === "en-ligne" ? fraisEncaissement(issue.resultat.totalXof) : 0;
  const reponse: ReponseDevis = {
    ok: true,
    issue,
    capacite: { velosLibres: libres.total, parGamme: libres.parGamme },
    prochainCreneau,
    ...(issue.ok ? { commissionXof, montantADebiterXof: issue.resultat.totalXof + commissionXof } : {}),
    ...(preuve ? { preuve } : {}),
  };
  return {
    reponse,
    issue,
    contexte,
    ...(issue.ok && preuveId && preuve === "validee" ? { preuveRetenue: preuveId } : {}),
  };
}

/** POST devis : le prix et les vélos libres, ou le refus motivé (200 dans les deux cas). */
export async function devisOffreGroupe(
  corps: unknown,
  deps: DependancesOffresGroupe,
  appelant?: { ip: string },
): Promise<Reponse<ReponseDevis | ReponseErreur>> {
  const analyse = schemaDemandeDevis.safeParse(corps);
  if (!analyse.success) return erreur(400, "SAISIE", MESSAGE_SAISIE);
  const prealable = await verifierPrealable(deps, "en-ligne");
  if ("statut" in prealable) return prealable;
  // Le devis est public : limité par adresse, largement (la route donne l'adresse).
  if (appelant && (await compter(deps, `offres-groupe-devis:${appelant.ip}`)) > DEVIS_PAR_HEURE_ADRESSE) {
    return erreur(429, "TROP_DE_DEMANDES", "Beaucoup de calculs en peu de temps : patientez quelques minutes, puis réessayez.");
  }
  const devis = await etablirDevis(analyse.data, "en-ligne", prealable, deps);
  return { statut: 200, corps: devis.reponse };
}

/* --------------------------------------------------------- Réservation */

/** Les huit derniers chiffres d'un numéro : « +229 01 97… » et « 0197… » se reconnaissent. */
const finDeNumero = (telephone?: string) => (telephone ?? "").replace(/[^0-9]/g, "").slice(-8);

/** La demande de devis contenue dans une réservation ou une vente : l'offre, le jour, la saisie. */
function demandeDevisDe(demande: DemandeDevis): DemandeDevis {
  return { offre: demande.offre, date: demande.date, saisie: demande.saisie } as DemandeDevis;
}

/** Les gammes réellement demandées, sans les zéros. */
function gammesNonNulles(velos: Record<GammeVelo, number>): Partial<Record<GammeVelo, number>> {
  return Object.fromEntries(Object.entries(velos).filter(([, n]) => n > 0)) as Partial<Record<GammeVelo, number>>;
}

/**
 * L'instantané du calcul, rangé tel quel sur la réservation (offreDetails) :
 * un réglage changé ensuite ne réécrit pas ce que le client a payé. Les
 * champs connus de l'administration, puis la saisie du client, les lignes
 * du prix et la règle de retard du moment, que les emails reprennent.
 */
function detailsDe(demande: DemandeDevis, resultat: ResultatOffre, reglages: ReglagesOffres, preuveId?: string): DetailsOffreGroupe {
  const bikeForAll = demande.offre === "bike-for-all" ? demande.saisie : null;
  return {
    ...(bikeForAll ? { mode: bikeForAll.mode } : {}),
    ...(bikeForAll?.mode === "budget" ? { budgetXof: bikeForAll.budgetXof } : {}),
    minutes: resultat.minutes,
    depart: resultat.depart,
    retour: resultat.fin,
    coco: resultat.coco,
    cocos: resultat.cocos,
    eaux: resultat.eaux,
    gateaux: resultat.gateaux,
    accompagnateur: bikeForAll?.accompagnateur ?? false,
    accompagnateurXof: resultat.accompagnateurXof,
    ...(resultat.velosParGamme ? { gammes: gammesNonNulles(resultat.velosParGamme) } : {}),
    reductionXof: resultat.reductionXof,
    fraisPaiementXof: resultat.fraisPaiementXof,
    ...(resultat.prixBarreXof !== null ? { prixBarreXof: resultat.prixBarreXof } : {}),
    totalXof: resultat.totalXof,
    recapitulatif: resultat.recapModele,
    canal: resultat.canal,
    personnes: resultat.personnes,
    lignes: resultat.lignes,
    saisie: demande.saisie,
    retard: { ...reglages.retard },
    ...(preuveId ? { preuveId } : {}),
  };
}

/** La réservation à écrire, telle que le calcul du serveur l'a donnée. */
function demandeAEcrire(
  demande: DemandeDevis,
  resultat: ResultatOffre,
  reglages: ReglagesOffres,
  champs: Pick<DemandeReservationGroupe, "client" | "moyenPaiement" | "message" | "encaissement" | "preuveId">,
): DemandeReservationGroupe {
  return {
    offre: demande.offre,
    date: demande.date,
    debutMinute: minutesDeHeure(resultat.depart),
    finMinute: minutesDeHeure(resultat.fin),
    // Toutes gammes (décision 10), ou le nombre exact de chaque gamme pour Gbashi Bike.
    velos: resultat.velosParGamme ? gammesNonNulles(resultat.velosParGamme) : resultat.velosBloques,
    nombrePersonnes: resultat.personnes,
    totalXof: resultat.totalXof,
    details: detailsDe(demande, resultat, reglages, champs.preuveId),
    client: champs.client,
    moyenPaiement: champs.moyenPaiement,
    cgvAcceptees: true,
    ...(champs.message ? { message: champs.message } : {}),
    ...(champs.encaissement ? { encaissement: champs.encaissement } : {}),
    ...(champs.preuveId ? { preuveId: champs.preuveId } : {}),
  };
}

/**
 * La preuve citée ne peut pas servir (lot 3, PreuveReductionInutilisableError) :
 * reconnue par son nom, sans dépendre de la classe, que le dépôt du lot 3 déclare.
 */
function estRefusDePreuve(e: unknown): boolean {
  return e instanceof Error && e.name === "PreuveReductionInutilisableError";
}

/** Les compteurs de la limite de débit ; un compteur injoignable ne bloque personne. */
async function compter(deps: DependancesOffresGroupe, cle: string): Promise<number> {
  try {
    return await deps.depot.compterEssai(cle, 60 * 60);
  } catch (e) {
    console.error("[offres-groupe] compteur injoignable", e);
    return 0;
  }
}

/**
 * La même personne a déjà une demande qui attend son paiement ce jour-là :
 * une réponse perdue, un double clic, une conversation reprise pendant
 * qu'elle valide sur son téléphone. On la renvoie vers la première au lieu
 * de pousser une seconde demande Mobile Money (même garde que le tunnel).
 */
async function demandeEnAttente(
  deps: DependancesOffresGroupe,
  date: DateISO,
  client: { email: string; telephone: string },
): Promise<Reservation | undefined> {
  const email = client.email.trim().toLowerCase();
  const numero = finDeNumero(client.telephone);
  const maintenant = deps.maintenant();
  return (await deps.depot.listerReservations({ statut: "EN_ATTENTE_PAIEMENT", depuis: date, jusqua: date })).find(
    (r) =>
      // Octobre rose et Padel bike ont leur propre contrôle.
      r.offre !== "octobre-rose" &&
      r.offre !== "padel-bike" &&
      r.dateDebut === date &&
      r.statut === "EN_ATTENTE_PAIEMENT" &&
      !panierExpire(r.creeLe, maintenant) &&
      (r.client.email.trim().toLowerCase() === email || (numero.length === 8 && finDeNumero(r.client.telephone) === numero)),
  );
}

/** Les emails d'une réservation payée : confirmation avec le récapitulatif, facture, alerte à Bike Land. */
async function emailsDeConfirmation(deps: DependancesOffresGroupe, reservation: Reservation, lienSuivi: string) {
  await Promise.allSettled([
    deps.emails.confirmation(reservation, lienSuivi),
    deps.emails.facture(reservation, lienSuivi),
    deps.emails.alerteAdmin(reservation),
  ]);
}

/** 409 DISPO : les vélos viennent d'être pris, avec le créneau libre le plus proche. */
function reponseDispo(
  message: string,
  prochainCreneau: ProchainCreneau | null,
): Reponse<{ ok: false; code: "DISPO"; message: string; prochainCreneau: ProchainCreneau | null }> {
  return { statut: 409, corps: { ok: false, code: "DISPO", message, prochainCreneau } };
}

const MESSAGE_PRIX_CHANGE =
  "Le prix vient de changer : voici le nouveau montant. Vérifiez-le, puis confirmez de nouveau.";

const MESSAGE_VELOS_PRIS =
  "Ces vélos viennent d'être réservés par un autre groupe. Choisissez un autre créneau, nous vous proposons le plus proche.";

/**
 * POST reservations : recalcule tout, écrit la réservation (les vélos sont
 * retenus 30 minutes, décision 5), puis lance le paiement Mobile Money par
 * l'encaissement existant (SasPay, ou la démonstration hors ligne).
 */
export async function reserverOffreGroupe(
  corps: unknown,
  appelant: { ip: string },
  deps: DependancesOffresGroupe,
): Promise<Reponse<ReponseReservation>> {
  const analyse = schemaDemandeReservation.safeParse(corps);
  if (!analyse.success) return erreur(400, "SAISIE", MESSAGE_SAISIE);
  const demande = analyse.data;

  const prealable = await verifierPrealable(deps, "en-ligne");
  if ("statut" in prealable) return prealable;

  // Sans moyen d'encaisser, rien n'est écrit : la demande resterait en attente pour rien.
  if (deps.fournisseur() === "indisponible") {
    console.error("[offres-groupe] aucune clé SasPay configurée : réservation refusée.");
    return erreur(
      503,
      "PAIEMENT",
      `Le paiement en ligne est momentanément indisponible. Appelez-nous au ${site.telephone}, nous prenons votre réservation par téléphone.`,
    );
  }

  // Limite de débit : par adresse, et par numéro (comme Octobre rose et Padel bike).
  const numero = finDeNumero(demande.client.telephone);
  const parAdresse = await compter(deps, `offres-groupe:${appelant.ip}`);
  const parNumero = numero ? await compter(deps, `offres-groupe-numero:${numero}`) : 0;
  if (parAdresse > RESERVATIONS_PAR_HEURE_ADRESSE || parNumero > RESERVATIONS_PAR_HEURE_NUMERO) {
    return erreur(
      429,
      "TROP_DE_DEMANDES",
      "Trop de demandes en une heure. Réessayez un peu plus tard, ou écrivez-nous sur WhatsApp : nous réservons pour vous.",
    );
  }

  const enAttente = await demandeEnAttente(deps, demande.date, demande.client);
  if (enAttente) {
    return erreur(
      409,
      "EN_ATTENTE",
      `Une réservation à votre nom attend déjà son paiement pour ce jour (${enAttente.reference}). ` +
        "Validez la demande sur votre téléphone, ou relancez-la depuis le lien reçu par email. " +
        "Sans paiement, elle se libère d'elle-même au bout de 30 minutes.",
    );
  }

  // Tout se recalcule ici, avec les réglages et le parc de cet instant.
  const devis = await etablirDevis(demandeDevisDe(demande), "en-ligne", prealable, deps);
  if (!devis.issue.ok) {
    if (estPlein(devis.issue)) return reponseDispo(devis.issue.refus.message, devis.reponse.prochainCreneau);
    return { statut: 422, corps: { ok: false, code: "REFUS", refus: devis.issue.refus } };
  }
  const resultat = devis.issue.resultat;
  if (demande.attendu.totalXof !== resultat.totalXof) {
    return { statut: 409, corps: { ok: false, code: "REGLAGES", message: MESSAGE_PRIX_CHANGE, devis: devis.reponse } };
  }

  let ecrite: ResultatReservation;
  try {
    ecrite = await deps.depot.creerReservationGroupe(
      demandeAEcrire(demande, resultat, prealable.reglages, {
        client: {
          prenom: demande.client.prenom,
          nom: demande.client.nom,
          email: demande.client.email,
          telephone: demande.client.telephone,
        },
        moyenPaiement: demande.moyenPaiement,
        message: demande.message,
        preuveId: devis.preuveRetenue,
      }),
    );
  } catch (e) {
    if (e instanceof CapaciteInsuffisanteError) {
      // Le parc a changé : on le relit pour proposer un créneau vraiment libre.
      const contexte = { ...devis.contexte, parcs: new Map<DateISO, Promise<ParcDuJour>>() };
      return reponseDispo(MESSAGE_VELOS_PRIS, await chercherProchainCreneau(demande, contexte));
    }
    if (estRefusDePreuve(e)) {
      // La preuve vient de servir ailleurs : le client revoit le prix sans la réduction.
      const nouveau = await etablirDevis(demandeDevisDe(demande), "en-ligne", prealable, deps);
      return { statut: 409, corps: { ok: false, code: "REGLAGES", message: MESSAGE_PRIX_CHANGE, devis: nouveau.reponse } };
    }
    throw e;
  }

  const { reservation, token } = ecrite;
  // Sur un aperçu, l'adresse de la branche (base de test) : voir urlDuSite.
  const lienSuivi = `${deps.urlSite()}/reservation/${token}`;
  // Le montant de la réservation enregistrée, jamais celui du navigateur.
  // SasPay ajoute sa commission en payant (mode ADD_ON, décision 3) : le
  // téléphone est débité du total plus la commission.
  const paiement = await deps.encaisser({
    montantXof: reservation.totalXof,
    reference: reservation.reference,
    moyen: demande.moyenPaiement,
    client: {
      prenom: demande.client.prenom,
      nom: demande.client.nom,
      email: demande.client.email,
      telephone: demande.client.telephone,
    },
  });

  if (paiement.statut === "REUSSI") {
    // Démonstration : l'encaissement répond tout de suite. Avec SasPay, la
    // confirmation vient du webhook ou du suivi du navigateur, après
    // vérification du paiement : jamais d'ici sans preuve.
    const confirmation = await deps.depot.confirmerPaiement(reservation.reference, paiement.referenceTransaction);
    if (confirmation && !confirmation.dejaConfirmee) await emailsDeConfirmation(deps, confirmation.reservation, lienSuivi);
  } else {
    if (paiement.statut !== "EN_ATTENTE") {
      console.warn(`[offres-groupe] ${reservation.reference} : paiement non lancé (${paiement.message ?? "sans détail"}).`);
    }
    // Le seul moment où le jeton de suivi existe en clair : le lien part tout
    // de suite, même si la demande de paiement n'a pas pu partir (le client
    // la relance depuis ce lien, comme dans le tunnel).
    await Promise.allSettled([deps.emails.reception(reservation, lienSuivi)]);
  }

  const message =
    paiement.statut === "ECHOUE" ? diagnostiquer(paiement.message, paiement.statut).explication : paiement.message;
  return {
    statut: 201,
    corps: {
      ok: true,
      reference: reservation.reference,
      lienSuivi,
      totalXof: reservation.totalXof,
      montantADebiterXof: reservation.totalXof + fraisEncaissement(reservation.totalXof),
      paiement: {
        statut: paiement.statut,
        ...(paiement.suivi ? { suivi: paiement.suivi } : {}),
        ...(message ? { message } : {}),
      },
    },
  };
}

/* ------------------------------------------------------------ Comptoir */

/**
 * POST comptoir (session d'administration vérifiée par la route) : les trois
 * offres vendues en espèces au comptoir, mêmes réglages, sans les frais de
 * paiement électronique, sans date limite du vendredi ni délai minimum
 * (décision 12). `action: "devis"` donne le prix sans rien écrire ; sinon la
 * vente est enregistrée, déjà payée, au nom de qui a reçu l'argent.
 */
export async function vendreAuComptoir(
  corps: unknown,
  deps: DependancesOffresGroupe,
): Promise<Reponse<ReponseVenteComptoir | ReponseDevis>> {
  const action = corps && typeof corps === "object" ? (corps as { action?: unknown }).action : undefined;
  if (action === "devis") {
    const analyse = schemaDemandeDevis.safeParse(corps);
    if (!analyse.success) return erreur(400, "SAISIE", "La vente est incomplète : vérifiez l'offre, le jour et le groupe.");
    const prealable = await verifierPrealable(deps, "comptoir");
    if ("statut" in prealable) return prealable;
    return { statut: 200, corps: (await etablirDevis(analyse.data, "comptoir", prealable, deps)).reponse };
  }

  const analyse = schemaVenteComptoirGroupe.safeParse(corps);
  if (!analyse.success) {
    return erreur(400, "SAISIE", premierMessage(analyse.error) ?? "La vente est incomplète : vérifiez les informations.");
  }
  const vente = analyse.data;
  const prealable = await verifierPrealable(deps, "comptoir");
  if ("statut" in prealable) return prealable;

  // La même saisie envoyée deux fois (double clic, réponse perdue) n'est
  // enregistrée qu'une fois : sa clé est la référence du paiement en espèces.
  const referenceSaisie = `ESP-${vente.cleVente}`;
  const dejaFaite = async (): Promise<Reponse<ReponseVenteComptoir> | null> => {
    const enregistree = await deps.depot.trouverReservationParPaiement(referenceSaisie);
    if (!enregistree) return null;
    return {
      statut: 200,
      corps: {
        ok: true,
        deja: true,
        reference: enregistree.reference,
        // Le jeton se recalcule de la référence : le même lien que dans l'email.
        lienSuivi: `${deps.urlSite()}/reservation/${genererToken(enregistree.reference)}`,
        totalXof: enregistree.totalXof,
      },
    };
  };
  const deja = await dejaFaite();
  if (deja) return deja;

  const devis = await etablirDevis(demandeDevisDe(vente), "comptoir", prealable, deps);
  if (!devis.issue.ok) {
    if (estPlein(devis.issue)) return reponseDispo(devis.issue.refus.message, devis.reponse.prochainCreneau);
    return { statut: 422, corps: { ok: false, code: "REFUS", refus: devis.issue.refus } };
  }
  const resultat = devis.issue.resultat;
  // Le montant que le commercial a vu est celui qu'il a encaissé : jamais un autre en silence.
  if (vente.attendu.totalXof !== resultat.totalXof) {
    return {
      statut: 409,
      corps: {
        ok: false,
        code: "REGLAGES",
        message:
          `Le montant a changé : ${formatMontant(resultat.totalXof)} et non ${formatMontant(vente.attendu.totalXof)}. ` +
          "Vérifiez avec le client, puis enregistrez à nouveau.",
        devis: devis.reponse,
      },
    };
  }

  let ecrite: ResultatReservation;
  try {
    ecrite = await deps.depot.creerReservationGroupe(
      demandeAEcrire(vente, resultat, prealable.reglages, {
        client: {
          prenom: vente.client.prenom,
          nom: vente.client.nom,
          email: vente.client.email,
          telephone: vente.client.telephone ?? "",
        },
        moyenPaiement: "ESPECES",
        message: vente.message,
        encaissement: { par: vente.encaissePar, reference: referenceSaisie },
        preuveId: devis.preuveRetenue,
      }),
    );
  } catch (e) {
    // Deux envois simultanés de la même saisie : l'autre l'a enregistrée.
    if (e instanceof TransactionDejaUtiliseeError) {
      const entreTemps = await dejaFaite();
      if (entreTemps) return entreTemps;
    }
    if (e instanceof CapaciteInsuffisanteError) {
      const contexte = { ...devis.contexte, parcs: new Map<DateISO, Promise<ParcDuJour>>() };
      return reponseDispo(MESSAGE_VELOS_PRIS, await chercherProchainCreneau(vente, contexte));
    }
    if (estRefusDePreuve(e)) {
      const nouveau = await etablirDevis(demandeDevisDe(vente), "comptoir", prealable, deps);
      return { statut: 409, corps: { ok: false, code: "REGLAGES", message: MESSAGE_PRIX_CHANGE, devis: nouveau.reponse } };
    }
    throw e;
  }

  const { reservation, token } = ecrite;
  // Au journal, une fois, signé de qui a reçu l'argent : le dépôt l'écrit
  // peut-être déjà avec la réservation, on ne double pas la ligne.
  try {
    const dejaAuJournal = await deps.depot.listerJournal({ reference: reservation.reference, limite: 1 });
    if (dejaAuJournal.length === 0) {
      await deps.depot.journaliser({
        type: "vente-comptoir-groupe",
        reference: reservation.reference,
        details: {
          offre: vente.offre,
          date: vente.date,
          personnes: resultat.personnes,
          totalXof: reservation.totalXof,
          encaissePar: vente.encaissePar,
        },
        auteur: auteurAdmin(vente.encaissePar),
      });
    }
  } catch (e) {
    console.error(`[offres-groupe] ${reservation.reference} : vente enregistrée, journal non écrit`, e);
  }

  const lienSuivi = `${deps.urlSite()}/reservation/${token}`;
  const envois = await Promise.allSettled([
    deps.emails.confirmation(reservation, lienSuivi),
    deps.emails.facture(reservation, lienSuivi),
    deps.emails.alerteAdmin(reservation),
  ]);
  const parti = (envoi: PromiseSettledResult<unknown>) =>
    envoi.status === "fulfilled" && Boolean((envoi.value as { envoye?: boolean } | undefined)?.envoye);
  return {
    statut: 201,
    corps: {
      ok: true,
      reference: reservation.reference,
      lienSuivi,
      totalXof: reservation.totalXof,
      emailEnvoye: parti(envois[0]) && parti(envois[1]),
    },
  };
}

/** Le premier message d'une saisie refusée, quand le schéma en donne un en français. */
function premierMessage(e: z.ZodError): string | undefined {
  const message = e.errors[0]?.message;
  return message && !/^(Required|Expected |Invalid |Number must|String must|Array must|Too )/.test(message) ? message : undefined;
}
