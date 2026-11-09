// La tâche du rappel de la veille, en mode démonstration : rien ne part,
// l'envoi est intercepté. Une réservation payée en ligne et une vente au
// comptoir partent demain : chacune reçoit un rappel, une seule fois.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) delete process.env[nom];
process.env.RESEND_API_KEY = "factice";
process.env.CRON_SECRET = "secret-de-test-assez-long";

const envois: { a: string; sujet: string; texte: string }[] = [];
globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  const corps = JSON.parse(String(init?.body));
  envois.push({ a: corps.to[0], sujet: corps.subject, texte: corps.text });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (chemin: string) => import(pathToFileURL(join(projet, chemin)).href);
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const route = await charger("src/app/api/cron/rappels/route.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

const demain = ajouterJours(aujourdhui(), 1);
const velos = (await depot.listerVelos()).filter((v: { statut: string }) => v.statut === "DISPONIBLE");
// Un vélo pour chaque réservation : le road trip de demain n'existe que le
// week-end, la location libre se prend l'après-midi.
const enLigne = (await depot.creerReservation({
  veloId: velos[0].id, offre: "location-libre", dureeHeures: 2, dateDebut: demain, dateFin: demain,
  heureDebut: 14, options: [], client: { prenom: "Aïcha", nom: "Test", email: "en-ligne@example.com", telephone: "0100000000" },
  moyenPaiement: "MTN_MONEY", cgvAcceptees: true,
})).reservation;
await depot.confirmerPaiement(enLigne.reference, "tx-test-rappel");
const comptoir = (await depot.creerReservation({
  veloId: velos[1].id, offre: "location-libre", dureeHeures: 1, dateDebut: demain, dateFin: demain,
  heureDebut: 15, options: [], client: { prenom: "Koku", nom: "Test", email: "comptoir@example.com" },
  moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-test-rappel" },
})).reservation;

const appel = async (entetes: Record<string, string> = {}) => {
  const reponse = await route.GET(new Request("http://local/api/cron/rappels", { headers: entetes }));
  return { statut: reponse.status, corps: await reponse.json() };
};

verifier("sans en-tête : refusé", (await appel()).statut, 401);
const premier = await appel({ authorization: "Bearer secret-de-test-assez-long" });
verifier("bon en-tête : 200", premier.statut, 200);
const second = await appel({ authorization: "Bearer secret-de-test-assez-long" });
verifier("second passage : aucun rappel de plus", envois.filter((e) => /C'est demain/.test(e.sujet)).length, envois.filter((e) => /C'est demain/.test(e.sujet)).length);
void second;

for (const [nom, reservation, email] of [["en ligne", enLigne, "en-ligne@example.com"], ["au comptoir", comptoir, "comptoir@example.com"]] as const) {
  const rappels = envois.filter((e) => e.a === email && /C'est demain/.test(e.sujet));
  verifier(`rappel ${nom} : un seul`, rappels.length, 1);
  verifier(`rappel ${nom} : lien de suivi personnel`, rappels[0]?.texte.includes(`/reservation/${reservation.reference}.`), true);
}

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
