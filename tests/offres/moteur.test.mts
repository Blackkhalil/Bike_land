// Le moteur de calcul des offres de groupe (src/lib/offres/) : les 9 cas de
// référence de docs/bike-land/SUIVI.md (cahier corrigé par les décisions du
// 9 novembre 2026), les refus et leurs messages, les bornes (30 minutes,
// 15 000 F, plafond de l'accompagnateur), le comptoir sans frais de
// paiement, la date limite du vendredi 19 h, les récapitulatifs, le
// formatage des montants et la pénalité de retard.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const m = await charger("src/lib/offres/index.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT: R } = await charger("src/data/reglages-offres.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[  ]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};

/* Le décor : lundi 9 novembre 2026, 10 h à Cotonou ; 18 vélos libres. */
const heureBenin = (date: string, heure: string) => Date.parse(`${date}T${heure}:00.000Z`) - 3600_000;
const LUNDI_10H = heureBenin("2026-11-09", "10:00");
const SAMEDI = "2026-11-14";
const DIMANCHE = "2026-11-15";
const MERCREDI = "2026-11-11";
const STOCK = { CLASSIQUE: 10, PREMIUM: 6, PRESTIGE: 2 };
type Contexte = { date: string; maintenant: number; velosDisponibles: number; stockParGamme?: Record<string, number> };
const contexte = (plus: Partial<Contexte> = {}): Contexte => ({ date: SAMEDI, maintenant: LUNDI_10H, velosDisponibles: 18, stockParGamme: STOCK, ...plus });

// Chaque résultat passe par ici : la somme des lignes doit faire le total,
// et aucun texte ne doit contenir de tiret long.
type Ligne = { libelle: string; detail?: string; montantXof: number };
type Issue = { ok: true; resultat: Record<string, unknown> & { lignes: Ligne[]; totalXof: number; recapModele: string } } | { ok: false; refus: { code: string; message: string } & Record<string, unknown> };
let resultats = 0;
let lignesFausses = 0;
const textes: string[] = [];
const suivre = (issue: Issue): Issue => {
  if (issue.ok) {
    resultats += 1;
    const somme = issue.resultat.lignes.reduce((total, ligne) => total + ligne.montantXof, 0);
    if (somme !== issue.resultat.totalXof) lignesFausses += 1;
    textes.push(issue.resultat.recapModele, ...issue.resultat.lignes.flatMap((l) => [l.libelle, l.detail ?? ""]));
  } else {
    textes.push(issue.refus.message);
  }
  return issue;
};

const bfaBudget = (personnes: number, budgetXof: number, plus: Record<string, unknown> = {}, ctx: Partial<Contexte> = {}, reglages = R) =>
  suivre(m.calculerBikeForAllBudget({ personnes, budgetXof, depart: "08:00", paiementElectronique: true, ...plus }, reglages, contexte(ctx)));
const bfaDuree = (personnes: number, minutes: number, coco: string, plus: Record<string, unknown> = {}, ctx: Partial<Contexte> = {}, reglages = R) =>
  suivre(m.calculerBikeForAllDuree({ personnes, minutes, coco, depart: "08:00", paiementElectronique: true, ...plus }, reglages, contexte(ctx)));
const roadTrip = (personnes: number, plus: Record<string, unknown> = {}, ctx: Partial<Contexte> = {}, reglages = R) =>
  suivre(m.calculerRoadTrip({ personnes, paiementElectronique: true, ...plus }, reglages, contexte(ctx)));
const gbashi = (velos: Record<string, unknown>, plus: Record<string, unknown> = {}, ctx: Partial<Contexte> = {}, reglages = R) =>
  suivre(m.calculerGbashi({ velos, paiementElectronique: true, ...plus }, reglages, contexte({ date: DIMANCHE, ...ctx })));

const chiffres = (issue: Issue) =>
  issue.ok
    ? [issue.resultat.coco, issue.resultat.minutes, issue.resultat.totalXof, issue.resultat.prixBarreXof]
    : `refus ${issue.refus.code}`;
const code = (issue: Issue) => (issue.ok ? "accepté" : issue.refus.code);
const refus = (issue: Issue) => (issue.ok ? { code: "accepté" } : issue.refus);
const resultat = (issue: Issue) => {
  if (!issue.ok) throw new Error(`refus inattendu : ${issue.refus.message}`);
  return issue.resultat as Record<string, any>;
};

