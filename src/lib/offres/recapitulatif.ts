/**
 * Le récapitulatif modèle de chaque offre : le texte fixe du tableur
 * Bike_Land_Calculatrice_Offres.xlsx (onglet « Bike for All », cellule A33 ;
 * « Bike for All durée », A27 ; « Road trip groupe », A20), rempli avec les
 * chiffres calculés. Gbashi Bike, absent du tableur, suit le même patron.
 *
 * L'agent IA le reprend pour écrire au client, sans changer un chiffre
 * (cahier des charges, étape 7). Les phrases sont celles du tableur, mot
 * pour mot ; seuls changent :
 *
 *  - les montants, écrits « 11 250 F » (formatMontant) : le tableur, ouvert
 *    dans un Excel réglé en français, écrivait « 11250 0 F » ;
 *  - les valeurs que le tableur écrivait en dur (25 km, Classique, Premium,
 *    Prestige) et que les réglages portent désormais (distance) ;
 *  - le singulier, si un nombre vaut 1 (le tableur écrit toujours le
 *    pluriel ; avec 10 personnes au moins, le texte est le même) ;
 *  - les cocos ou l'eau réglés à zéro, qui ne sont pas annoncés (le tableur
 *    écrirait « 0 cocos »).
 *
 * Les heures restent écrites comme dans le tableur : « 08h00 ».
 */

import type { ReglagesOffres } from "@/data/reglages-offres";

import { heureDuRecap } from "./calendrier";
import { compte } from "./controles";
import { formatMontant } from "./montants";
import type { Coco, GammeVelo, HeureMinute } from "./types";

/** Le nom des gammes, comme le client les lit. */
export const NOMS_GAMMES: Record<GammeVelo, string> = {
  CLASSIQUE: "Classique",
  PREMIUM: "Premium",
  PRESTIGE: "Prestige",
};

/** L'ordre des gammes, du Classique au Prestige. */
export const ORDRE_GAMMES: readonly GammeVelo[] = ["CLASSIQUE", "PREMIUM", "PRESTIGE"];

const GAMME_COMPLETE = "Vous profitez de toute notre gamme de vélos (Classique, Premium, Prestige) et de nos casques.";

/** Les deux paragraphes de fin, communs aux trois offres. */
function fin(reglages: Pick<ReglagesOffres, "retard">): string {
  const { toleranceMinutes, penaliteParMinuteXof } = reglages.retard;
  return (
    `\n\nLe retour des vélos doit être expressément respecté. Vous avez une marge de retard de ${compte(toleranceMinutes, "minute")} ; ` +
    `au-delà, le groupe paiera ${formatMontant(penaliteParMinuteXof)} par minute.` +
    "\n\nMerci de faire confiance à Bike Land !"
  );
}

/** « Vous aurez aussi 20 gâteaux, à raison de 1 par personne. », ou rien. */
function phraseGateaux(personnes: number, gateauxParPersonne: number): string {
  return gateauxParPersonne > 0
    ? ` Vous aurez aussi ${compte(personnes * gateauxParPersonne, "gâteau", "gâteaux")}, à raison de ${gateauxParPersonne} par personne.`
    : "";
}

/**
 * Les cocos et l'eau compris dans le prix (road trip, Gbashi Bike) : « Vous
 * aurez 2 cocos et 2 bouteilles d'eau par personne, inclus dans le prix. »,
 * la phrase du tableur (A20). Ce qui est réglé à zéro n'est pas annoncé.
 */
function phraseConsommables(parPersonne: { cocosGrandsParPersonne: number; eauxParPersonne: number }): string {
  const { cocosGrandsParPersonne: cocos, eauxParPersonne: eaux } = parPersonne;
  const offerts = [
    ...(cocos > 0 ? [compte(cocos, "coco")] : []),
    ...(eaux > 0 ? [`${compte(eaux, "bouteille")} d'eau`] : []),
  ];
  return offerts.length ? ` Vous aurez ${offerts.join(" et ")} par personne, inclus dans le prix.` : "";
}

