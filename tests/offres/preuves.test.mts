// Les preuves de réduction du road trip en groupe (lot 5b), sans base,
// sans email, sans agent IA réels : de faux dépôts, un faux stockage, un
// faux agent ; sharp, lui, réencode pour de vrai des images fabriquées ici.
//  - type lu dans le fichier, taille, limite de débit ;
//  - réencodage : tournée, réduite à 2 576 pixels, sans EXIF ;
//  - sans agent IA : « en_attente », vérifiée à la main ; avec lui :
//    décidée, et la capture effacée aussitôt ;
//  - administration : décision signée, capture effacée, email au client
//    avec le lien qui rouvre le chatbot ;
//  - stockage privé (base ou magasin Vercel Blob privé), dépôt de
//    démonstration, effacement quotidien, routes branchées.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "SASPAY_API_KEY", "ANTHROPIC_API_KEY", "BLOB_PREUVES_READ_WRITE_TOKEN", "BIKELAND_ROLE"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const preuves = await charger("src/lib/offres-groupe/preuves.ts");
const { stockagePreuves } = await charger("src/lib/offres-groupe/stockage-preuves.ts");
const { TAILLE_MAX_CAPTURE_OCTETS } = await charger("src/lib/offres-groupe/api.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT } = await charger("src/data/reglages-offres.ts");
const { default: sharp } = await import("sharp");

let echecs = 0;
const espaces = (texte: string) => texte.replace(/[  ]/g, " ");
const normaliser = (v: unknown) => {
  const json = JSON.stringify(v);
  return json === undefined ? json : espaces(json);
};
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};

const MAINTENANT = Date.parse("2026-11-16T09:00:00Z");
const JOUR = 24 * 60 * 60 * 1000;

/* --------------------------------------------------- Images fabriquées */

const orange = { r: 242, g: 92, b: 5 };
// Une grande photo JPEG avec un EXIF (droit d'auteur, comme une donnée privée).
const grandeAvecExif = new Uint8Array(
  await sharp({ create: { width: 4000, height: 1000, channels: 3, background: orange } })
    .withMetadata({ exif: { IFD0: { Copyright: "Photo privée du client" } } })
    .jpeg()
    .toBuffer(),
);
// Une photo prise téléphone tourné : 100 × 50, orientation EXIF 6 (à tourner d'un quart de tour).
const tournee = new Uint8Array(
  await sharp({ create: { width: 100, height: 50, channels: 3, background: orange } }).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
);
const petitPng = new Uint8Array(await sharp({ create: { width: 300, height: 600, channels: 3, background: orange } }).png().toBuffer());
const gif = new TextEncoder().encode("GIF89a, une image animée");

console.log("\n— Le type se lit dans le fichier");
{
  verifier("JPEG, PNG, WebP reconnus par leur signature", [preuves.typeDeLImage(grandeAvecExif), preuves.typeDeLImage(petitPng)], ["image/jpeg", "image/png"]);
  const webp = new Uint8Array(await sharp(petitPng).webp().toBuffer());
  verifier("WebP reconnu", preuves.typeDeLImage(webp), "image/webp");
  verifier("GIF refusé", preuves.typeDeLImage(gif), null);
  verifier("texte refusé, quel que soit son nom", preuves.typeDeLImage(new TextEncoder().encode("<script>alert(1)</script>")), null);
}