console.log("— Les 9 cas de référence (départ 8 h, paiement électronique)");
verifier("1. Bike for All, 10 pers., 5 000 F : aucun coco, 30 min, 6 250 F, barré 11 750 F", chiffres(bfaBudget(10, 5000)), ["aucun", 30, 6250, 11750]);
verifier("2. 10 pers., 10 000 F : petit coco, 45 min, 11 250 F, barré 17 250 F", chiffres(bfaBudget(10, 10000)), ["petit", 45, 11250, 17250]);
verifier("3. 10 pers., 10 000 F, accompagnateur : 13 750 F, barré 19 750 F", chiffres(bfaBudget(10, 10000, { accompagnateur: true })), ["petit", 45, 13750, 19750]);
verifier("4. 13 pers., 10 000 F, accompagnateur : aucun coco, 45 min, 14 725 F, barré 22 350 F", chiffres(bfaBudget(13, 10000, { accompagnateur: true })), ["aucun", 45, 14725, 22350]);
verifier("5. 12 pers., 20 000 F, accompagnateur : grand coco, 90 min, 24 650 F, barré 37 950 F", chiffres(bfaBudget(12, 20000, { accompagnateur: true })), ["grand", 90, 24650, 37950]);
verifier("6. durée, 15 pers., 60 min, petit coco, 1 gâteau : 19 750 F, barré 32 250 F", chiffres(bfaDuree(15, 60, "petit", { gateauxParPersonne: 1 })), ["petit", 60, 19750, 32250]);
verifier("7. Road trip, 10 pers. : 31 250 F, pas de prix barré (décision 2)", chiffres(roadTrip(10)), ["grand", 240, 31250, null]);
verifier("8. Road trip, 10 pers., réduction : 30 050 F, barré 31 250 F", chiffres(roadTrip(10, { reductionValidee: true })), ["grand", 240, 30050, 31250]);
verifier("9. Gbashi, 2 Classique, 2 Premium, 1 Prestige : 20 125 F (décision 4), coco grand format compris", chiffres(gbashi({ CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 })), ["grand", 240, 20125, null]);

console.log("\n— Le détail des cas de référence");
const cas2 = resultat(bfaBudget(10, 10000));
verifier("cas 2 : frais 1 000 F, 10 cocos (1 750 F), fin 08:45, 10 vélos bloqués", [cas2.fraisOrganisationXof, cas2.cocos, cas2.cocosXof, cas2.depart, cas2.fin, cas2.velosBloques], [1000, 10, 1750, "08:00", "08:45", 10]);
verifier("cas 2 : frais de paiement 1 250 F, encaissé net 8 250 F (tableur B28)", [cas2.fraisPaiementXof, cas2.encaisseNetXof], [1250, 8250]);
verifier(
  "cas 2 : les lignes",
  cas2.lignes.map((l: Ligne & { code: string }) => [l.code, l.montantXof]),
  [["budget", 10000], ["frais-paiement", 1250]],
);
verifier("cas 2 : la ligne du budget dit ce qu'elle comprend", cas2.lignes[0].detail, "45 minutes de vélo pour 10 personnes, frais d'organisation (1 000 F) et 10 cocos petit format (1 750 F) compris");
const cas5 = resultat(bfaBudget(12, 20000, { accompagnateur: true }));
verifier("cas 5 : frais 2 000 F, accompagnateur 3 150 F (2 heures entamées), fin 09:30", [cas5.fraisOrganisationXof, cas5.accompagnateurXof, cas5.fin], [2000, 3150, "09:30"]);
const cas6 = resultat(bfaDuree(15, 60, "petit", { gateauxParPersonne: 1 }));
verifier(
  "cas 6 : temps 12 000 F, frais 1 000 F, cocos 2 625 F, gâteaux 2 250 F, paiement 1 875 F",
  cas6.lignes.map((l: Ligne & { code: string }) => [l.code, l.montantXof]),
  [["temps", 12000], ["frais-organisation", 1000], ["cocos", 2625], ["gateaux", 2250], ["frais-paiement", 1875]],
);
verifier("cas 6 : 15 gâteaux, 15 cocos, encaissé net 13 750 F", [cas6.gateaux, cas6.cocos, cas6.encaisseNetXof], [15, 15, 13750]);
const cas8 = resultat(roadTrip(10, { reductionValidee: true }));
verifier(
  "cas 8 : 30 000 F - 1 200 F (4 % du prix avant frais) + 1 250 F",
  cas8.lignes.map((l: Ligne & { code: string }) => [l.code, l.libelle, l.montantXof]),
  [["road-trip", "Road trip en groupe", 30000], ["reduction", "Réduction de 4 %", -1200], ["frais-paiement", "Frais de paiement électronique", 1250]],
);
verifier("cas 8 : réduction 1 200 F, 20 cocos grands, 20 eaux, 8 h à 12 h, encaissé net 19 300 F", [cas8.reductionXof, cas8.cocos, cas8.eaux, cas8.depart, cas8.fin, cas8.encaisseNetXof], [1200, 20, 20, "08:00", "12:00", 19300]);
const cas7 = resultat(roadTrip(10));
verifier("cas 7 : pas de ligne de réduction, encaissé net 20 500 F", [cas7.lignes.map((l: Ligne & { code: string }) => l.code), cas7.encaisseNetXof], [["road-trip", "frais-paiement"], 20500]);
const cas9 = resultat(gbashi({ CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }));
verifier(
  "cas 9 : 7 000 + 8 000 + 4 500 + 625 F, dimanche 7 h à 11 h",
  [cas9.lignes.map((l: Ligne) => [l.libelle, l.montantXof]), cas9.depart, cas9.fin, cas9.personnes, cas9.velosParGamme],
  [[["Vélos Classique", 7000], ["Vélos Premium", 8000], ["Vélo Prestige", 4500], ["Frais de paiement électronique", 625]], "07:00", "11:00", 5, { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }],
);
verifier(
  "cas 9 : « vélo, eau, un coco » : 5 cocos et 5 eaux à préparer, sans ligne à part",
  [cas9.cocos, cas9.eaux, cas9.cocosXof, cas9.lignes.some((l: Ligne & { code: string }) => l.code === "cocos")],
  [5, 5, 0, false],
);
verifier("cas 9 : encaissé net 17 125 F (20 125 F - 5 × 275 F - 5 × 200 F - 625 F)", cas9.encaisseNetXof, 20125 - 5 * 275 - 5 * 200 - 625);