/** Bike for All, par budget (A33) ou par durée (A27) : le même texte. */
export function recapBikeForAll(
  donnees: {
    personnes: number;
    totalXof: number;
    prixBarreXof: number;
    minutes: number;
    depart: HeureMinute;
    fin: HeureMinute;
    coco: Coco;
    gateauxParPersonne: number;
    accompagnateur: boolean;
  },
  reglages: Pick<ReglagesOffres, "retard">,
): string {
  const { personnes } = donnees;
  return (
    `BIKE FOR ALL : Cher client, pour votre groupe de ${compte(personnes, "personne")}, vous paierez ${formatMontant(donnees.totalXof)} ` +
    `au lieu de ${formatMontant(donnees.prixBarreXof)}, pour ${compte(donnees.minutes, "minute")} de vélo ` +
    `de ${heureDuRecap(donnees.depart)} à ${heureDuRecap(donnees.fin)}. ${GAMME_COMPLETE}` +
    (donnees.coco === "aucun"
      ? ""
      : ` Vous aurez ${compte(personnes, "coco")} ${donnees.coco} format inclus dans le prix, à raison de 1 par personne.`) +
    phraseGateaux(personnes, donnees.gateauxParPersonne) +
    (donnees.accompagnateur
      ? " Un accompagnateur Bike Land vous guidera, vous montrera le circuit et vous assistera tout au long du trajet."
      : "") +
    fin(reglages)
  );
}

/** Road trip en groupe (A20) : le prix barré n'y figure qu'avec la réduction. */
export function recapRoadTrip(
  donnees: { personnes: number; totalXof: number; prixBarreXof: number | null; gateauxParPersonne: number },
  reglages: Pick<ReglagesOffres, "roadTrip" | "retard">,
): string {
  const { personnes } = donnees;
  const { distanceKm, depart, retour } = reglages.roadTrip;
  return (
    `ROAD TRIP BIKE LAND : Cher client, pour votre groupe de ${compte(personnes, "personne")}, vous paierez ${formatMontant(donnees.totalXof)}` +
    (donnees.prixBarreXof !== null ? ` au lieu de ${formatMontant(donnees.prixBarreXof)}` : "") +
    `, pour une balade de ${distanceKm} km de ${heureDuRecap(depart)} à ${heureDuRecap(retour)}. ${GAMME_COMPLETE}` +
    phraseConsommables(reglages.roadTrip) +
    phraseGateaux(personnes, donnees.gateauxParPersonne) +
    fin(reglages)
  );
}

/** « 2 vélos Classique, 2 Premium et 1 Prestige » : les vélos choisis, de la gamme la plus simple à la plus belle. */
export function velosEnClair(velos: Record<GammeVelo, number>): string {
  const morceaux = ORDRE_GAMMES.filter((gamme) => velos[gamme] > 0).map(
    (gamme, rang) => `${rang === 0 ? compte(velos[gamme], "vélo") : velos[gamme]} ${NOMS_GAMMES[gamme]}`,
  );
  if (morceaux.length <= 1) return morceaux.join("");
  return `${morceaux.slice(0, -1).join(", ")} et ${morceaux[morceaux.length - 1]}`;
}

/**
 * Gbashi Bike, sur le patron du tableur : la sortie, les vélos choisis, puis
 * l'eau et le coco de la carte du cahier (« vélo, eau, un coco »), comptés
 * par le moteur comme ceux du road trip.
 */
export function recapGbashi(
  donnees: { personnes: number; totalXof: number; velos: Record<GammeVelo, number>; gateauxParPersonne: number },
  reglages: Pick<ReglagesOffres, "gbashi" | "retard">,
): string {
  const { personnes } = donnees;
  const { depart, retour } = reglages.gbashi;
  return (
    `GBASHI BIKE : Cher client, pour votre groupe de ${compte(personnes, "personne")}, vous paierez ${formatMontant(donnees.totalXof)}, ` +
    `pour une sortie Gbashi Bike de ${heureDuRecap(depart)} à ${heureDuRecap(retour)} : du vélo jusqu'au bord de mer, ` +
    "puis une séance de musculation encadrée par nos coachs. " +
    `Vous roulerez sur ${velosEnClair(donnees.velos)}, avec nos casques.` +
    phraseConsommables(reglages.gbashi) +
    phraseGateaux(personnes, donnees.gateauxParPersonne) +
    fin(reglages)
  );
}
