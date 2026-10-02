/**
 * Verifie que la mesure d'audience fonctionne reellement.
 *
 * Deux pieges ont fait echouer les premieres verifications, et ils
 * valent d'etre notes parce qu'ils reprendront quiconque voudra
 * recontroler :
 *
 *  1. Le script n'est pas dans le HTML. La bibliotheque l'injecte depuis
 *     le JavaScript, apres hydratation. Chercher une balise dans la
 *     source ne prouve donc rien.
 *
 *  2. Vercel ne sert plus le script depuis `/_vercel/insights/`, mais
 *     depuis un chemin tire au hasard par projet, du genre
 *     `/8ce46b7ff00e43cc/script.js`, pour echapper aux bloqueurs de
 *     publicite. Guetter l'ancien chemin ne voit jamais rien passer.
 *
 * On detecte donc la bibliotheque par ce qu'elle pose sur `window`, et
 * le trafic par la balise qu'elle a injectee, quelle que soit son
 * adresse.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://bike-land.vercel.app";
const navigateur = await chromium.launch({ channel: "msedge" });

/**
 * Charge une page et rend compte de la mesure.
 *
 * `avantChargement` permet d'imposer un reglage du navigateur, comme
 * « Ne pas me pister », avant que la page ne s'execute.
 */
async function observer(chemin, avantChargement) {
  const contexte = await navigateur.newContext();
  if (avantChargement) await contexte.addInitScript(avantChargement);
  const page = await contexte.newPage();

  const trafic = [];
  page.on("request", (r) => {
    const u = r.url();
    // Le script de mesure et ses balises partent vers le meme chemin
    // tire au hasard. On reconnait la forme, pas l'adresse.
    if (/\/[0-9a-f]{12,}\/(script\.js|view|event)/.test(u) || u.includes("/_vercel/insights/")) {
      trafic.push(u.replace(BASE, ""));
    }
  });

  await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 150_000 });

  // On attend que la bibliotheque se signale plutot qu'un delai fixe :
  // sur une connexion lente, l'hydratation prend parfois dix secondes.
  let pret = false;
  for (let i = 0; i < 45; i += 1) {
    pret = await page.evaluate(() => typeof window.va === "function");
    if (pret) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(6000);

  const etat = await page.evaluate(() => ({
    bibliotheque: typeof window.va === "function",
    mode: window.vam,
    enAttente: Array.isArray(window.vaq) ? window.vaq.map((e) => e[0]) : [],
    /**
     * Tant que le service n'est pas active sur le projet, Vercel sert un
     * script inerte : il se charge bien, repond 200, mais ne remplace
     * jamais le talon de file d'attente pose par la bibliotheque. C'est
     * le seul signe fiable, et il ne se voit ni dans le HTML ni dans le
     * code de reponse.
     */
    talonRemplace: !String(window.va).includes("vaq"),
    script: [...document.querySelectorAll("script[src]")]
      .map((s) => s.src)
      .find((s) => /\/[0-9a-f]{12,}\/script\.js$/.test(s) || s.includes("/_vercel/insights/")),
  }));

  await contexte.close();
  return { ...etat, trafic, hydrate: pret };
}

function rendre(titre, r, attenduMesure) {
  const balises = r.trafic.filter((u) => !u.endsWith("script.js")).length;
  // Une mesure n'a reellement eu lieu que si le script a pris la main.
  // La file qui contient « pageview » prouve seulement qu'on a essaye.
  const mesure = r.talonRemplace && (balises > 0 || !r.enAttente.includes("pageview"));
  const conforme = attenduMesure ? mesure : !mesure;

  console.log(`\n=== ${titre} ===`);
  console.log(`  hydratation      : ${r.hydrate ? "oui" : "NON"}`);
  console.log(`  mode             : ${r.mode ?? "inconnu"}`);
  console.log(`  script injecte   : ${r.script ? r.script.replace(BASE, "") : "non"}`);
  console.log(`  service actif    : ${r.talonRemplace ? "oui" : "NON, a activer sur Vercel"}`);
  console.log(`  evenements en file: ${r.enAttente.join(", ") || "aucun"}`);
  console.log(`  balises envoyees : ${balises}`);
  console.log(`  attendu          : ${attenduMesure ? "mesure comptee" : "aucune mesure"}`);
  console.log(`  verdict          : ${conforme ? "conforme" : "A CORRIGER"}`);
  return conforme;
}

const resultats = [];

resultats.push(rendre("page publique, visiteur ordinaire", await observer("/cgv"), true));

resultats.push(
  rendre(
    "« Ne pas me pister » active",
    await observer("/cgv", () => {
      Object.defineProperty(window.navigator, "doNotTrack", { get: () => "1" });
    }),
    false,
  ),
);

resultats.push(rendre("espace d'exploitation", await observer("/admin/connexion"), false));

await navigateur.close();

const rates = resultats.filter((r) => !r).length;
console.log(`\n${resultats.length - rates}/${resultats.length} conformes`);
process.exitCode = rates > 0 ? 1 : 0;