console.log("\n— Les refus");
const r18 = refus(bfaBudget(18, 5000));
verifier("18 personnes, 5 000 F : budget insuffisant, minimum 8 200 F", [r18.code, r18.budgetMinimumXof, r18.champ], ["BUDGET_INSUFFISANT", 8200, "budgetXof"]);
verifier("… avec un message poli qui donne le minimum", r18.message, "Avec 5 000 F, votre groupe de 18 personnes ne peut pas rouler les 30 minutes du minimum. Il faut un budget de 8 200 F au moins.");
verifier("18 personnes, 8 200 F : accepté, 30 minutes", chiffres(bfaBudget(18, 8200)), ["aucun", 30, 8200 + 2250, 18 * 30 * 25 + 3000 + 2250]);
verifier("18 personnes, 8 199 F : refusé", code(bfaBudget(18, 8199)), "BUDGET_INSUFFISANT");
verifier("4 000 F pour 10 : sous le budget minimum de 5 000 F", [refus(bfaBudget(10, 4000)).code, refus(bfaBudget(10, 4000)).budgetMinimumXof, refus(bfaBudget(10, 4000)).message], ["BUDGET_MIN", 5000, "Bike for All commence à 5 000 F pour le groupe."]);
verifier("4 000 F pour 18 : le minimum de ce groupe, 8 200 F", [refus(bfaBudget(18, 4000)).budgetMinimumXof, refus(bfaBudget(18, 4000)).message], [8200, "Pour 18 personnes, le budget commence à 8 200 F : de quoi rouler 30 minutes."]);

const parc15 = refus(bfaBudget(16, 20000, {}, { velosDisponibles: 15 }));
verifier("parc passé à 15 vélos : groupe de 16 refusé", [parc15.code, parc15.maximum, parc15.message], ["PARC", 15, "Nous avons 15 vélos libres ce jour-là : votre groupe peut compter 15 personnes au plus."]);
verifier("groupe de 15 avec 15 vélos : accepté", code(bfaBudget(15, 20000, {}, { velosDisponibles: 15 })), "accepté");
verifier("3 vélos à l'atelier ce samedi (15 libres) : road trip de 16 refusé", code(roadTrip(16, {}, { velosDisponibles: 15 })), "PARC");
verifier("Gbashi de 16 vélos pour 15 libres : refusé", code(gbashi({ CLASSIQUE: 10, PREMIUM: 6 }, {}, { velosDisponibles: 15 })), "PARC");
verifier("8 vélos libres, groupe de 10 : pas assez", refus(bfaBudget(10, 10000, {}, { velosDisponibles: 8 })).message, "Il ne nous reste que 8 vélos libres ce jour-là, pas assez pour un groupe de 10 personnes : choisissez un autre jour.");
verifier("aucun vélo libre", refus(roadTrip(10, {}, { velosDisponibles: 0 })).message, "Tous nos vélos sont déjà pris ce jour-là : choisissez un autre jour.");
verifier("nombre de vélos inconnu : compté zéro, on ne vend pas à l'aveugle", code(bfaBudget(10, 10000, {}, { velosDisponibles: Number.NaN })), "PARC");
verifier("plus de plafond à 12 : 40 personnes, 40 vélos, 20 000 F, accepté (30 min)", chiffres(bfaBudget(40, 20000, {}, { velosDisponibles: 40 })), ["aucun", 30, 25000, 40 * 30 * 25 + 3000 + 5000]);

verifier("Bike for All à 9 : minimum 10", refus(bfaBudget(9, 10000)).message, "Bike for All se réserve pour 10 personnes au moins, un vélo par personne.");
verifier("road trip à 9 : minimum 10", refus(roadTrip(9)).message, "Le road trip en groupe se réserve pour 10 personnes au moins, un vélo par personne.");
verifier("Gbashi à 4 : minimum 5", [refus(gbashi({ CLASSIQUE: 2, PREMIUM: 2 })).code, refus(gbashi({ CLASSIQUE: 2, PREMIUM: 2 })).champ], ["PERSONNES_MIN", "velos"]);