console.log("\n— Réencodage : tournée, réduite, sans métadonnées");
{
  verifier("l'image d'origine porte bien un EXIF", Boolean((await sharp(grandeAvecExif).metadata()).exif), true);
  const reencodee = await preuves.reencoderCapture(grandeAvecExif);
  const lue = await sharp(Buffer.from(reencodee.octets)).metadata();
  verifier("WebP, plus grand côté ramené à 2 576 pixels", [reencodee.typeMime, lue.format, lue.width, lue.height], ["image/webp", "webp", 2576, 644]);
  verifier("ni EXIF, ni XMP, ni ICC après réencodage", [lue.exif, lue.xmp, lue.icc], [undefined, undefined, undefined]);
  const droite = await preuves.reencoderCapture(tournee);
  verifier("photo tournée : remise droite (50 × 100)", [droite.largeur, droite.hauteur], [50, 100]);
  const petite = await preuves.reencoderCapture(petitPng);
  verifier("petite capture : pas agrandie", [petite.largeur, petite.hauteur], [300, 600]);
  let illisible = "";
  try {
    await preuves.reencoderCapture(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
  } catch {
    illisible = "refusée";
  }
  verifier("PNG tronqué : refusé", illisible, "refusée");
}

/* ------------------------------------------------------- Faux décor */

interface Options {
  actives?: boolean;
  mode?: "base" | "blob";
  analyser?: (entree: { image: Uint8Array; typeMime: string }) => Promise<Record<string, unknown>>;
}
function fauxDecor(options: Options = {}) {
  const etat = {
    preuves: new Map<string, Record<string, any>>(),
    creees: [] as Record<string, any>[],
    decisions: [] as Record<string, any>[],
    effaces: [] as string[],
    rangees: [] as string[],
    emails: [] as Record<string, any>[],
    compteurs: new Map<string, number>(),
    vuParAgent: [] as { image: Uint8Array; typeMime: string }[],
  };
  const depot = {
    async compterEssai(cle: string) {
      const n = (etat.compteurs.get(cle) ?? 0) + 1;
      etat.compteurs.set(cle, n);
      return n;
    },
    async creerPreuve(champs: Record<string, any>) {
      const id = `p${etat.creees.length + 1}`;
      etat.creees.push(champs);
      const preuve = {
        id,
        typeMime: champs.typeMime,
        tailleOctets: champs.tailleOctets,
        statut: "en_attente",
        email: champs.email,
        telephone: champs.telephone,
        creeLe: new Date(MAINTENANT).toISOString(),
        fichierCle: champs.fichierCle ?? (champs.octets ? `base:${id}` : undefined),
      };
      etat.preuves.set(id, preuve);
      return { ...preuve };
    },
    async trouverPreuve(id: string) {
      const preuve = etat.preuves.get(id);
      return preuve ? { ...preuve } : null;
    },
    async deciderPreuve(id: string, decision: Record<string, any>) {
      const preuve = etat.preuves.get(id);
      if (!preuve || preuve.statut !== "en_attente") return null;
      Object.assign(preuve, { statut: decision.statut, decidePar: decision.par, motif: decision.motif, verdict: decision.verdict });
      etat.decisions.push({ id, ...decision });
      return { ...preuve };
    },
    async effacerFichierPreuve(id: string) {
      const preuve = etat.preuves.get(id);
      if (!preuve) return null;
      etat.effaces.push(id);
      delete preuve.fichierCle;
      return { ...preuve };
    },
    async listerFichiersPreuvesAEffacer() {
      return [];
    },
  };
  const stockage = {
    mode: options.mode ?? "base",
    async ranger(_octets: Uint8Array, typeMime: string) {
      etat.rangees.push(typeMime);
      return "blob:preuves/capture-abc.webp";
    },
    async lire() {
      return null;
    },
    async effacer(preuve: { fichierCle?: string }) {
      if (preuve.fichierCle?.startsWith("blob:")) etat.effaces.push(preuve.fichierCle);
    },
  };
  const deps = {
    depot,
    stockage,
    lireOuverture: async () => ({ offresGroupeActives: options.actives ?? true }),
    lireReglages: async () => ({ reglages: REGLAGES_OFFRES_PAR_DEFAUT, source: "defaut" }),
    analyser: options.analyser
      ? async (entree: { image: Uint8Array; typeMime: string }) => {
          etat.vuParAgent.push(entree);
          return options.analyser!(entree);
        }
      : null,
    reencoder: preuves.reencoderCapture,
    maintenant: () => MAINTENANT,
    emailDecision: async (champs: Record<string, any>) => {
      etat.emails.push(champs);
      return { envoye: true };
    },
    urlSite: () => "https://site.test",
  };
  return { deps, etat };
}
const formulaire = (capture: Uint8Array | null, champs: Record<string, string> = { telephone: "+229 01 97 00 00 00", email: "awa.test@example.com" }) => {
  const form = new FormData();
  if (capture) form.set("capture", new Blob([capture], { type: "image/png" }), "capture.png");
  for (const [nom, valeur] of Object.entries(champs)) form.set(nom, valeur);
  return form;
};
const envoyer = async (form: FormData | null, options?: Options, ip = "10.0.0.1") => {
  const decor = fauxDecor(options);
  const r = (await preuves.recevoirPreuve(form, { ip }, decor.deps)) as { statut: number; corps: Record<string, any> };
  return { ...r, etat: decor.etat };
};

/* --------------------------------------------------------- Réception */

console.log("\n— Réception d'une capture : refus");
{
  const ferme = await envoyer(formulaire(petitPng), { actives: false });
  verifier("interrupteur coupé : 403 FERME, rien d'enregistré", [ferme.statut, ferme.corps.code, ferme.etat.creees.length], [403, "FERME", 0]);
  const sansFichier = await envoyer(formulaire(null));
  verifier("sans capture : 400 SAISIE", [sansFichier.statut, sansFichier.corps.code], [400, "SAISIE"]);
  const sansEmail = await envoyer(formulaire(petitPng, { telephone: "0197000000" }));
  verifier("sans email : 400 SAISIE", [sansEmail.statut, sansEmail.corps.code], [400, "SAISIE"]);
  const mauvaisType = await envoyer(formulaire(gif));
  verifier("GIF : 400, JPEG, PNG ou WebP seulement", [mauvaisType.statut, mauvaisType.corps.message], [400, "Envoyez une capture d'écran en JPEG, PNG ou WebP."]);
  const deguise = await envoyer(formulaire(new TextEncoder().encode("ceci n'est pas une image")));
  verifier("texte annoncé image/png : refusé (signature)", [deguise.statut, deguise.etat.creees.length], [400, 0]);
  const tropGros = new Uint8Array(TAILLE_MAX_CAPTURE_OCTETS + 1);
  tropGros.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const lourd = await envoyer(formulaire(tropGros));
  verifier("plus de 5 Mo : 413, rien d'enregistré", [lourd.statut, lourd.corps.code, lourd.etat.creees.length], [413, "SAISIE", 0]);
  const tronque = await envoyer(formulaire(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])));
  verifier("image illisible : 400", [tronque.statut, tronque.etat.creees.length], [400, 0]);
}

