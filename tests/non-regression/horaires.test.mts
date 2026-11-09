// Vérifie les règles d'horaires sans toucher à la base (mode démo).
import { join } from "node:path";
import { pathToFileURL } from "node:url";

delete process.env.DATABASE_URL;
const charger = (chemin: string) => import(pathToFileURL(join(process.cwd(), chemin)).href);
const offres = await charger("src/data/offres.ts");
const ouverture = await charger("src/lib/ouverture.ts");
const tokens = await charger("src/lib/tokens.ts");

// Heure du Bénin (UTC+1) -> instant UTC.
const benin = (iso: string) => new Date(Date.parse(`${iso}:00Z`) - 3_600_000);
let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
};

// 1. Clôture la veille à 22 h, heure du Bénin.
verifier("clôture samedi 10/10 = vendredi 22 h", new Date(offres.clotureRoadTrip("2026-10-10")).toISOString(), "2026-10-09T21:00:00.000Z");
verifier("clôture dimanche 11/10 = samedi 22 h", new Date(offres.clotureRoadTrip("2026-10-11")).toISOString(), "2026-10-10T21:00:00.000Z");

// 2. Départs proposés, les deux créneaux ouverts.
const deux = { creneauxActifs: new Set(["samedi-matin", "dimanche-matin"]), joursFermes: [] };
const departs = (quand: string) => offres.creneauxDisponibles(benin(quand), deux).map((c: { libelle: string; date: string }) => `${c.libelle} ${c.date}`);
verifier("vendredi 21 h 59", departs("2026-10-09T21:59"), ["Samedi 2026-10-10", "Dimanche 2026-10-11"]);
verifier("vendredi 22 h 00", departs("2026-10-09T22:00"), ["Samedi 2026-10-17", "Dimanche 2026-10-11"]);
verifier("samedi 15 h", departs("2026-10-10T15:00"), ["Samedi 2026-10-17", "Dimanche 2026-10-11"]);
verifier("samedi 21 h 59", departs("2026-10-10T21:59"), ["Samedi 2026-10-17", "Dimanche 2026-10-11"]);
verifier("samedi 22 h 00", departs("2026-10-10T22:00"), ["Samedi 2026-10-17", "Dimanche 2026-10-18"]);
verifier("dimanche 9 h", departs("2026-10-11T09:00"), ["Samedi 2026-10-17", "Dimanche 2026-10-18"]);
verifier("mercredi 12 h", departs("2026-10-14T12:00"), ["Samedi 2026-10-17", "Dimanche 2026-10-18"]);

// 3. Heures de location libre.
const mercredi = benin("2026-10-07T09:30");
verifier("samedi, 2 h : de 11 h (après le road trip) à 20 h", offres.heuresDepartPossibles(2, "2026-10-10", mercredi), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
verifier("dimanche, 4 h : jusqu'à 18 h (retour 22 h)", offres.heuresDepartPossibles(4, "2026-10-11", mercredi), [11, 12, 13, 14, 15, 16, 17, 18]);
verifier("lundi, 2 h : de 8 h à 20 h", offres.heuresDepartPossibles(2, "2026-10-12", mercredi), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
verifier("lundi, 3 h : jusqu'à 19 h", offres.heuresDepartPossibles(3, "2026-10-12", mercredi).at(-1), 19);
verifier("lundi, 1 h : pas de départ à 21 h", offres.heuresDepartPossibles(1, "2026-10-12", mercredi).at(-1), 20);
verifier("aujourd'hui 14 h 30, 2 h", offres.heuresDepartPossibles(2, "2026-10-12", benin("2026-10-12T14:30")), [15, 16, 17, 18, 19, 20]);
verifier("aujourd'hui 18 h 30, 1 h : 19 h et 20 h", offres.heuresDepartPossibles(1, "2026-10-12", benin("2026-10-12T18:30")), [19, 20]);
verifier("aujourd'hui 20 h 30, 1 h : plus rien", offres.heuresDepartPossibles(1, "2026-10-12", benin("2026-10-12T20:30")), []);
verifier("samedi même, 9 h 30, 1 h", offres.heuresDepartPossibles(1, "2026-10-10", benin("2026-10-10T09:30")), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
verifier("sans date, 4 h : de 8 h à 18 h", offres.heuresDepartPossibles(4), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);

// 4. Refus du serveur.
const lireMotif = (quand: string, demande: Record<string, unknown>) => {
  const reel = Date.now;
  Date.now = () => benin(quand).getTime();
  try {
    return ouverture.motifDeRefus(deux, demande);
  } finally {
    Date.now = reel;
  }
};
console.log("\nSamedi après vendredi 22 h :", lireMotif("2026-10-09T22:30", { offre: "road-trip", dateDebut: "2026-10-10", dateFin: "2026-10-10", heureDebut: 8 }));
console.log("Dimanche après samedi 22 h :", lireMotif("2026-10-10T22:30", { offre: "road-trip", dateDebut: "2026-10-11", dateFin: "2026-10-11", heureDebut: 8 }));
verifier("dimanche encore ouvert samedi 15 h", lireMotif("2026-10-10T15:00", { offre: "road-trip", dateDebut: "2026-10-11", dateFin: "2026-10-11", heureDebut: 8 }), null);
console.log("Location samedi 9 h :", ouverture.motifDeRefus(deux, { offre: "location-libre", dateDebut: "2027-01-02", dateFin: "2027-01-02", heureDebut: 9, dureeHeures: 2 }));
verifier("location samedi 11 h acceptée", ouverture.motifDeRefus(deux, { offre: "location-libre", dateDebut: "2027-01-02", dateFin: "2027-01-02", heureDebut: 11, dureeHeures: 2 }), null);
verifier("location samedi 9 h sans durée (page) non bloquée", ouverture.motifDeRefus(deux, { offre: "location-libre", dateDebut: "2026-10-10", dateFin: "2026-10-10", heureDebut: 9 }), null);

// 5. Jeton de suivi reconstituable.
const a = tokens.genererToken("BL-TEST01");
verifier("jeton identique d'un appel à l'autre", tokens.genererToken("BL-TEST01"), a);
verifier("jeton lisible", tokens.lireToken(a), "BL-TEST01");
verifier("jeton différent par référence", tokens.genererToken("BL-TEST02") === a, false);
verifier("jeton falsifié refusé", tokens.lireToken(a.slice(0, -2) + "xx"), null);

console.log(`\n${echecs === 0 ? "Tout est bon." : `${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