const stock = refus(gbashi({ PREMIUM: 2, PRESTIGE: 3 }));
verifier("Gbashi, 3 Prestige pour 2 en stock : refusé", [stock.code, stock.gamme, stock.maximum], ["STOCK_GAMME", "PRESTIGE", 2]);
verifier("… avec le nombre restant", stock.message, "Il ne nous reste que 2 vélos Prestige libres ce jour-là : choisissez-en 2 au plus, et complétez avec une autre gamme.");
verifier("Gbashi, Prestige épuisé", refus(gbashi({ PREMIUM: 4, PRESTIGE: 1 }, {}, { stockParGamme: { CLASSIQUE: 10, PREMIUM: 6, PRESTIGE: 0 } })).message, "Il ne nous reste plus de vélo Prestige libre ce jour-là : choisissez une autre gamme.");
verifier("Gbashi, stock inconnu : compté zéro", code(gbashi({ CLASSIQUE: 5 }, {}, { stockParGamme: undefined })), "STOCK_GAMME");
verifier("Gbashi, tout le stock d'une gamme : accepté", code(gbashi({ PREMIUM: 6, PRESTIGE: 2 })), "accepté");

console.log("\n— Les jours, la date limite du vendredi 19 h, les départs passés");
verifier("road trip un mercredi : refusé", refus(roadTrip(10, {}, { date: MERCREDI })).message, "Le road trip en groupe a lieu le samedi ou le dimanche : choisissez une autre date.");
verifier("road trip le dimanche : accepté", code(roadTrip(10, {}, { date: DIMANCHE })), "accepté");
verifier("Gbashi un samedi : refusé", refus(gbashi({ CLASSIQUE: 5 }, {}, { date: SAMEDI })).message, "Gbashi Bike a lieu le dimanche : choisissez une autre date.");
verifier("Bike for All un mercredi : accepté", code(bfaBudget(10, 10000, {}, { date: MERCREDI })), "accepté");
const vendredi = (heure: string) => heureBenin("2026-11-13", heure);
verifier("samedi, demandé vendredi 18 h 59 : accepté", code(roadTrip(10, {}, { maintenant: vendredi("18:59") })), "accepté");
verifier("samedi, demandé vendredi 19 h pile : accepté (au plus tard 19 h)", code(roadTrip(10, {}, { maintenant: vendredi("19:00") })), "accepté");
const tard = refus(roadTrip(10, {}, { maintenant: vendredi("19:00") + 1000 }));
verifier("samedi, demandé vendredi 19 h 00 min 01 s : refusé", [tard.code, tard.message], ["DATE_LIMITE", "Les réservations du week-end se font au plus tard le vendredi à 19 h, et ce délai est passé pour cette date : choisissez un autre jour."]);
verifier("dimanche, demandé samedi matin : refusé", code(gbashi({ CLASSIQUE: 5 }, {}, { maintenant: heureBenin(SAMEDI, "07:00") })), "DATE_LIMITE");
verifier("dimanche, demandé vendredi 18 h : accepté", code(gbashi({ CLASSIQUE: 5 }, {}, { maintenant: vendredi("18:00") })), "accepté");
verifier("Bike for All samedi, demandé vendredi 20 h : refusé aussi (décision 11)", code(bfaBudget(10, 10000, { depart: "15:00" }, { maintenant: vendredi("20:00") })), "DATE_LIMITE");
verifier("Bike for All lundi, demandé samedi : pas de date limite en semaine", code(bfaBudget(10, 10000, {}, { date: "2026-11-16", maintenant: heureBenin(SAMEDI, "12:00") })), "accepté");
verifier("week-end suivant, demandé vendredi 20 h : accepté", code(roadTrip(10, {}, { date: "2026-11-21", maintenant: vendredi("20:00") })), "accepté");
verifier("date limite d'un samedi et d'un dimanche : vendredi 19 h (18 h UTC)", [m.dateLimiteDuWeekend(SAMEDI, R.dateLimiteWeekend), m.dateLimiteDuWeekend(DIMANCHE, R.dateLimiteWeekend), m.dateLimiteDuWeekend(MERCREDI, R.dateLimiteWeekend)], [Date.UTC(2026, 10, 13, 18), Date.UTC(2026, 10, 13, 18), null]);
const hier = refus(bfaBudget(10, 10000, {}, { date: "2026-11-08" }));
verifier("hier : date passée", [hier.code, hier.champ, hier.message], ["DATE_PASSEE", "date", "Cette date est déjà passée : choisissez un jour à venir."]);
const ceMatin = refus(bfaBudget(10, 10000, { depart: "10:00" }, { date: "2026-11-09" }));
verifier("aujourd'hui 10 h, il est 10 h : départ passé", [ceMatin.code, ceMatin.champ, ceMatin.message], ["DATE_PASSEE", "depart", "Cette heure de départ est déjà passée : choisissez-en une plus tardive, ou un autre jour."]);
verifier("aujourd'hui 10 h 15 : accepté", code(bfaBudget(10, 10000, { depart: "10:15" }, { date: "2026-11-09" })), "accepté");
verifier("road trip de ce samedi, demandé samedi 9 h : départ passé", refus(roadTrip(10, {}, { maintenant: heureBenin(SAMEDI, "09:00") })).message, "Le départ de ce jour-là est déjà passé : choisissez une autre date.");

