/**
 * Gbashi Bike sur réservation (cahier des charges, 4.5) : la somme des
 * vélos choisis, chacun au prix de sa gamme, plus les gâteaux et les frais
 * de paiement électronique. Pas de prix barré.
 *
 * Décision 4 : 3 500 / 4 000 / 4 500 F (Classique, Premium, Prestige), plus
 * 125 F par personne en ligne, soit 3 625 / 4 125 / 4 625 F ; au comptoir,
 * sans les frais. Le groupe compte une personne par vélo, 5 au moins, et
 * chaque gamme au plus les vélos libres de cette gamme ce jour-là.
 *
 * Le prix comprend ce que promet la carte du cahier, « vélo, eau, un coco » :
 * par personne, un coco grand format et une bouteille d'eau (réglables).
 * Comme au road trip, ils sont comptés pour la préparation et retirés de
 * l'encaissé net (le coco au prix du grand format, l'eau à son coût).
 *
 * Départ et retour sont ceux des réglages (dimanche, 7 h à 11 h).
 */

import type { ReglagesOffres } from "@/data/reglages-offres";

import { minutesDe } from "./calendrier";
import {
  compte,
  controlerCalendrier,
  controlerOptions,
  controlerPersonnes,
  estEntierPositif,
  refusSaisie,
  velosLibres,
} from "./controles";
import { consommablesOfferts, fraisPaiementDe, gateauxDe, ligneFraisPaiement, ligneGateaux } from "./lignes";
import { formatMontant } from "./montants";
import { NOMS_GAMMES, ORDRE_GAMMES, recapGbashi } from "./recapitulatif";
import type { ContexteOffre, DemandeGbashi, GammeVelo, IssueOffre, LigneOffre, Refus, ResultatOffre } from "./types";

type Reglages = Pick<ReglagesOffres, "gbashi" | "consommables" | "paiement" | "dateLimiteWeekend" | "retard">;

/** Les vélos demandés, gamme par gamme (zéro pour une gamme absente), ou `null` si un nombre est illisible. */
function lireVelos(velos: unknown): Record<GammeVelo, number> | null {
  if (typeof velos !== "object" || velos === null) return null;
  const lus = { CLASSIQUE: 0, PREMIUM: 0, PRESTIGE: 0 };
  for (const gamme of ORDRE_GAMMES) {
    const nombre = (velos as Partial<Record<GammeVelo, unknown>>)[gamme];
    if (nombre === undefined) continue;
    if (!estEntierPositif(nombre)) return null;
    lus[gamme] = nombre;
  }
  return lus;
}

/** Une gamme demandée au-delà des vélos libres de cette gamme, ou `null`. */
function controlerStock(velos: Record<GammeVelo, number>, contexte: ContexteOffre): Refus | null {
  for (const gamme of ORDRE_GAMMES) {
    const libres = velosLibres(contexte.stockParGamme?.[gamme]);
    if (velos[gamme] <= libres) continue;
    const nom = NOMS_GAMMES[gamme];
    return {
      code: "STOCK_GAMME",
      champ: "velos",
      gamme,
      maximum: libres,
      message:
        libres === 0
          ? `Il ne nous reste plus de vélo ${nom} libre ce jour-là : choisissez une autre gamme.`
          : `Il ne nous reste que ${compte(libres, `vélo ${nom} libre`, `vélos ${nom} libres`)} ce jour-là : choisissez-en ${libres} au plus, et complétez avec une autre gamme.`,
    };
  }
  return null;
}

/** Gbashi Bike : le prix du groupe, ou le refus motivé. */
export function calculerGbashi(demande: DemandeGbashi, reglages: Reglages, contexte: ContexteOffre): IssueOffre {
  const velos = lireVelos(demande.velos);
  if (!velos) return { ok: false, refus: refusSaisie("velos") };
  const saisie = controlerOptions(demande);
  if (saisie) return { ok: false, refus: saisie };

  const gb = reglages.gbashi;
  const N = ORDRE_GAMMES.reduce((total, gamme) => total + velos[gamme], 0);
  const gateauxParPersonne = demande.gateauxParPersonne ?? 0;

  const refus =
    controlerPersonnes("gbashi-groupe", N, gb.personnesMin, velosLibres(contexte.velosDisponibles), "velos") ??
    controlerStock(velos, contexte) ??
    controlerCalendrier("gbashi-groupe", contexte, gb.depart, gb.jours, reglages, false);
  if (refus) return { ok: false, refus };

  const lignesVelos: LigneOffre[] = ORDRE_GAMMES.filter((gamme) => velos[gamme] > 0).map((gamme) => ({
    code: `velos-${gamme.toLowerCase() as Lowercase<GammeVelo>}` as const,
    libelle: `${velos[gamme] > 1 ? "Vélos" : "Vélo"} ${NOMS_GAMMES[gamme]}`,
    detail: `${velos[gamme]} × ${formatMontant(gb.prixXof[gamme])}`,
    montantXof: velos[gamme] * gb.prixXof[gamme],
  }));
  const velosXof = lignesVelos.reduce((total, ligne) => total + ligne.montantXof, 0);
  const { gateaux, gateauxXof, coutXof: coutGateauxXof } = gateauxDe(N, gateauxParPersonne, reglages);
  const fraisPaiementXof = fraisPaiementDe(N, demande.paiementElectronique, reglages);
  const totalXof = velosXof + gateauxXof + fraisPaiementXof;
  const { cocos, eaux, coutXof: coutConsommablesXof } = consommablesOfferts(N, gb, reglages);

  const resultat: ResultatOffre = {
    offre: "gbashi-groupe",
    mode: "forfait",
    personnes: N,
    date: contexte.date,
    depart: gb.depart,
    fin: gb.retour,
    minutes: minutesDe(gb.retour) - minutesDe(gb.depart),
    coco: cocos > 0 ? "grand" : "aucun",
    cocos,
    eaux,
    gateaux,
    velosParGamme: velos,
    lignes: [...lignesVelos, ...ligneGateaux(gateaux, gateauxXof, reglages), ...ligneFraisPaiement(N, fraisPaiementXof, reglages)],
    paiementElectronique: demande.paiementElectronique,
    fraisOrganisationXof: 0,
    cocosXof: 0,
    gateauxXof,
    accompagnateurXof: 0,
    fraisPaiementXof,
    reductionXof: 0,
    totalXof,
    prixBarreXof: null,
    encaisseNetXof: totalXof - coutConsommablesXof - coutGateauxXof - fraisPaiementXof,
    velosBloques: N,
    recapModele: recapGbashi({ personnes: N, totalXof, velos, gateauxParPersonne }, reglages),
  };
  return { ok: true, resultat };
}
