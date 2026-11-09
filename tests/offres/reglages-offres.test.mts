// Les réglages des offres de groupe : valeurs de départ (tableur corrigé par
// les décisions du 9 novembre 2026), lecture d'un enregistrement partiel,
// réglage illisible qui bloque la vente au lieu de vendre au prix par défaut.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const m = await charger("src/data/reglages-offres.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

const D = m.REGLAGES_OFFRES_PAR_DEFAUT;
console.log("\n— Valeurs de départ");
verifier("valides pour le schéma", m.schemaReglagesOffres.safeParse(D).success, true);
verifier(
  "tableur : 1 500 F/h, 800 F/h/pers, frais 1 000 / 2 000 F dès 15 000 F, 20 %, 30 min par 15 min, 3 000 F hors offre",
  [D.tarifNormalHeureXof, D.bikeForAll.tarifHeurePersonneXof, D.bikeForAll.fraisOrganisationXof, D.bikeForAll.fraisOrganisationGrosXof, D.bikeForAll.seuilGrosBudgetXof, D.bikeForAll.partMaxCocos, D.bikeForAll.dureeMinMinutes, D.bikeForAll.pasMinutes, D.bikeForAll.fraisHorsOffreXof],
  [1500, 800, 1000, 2000, 15000, 0.2, 30, 15, 3000],
);
verifier("accompagnateur 1 500 F + 200 F/pers + 250 F/h, plafond 5 000 F", [D.accompagnateur.minXof, D.accompagnateur.parPersonneXof, D.accompagnateur.parHeureXof, D.accompagnateur.plafondXof], [1500, 200, 250, 5000]);
verifier("cocos 175 / 275 F, gâteau 150 F", [D.consommables.cocoPetitXof, D.consommables.cocoGrandXof, D.consommables.gateauPrixXof], [175, 275, 150]);
verifier("décision 2 : road trip 3 000 F + 125 F de frais = 3 125 F", D.roadTrip.prixPersonneXof + D.paiement.fraisParPersonneXof, 3125);
verifier("décision 4 : Gbashi 3 500 / 4 000 / 4 500 F + 125 F", [D.gbashi.prixXof.CLASSIQUE, D.gbashi.prixXof.PREMIUM, D.gbashi.prixXof.PRESTIGE].map((p: number) => p + D.paiement.fraisParPersonneXof), [3625, 4125, 4625]);
verifier("horaires : road trip samedi et dimanche 8 h - 12 h, Gbashi dimanche 7 h - 11 h", [D.roadTrip.jours, D.roadTrip.depart, D.roadTrip.retour, D.gbashi.jours, D.gbashi.depart, D.gbashi.retour], [[6, 0], "08:00", "12:00", [0], "07:00", "11:00"]);
verifier("minimums : 10, 10, 5 personnes", [D.bikeForAll.personnesMin, D.roadTrip.personnesMin, D.gbashi.personnesMin], [10, 10, 5]);
verifier("vendredi 19 h ; retard 7 min puis 1 000 F/min", [D.dateLimiteWeekend.jour, D.dateLimiteWeekend.heure, D.retard.toleranceMinutes, D.retard.penaliteParMinuteXof], [5, "19:00", 7, 1000]);
verifier("accompagnateur : 5 personnes comprises dans le minimum (tableur B23)", D.accompagnateur.personnesIncluses, 5);
verifier("Gbashi : un coco et une eau par personne (carte du cahier)", [D.gbashi.cocosGrandsParPersonne, D.gbashi.eauxParPersonne], [1, 1]);
verifier("en ligne : réservation au moins 2 h avant le départ", D.delaiMinimumMinutes, 120);

console.log("\n— Lecture");
const rien = await m.lireReglagesOffresAvec(async () => null);
verifier("rien d'enregistré : valeurs de départ", [rien.source, rien.reglages.roadTrip.prixPersonneXof], ["defaut", 3000]);
const partiel = await m.lireReglagesOffresAvec(async () => JSON.stringify({ roadTrip: { prixPersonneXof: 3200 } }));
verifier("un champ enregistré : les autres gardent leur valeur", [partiel.source, partiel.reglages.roadTrip.prixPersonneXof, partiel.reglages.roadTrip.reduction, partiel.reglages.gbashi.prixXof.PRESTIGE], ["enregistre", 3200, 0.04, 4500]);
const faux = await m.lireReglagesOffresAvec(async () => JSON.stringify({ roadTrip: { retour: "07:00" } }));
verifier("valeur impossible : « illisible », la vente sera refusée", [faux.source, typeof faux.probleme], ["illisible", "string"]);
const casse = await m.lireReglagesOffresAvec(async () => "{oups");
verifier("JSON cassé : « illisible »", casse.source, "illisible");
verifier("pas de durée minimale hors pas", m.schemaReglagesOffres.safeParse({ ...D, bikeForAll: { ...D.bikeForAll, dureeMinMinutes: 40 } }).success, false);
const ancien = await m.lireReglagesOffresAvec(async () =>
  JSON.stringify({ gbashi: { prixXof: { CLASSIQUE: 3600, PREMIUM: 4100, PRESTIGE: 4600 } } }),
);
verifier(
  "réglages enregistrés avant l'ajout d'un champ : le nouveau champ prend sa valeur de départ",
  [ancien.source, ancien.reglages.gbashi.prixXof.CLASSIQUE, ancien.reglages.gbashi.cocosGrandsParPersonne, ancien.reglages.delaiMinimumMinutes],
  ["enregistre", 3600, 1, 120],
);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