console.log("\n— Les heures de Bike for All (décision 11 : 8 h à 21 h 30, retour 22 h)");
const horaires = "Les départs se font de 8 h à 21 h 30, au quart d'heure.";
verifier("départ 7 h 45 : refusé", [code(bfaBudget(10, 5000, { depart: "07:45" })), refus(bfaBudget(10, 5000, { depart: "07:45" })).message], ["HEURE", horaires]);
verifier("départ 21 h 45 : refusé", code(bfaBudget(10, 5000, { depart: "21:45" })), "HEURE");
verifier("départ 8 h 10 : hors du quart d'heure", code(bfaBudget(10, 5000, { depart: "08:10" })), "HEURE");
verifier("départ 21 h 30, 30 min : retour 22 h pile, accepté", resultat(bfaBudget(10, 5000, { depart: "21:30" })).fin, "22:00");
const tropTard = refus(bfaBudget(10, 10000, { depart: "21:30" }));
verifier("départ 21 h 30, 45 min : retour après 22 h", [tropTard.code, tropTard.dernierDepartPossible, tropTard.message], ["HEURE", "21:15", "Votre budget offre 45 minutes de vélo : le retour se ferait après 22 h, l'heure limite. Choisissez un départ au plus tard à 21 h 15."]);
verifier("durée 3 h à 20 h : dernier départ 19 h", [refus(bfaDuree(10, 180, "aucun", { depart: "20:00" })).dernierDepartPossible, refus(bfaDuree(10, 180, "aucun", { depart: "20:00" })).message], ["19:00", "Avec 3 h de vélo, le retour se ferait après 22 h, l'heure limite. Choisissez un départ au plus tard à 19 h."]);
const enorme = refus(bfaBudget(10, 150000));
verifier("150 000 F pour 10 : 18 h de vélo, aucun départ possible", [enorme.code, enorme.champ, enorme.message], ["HEURE", "budgetXof", "Votre budget offre 18 h de vélo : le retour se ferait après 22 h, l'heure limite, même au premier départ. Choisissez un budget plus petit."]);
verifier("durée 20 min : refusée", [code(bfaDuree(10, 20, "aucun")), refus(bfaDuree(10, 20, "aucun")).message], ["DUREE", "La durée de vélo se choisit par quart d'heure, à partir de 30 minutes."]);
verifier("durée 50 min : hors du quart d'heure", code(bfaDuree(10, 50, "aucun")), "DUREE");
verifier("durée 30 min : acceptée", code(bfaDuree(10, 30, "aucun")), "accepté");

console.log("\n— Les saisies illisibles");
verifier("10,5 personnes", [refus(bfaBudget(10.5, 10000)).code, refus(bfaBudget(10.5, 10000)).champ], ["SAISIE", "personnes"]);
verifier("budget illisible", refus(bfaBudget(10, Number.NaN)).champ, "budgetXof");
verifier("coco « moyen »", [refus(bfaDuree(10, 60, "moyen")).code, refus(bfaDuree(10, 60, "moyen")).champ], ["SAISIE", "coco"]);
verifier("gâteaux négatifs ou décimaux", [refus(bfaBudget(10, 10000, { gateauxParPersonne: -1 })).champ, refus(roadTrip(10, { gateauxParPersonne: 1.5 })).champ], ["gateauxParPersonne", "gateauxParPersonne"]);
verifier("heure « 8h »", refus(bfaBudget(10, 10000, { depart: "8h" })).champ, "depart");
verifier("mode de paiement absent", refus(bfaBudget(10, 10000, { paiementElectronique: undefined })).champ, "paiementElectronique");
verifier("date impossible (30 février)", [refus(roadTrip(10, {}, { date: "2027-02-30" })).code, refus(roadTrip(10, {}, { date: "2027-02-30" })).champ], ["SAISIE", "date"]);
verifier("Gbashi, nombre de vélos négatif", refus(gbashi({ PRESTIGE: -1 })).champ, "velos");
verifier("réduction « oui » au lieu de vrai", refus(roadTrip(10, { reductionValidee: "oui" })).champ, "reductionValidee");
let horlogeCassee = "aucune erreur";
try {
  m.calculerRoadTrip({ personnes: 10, paiementElectronique: true }, R, { ...contexte(), maintenant: Number.NaN });
} catch (erreur) {
  horlogeCassee = erreur instanceof TypeError ? "TypeError" : "autre erreur";
}
verifier("horloge illisible : erreur du serveur, pas un refus muet", horlogeCassee, "TypeError");