console.log("\n— Réception d'une capture : limite de débit");
{
  const decor = fauxDecor();
  let dernier = { statut: 0 };
  for (let i = 0; i < 11; i += 1) {
    dernier = await preuves.recevoirPreuve(formulaire(petitPng, { telephone: `0197${String(i).padStart(6, "0")}`, email: "a@example.com" }), { ip: "10.1.1.1" }, decor.deps);
  }
  verifier("11e capture de la même adresse en une heure : 429", dernier.statut, 429);
  const autre = fauxDecor();
  for (let i = 0; i < 6; i += 1) dernier = await preuves.recevoirPreuve(formulaire(petitPng), { ip: `10.2.2.${i}` }, autre.deps);
  verifier("6e capture du même numéro dans la journée : 429", dernier.statut, 429);
}

console.log("\n— Sans agent IA (décision 21) : vérifiée à la main");
{
  const r = await envoyer(formulaire(grandeAvecExif));
  verifier("201, en attente", [r.statut, r.corps.ok, r.corps.statut, r.corps.preuveId], [201, true, "en_attente", "p1"]);
  verifier("le message dit qu'on répond par email, sans parler d'IA", [r.corps.message.includes("par email"), /IA|intelligence/i.test(r.corps.message)], [true, false]);
  const creee = r.etat.creees[0];
  const lue = await sharp(Buffer.from(creee.octets)).metadata();
  verifier("rangée en base : la capture réencodée (WebP, 2 576 px, sans EXIF)", [creee.typeMime, lue.format, lue.width, lue.exif], ["image/webp", "webp", 2576, undefined]);
  verifier("avec l'email et le téléphone du client, pour lui répondre", [creee.email, creee.telephone], ["awa.test@example.com", "+229 01 97 00 00 00"]);
  verifier("aucune décision, aucun effacement", [r.etat.decisions.length, r.etat.effaces.length], [0, 0]);
  const blob = await envoyer(formulaire(petitPng), { mode: "blob" });
  verifier("magasin privé réglé : la capture y est rangée, la preuve garde sa clé", [blob.etat.rangees, blob.etat.creees[0].fichierCle, "octets" in blob.etat.creees[0]], [["image/webp"], "blob:preuves/capture-abc.webp", false]);
}

