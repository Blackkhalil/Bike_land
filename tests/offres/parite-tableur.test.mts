// La parité du moteur de calcul (src/lib/offres/) avec le vrai tableur
// Bike_Land_Calculatrice_Offres.xlsx, exigée par le responsable.
//
// tests/offres/cas-tableur.json contient des entrées tirées au hasard et les
// résultats du classeur recalculé par ses propres formules (outil :
// outils/parite-tableur.py, bibliothèque Python « formulas », prix du road
// trip porté à 3 000 F, décision 2). Ce test refait chaque cas avec le
// moteur et compare tout : coco, durée, heure de fin, frais, cocos, gâteaux,
// accompagnateur, frais de paiement, total, prix barré, encaissé net et
// récapitulatif (texte entier pour les premiers cas, empreinte pour tous).
//
// Seule exclusion : en mode budget, le tableur accepte un budget qui ne paie
// pas 30 minutes de vélo ; le moteur le refuse (décision 16). Ces cas sont
// comptés, affichés, et le refus du moteur est vérifié.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const m = await charger("src/lib/offres/index.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT: R } = await charger("src/data/reglages-offres.ts");
const cas = JSON.parse(readFileSync(join(projet, "tests/offres/cas-tableur.json"), "utf8"));

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

// Le tableur écrit des espaces ordinaires, le moteur des espaces insécables
// dans les montants (« 11 250 F ») : on compare le texte une fois ramené aux
// espaces ordinaires.
const texteDuTableur = (texte: string) => texte.replace(/[  ]/g, " ");
const empreinte = (texte: string) => createHash("sha256").update(texteDuTableur(texte), "utf8").digest("hex").slice(0, 16);

console.log("— Les réglages du tableur sont ceux du moteur");
const P = cas.parametres;
verifier(
  "onglet Paramètres = valeurs de départ des réglages (prix du road trip : 3 000 F, décision 2)",
  [
    P.B6, P.B8, P.B9, P.B10, P.B11, P.B12, P.B13, P.B14, P.B15, P.B16, P.B17,
    P.B18, P.B19, P.B20, P.B21, P.B23, P.B24, P.B25, P.B26, P.B27,
    P.B29, P.B30, P.B31, P.B32, P.B33, P.B34, P.B36, P.B38, P.B40, P.B41,
  ],
  [
    R.tarifNormalHeureXof, R.bikeForAll.personnesMin, R.bikeForAll.budgetMinXof, R.bikeForAll.tarifHeurePersonneXof,
    R.bikeForAll.fraisOrganisationXof, R.bikeForAll.fraisOrganisationGrosXof, R.bikeForAll.seuilGrosBudgetXof,
    R.bikeForAll.partMaxCocos, R.bikeForAll.dureeMinMinutes, R.bikeForAll.pasMinutes, R.bikeForAll.fraisHorsOffreXof,
    R.accompagnateur.minXof, R.accompagnateur.parPersonneXof, R.accompagnateur.parHeureXof, R.accompagnateur.plafondXof,
    R.consommables.cocoPetitXof, R.consommables.cocoGrandXof, R.consommables.eauCoutXof, R.consommables.gateauPrixXof,
    R.consommables.gateauCoutXof, R.roadTrip.prixPersonneXof, R.roadTrip.reduction, R.roadTrip.cocosGrandsParPersonne,
    R.roadTrip.eauxParPersonne, R.roadTrip.depart, R.roadTrip.retour, R.paiement.fraisParPersonneXof,
    R.dateLimiteWeekend.heure, R.retard.toleranceMinutes, R.retard.penaliteParMinuteXof,
  ],
);

// Le décor : demandé le lundi 9 novembre 2026 à 10 h ; Bike for All le
// mercredi, le road trip le samedi ; 18 vélos libres (Paramètres!B5). C'est
// assez tôt pour la date limite du vendredi et pour le délai minimum en
// ligne (vérifié plus bas) : le tableur ne connaît ni l'un ni l'autre.
//
// Le canal de vente suit la case « Paiement électronique ? » du tableur,
// gardée dans chaque entrée : « Oui », en ligne ; « Non », le comptoir
// (décision 12). Le moteur, lui, ne lit pas ce champ dans la demande.
const MAINTENANT = Date.parse("2026-11-09T09:00:00.000Z");
const MERCREDI = "2026-11-11";
const SAMEDI = "2026-11-14";
const canalDe = (entree: Record<string, any>) => (entree.paiementElectronique ? "en-ligne" : "comptoir");
const contexte = (date: string, entree: Record<string, any>) => ({
  canal: canalDe(entree),
  date,
  maintenant: MAINTENANT,
  velosDisponibles: P.B5,
});
const instantBenin = (date: string, heure: string) => Date.parse(`${date}T${heure}:00.000Z`) - 3600_000;
const premierDepart = Math.min(
  ...[...cas.bikeForAll, ...cas.bikeForAllDuree].map((c: Cas) => instantBenin(MERCREDI, c.entree.depart)),
  instantBenin(SAMEDI, R.roadTrip.depart),
);
verifier(
  "le décor respecte le délai minimum en ligne : premier départ du fichier à plus de 2 h de la demande",
  premierDepart - MAINTENANT >= R.delaiMinimumMinutes * 60_000,
  true,
);