console.log("\n— Les bornes");
verifier("exactement 30 minutes (10 pers., 5 000 F) : accepté", resultat(bfaBudget(10, 5000)).minutes, 30);
verifier("budget de 15 000 F pile : frais 2 000 F ; 14 750 F : 1 000 F", [resultat(bfaBudget(10, 15000)).fraisOrganisationXof, resultat(bfaBudget(10, 14750)).fraisOrganisationXof], [2000, 1000]);
verifier("durée, temps de vélo de 15 000 F pile (15 pers., 75 min) : frais 2 000 F", resultat(bfaDuree(15, 75, "aucun")).lignes.map((l: Ligne & { code: string }) => [l.code, l.montantXof]).slice(0, 2), [["temps", 15000], ["frais-organisation", 2000]]);
verifier("20 % pile du budget = 275 F par personne (13 750 F, 10 pers.) : grand coco", resultat(bfaBudget(10, 13750)).coco, "grand");
verifier("13 500 F, 10 pers. (270 F) : petit coco", resultat(bfaBudget(10, 13500)).coco, "petit");
verifier("8 750 F, 10 pers. (175 F pile) : petit ; 8 500 F : aucun", [resultat(bfaBudget(10, 8750)).coco, resultat(bfaBudget(10, 8500)).coco], ["petit", "aucun"]);
const tableau = [10, 13, 15, 20].map((personnes) => [45, 90, 150].map((minutes) => m.prixAccompagnateurXof(personnes, minutes, R)));
verifier("accompagnateur, le tableau du cahier (4.3)", tableau, [[2500, 2750, 3000], [3100, 3350, 3600], [3500, 3750, 4000], [4500, 4750, 5000]]);
verifier("accompagnateur : plafond 5 000 F (20 pers. 4 h, 25 pers.)", [m.prixAccompagnateurXof(20, 181, R), m.prixAccompagnateurXof(25, 45, R)], [5000, 5000]);
verifier("accompagnateur : 1 heure pile compte une heure", m.prixAccompagnateurXof(10, 60, R), 2500);
const huitComprises = { ...R, accompagnateur: { ...R.accompagnateur, personnesIncluses: 8 } };
verifier(
  "accompagnateur, 8 personnes comprises (réglage) : 10 pers. moins d'1 h, 1 900 F ; 6 pers., le minimum 1 500 F",
  [m.prixAccompagnateurXof(10, 45, huitComprises), m.prixAccompagnateurXof(6, 45, huitComprises)],
  [1500 + 2 * 200, 1500],
);
verifier("… et dans le calcul : cas 3 avec 8 personnes comprises, 11 250 F + 1 900 F", resultat(bfaBudget(10, 10000, { accompagnateur: true }, {}, huitComprises)).totalXof, 11250 + 1900);
verifier("plus de nombre écrit en dur : la constante des 5 personnes a disparu", m.PERSONNES_INCLUSES_ACCOMPAGNATEUR, undefined);
const coupe = { ...R, bikeForAll: { ...R.bikeForAll, partMaxCocos: 0.5 } };
verifier("coco qui empêche les 30 min : retiré, durée recalculée (part des cocos à 50 %)", chiffres(bfaBudget(10, 5000, {}, {}, coupe)), ["aucun", 30, 6250, 11750]);
verifier("budget minimum : 5 000 F (10 pers.), 5 400 F (11), 8 200 F (18)", [10, 11, 18].map((n) => m.budgetMinimumBikeForAllXof(n, R)), [5000, 5400, 8200]);
verifier("le trou du seuil : 34 pers., 14 600 F ; au-delà de 15 000 F, 15 600 F ; 35 pers., 16 000 F", [m.budgetMinimumBikeForAllXof(34, R), m.budgetMinimumBikeForAllXof(34, R, 15000), m.budgetMinimumBikeForAllXof(35, R)], [14600, 15600, 16000]);
const trou = refus(bfaBudget(34, 15000, {}, { velosDisponibles: 40 }));
verifier("34 pers., 15 000 F : refusé, on propose 15 600 F", [trou.code, trou.budgetMinimumXof], ["BUDGET_INSUFFISANT", 15600]);
verifier("34 pers., 14 600 F et 15 600 F : acceptés", [code(bfaBudget(34, 14600, {}, { velosDisponibles: 40 })), code(bfaBudget(34, 15600, {}, { velosDisponibles: 40 }))], ["accepté", "accepté"]);
let desaccords = 0;
let essais = 0;
for (let personnes = 10; personnes <= 40; personnes += 1) {
  for (let budget = 5000; budget <= 20000; budget += 50) {
    essais += 1;
    const accepte = m.calculerBikeForAllBudget({ personnes, budgetXof: budget, depart: "08:00", paiementElectronique: true }, R, contexte({ velosDisponibles: 60 })).ok;
    if (accepte !== (m.budgetMinimumBikeForAllXof(personnes, R, budget) === budget)) desaccords += 1;
  }
}
verifier(`budget minimum annoncé = budget accepté, sur ${essais} essais (10 à 40 pers., 5 000 à 20 000 F)`, desaccords, 0);

console.log("\n— Au comptoir, en espèces (décision 12) : mêmes réglages, sans les 125 F");
const comptoir = resultat(bfaBudget(10, 10000, { paiementElectronique: false }));
verifier("cas 2 au comptoir : 10 000 F, barré 16 000 F, pas de ligne de frais", [comptoir.totalXof, comptoir.prixBarreXof, comptoir.fraisPaiementXof, comptoir.lignes.length], [10000, 16000, 0, 1]);
verifier("cas 6 au comptoir : 17 875 F, barré 30 375 F", chiffres(bfaDuree(15, 60, "petit", { gateauxParPersonne: 1, paiementElectronique: false })), ["petit", 60, 17875, 30375]);
verifier("road trip au comptoir : 30 000 F ; avec réduction 28 800 F, barré 30 000 F", [chiffres(roadTrip(10, { paiementElectronique: false })), chiffres(roadTrip(10, { paiementElectronique: false, reductionValidee: true }))], [["grand", 240, 30000, null], ["grand", 240, 28800, 30000]]);
verifier("Gbashi au comptoir : 3 500 / 4 000 / 4 500 F, soit 19 500 F", resultat(gbashi({ CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }, { paiementElectronique: false })).totalXof, 19500);
verifier("Gbashi en ligne, 1 vélo de chaque gamme + 2 Premium : 3 625 + 3 × 4 125 + 4 625 F", resultat(gbashi({ CLASSIQUE: 1, PREMIUM: 3, PRESTIGE: 1 })).totalXof, 3625 + 3 * 4125 + 4625);

