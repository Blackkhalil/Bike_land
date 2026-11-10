// Réservation et paiement des offres de groupe (lot 5b), avec de faux
// dépôts, de faux emails et un faux encaissement : aucune base, aucun
// email, aucun paiement réel (le lanceur retire tous les secrets).
//  - Références d'essai (décision 17) : « BL-T… » hors production, jamais
//    en production, reconnues par SasPay ; liens des emails vers la branche
//    sur un aperçu.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "SASPAY_API_KEY", "ANTHROPIC_API_KEY", "VERCEL_ENV", "VERCEL_BRANCH_URL", "BIKELAND_ROLE"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const tokens = await charger("src/lib/tokens.ts");
const saspay = await charger("src/lib/saspay.ts");
const { site, urlDuSite } = await charger("src/lib/site.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[  ]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
/** Avec ces variables d'environnement le temps d'un calcul, puis comme avant. */
const avecEnvironnement = <T,>(variables: Record<string, string | undefined>, faire: () => T): T => {
  const avant = Object.fromEntries(Object.keys(variables).map((nom) => [nom, process.env[nom]]));
  for (const [nom, valeur] of Object.entries(variables)) {
    if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  }
  try {
    return faire();
  } finally {
    for (const [nom, valeur] of Object.entries(avant)) {
      if (valeur === undefined) delete process.env[nom];
      else process.env[nom] = valeur;
    }
  }
};

/* ---------------------------------------------------- Références d'essai */

console.log("\n— Références d'essai (décision 17)");
{
  const FORMAT = /^BL-[A-HJ-NP-Z2-9]{6}$/;
  const essais = Array.from({ length: 300 }, () => tokens.genererReference() as string);
  verifier("hors production : toutes commencent par BL-T", essais.every((r) => r.startsWith("BL-T")), true);
  verifier("même longueur et même alphabet qu'une vraie référence", essais.every((r) => FORMAT.test(r)), true);
  verifier("reconnue comme essai", tokens.estReferenceDeTest(essais[0]), true);
  verifier(
    "SasPay la retrouve dans la description d'un paiement",
    saspay.referenceDepuisCharge({ description: `Bike Land, essai ${essais[0]}` }),
    essais[0],
  );
  verifier("et dans les métadonnées", saspay.referenceDepuisCharge({ metadata: { reference: essais[0] } }), essais[0]);

  const enProduction = avecEnvironnement({ VERCEL_ENV: "production" }, () => ({
    references: Array.from({ length: 3000 }, () => tokens.genererReference() as string),
    essai: tokens.estReferenceDeTest("BL-T2K9QX"),
  }));
  verifier("en production : jamais BL-T (3 000 tirages)", enProduction.references.some((r) => r.startsWith("BL-T")), false);
  verifier("en production : le format reste BL- et six signes", enProduction.references.every((r) => FORMAT.test(r)), true);
  verifier("en production, une ancienne référence BL-T reste ordinaire", enProduction.essai, false);
}

console.log("\n— Liens des emails sur un aperçu");
{
  verifier("en local : l'adresse du site", urlDuSite(), site.url);
  verifier(
    "aperçu du site : l'adresse de la branche",
    avecEnvironnement({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "bike-land-git-feature-offres-groupe.vercel.app" }, () => urlDuSite()),
    "https://bike-land-git-feature-offres-groupe.vercel.app",
  );
  verifier(
    "aperçu de l'administration : l'adresse du site, pas sa propre branche",
    avecEnvironnement(
      { VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "bikeland-gestion-git-x.vercel.app", BIKELAND_ROLE: "admin" },
      () => urlDuSite(),
    ),
    site.url,
  );
  verifier(
    "production : l'adresse du site, même si la variable de branche existe",
    avecEnvironnement({ VERCEL_ENV: "production", VERCEL_BRANCH_URL: "bike-land-git-x.vercel.app" }, () => urlDuSite()),
    site.url,
  );
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
