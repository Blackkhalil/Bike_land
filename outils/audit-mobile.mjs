/**
 * Audit mobile du site et de l'espace d'exploitation, dans un vrai
 * navigateur.
 *
 * Quatre défauts sont cherchés, ceux qui rendent une page pénible au pouce :
 *
 *  - la page qui déborde et se fait glisser de côté ;
 *  - le tableau plus large que l'écran, qu'il faut faire défiler à
 *    l'horizontale pour en voir la fin ;
 *  - le bouton qui se trouve hors de l'écran dans un tel tableau : c'est
 *    le pire, l'action existe mais on ne la voit pas ;
 *  - la cible trop petite pour un doigt, sous 32 px de haut.
 *
 * Usage :
 *
 *     npm install --no-save playwright-core
 *     node outils/audit-mobile.mjs
 *
 * Les identifiants de l'espace d'exploitation sont lus dans .env, jamais
 * affichés.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://bike-land.vercel.app";

const env = Object.fromEntries(
  readFileSync(".env", "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const LARGEURS = [360, 390];
const PAGES = (process.env.PAGES ?? [
  "/admin",
  "/admin/aujourdhui",
  "/admin/reservations",
  "/admin/velos",
  "/admin/clients",
  "/admin/avis",
  "/admin/messages",
  "/admin/parrainage",
  "/",
  "/velos",
  "/velos/emeraude",
  "/reservation?velo=emeraude",
].join(",")).split(",");

const navigateur = await chromium.launch({ channel: "msedge" });
const bilan = [];

for (const largeur of LARGEURS) {
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const connexion = await contexte.request.post(`${BASE}/api/admin/connexion`, {
    data: { email: env.ADMIN_EMAIL, motDePasse: env.ADMIN_PASSWORD },
  });
  if (!connexion.ok()) {
    console.log(`connexion refusée : ${connexion.status()}`);
    process.exit(1);
  }
  const page = await contexte.newPage();

  for (const chemin of PAGES) {
    try {
      await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 150_000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1500);
    } catch {
      bilan.push({ largeur, chemin, soucis: ["page injoignable"] });
      continue;
    }

    const soucis = await page.evaluate((vue) => {
      const sortie = [];
      const deborde = document.documentElement.scrollWidth - vue;
      if (deborde > 1) sortie.push(`LA PAGE DÉBORDE de ${deborde} px`);

      // Conteneurs qui défilent à l'horizontale, et ce qu'ils cachent.
      for (const el of document.querySelectorAll("body *")) {
        const style = getComputedStyle(el);
        if (!/(auto|scroll)/.test(style.overflowX)) continue;
        if (el.scrollWidth <= el.clientWidth + 2) continue;
        const cadre = el.getBoundingClientRect();
        if (cadre.width === 0) continue;
        const titre =
          el.closest("section")?.querySelector("h2, h3")?.textContent?.trim().slice(0, 40) ??
          el.tagName.toLowerCase();
        const caches = [...el.querySelectorAll("button, a, input, select")].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.left >= cadre.right - 4;
        });
        const libelles = [...new Set(caches.map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 18)).filter(Boolean))];
        sortie.push(
          `tableau à faire glisser « ${titre} » : ${el.scrollWidth} px pour ${Math.round(cadre.width)} visibles` +
            (caches.length ? `, ${caches.length} action(s) HORS ÉCRAN (${libelles.slice(0, 3).join(", ")})` : ""),
        );
      }

      // Cibles trop petites, hors liens d'évitement et éléments masqués.
      const petites = [];
      for (const b of document.querySelectorAll("a, button, input, select")) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.height >= 32) continue;
        if (b.classList.contains("sr-only") || b.closest(".sr-only")) continue;
        const style = getComputedStyle(b);
        if (style.visibility === "hidden" || style.opacity === "0") continue;
        // La zone élargie par un pseudo-élément compte.
        const apres = getComputedStyle(b, "::after");
        const ext = apres.content && apres.content !== "none" && apres.position === "absolute"
          ? -parseFloat(apres.top || "0") - parseFloat(apres.bottom || "0") : 0;
        if (r.height + ext >= 32) continue;
        petites.push(`${(b.textContent || b.getAttribute("aria-label") || b.tagName).trim().slice(0, 20)} (${Math.round(r.height + ext)} px)`);
      }
      if (petites.length) sortie.push(`${petites.length} cible(s) trop petite(s) : ${petites.slice(0, 4).join(" ; ")}`);
      return sortie;
    }, largeur);

    bilan.push({ largeur, chemin, soucis });
  }
  await contexte.close();
}

await navigateur.close();

for (const { largeur, chemin, soucis } of bilan) {
  console.log(`\n[${largeur} px] ${chemin}`);
  if (soucis.length === 0) console.log("  rien à signaler");
  for (const s of soucis) console.log("  - " + s);
}
