// Le jour de Padel bike que le comptoir propose d'office : le prochain jour
// programmé dont le départ n'est pas passé (un Padel bike avait été saisi le
// jeudi 19 novembre pour la sortie du vendredi 20). Règle pure, sans base.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { prochainJourPadelAuComptoir, jourProgrammePadel } = await charger("src/data/padel-bike.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

// L'heure du Bénin est UTC+1 : 09:00Z, c'est 10 h à Cotonou.
const leVendredi = { jours: [5], dates: [], depart: "17:30" };
verifier("jeudi 19 à 10 h : le vendredi 20, pas aujourd'hui", prochainJourPadelAuComptoir(leVendredi, Date.parse("2026-11-19T09:00:00Z")), "2026-11-20");
verifier("vendredi 20 à 16 h : aujourd'hui, le départ de 17 h 30 n'est pas passé", prochainJourPadelAuComptoir(leVendredi, Date.parse("2026-11-20T15:00:00Z")), "2026-11-20");
verifier("vendredi 20 à 18 h : le départ est passé, le vendredi suivant", prochainJourPadelAuComptoir(leVendredi, Date.parse("2026-11-20T17:00:00Z")), "2026-11-27");
verifier("une date programmée une à une", prochainJourPadelAuComptoir({ jours: [], dates: ["2026-11-24"], depart: "18:30" }, Date.parse("2026-11-19T09:00:00Z")), "2026-11-24");
verifier("la plus proche des deux : un jour de semaine ou une date", prochainJourPadelAuComptoir({ jours: [5], dates: ["2026-11-21", "2026-11-19"], depart: "18:30" }, Date.parse("2026-11-19T09:00:00Z")), "2026-11-19");
verifier("rien de programmé : aujourd'hui", prochainJourPadelAuComptoir({ jours: [], dates: [], depart: "18:30" }, Date.parse("2026-11-19T09:00:00Z")), "2026-11-19");
verifier("le jour proposé est bien programmé", jourProgrammePadel(leVendredi, prochainJourPadelAuComptoir(leVendredi, Date.parse("2026-11-19T09:00:00Z"))), true);

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