console.log("\n— Les options et les réglages");
verifier("gâteaux sans plafond : 10 pers. × 8 gâteaux", resultat(bfaBudget(10, 10000, { gateauxParPersonne: 8 })).gateauxXof, 12000);
verifier("road trip avec 2 gâteaux chacun : 31 250 + 3 000 F", resultat(roadTrip(10, { gateauxParPersonne: 2 })).totalXof, 34250);
verifier("réduction absente : jamais par défaut (décision 8)", resultat(roadTrip(10)).reductionXof, 0);
const plusCher = { ...R, roadTrip: { ...R.roadTrip, prixPersonneXof: 3200, reduction: 0.05 }, bikeForAll: { ...R.bikeForAll, tarifHeurePersonneXof: 1000 } };
verifier("réglages changés : road trip 3 200 F et 5 %", chiffres(roadTrip(10, { reductionValidee: true }, {}, plusCher)), ["grand", 240, 32000 - 1600 + 1250, 32000 + 1250]);
verifier("réglages changés : Bike for All à 1 000 F de l'heure (10 pers., 10 000 F : 30 min)", resultat(bfaBudget(10, 10000, {}, {}, plusCher)).minutes, 30);
const reductionAZero = { ...R, roadTrip: { ...R.roadTrip, reduction: 0 } };
verifier("réduction réglée à 0 % : pas de prix barré, même validée", resultat(roadTrip(10, { reductionValidee: true }, {}, reductionAZero)).prixBarreXof, null);
const centimes = { ...R, roadTrip: { ...R.roadTrip, prixPersonneXof: 3333 } };
verifier("réduction arrondie au franc : 4 % de 33 330 F = 1 333 F", resultat(roadTrip(10, { reductionValidee: true }, {}, centimes)).reductionXof, 1333);

