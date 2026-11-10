// Lance les tests du projet : `npm test`.
//
// Chaque suite tourne dans son propre processus, depuis la racine du projet,
// en mode démonstration : toutes les variables qui mènent à la vraie base, au
// paiement SasPay ou à l'envoi d'emails sont retirées avant le lancement. Un
// test ne peut donc jamais écrire dans la base de production ni déclencher un
// paiement réel, même si le fichier .env local les contient.
//
// Une suite échoue si elle se termine en erreur ou si une de ses lignes
// commence par « FAUX ». Usage : node tests/lancer.mjs [motif]
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const dossiers = ["tests/non-regression", "tests/offres"];
const motif = process.argv[2] ?? "";

const SECRETS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SASPAY_API_KEY",
  "SASPAY_WEBHOOK_SECRET",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "RESEND_API_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "BOOKING_TOKEN_SECRET",
  "REVALIDATION_SECRET",
  "CRON_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_PREUVES_READ_WRITE_TOKEN",
  "VERCEL_TOKEN",
  "ANTHROPIC_API_KEY",
  "PAIEMENT_DEMO_AUTORISE",
  "BIKELAND_ROLE",
];
const env = { ...process.env, NODE_ENV: "test" };
for (const nom of SECRETS) delete env[nom];

const suites = dossiers.flatMap((dossier) => {
  try {
    return readdirSync(join(racine, dossier))
      .filter((fichier) => /\.test\.m?ts$/.test(fichier) && fichier.includes(motif))
      .map((fichier) => join(dossier, fichier));
  } catch {
    return [];
  }
});

const tsx = join(racine, "node_modules", "tsx", "dist", "cli.mjs");
let echecs = 0;
let verifications = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [tsx, suite], { cwd: racine, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sortie = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const ok = sortie.split(/\r?\n/).filter((ligne) => ligne.startsWith("OK")).length;
  const faux = sortie.split(/\r?\n/).filter((ligne) => ligne.startsWith("FAUX"));
  verifications += ok + faux.length;
  const reussie = r.status === 0 && faux.length === 0;
  if (!reussie) echecs += 1;
  console.log(`${reussie ? "OK  " : "ÉCHEC"} ${suite} : ${ok} vérification(s) réussie(s)${faux.length ? `, ${faux.length} fausse(s)` : ""}`);
  if (!reussie) {
    for (const ligne of faux.slice(0, 10)) console.log(`      ${ligne}`);
    if (r.status !== 0 && faux.length === 0) console.log(sortie.split(/\r?\n/).filter(Boolean).slice(-15).map((l) => `      ${l}`).join("\n"));
  }
}
console.log(`\n${suites.length} suite(s), ${verifications} vérification(s), ${echecs} suite(s) en échec.`);
process.exit(echecs ? 1 : 0);