type Cas = { entree: Record<string, any>; tableur: Record<string, any> };
type Champs = Record<string, (resultat: Record<string, any>) => unknown>;

/**
 * Compare un onglet : chaque champ du tableur avec celui du moteur. Rend le
 * nombre de cas comparés. Les cas exclus (`exclure`) passent par `controler`.
 */
function comparerOnglet(
  nom: string,
  liste: Cas[],
  calculer: (entree: Record<string, any>) => { ok: boolean; resultat?: Record<string, any>; refus?: Record<string, any> },
  champs: Champs,
  exclure: (tableur: Record<string, any>) => boolean = () => false,
  controler?: (entree: Record<string, any>, issue: { ok: boolean; refus?: Record<string, any> }) => boolean,
) {
  const ecarts: Record<string, string[]> = {};
  let compares = 0;
  let exclus = 0;
  let exclusMalTraites = 0;
  let textesEntiers = 0;
  const noter = (champ: string, detail: string) => (ecarts[champ] ??= []).push(detail);

  for (const { entree, tableur } of liste) {
    const issue = calculer(entree);
    if (exclure(tableur)) {
      exclus += 1;
      if (!controler?.(entree, issue)) exclusMalTraites += 1;
      continue;
    }
    compares += 1;
    if (tableur.conditions !== "Oui") {
      if (issue.ok) noter("conditions", `${JSON.stringify(entree)} : le tableur refuse (${tableur.conditions}), le moteur accepte`);
      continue;
    }
    if (!issue.ok || !issue.resultat) {
      noter("acceptation", `${JSON.stringify(entree)} : le moteur refuse (${issue.refus?.code} ${issue.refus?.message})`);
      continue;
    }
    for (const [champ, lire] of Object.entries(champs)) {
      const obtenu = lire(issue.resultat);
      if (JSON.stringify(obtenu) !== JSON.stringify(tableur[champ])) {
        noter(champ, `${JSON.stringify(entree)} : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(tableur[champ])}`);
      }
    }
    if (empreinte(issue.resultat.recapModele) !== tableur.recapEmpreinte) {
      noter("récapitulatif", `${JSON.stringify(entree)} : ${JSON.stringify(texteDuTableur(issue.resultat.recapModele))}`);
    }
    if (tableur.recap !== undefined) {
      textesEntiers += 1;
      if (texteDuTableur(issue.resultat.recapModele) !== tableur.recap) {
        noter("récapitulatif entier", `${JSON.stringify(texteDuTableur(issue.resultat.recapModele))} au lieu de ${JSON.stringify(tableur.recap)}`);
      }
    }
  }

  console.log(`\n— ${nom} : ${liste.length} cas du tableur, ${compares} comparés, ${exclus} exclus`);
  for (const champ of [...Object.keys(champs), "récapitulatif"]) {
    const liste = ecarts[champ] ?? [];
    verifier(`${nom} : ${champ} identique au tableur sur les ${compares} cas`, liste.length, 0);
    for (const detail of liste.slice(0, 3)) console.log(`      ${detail}`);
  }
  verifier(`${nom} : récapitulatif identique mot pour mot (${textesEntiers} textes entiers)`, (ecarts["récapitulatif entier"] ?? []).length, 0);
  for (const detail of (ecarts["récapitulatif entier"] ?? []).slice(0, 2)) console.log(`      ${detail}`);
  for (const champ of ["conditions", "acceptation"]) {
    const liste = ecarts[champ] ?? [];
    verifier(`${nom} : ${champ === "conditions" ? "mêmes refus que le tableur" : "accepté quand le tableur accepte"}`, liste.length, 0);
    for (const detail of liste.slice(0, 3)) console.log(`      ${detail}`);
  }
  if (controler) verifier(`${nom} : les ${exclus} cas exclus sont refusés par le moteur comme prévu`, exclusMalTraites, 0);
  return { compares, exclus };
}

/* ----------------------------------------------------- Bike for All, budget */

const ligne = (resultat: Record<string, any>, code: string) =>
  resultat.lignes.find((l: { code: string }) => l.code === code)?.montantXof ?? 0;

