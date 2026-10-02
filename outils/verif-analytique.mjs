/**
 * Verifie la mesure d'audience telle qu'elle est deployee.
 *
 * Ce que ce controle sait prouver, et ce qu'il ne sait pas
 * --------------------------------------------------------
 *
 * Un navigateur pilote ne peut pas prouver qu'une vue a ete comptee. La
 * balise part par `navigator.sendBeacon`, que l'outil de pilotage ne voit
 * pas passer, et la bibliotheque laisse sa file d'attente en place meme
 * quand tout fonctionne. Une premiere version de ce controle concluait
 * « service inactif » sur ce seul indice : elle se trompait, Vercel
 * comptait pourtant les visites. La seule preuve qu'une vue est comptee
 * est le tableau de bord Analytics de Vercel.
 *
 * Ce que l'on peut prouver, en revanche, et c'est le plus important :
 * que **nos filtres** font ce qu'on promet dans la page sur les donnees
 * personnelles. On recupere la fonction `beforeSend` reellement
 * deployee, celle que la bibliotheque appellera avant chaque envoi, et
 * on la soumet a chaque cas :
 *
 *  - une page ordinaire doit partir telle quelle ;
 *  - une page /admin ne doit pas partir ;
 *  - un jeton de reservation doit etre efface de l'adresse ;
 *  - « Ne pas me pister » doit tout couper.
 *
 * Usage :
 *
 *     npm install --no-save playwright-core
 *     node outils/verif-analytique.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://bike-land.vercel.app";
const navigateur = await chromium.launch({ channel: "msedge" });

/**
 * Charge une page et rend la fonction de filtrage deployee, appliquee a
 * une serie d'adresses. `pister` impose « Ne pas me pister ».
 */
async function filtrer(adresses, { pister = true } = {}) {
  const contexte = await navigateur.newContext();
  if (!pister) {
    await contexte.addInitScript(() => {
      Object.defineProperty(window.navigator, "doNotTrack", { get: () => "1" });
    });
  }
  const page = await contexte.newPage();
  await page.goto(BASE + "/cgv", { waitUntil: "domcontentloaded", timeout: 150_000 });

  for (let i = 0; i < 45; i += 1) {
    const pret = await page.evaluate(() =>
      Array.isArray(window.vaq) && window.vaq.some((e) => e[0] === "beforeSend"),
    );
    if (pret) break;
    await page.waitForTimeout(1000);
  }

  const resultats = await page.evaluate((liste) => {
    const entree = (window.vaq || []).find((e) => e[0] === "beforeSend");
    if (!entree || typeof entree[1] !== "function") return null;
    const filtre = entree[1];
    return liste.map((url) => {
      try {
        const sortie = filtre({ type: "pageview", url });
        return { url, sortie: sortie === null ? null : sortie.url };
      } catch (erreur) {
        return { url, erreur: String(erreur) };
      }
    });
  }, adresses);

  await contexte.close();
  return resultats;
}

const base = BASE;
const cas = [
  { titre: "page ordinaire", url: `${base}/velos`, attendu: (s) => s === `${base}/velos` },
  { titre: "espace d'exploitation", url: `${base}/admin/reservations`, attendu: (s) => s === null },
  {
    titre: "lien de suivi d'une reservation",
    url: `${base}/reservation/BL-ABC123.signatureSecrete.xyz`,
    attendu: (s) => s === `${base}/reservation/[jeton]`,
  },
  {
    titre: "page de reservation, sans jeton",
    url: `${base}/reservation?velo=emeraude`,
    attendu: (s) => s === `${base}/reservation?velo=emeraude`,
  },
];

let conformes = 0;
let total = 0;

console.log("=== visiteur ordinaire ===");
const ordinaire = await filtrer(cas.map((c) => c.url));
if (!ordinaire) {
  console.log("  filtre introuvable : la bibliotheque ne s'est pas chargee");
} else {
  for (const [i, c] of cas.entries()) {
    const r = ordinaire[i];
    const ok = !r.erreur && c.attendu(r.sortie);
    total += 1;
    if (ok) conformes += 1;
    const sortie = r.erreur ? `ERREUR ${r.erreur}` : r.sortie === null ? "non envoye" : r.sortie.replace(base, "");
    console.log(`  ${ok ? "ok    " : "ECHEC "} ${c.titre.padEnd(34)} -> ${sortie}`);
  }
}

console.log("\n=== « Ne pas me pister » active ===");
const refus = await filtrer([`${base}/velos`], { pister: false });
if (refus) {
  const ok = refus[0].sortie === null;
  total += 1;
  if (ok) conformes += 1;
  console.log(`  ${ok ? "ok    " : "ECHEC "} ${"page ordinaire".padEnd(34)} -> ${refus[0].sortie === null ? "non envoye" : refus[0].sortie}`);
}

await navigateur.close();

console.log(`\n${conformes}/${total} conformes`);
console.log(
  "\nPour savoir si les vues sont bien comptees, voir le tableau de bord :\n" +
    "https://vercel.com/khalils-projects-98b9ce03/bike-land/analytics",
);
process.exitCode = conformes === total ? 0 : 1;