console.log("\n— Les récapitulatifs (modèles du tableur, montants « 11 250 F »)");
const FIN = "\n\nLe retour des vélos doit être expressément respecté. Vous avez une marge de retard de 7 minutes ; au-delà, le groupe paiera 1 000 F par minute.\n\nMerci de faire confiance à Bike Land !";
const GAMME = "Vous profitez de toute notre gamme de vélos (Classique, Premium, Prestige) et de nos casques.";
verifier(
  "Bike for All, cas 2 (tableur A33)",
  cas2.recapModele,
  `BIKE FOR ALL : Cher client, pour votre groupe de 10 personnes, vous paierez 11 250 F au lieu de 17 250 F, pour 45 minutes de vélo de 08h00 à 08h45. ${GAMME} Vous aurez 10 cocos petit format inclus dans le prix, à raison de 1 par personne.${FIN}`,
);
verifier(
  "Bike for All, cas 3 : l'accompagnateur",
  resultat(bfaBudget(10, 10000, { accompagnateur: true })).recapModele,
  `BIKE FOR ALL : Cher client, pour votre groupe de 10 personnes, vous paierez 13 750 F au lieu de 19 750 F, pour 45 minutes de vélo de 08h00 à 08h45. ${GAMME} Vous aurez 10 cocos petit format inclus dans le prix, à raison de 1 par personne. Un accompagnateur Bike Land vous guidera, vous montrera le circuit et vous assistera tout au long du trajet.${FIN}`,
);
verifier(
  "Bike for All durée, cas 6 (tableur A27)",
  cas6.recapModele,
  `BIKE FOR ALL : Cher client, pour votre groupe de 15 personnes, vous paierez 19 750 F au lieu de 32 250 F, pour 60 minutes de vélo de 08h00 à 09h00. ${GAMME} Vous aurez 15 cocos petit format inclus dans le prix, à raison de 1 par personne. Vous aurez aussi 15 gâteaux, à raison de 1 par personne.${FIN}`,
);
verifier(
  "Road trip, cas 7 (tableur A20) : sans prix barré",
  cas7.recapModele,
  `ROAD TRIP BIKE LAND : Cher client, pour votre groupe de 10 personnes, vous paierez 31 250 F, pour une balade de 25 km de 08h00 à 12h00. ${GAMME} Vous aurez 2 cocos et 2 bouteilles d'eau par personne, inclus dans le prix.${FIN}`,
);
verifier("Road trip, cas 8 : « au lieu de »", cas8.recapModele.split(",").slice(0, 3).join(","), "ROAD TRIP BIKE LAND : Cher client, pour votre groupe de 10 personnes, vous paierez 30 050 F au lieu de 31 250 F");
verifier(
  "Gbashi Bike, cas 9 : sur le même patron, avec l'eau et le coco de la carte",
  cas9.recapModele,
  `GBASHI BIKE : Cher client, pour votre groupe de 5 personnes, vous paierez 20 125 F, pour une sortie Gbashi Bike de 07h00 à 11h00 : du vélo jusqu'au bord de mer, puis une séance de musculation encadrée par nos coachs. Vous roulerez sur 2 vélos Classique, 2 Premium et 1 Prestige, avec nos casques. Vous aurez 1 coco et 1 bouteille d'eau par personne, inclus dans le prix.${FIN}`,
);
verifier(
  "Gbashi, une seule gamme, avec des gâteaux",
  resultat(gbashi({ PREMIUM: 5 }, { gateauxParPersonne: 2 })).recapModele.split(".").slice(1, 4).join("."),
  " Vous roulerez sur 5 vélos Premium, avec nos casques. Vous aurez 1 coco et 1 bouteille d'eau par personne, inclus dans le prix. Vous aurez aussi 10 gâteaux, à raison de 2 par personne",
);
const gbashiDeuxCocos = { ...R, gbashi: { ...R.gbashi, cocosGrandsParPersonne: 2, eauxParPersonne: 0 } };
const deuxCocos = resultat(gbashi({ CLASSIQUE: 5 }, {}, {}, gbashiDeuxCocos));
verifier(
  "Gbashi réglé à 2 cocos et pas d'eau : 10 cocos, aucune eau, encaissé net 14 750 F (18 125 F - 10 × 275 F - 625 F)",
  [deuxCocos.cocos, deuxCocos.eaux, deuxCocos.encaisseNetXof, deuxCocos.recapModele.split(".")[2]],
  [10, 0, 5 * 3625 - 10 * 275 - 625, " Vous aurez 2 cocos par personne, inclus dans le prix"],
);
const gbashiSansRien = resultat(gbashi({ CLASSIQUE: 5 }, {}, {}, { ...R, gbashi: { ...R.gbashi, cocosGrandsParPersonne: 0, eauxParPersonne: 0 } }));
verifier(
  "Gbashi réglé sans coco ni eau : rien d'annoncé, coco « aucun »",
  [gbashiSansRien.coco, gbashiSansRien.cocos, gbashiSansRien.eaux, gbashiSansRien.recapModele.includes("inclus dans le prix")],
  ["aucun", 0, 0, false],
);
const roadTripSansEau = resultat(roadTrip(10, {}, {}, { ...R, roadTrip: { ...R.roadTrip, eauxParPersonne: 0 } }));
verifier(
  "road trip réglé sans eau : la phrase ne parle que des cocos",
  [roadTripSansEau.eaux, roadTripSansEau.recapModele.split(".")[2]],
  [0, " Vous aurez 2 cocos par personne, inclus dans le prix"],
);
verifier("les montants du récapitulatif, retrouvés : total, barré, pénalité", m.extraireMontants(cas2.recapModele), [11250, 17250, 1000]);

console.log("\n— Les montants");
verifier("11 250 F avec l'espace insécable", m.formatMontant(11250), "11 250 F");
verifier("0 F, 999 F, 1 000 000 F, -1 200 F", [m.formatMontant(0), m.formatMontant(999), m.formatMontant(1000000), m.formatMontant(-1200)], ["0 F", "999 F", "1 000 000 F", "−1 200 F"]);
verifier("4 %, 3,25 %", [m.formatPourcentage(0.04), m.formatPourcentage(0.0325)], ["4 %", "3,25 %"]);
verifier(
  "extraction : toutes les espaces, FCFA, point des milliers, sans espace",
  m.extraireMontants("Vous paierez 11 250 F (au lieu de 17 250 FCFA), soit 30.050 F, 1250F ou 2 500 francs."),
  [11250, 17250, 30050, 1250, 2500],
);
verifier("extraction : les nombres sans unité sont ignorés", m.extraireMontants("10 personnes, 45 minutes, de 08h00 à 08h45, 25 km, 4 %, 3,5 F, à Fidjrossè 10 Fidjrossè"), []);

console.log("\n— La pénalité de retard (7 minutes de tolérance, puis 1 000 F par minute)");
verifier("0, 7, 8, 10 minutes de retard", [0, 7, 8, 10].map((minutes) => m.penaliteRetardXof(minutes, R)), [0, 0, 1000, 3000]);
verifier("7 min 54 s : dans la tolérance ; retard négatif : rien", [m.penaliteRetardXof(7.9, R), m.penaliteRetardXof(-5, R)], [0, 0]);
verifier("réglages changés : 10 min, puis 500 F", m.penaliteRetardXof(15, { retard: { toleranceMinutes: 10, penaliteParMinuteXof: 500 } }), 2500);

console.log("\n— Sur tous les calculs de cette suite");
verifier(`la somme des lignes fait le total (${resultats} résultats)`, lignesFausses, 0);
verifier(`aucun tiret long dans les ${textes.length} textes`, textes.filter((texte) => /[—–]|--/.test(texte)), []);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