console.log("\n— Avec l'agent IA : décidée, et la capture effacée aussitôt");
{
  const valide = await envoyer(formulaire(grandeAvecExif), {
    analyser: async () => ({ statut: "validee", motif: "Abonné à @bikeland_bj sur Instagram, vu par l'agent IA : profil, bouton Abonné.", reseau: "instagram", identifiantVu: "bikeland_bj" }),
  });
  verifier("validée par l'agent : 201, statut validée, message avec 4 %", [valide.statut, valide.corps.statut, espaces(valide.corps.message).includes("réduction de 4 %")], [201, "validee", true]);
  verifier("l'agent voit la capture réencodée, pas l'original", [valide.etat.vuParAgent[0].typeMime, preuves.typeDeLImage(valide.etat.vuParAgent[0].image)], ["image/webp", "image/webp"]);
  verifier("décision signée « agent IA », le compte de Bike Land seulement", [valide.etat.decisions[0].par, valide.etat.decisions[0].verdict], ["agent IA", { reseau: "instagram", compteBikeLand: "bikeland_bj" }]);
  verifier("capture effacée dès la décision", valide.etat.effaces, ["p1"]);
  const doute = await envoyer(formulaire(petitPng), { analyser: async () => ({ statut: "en_attente", motif: "Capture incertaine." }) });
  verifier("doute de l'agent : en attente, rien d'effacé", [doute.corps.statut, doute.etat.decisions.length, doute.etat.effaces.length], ["en_attente", 0, 0]);
  const refus = await envoyer(formulaire(petitPng), { mode: "blob", analyser: async () => ({ statut: "refusee", motif: "Bouton Suivre visible." }) });
  verifier("refusée par l'agent : le fichier du magasin privé et la clé effacés", [refus.corps.statut, refus.etat.effaces], ["refusee", ["blob:preuves/capture-abc.webp", "p1"]]);
}

console.log("\n— Où en est une preuve");
{
  const decor = fauxDecor();
  await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.3.3.3" }, decor.deps);
  const connue = (await preuves.statutPreuve("p1", decor.deps)) as { statut: number; corps: Record<string, any> };
  verifier("preuve connue : 200 et son statut, sans le contact du client", [connue.statut, connue.corps.statut, "email" in connue.corps, "telephone" in connue.corps], [200, "en_attente", false, false]);
  const inconnue = (await preuves.statutPreuve("inconnue", decor.deps)) as { statut: number };
  verifier("preuve inconnue : 404", inconnue.statut, 404);
}

/* ---------------------------------------------------- Administration */

console.log("\n— Administration : Valider, Refuser");
{
  const decor = fauxDecor();
  await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.4.4.4" }, decor.deps);
  await preuves.recevoirPreuve(formulaire(petitPng, { telephone: "0196000000", email: "kossi@example.com" }), { ip: "10.4.4.4" }, decor.deps);
  const decider = (corps: unknown) => preuves.deciderPreuveParAdmin(corps, decor.deps) as Promise<{ statut: number; corps: Record<string, any> }>;

  const sansPrenom = await decider({ action: "valider", id: "p1" });
  verifier("sans prénom : 422, le champ prénom en erreur", [sansPrenom.statut, typeof sansPrenom.corps.champs?.prenom], [422, "string"]);
  const valide = await decider({ action: "valider", id: "p1", prenom: "Koffi" });
  verifier("validée : 200, signée admin (Koffi)", [valide.statut, valide.corps.preuve, decor.etat.decisions[0].par], [200, { id: "p1", statut: "validee" }, "admin (Koffi)"]);
  verifier("validée : capture effacée aussitôt", [valide.corps.fichierEfface, decor.etat.effaces], [true, ["p1"]]);
  verifier(
    "validée : email au client, avec le lien qui rouvre le chatbot sur le road trip et cette preuve",
    [decor.etat.emails[0].email, decor.etat.emails[0].statut, decor.etat.emails[0].lienReprise, espaces(decor.etat.emails[0].reduction), valide.corps.emailEnvoye],
    ["awa.test@example.com", "validee", "https://site.test/?reserver-en-groupe=road-trip-groupe&preuve=p1", "4 %", true],
  );
  const encore = await decider({ action: "refuser", id: "p1", prenom: "Awa" });
  verifier("une preuve ne se décide qu'une fois : 409", encore.statut, 409);
  const refuse = await decider({ action: "refuser", id: "p2", prenom: "Koffi", motif: "Bouton « Suivre » visible." });
  verifier(
    "refusée : un email poli avec le motif, et le lien sans preuve",
    [refuse.statut, decor.etat.emails[1].statut, decor.etat.emails[1].motif, decor.etat.emails[1].lienReprise],
    [200, "refusee", "Bouton « Suivre » visible.", "https://site.test/?reserver-en-groupe=road-trip-groupe"],
  );
}

