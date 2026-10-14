/**
 * Mesure le site a plusieurs largeurs, dans un vrai navigateur.
 *
 * Deux defauts sont cherches, parce que ce sont les deux qui gachent une
 * page sur telephone :
 *
 *  - le debordement horizontal, qui oblige a faire glisser la page de
 *    cote pour lire une phrase ;
 *  - l'element plus large que l'ecran, qui est ce qui le provoque. Le
 *    signaler sans le nommer n'aiderait personne a le corriger.
 *
 * Il utilise Edge ou Chrome deja installe, plutot que de telecharger un
 * navigateur de 150 Mo sur une connexion lente.
 *
 * Usage :
 *
 *     npm install --no-save playwright-core
 *     node outils/verif-responsive.mjs
 *     BASE=http://localhost:3000 node outils/verif-responsive.mjs
 *
 * `playwright-core` n'est pas une dependance du projet : il ne sert qu'a
 * ce controle, et le site n'en a pas besoin pour tourner.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://bike-land.vercel.app";

const LARGEURS = [
  [320, 568, "iPhone SE, le plus etroit encore en usage"],
  [360, 740, "Android d'entree de gamme"],
  [390, 844, "iPhone 14"],
  [414, 896, "grand telephone"],
  [768, 1024, "tablette verticale"],
  [1024, 768, "tablette horizontale"],
  [1280, 800, "ordinateur portable"],
  [1920, 1080, "grand ecran"],
];

const PAGES = [
  "/",
  "/produits",
  "/velos",
  "/velos/emeraude",
  "/itineraires",
  "/comment-ca-marche",
  "/a-propos",
  "/contact",
  "/cgv",
  "/reservation/suivi",
  "/reservation?velo=emeraude",
];

const navigateur = await chromium.launch({ channel: "msedge" });
let total = 0;

for (const [largeur, hauteur, etiquette] of LARGEURS) {
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: hauteur },
    deviceScaleFactor: 1,
    isMobile: largeur < 768,
    hasTouch: largeur < 768,
  });
  const page = await contexte.newPage();
  const soucis = [];

  for (const chemin of PAGES) {
    // Pas d'attente du reseau au repos : les videos continuent de se
    // charger en fond et le reseau ne se calme jamais, ce qui faisait
    // echouer la premiere version de ce controle sur chaque page. La
    // mise en page, elle, est fixee des que le DOM est la et que les
    // polices sont arrivees.
    try {
      await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(800);
    } catch {
      soucis.push(`${chemin} : page injoignable`);
      continue;
    }

    const mesure = await page.evaluate((largeurVue) => {
      const debordement = document.documentElement.scrollWidth - largeurVue;
      const coupables = [];
      if (debordement > 1) {
        for (const element of document.body.querySelectorAll("*")) {
          const r = element.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // On ne retient que ce qui depasse reellement du cadre.
          if (r.right > largeurVue + 1 || r.left < -1) {
            const style = getComputedStyle(element);
            if (style.position === "fixed") continue;
            coupables.push({
              balise: element.tagName.toLowerCase(),
              classe: (element.className || "").toString().slice(0, 70),
              droite: Math.round(r.right),
              largeur: Math.round(r.width),
            });
          }
        }
      }
      // Cibles tactiles trop petites : sous 32 px, le doigt rate.
      const petites = [];
      for (const element of document.querySelectorAll("a, button, input, select")) {
        const r = element.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 32) {
          petites.push(
            `${element.tagName.toLowerCase()} ${Math.round(r.height)}px ` +
              `« ${(element.textContent || "").trim().slice(0, 25)} »`,
          );
        }
      }
      return { debordement, coupables: coupables.slice(0, 4), petites: petites.slice(0, 4) };
    }, largeur);

    if (mesure.debordement > 1) {
      soucis.push(`${chemin} : deborde de ${mesure.debordement}px`);
      for (const c of mesure.coupables) {
        soucis.push(`      <${c.balise}> largeur ${c.largeur} bord droit ${c.droite} | ${c.classe}`);
      }
    }
    if (largeur < 768 && mesure.petites.length) {
      soucis.push(`${chemin} : cibles tactiles courtes -> ${mesure.petites.join(" ; ")}`);
    }
  }

  total += soucis.filter((s) => !s.startsWith("      ")).length;
  console.log(`\n=== ${largeur}x${hauteur}  ${etiquette} ===`);
  if (soucis.length === 0) console.log("  rien a signaler");
  else soucis.forEach((s) => console.log("  " + s));

  await contexte.close();
}

await navigateur.close();
console.log(`\n${total} probleme(s) sur ${LARGEURS.length} largeurs et ${PAGES.length} pages`);