const budget = comparerOnglet(
  "Bike for All (budget)",
  cas.bikeForAll,
  (e) => m.calculerBikeForAllBudget(e, R, contexte(MERCREDI, e)),
  {
    fraisOrganisationXof: (r) => r.fraisOrganisationXof,
    coco: (r) => r.coco,
    cocosXof: (r) => r.cocosXof,
    minutes: (r) => r.minutes,
    fin: (r) => r.fin,
    gateauxXof: (r) => r.gateauxXof,
    accompagnateurXof: (r) => r.accompagnateurXof,
    fraisPaiementXof: (r) => r.fraisPaiementXof,
    totalXof: (r) => r.totalXof,
    prixBarreXof: (r) => r.prixBarreXof,
    encaisseNetXof: (r) => r.encaisseNetXof,
  },
  // Le tableur accepte sous 30 minutes ; le moteur refuse (décision 16).
  (t) => t.conditions === "Oui" && t.minutes < R.bikeForAll.dureeMinMinutes,
  (entree, issue) =>
    !issue.ok && issue.refus?.code === "BUDGET_INSUFFISANT" && issue.refus.budgetMinimumXof > entree.budgetXof,
);
console.log(`     ${budget.exclus} cas exclus : le tableur y accepte moins de 30 minutes de vélo, le moteur refuse (budget insuffisant).`);

/* ------------------------------------------------------ Bike for All, durée */

const duree = comparerOnglet(
  "Bike for All (durée)",
  cas.bikeForAllDuree,
  (e) => m.calculerBikeForAllDuree(e, R, contexte(MERCREDI, e)),
  {
    tempsXof: (r) => ligne(r, "temps"),
    fraisOrganisationXof: (r) => r.fraisOrganisationXof,
    cocosXof: (r) => r.cocosXof,
    gateauxXof: (r) => r.gateauxXof,
    accompagnateurXof: (r) => r.accompagnateurXof,
    fraisPaiementXof: (r) => r.fraisPaiementXof,
    fin: (r) => r.fin,
    totalXof: (r) => r.totalXof,
    prixBarreXof: (r) => r.prixBarreXof,
    encaisseNetXof: (r) => r.encaisseNetXof,
  },
);

/* ------------------------------------------------------------- Road trip */

const roadTrip = comparerOnglet(
  "Road trip en groupe",
  cas.roadTrip,
  (e) => m.calculerRoadTrip(e, R, contexte(SAMEDI, e)),
  {
    prixAvantReductionXof: (r) => ligne(r, "road-trip"),
    reductionXof: (r) => r.reductionXof,
    gateauxXof: (r) => r.gateauxXof,
    fraisPaiementXof: (r) => r.fraisPaiementXof,
    totalXof: (r) => r.totalXof,
    prixBarreXof: (r) => r.prixBarreXof,
    encaisseNetXof: (r) => r.encaisseNetXof,
  },
);

/* ------------------------------------------------------- Le fichier de cas */

console.log("\n— Le fichier de cas");
const auHasard = (liste: Cas[]) => liste.filter((c) => c.entree.paiementElectronique).length;
verifier(
  "au moins 1 000 cas par onglet avec paiement électronique",
  [auHasard(cas.bikeForAll) >= 1000, auHasard(cas.bikeForAllDuree) >= 1000, auHasard(cas.roadTrip) >= 1000],
  [true, true, true],
);
verifier(
  "des cas sans paiement électronique (le comptoir, décision 12) dans chaque onglet",
  [cas.bikeForAll, cas.bikeForAllDuree, cas.roadTrip].map((liste: Cas[]) => liste.some((c) => !c.entree.paiementElectronique)),
  [true, true, true],
);
verifier(
  "toutes les combinaisons coco, gâteaux, accompagnateur (durée) présentes",
  new Set(cas.bikeForAllDuree.map((c: Cas) => `${c.entree.coco}/${c.entree.gateauxParPersonne}/${c.entree.accompagnateur}`)).size,
  3 * 4 * 2,
);
verifier(
  "les cas de référence en tête : 6 250, 11 250, 13 750, 14 725, 24 650 F ; 19 750 F ; 31 250 et 30 050 F",
  [...cas.bikeForAll.slice(0, 5), cas.bikeForAllDuree[0], ...cas.roadTrip.slice(0, 2)].map((c: Cas) => c.tableur.totalXof),
  [6250, 11250, 13750, 14725, 24650, 19750, 31250, 30050],
);
console.log(
  `\n     Parité : ${budget.compares + duree.compares + roadTrip.compares} cas comparés au tableur ` +
    `(budget ${budget.compares}, durée ${duree.compares}, road trip ${roadTrip.compares}), ` +
    `${budget.exclus} exclus sous 30 minutes.`,
);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