/* ------------------------------------------------------------ Stockage */

const { depot } = await charger("src/lib/db/index.ts");

console.log("\n— Stockage privé : base ou magasin Vercel Blob privé");
{
  const base = stockagePreuves({ depot, jeton: null });
  verifier("sans jeton du magasin privé : la base", base.mode, "base");
  let refus = "";
  try {
    await base.ranger(new Uint8Array([1]), "image/webp");
  } catch {
    refus = "refusé";
  }
  verifier("sans jeton, rien ne part vers Vercel Blob", refus, "refusé");

  const appels: unknown[][] = [];
  const fauxBlob = async () => ({
    put: async (pathname: string, _corps: Buffer, options: Record<string, unknown>) => {
      appels.push(["put", pathname, options.access, options.addRandomSuffix, options.contentType, options.token]);
      return { pathname: "preuves/capture-Xy12.webp" };
    },
    get: async (pathname: string, options: Record<string, unknown>) => {
      appels.push(["get", pathname, options.access, options.useCache]);
      return { statusCode: 200, stream: new Blob([new Uint8Array([7, 8, 9])]).stream() };
    },
    del: async (pathname: string) => {
      appels.push(["del", pathname]);
    },
  });
  const prive = stockagePreuves({ depot, jeton: "jeton-factice", blob: fauxBlob });
  const cle = await prive.ranger(new Uint8Array([1, 2]), "image/webp");
  verifier("magasin privé : rangée en accès privé, nom unique sans rien du client", [prive.mode, cle, appels[0]], ["blob", "blob:preuves/capture-Xy12.webp", ["put", "preuves/capture.webp", "private", true, "image/webp", "jeton-factice"]]);
  verifier("relue par le serveur, en accès privé, sans cache", [Array.from((await prive.lire({ id: "x", fichierCle: cle })) ?? []), appels[1]], [[7, 8, 9], ["get", "preuves/capture-Xy12.webp", "private", false]]);
  await prive.effacer({ id: "x", fichierCle: cle });
  verifier("effacée du magasin", appels[2], ["del", "preuves/capture-Xy12.webp"]);
  await prive.effacer({ id: "x", fichierCle: "base:x" });
  verifier("une clé « base: » ne touche pas au magasin", appels.length, 3);
}

console.log("\n— Dépôt de démonstration");
{
  const p = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 3, email: " Awa@Example.com ", telephone: " 0197000000 ", octets: new Uint8Array([1, 2, 3]) });
  verifier("créée en attente, fichier gardé en base, email en minuscules", [p.statut, p.fichierCle, p.email, p.telephone], ["en_attente", `base:${p.id}`, "awa@example.com", "0197000000"]);
  verifier("le fichier se relit", Array.from((await depot.lireFichierPreuve(p.id)) ?? []), [1, 2, 3]);
  const image = await stockagePreuves({ depot, jeton: null }).lire(p);
  verifier("le stockage « base » le relit aussi", Array.from(image ?? []), [1, 2, 3]);
  const premiere = await depot.deciderPreuve(p.id, { statut: "validee", par: "admin (Koffi)", motif: "  Abonné\n à @bikeland_bj  " });
  const seconde = await depot.deciderPreuve(p.id, { statut: "refusee", par: "admin (Awa)" });
  verifier("décidée une seule fois, motif sur une ligne", [premiere?.statut, premiere?.motif, seconde], ["validee", "Abonné à @bikeland_bj", null]);
  const journal = (await depot.listerJournal({ type: "preuve-validee" }))[0];
  verifier("au journal, signée de qui décide", [journal?.auteur, journal?.details.preuveId], ["admin (Koffi)", p.id]);
  const effacee = await depot.effacerFichierPreuve(p.id);
  verifier("fichier effacé : plus de clé, date d'effacement, plus d'octets", [effacee?.fichierCle, typeof effacee?.supprimeLe, await depot.lireFichierPreuve(p.id)], [undefined, "string", null]);
  const enAttente = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 1, email: "b@example.com", telephone: "0196000000", fichierCle: "blob:preuves/x.webp" });
  const liste = await depot.listerPreuves({ statut: "en_attente" });
  verifier("liste des preuves à vérifier", liste.some((l: { id: string }) => l.id === enAttente.id), true);
}

