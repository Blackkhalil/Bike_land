/**
 * Pese une page : ce qui part sur le reseau, et dans quel ordre.
 *
 * Le but n'est pas le total, qui ne dit rien. C'est de savoir **ce qui
 * passe avant l'hydratation**. Tant que le JavaScript n'a pas fini de
 * charger, la page ne reagit a rien : les boutons ne repondent pas, le
 * tunnel de reservation ne demarre pas. Tout octet servi avant lui
 * retarde le moment ou le visiteur peut agir.
 *
 * Sur une connexion beninoise ordinaire, cette attente se compte en
 * secondes, et c'est la qu'on perd des reservations.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://bike-land.vercel.app";
const CHEMIN = process.env.CHEMIN ?? "/";
// Debit par defaut : ce que mesure une connexion mobile beninoise
// ordinaire, soit environ 1,6 Mbit/s.
const DEBIT = Number(process.env.DEBIT ?? 200) * 1024;

const navigateur = await chromium.launch({ channel: "msedge" });
const contexte = await navigateur.newContext();
const page = await contexte.newPage();

const depart = Date.now();
const ressources = [];
let hydrateA = null;

// On pese ce qui passe **sur le fil**, compression comprise. Vercel sert
// en Brotli : un script de 224 Ko n'en transfere que 71, le HTML de
// l'accueil 16 sur 130. Mesurer le corps decompresse, comme le faisait
// la premiere version de cet outil, triple le poids du code et fait
// chercher des economies la ou il n'y en a pas. Les images, elles, sont
// deja compressees : elles pesent sur le fil ce qu'elles pesent sur le
// disque, et c'est pour cela qu'elles comptent autant.
page.on("requestfinished", async (requete) => {
  const url = requete.url();
  if (url.startsWith("data:")) return;
  let taille = 0;
  try {
    const tailles = await requete.sizes();
    taille = tailles.responseBodySize + tailles.responseHeadersSize;
  } catch {
    taille = 0;
  }
  ressources.push({
    url: url.replace(BASE, ""),
    type: requete.resourceType(),
    taille,
    a: Date.now() - depart,
  });
});

await page.goto(BASE + CHEMIN, { waitUntil: "commit", timeout: 180_000 });

// L'hydratation se signale par le premier composant client qui agit.
for (let i = 0; i < 90; i += 1) {
  const pret = await page.evaluate(() => typeof window.va === "function");
  if (pret) {
    hydrateA = Date.now() - depart;
    break;
  }
  await page.waitForTimeout(500);
}
await page.waitForTimeout(4000);

const total = ressources.reduce((s, r) => s + r.taille, 0);
const avant = hydrateA ? ressources.filter((r) => r.a <= hydrateA) : ressources;
const totalAvant = avant.reduce((s, r) => s + r.taille, 0);

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;

console.log(`page            : ${CHEMIN}`);
console.log(`hydratation     : ${hydrateA ? `${(hydrateA / 1000).toFixed(1)} s` : "JAMAIS en 45 s"}`);
console.log(`poids total     : ${ko(total)} en ${ressources.length} requetes`);
console.log(`avant hydratation: ${ko(totalAvant)} en ${avant.length} requetes`);
console.log(`soit, a ${(DEBIT / 1024).toFixed(0)} Ko/s : ${(totalAvant / DEBIT).toFixed(1)} s d'attente`);

const parType = new Map();
for (const r of avant) {
  const e = parType.get(r.type) ?? { taille: 0, nombre: 0 };
  e.taille += r.taille;
  e.nombre += 1;
  parType.set(r.type, e);
}
console.log("\npar type, avant hydratation :");
for (const [type, e] of [...parType].sort((a, b) => b[1].taille - a[1].taille)) {
  console.log(`  ${type.padEnd(12)} ${ko(e.taille).padStart(9)}  ${e.nombre} requetes`);
}

console.log("\nles dix plus lourdes, avant hydratation :");
for (const r of [...avant].sort((a, b) => b.taille - a.taille).slice(0, 10)) {
  console.log(`  ${ko(r.taille).padStart(9)}  ${r.type.padEnd(10)} ${r.url.slice(0, 70)}`);
}

await navigateur.close();
