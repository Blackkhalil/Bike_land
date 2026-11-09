/**
 * Road trip en groupe (cahier des charges, 4.4) : un prix par personne,
 * moins la réduction si elle est validée, plus les gâteaux et les frais de
 * paiement électronique. Le prix barré n'apparaît que si la réduction
 * s'applique.
 *
 * Décision 2 : 3 000 F par personne, plus 125 F de frais de paiement en
 * ligne, soit 3 125 F. La réduction (4 %) porte sur le prix avant frais,
 * une fois par groupe : 10 personnes paient 30 000 F - 1 200 F + 1 250 F
 * = 30 050 F, au lieu de 31 250 F. Au comptoir, sans les frais
 * (décision 12).
 *
 * Départ et retour sont ceux des réglages (samedi ou dimanche, 8 h à 12 h) :
 * le client ne choisit que la date.
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
import { arrondiDivision, enDixMilliemes, formatMontant, formatPourcentage } from "./montants";
import { recapRoadTrip } from "./recapitulatif";
import type { ContexteOffre, DemandeRoadTrip, IssueOffre, LigneOffre, ResultatOffre } from "./types";

type Reglages = Pick<ReglagesOffres, "roadTrip" | "consommables" | "paiement" | "dateLimiteWeekend" | "retard">;

/** La réduction du road trip : le taux réglé (4 %) du prix avant frais, arrondi au franc. */
export function reductionRoadTripXof(prixAvantFraisXof: number, reglages: Pick<ReglagesOffres, "roadTrip">): number {
  return arrondiDivision(prixAvantFraisXof * enDixMilliemes(reglages.roadTrip.reduction), 10000);
}

/** Road trip en groupe : le prix du groupe, ou le refus motivé. */
export function calculerRoadTrip(demande: DemandeRoadTrip, reglages: Reglages, contexte: ContexteOffre): IssueOffre {
  const saisie =
    (estEntierPositif(demande.personnes) ? null : refusSaisie("personnes")) ??
    (demande.reductionValidee === undefined || typeof demande.reductionValidee === "boolean" ? null : refusSaisie("reductionValidee")) ??
    controlerOptions(demande);
  if (saisie) return { ok: false, refus: saisie };

  const rt = reglages.roadTrip;
  const N = demande.personnes;
  const gateauxParPersonne = demande.gateauxParPersonne ?? 0;

  const refus =
    controlerPersonnes("road-trip-groupe", N, rt.personnesMin, velosLibres(contexte.velosDisponibles)) ??
    controlerCalendrier("road-trip-groupe", contexte, rt.depart, rt.jours, reglages, false);
  if (refus) return { ok: false, refus };

  const prixAvantFraisXof = N * rt.prixPersonneXof;
  // Jamais de réduction par défaut (décision 8) : seulement si elle a été validée.
  const reductionXof = demande.reductionValidee === true ? reductionRoadTripXof(prixAvantFraisXof, reglages) : 0;
  const { gateaux, gateauxXof, coutXof: coutGateauxXof } = gateauxDe(N, gateauxParPersonne, reglages);
  const fraisPaiementXof = fraisPaiementDe(N, demande.paiementElectronique, reglages);
  const totalXof = prixAvantFraisXof - reductionXof + gateauxXof + fraisPaiementXof;
  const prixBarreXof = reductionXof > 0 ? totalXof + reductionXof : null;

  const { cocos, eaux, coutXof: coutConsommablesXof } = consommablesOfferts(N, rt, reglages);

  const lignes: LigneOffre[] = [
    {
      code: "road-trip",
      libelle: "Road trip en groupe",
      detail: `${compte(N, "personne")} × ${formatMontant(rt.prixPersonneXof)}`,
      montantXof: prixAvantFraisXof,
    },
    ...(reductionXof > 0
      ? [
          {
            code: "reduction" as const,
            libelle: `Réduction de ${formatPourcentage(rt.reduction)}`,
            detail: "Abonnement ou story validé, une fois par groupe",
            montantXof: -reductionXof,
          },
        ]
      : []),
    ...ligneGateaux(gateaux, gateauxXof, reglages),
    ...ligneFraisPaiement(N, fraisPaiementXof, reglages),
  ];

  const resultat: ResultatOffre = {
    offre: "road-trip-groupe",
    mode: "forfait",
    personnes: N,
    date: contexte.date,
    depart: rt.depart,
    fin: rt.retour,
    minutes: minutesDe(rt.retour) - minutesDe(rt.depart),
    coco: cocos > 0 ? "grand" : "aucun",
    cocos,
    eaux,
    gateaux,
    velosParGamme: null,
    lignes,
    paiementElectronique: demande.paiementElectronique,
    fraisOrganisationXof: 0,
    cocosXof: 0,
    gateauxXof,
    accompagnateurXof: 0,
    fraisPaiementXof,
    reductionXof,
    totalXof,
    prixBarreXof,
    encaisseNetXof: totalXof - coutConsommablesXof - coutGateauxXof - fraisPaiementXof,
    velosBloques: N,
    recapModele: recapRoadTrip({ personnes: N, totalXof, prixBarreXof, gateauxParPersonne }, reglages),
  };
  return { ok: true, resultat };
}