console.log("\n— Effacement quotidien");
{
  const stockage = stockagePreuves({ depot, jeton: null });
  const octets = new Uint8Array([4, 5]);
  const decidee = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 2, email: "c@example.com", telephone: "0195000000", octets });
  await depot.deciderPreuve(decidee.id, { statut: "refusee", par: "admin (Koffi)" });
  const recente = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 2, email: "d@example.com", telephone: "0194000000", octets });
  const aujourdhui = await preuves.effacerFichiersPreuves({ depot, stockage, maintenant: () => Date.now() });
  verifier("décidée mais fichier encore là : effacée ; récente à vérifier : gardée", [(await depot.trouverPreuve(decidee.id))?.fichierCle, Boolean((await depot.trouverPreuve(recente.id))?.fichierCle), aujourdhui.echecs], [undefined, true, 0]);
  const plusTard = await preuves.effacerFichiersPreuves({ depot, stockage, maintenant: () => Date.now() + 31 * JOUR });
  const vieille = await depot.trouverPreuve(recente.id);
  verifier("31 jours plus tard : effacée, et refusée par le site faute de vérification", [vieille?.fichierCle, vieille?.statut, vieille?.decidePar, plusTard.expirees >= 1], [undefined, "refusee", "site", true]);
}

/* ------------------------------------------------------------- Routes */

console.log("\n— Routes, branchées au dépôt de démonstration");
{
  const { POST: routePreuves } = await charger("src/app/api/offres-groupe/preuves/route.ts");
  const { GET: routeStatut } = await charger("src/app/api/offres-groupe/preuves/[preuveId]/route.ts");
  const { POST: routeDecision } = await charger("src/app/api/admin/preuves/route.ts");
  const { GET: routeImage } = await charger("src/app/api/admin/preuves/[preuveId]/image/route.ts");
  const parametres = (preuveId: string) => ({ params: Promise.resolve({ preuveId }) });

  const ferme = await routePreuves(new Request("http://localhost/api/offres-groupe/preuves", { method: "POST", body: formulaire(petitPng) }));
  verifier("envoi : 403 tant que l'interrupteur est coupé", ferme.status, 403);
  const lourde = await routePreuves(
    new Request("http://localhost/api/offres-groupe/preuves", { method: "POST", body: "x", headers: { "content-length": String(TAILLE_MAX_CAPTURE_OCTETS * 2) } }),
  );
  verifier("annoncée trop lourde : 413 avant même d'être lue", lourde.status, 413);
  verifier("statut d'une preuve inconnue : 404", (await routeStatut(new Request("http://localhost/x"), parametres("inconnue"))).status, 404);

  const p = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 3, email: "e@example.com", telephone: "0193000000", octets: new Uint8Array([9, 9, 9]) });
  const image = await routeImage(new Request("http://localhost/x"), parametres(p.id));
  verifier(
    "image pour l'administration : 200, son type, jamais en cache, sandbox",
    [image.status, image.headers.get("content-type"), image.headers.get("cache-control"), image.headers.get("content-security-policy"), Array.from(new Uint8Array(await image.arrayBuffer()))],
    [200, "image/webp", "private, no-store, max-age=0", "default-src 'none'; sandbox", [9, 9, 9]],
  );
  verifier("image inconnue : 404", (await routeImage(new Request("http://localhost/x"), parametres("inconnue"))).status, 404);
  const decision = await routeDecision(
    new Request("http://localhost/api/admin/preuves", { method: "POST", body: JSON.stringify({ action: "valider", id: p.id, prenom: "Koffi" }) }),
  );
  verifier("décision par la route : 200, capture effacée", [decision.status, (await decision.json()).fichierEfface], [200, true]);
  verifier("après la décision, l'image n'existe plus", (await routeImage(new Request("http://localhost/x"), parametres(p.id))).status, 404);

  process.env.BIKELAND_ROLE = "site";
  verifier("sur le site public : image refusée (401)", (await routeImage(new Request("http://localhost/x"), parametres(p.id))).status, 401);
  const refusee = await routeDecision(new Request("http://localhost/api/admin/preuves", { method: "POST", body: "{}" }));
  verifier("sur le site public : décision refusée (401)", refusee.status, 401);
  delete process.env.BIKELAND_ROLE;
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
