// Deux cocos par personne au retour du road trip, quelle que soit la gamme
// (décision du gérant) : le devis, les pages, la fiche du jour, le tableau
// de bord et l'email de l'équipe disent la même chose.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { cocosDe } = await charger("src/lib/reservations.ts");
const { indicateursDuJour, AIDE_A_PREVOIR } = await charger("src/lib/rapport.ts");
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { COCOS_ROAD_TRIP } = await charger("src/data/offres.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

console.log("— La règle");
verifier("COCOS_ROAD_TRIP vaut 2", COCOS_ROAD_TRIP, 2);
verifier("road trip, 2 personnes : 4 cocos", cocosDe({ offre: "road-trip", nombrePersonnes: 2 }), 4);
verifier("road trip du dimanche, 3 personnes : 6 cocos", cocosDe({ offre: "road-trip", nombrePersonnes: 3 }), 6);
verifier("location libre : 0", cocosDe({ offre: "location-libre", nombrePersonnes: 2 }), 0);
verifier("Octobre rose : 0 (son propre compte)", cocosDe({ offre: "octobre-rose", nombrePersonnes: 2 }), 0);

console.log("\n— Ce que le client lit sur son devis");
const dimanche = "2026-11-08";
for (const gamme of ["PREMIUM", "PRESTIGE"]) {
  const detail = calculerDevis({ offre: "road-trip", gamme, date: dimanche, nombrePersonnes: 1 }).lignes[0].detail;
  verifier(`road trip du dimanche ${gamme} : « eau et 2 cocos compris »`, /eau et 2 cocos compris/.test(detail), true);
}
verifier("road trip du samedi Premium : « eau et 2 cocos compris »", /eau et 2 cocos compris/.test(calculerDevis({ offre: "road-trip", gamme: "PREMIUM", date: "2026-11-07", nombrePersonnes: 2 }).lignes[0].detail), true);

console.log("\n— Le tableau de bord du jour");
const jour = "2026-11-07";
const resa = (offre: string, nombrePersonnes: number) => ({ offre, nombrePersonnes, lignes: [], statut: "CONFIRMEE", dateDebut: jour, dateFin: jour, cautionXof: 0, creeLe: `${jour}T06:00:00.000Z`, paiements: [] });
const jourDeTest = indicateursDuJour([resa("road-trip", 2), resa("road-trip", 1), resa("octobre-rose", 2), resa("location-libre", 1)], jour);
verifier("cocos à prévoir : 2 × 3 au road trip + 2 × 2 à Octobre rose = 10", jourDeTest.aPrevoir.cocos, 10);
verifier("eaux à prévoir : 3 au road trip + 4 à Octobre rose = 7", jourDeTest.aPrevoir.eaux, 7);
verifier("l'aide dit « Deux cocos et une eau par participant au road trip »", AIDE_A_PREVOIR.startsWith("Deux cocos et une eau par participant au road trip"), true);

console.log("\n— L'email de l'équipe");
let samedi = ajouterJours(aujourdhui(), 2);
while (new Date(`${samedi}T12:00:00Z`).getUTCDay() !== 6) samedi = ajouterJours(samedi, 1);
const { reservation } = await depot.creerReservation({
  gamme: "PREMIUM", offre: "road-trip", nombrePersonnes: 2, dateDebut: samedi, dateFin: samedi, heureDebut: 8,
  options: [], client: { prenom: "Coco", nom: "Test", email: "coco.test@example.com" },
  moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-cocos" },
});
process.env.RESEND_API_KEY = "cle-factice-test-local";
const envois: string[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  envois.push(JSON.parse(String(init?.body)).text);
  return new Response(JSON.stringify({ id: "test" }), { status: 200 });
}) as typeof fetch;
const email = await charger("src/lib/email.ts");
await email.envoyerNotificationAdmin(reservation);
verifier("email de l'équipe : « À prévoir : 4 cocos et 2 eaux. »", envois[0]?.includes("À prévoir : 4 cocos et 2 eaux."), true);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
