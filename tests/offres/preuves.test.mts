// Les preuves de réduction du road trip en groupe (lot 5b), sans base,
// sans email, sans agent IA réels : de faux dépôts, un faux stockage, un
// faux agent ; sharp, lui, réencode pour de vrai des images fabriquées ici.
//  - type lu dans le fichier, taille, limite de débit ;
//  - réencodage : tournée, réduite à 1 600 pixels, 1 Mo au plus, sans EXIF ;
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
  verifier("WebP, plus grand côté ramené à 1 600 pixels", [reencodee.typeMime, lue.format, lue.width, lue.height], ["image/webp", "webp", 1600, 400]);
  verifier("1 Mo au plus après réencodage", reencodee.octets.byteLength <= preuves.TAILLE_MAX_REENCODEE_OCTETS, true);
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
  /** Combien de captures attendent déjà d'être vérifiées. */
  enAttente?: number;
  analyser?: (entree: { image: Uint8Array; typeMime: string }) => Promise<Record<string, unknown>>;
  /** Les road trips en groupe connus (`ReservationRoadTripClient`), pour la règle « une réduction par client ». */
  reservations?: Record<string, any>[];
  /** L'email de Bike Land échoue (décision 24) : l'envoi de la capture ne doit pas échouer pour autant. */
  alerteEnPanne?: boolean;
  /** L'email au client ne part pas. */
  emailClientEnPanne?: boolean;
}
function fauxDecor(options: Options = {}) {
  const etat = {
    preuves: new Map<string, Record<string, any>>(),
    creees: [] as Record<string, any>[],
    decisions: [] as Record<string, any>[],
    effaces: [] as string[],
    rangees: [] as string[],
    emails: [] as Record<string, any>[],
    alertes: [] as Record<string, any>[],
    journal: [] as Record<string, any>[],
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
    async listerPreuves(filtre?: { statut?: string; limite?: number }) {
      const attente = [...etat.preuves.values()].filter((p) => !filtre?.statut || p.statut === filtre.statut);
      return attente.length ? attente : Array.from({ length: options.enAttente ?? 0 }, (_, i) => ({ id: `ancienne-${i}`, statut: "en_attente" }));
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
    async trouverReservationParReference(reference: string) {
      return (options.reservations ?? []).find((r) => r.reference === reference) ?? null;
    },
    async listerReservationsRoadTripGroupe(filtre: { avecReduction: boolean; depuis?: string }) {
      return (options.reservations ?? []).filter(
        (r) => r.statut !== "ANNULEE" && (filtre.avecReduction ? r.reductionXof > 0 : r.reductionXof === 0) && (!filtre.depuis || r.creeLe >= filtre.depuis),
      );
    },
    async journaliser(evenement: Record<string, any>) {
      etat.journal.push(evenement);
      return { id: `j${etat.journal.length}`, details: {}, creeLe: new Date(MAINTENANT).toISOString(), ...evenement };
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
      return { envoye: !options.emailClientEnPanne };
    },
    alerterBikeLand: async (alerte: Record<string, any>) => {
      etat.alertes.push(alerte);
      if (options.alerteEnPanne) throw new Error("Gmail injoignable");
      return { envoye: true };
    },
    urlSite: () => "https://site.test",
  };
  return { deps, etat };
}

/** Un road trip en groupe connu du dépôt, réduit à ce que regarde la règle « une réduction par client ». */
const roadTrip = (champs: Record<string, any>) => ({
  reference: "BL-AVANT1",
  statut: "CONFIRMEE",
  creeLe: new Date(MAINTENANT - 3 * JOUR).toISOString(),
  email: "autre@example.com",
  telephone: "+229 01 90 00 00 00",
  reductionXof: 1200,
  ...champs,
});
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
  // Le numéro est contrôlé comme à la réservation : il reconnaît le client (décision 25) et reçoit le paiement.
  const numeros = await Promise.all(
    ["abcdefgh", "+229 ()()()", "01 97 00 0", "0197-00-00-00x", "+229 01 97 00 00 00", "(229) 01.97.00.00.00"].map(async (telephone) => {
      const r = await envoyer(formulaire(petitPng, { telephone, email: "num@example.com" }));
      return r.statut;
    }),
  );
  verifier("numéro : chiffres, espaces et + ( ) . - seulement, huit chiffres au moins", numeros, [400, 400, 400, 400, 201, 201]);
  const sansChiffres = await envoyer(formulaire(petitPng, { telephone: "abcdefgh", email: "num@example.com" }));
  verifier("numéro sans chiffres : refusé avant tout compteur, rien d'enregistré, le message dit quoi corriger", [
    sansChiffres.etat.compteurs.size,
    sansChiffres.etat.creees.length,
    sansChiffres.corps.message,
  ], [0, 0, "Vérifiez votre numéro Mobile Money (8 chiffres au moins) et votre email, puis réessayez."]);
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
  const statuts: number[] = [];
  for (let i = 0; i < 11; i += 1) {
    const r = await preuves.recevoirPreuve(formulaire(petitPng, { telephone: `0197${String(i).padStart(6, "0")}`, email: `a${i}@example.com` }), { ip: "10.1.1.1" }, decor.deps);
    statuts.push(r.statut);
  }
  verifier("10 captures de la même adresse en une heure passent, la 11e : 429", [statuts.slice(0, 10).every((s) => s === 201), statuts[10]], [true, 429]);
  let dernier = { statut: 0 };
  const autre = fauxDecor();
  for (let i = 0; i < 6; i += 1) {
    dernier = await preuves.recevoirPreuve(formulaire(petitPng, { telephone: "+229 01 97 00 00 00", email: `b${i}@example.com` }), { ip: `10.2.2.${i}` }, autre.deps);
  }
  verifier("6e capture du même numéro dans la journée : 429", dernier.statut, 429);
  const parEmail = fauxDecor();
  for (let i = 0; i < 6; i += 1) {
    dernier = await preuves.recevoirPreuve(formulaire(petitPng, { telephone: `0196${String(i).padStart(6, "0")}`, email: " Meme@Example.com " }), { ip: `10.5.5.${i}` }, parEmail.deps);
  }
  verifier("6e capture du même email (casse et espaces mis à part) dans la journée : 429", dernier.statut, 429);
  const debordee = await envoyer(formulaire(petitPng), { enAttente: 100 });
  verifier("100 captures déjà à vérifier : les nouvelles attendent (429), rien d'enregistré", [debordee.statut, debordee.etat.creees.length], [429, 0]);
  const lourde = fauxDecor();
  lourde.deps.reencoder = async () => ({ octets: new Uint8Array(preuves.TAILLE_MAX_REENCODEE_OCTETS + 1), typeMime: "image/webp", largeur: 1600, hauteur: 1600 });
  const tropChargee = (await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.3.3.3" }, lourde.deps)) as { statut: number };
  verifier("plus de 1 Mo même réduite : refusée (413), rien d'enregistré", [tropChargee.statut, lourde.etat.creees.length], [413, 0]);
}

console.log("\n— Sans agent IA (décision 21) : vérifiée à la main");
{
  const r = await envoyer(formulaire(grandeAvecExif));
  verifier("201, en attente", [r.statut, r.corps.ok, r.corps.statut, r.corps.preuveId], [201, true, "en_attente", "p1"]);
  verifier("le message dit qu'on répond par email, sans parler d'IA", [r.corps.message.includes("par email"), /IA|intelligence/i.test(r.corps.message)], [true, false]);
  const creee = r.etat.creees[0];
  const lue = await sharp(Buffer.from(creee.octets)).metadata();
  verifier("rangée en base : la capture réencodée (WebP, 1 600 px, sans EXIF)", [creee.typeMime, lue.format, lue.width, lue.exif], ["image/webp", "webp", 1600, undefined]);
  verifier("avec l'email et le téléphone du client, pour lui répondre", [creee.email, creee.telephone], ["awa.test@example.com", "+229 01 97 00 00 00"]);
  verifier("aucune décision, aucun effacement", [r.etat.decisions.length, r.etat.effaces.length], [0, 0]);
  const blob = await envoyer(formulaire(petitPng), { mode: "blob" });
  verifier("magasin privé réglé : la capture y est rangée, la preuve garde sa clé", [blob.etat.rangees, blob.etat.creees[0].fichierCle, "octets" in blob.etat.creees[0]], [["image/webp"], "blob:preuves/capture-abc.webp", false]);
}

console.log("\n— Décision 24 : Bike Land reçoit un email à chaque capture qui attend");
{
  const r = await envoyer(formulaire(petitPng));
  verifier("capture en attente : un email à Bike Land, avec l'heure, le contact et le nombre en attente", [r.statut, r.etat.alertes], [
    201,
    [{ recueLe: new Date(MAINTENANT).toISOString(), telephone: "+229 01 97 00 00 00", email: "awa.test@example.com", enAttente: 1 }],
  ]);
  verifier("le message au client dit que la réponse vient par email, à son adresse, et le prix normal s'il réserve tout de suite", r.corps.message, [
    "Merci, votre capture est bien reçue ! Nous la vérifions et vous répondons par email à awa.test@example.com.",
    "Si vous réservez tout de suite, c'est au prix normal : la réduction ne s'ajoutera pas après.",
  ].join(" "));
  const enPanne = await envoyer(formulaire(petitPng), { alerteEnPanne: true });
  verifier("l'email à Bike Land échoue : la capture est quand même reçue (201)", [enPanne.statut, enPanne.corps.statut, enPanne.etat.creees.length], [201, "en_attente", 1]);
  const decor = fauxDecor();
  await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.6.6.1" }, decor.deps);
  await preuves.recevoirPreuve(formulaire(petitPng, { telephone: "0195112233", email: "kossi@example.com" }), { ip: "10.6.6.2" }, decor.deps);
  verifier("deux captures qui attendent : le second email le dit", decor.etat.alertes.map((alerte: { enAttente: number }) => alerte.enAttente), [1, 2]);
  const valideeParIa = await envoyer(formulaire(petitPng), { analyser: async () => ({ statut: "validee", motif: "Abonné.", reseau: "instagram", identifiantVu: "bikeland_bj" }) });
  const refuseeParIa = await envoyer(formulaire(petitPng), { analyser: async () => ({ statut: "refusee", motif: "Bouton Suivre." }) });
  verifier("capture répondue d'emblée (agent IA) : personne n'est dérangé", [valideeParIa.etat.alertes.length, refuseeParIa.etat.alertes.length], [0, 0]);
}

console.log("\n— Décision 25 : la réduction, une seule fois par client, dès l'envoi");
{
  const dejaParNumero = await envoyer(formulaire(petitPng, { telephone: "0197000000", email: "nouvel.email@example.com" }), {
    reservations: [roadTrip({ telephone: "+229 01 97 00 00 00" })],
  });
  verifier("même numéro (8 derniers chiffres), autre email : 409 tout de suite, rien gardé, personne de prévenu", [
    dejaParNumero.statut,
    dejaParNumero.corps.code,
    dejaParNumero.corps.message,
    dejaParNumero.etat.creees.length,
    dejaParNumero.etat.alertes.length,
  ], [409, "REDUCTION_DEJA_EUE", "Vous avez déjà eu la réduction de 4 % : elle vaut une seule fois par client.", 0, 0]);
  const dejaParEmail = await envoyer(formulaire(petitPng, { telephone: "0161000000", email: "Awa.Test@Example.com" }), {
    reservations: [roadTrip({ email: "awa.test@example.com" })],
  });
  verifier("même email, en majuscules, autre numéro : 409", [dejaParEmail.statut, dejaParEmail.corps.code], [409, "REDUCTION_DEJA_EUE"]);
  const enAttenteRecente = await envoyer(formulaire(petitPng), {
    reservations: [roadTrip({ telephone: "0197000000", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 10 * 60_000).toISOString() })],
  });
  verifier("réduction sur une demande qui attend son paiement depuis 10 min : elle compte", enAttenteRecente.statut, 409);
  const expiree = await envoyer(formulaire(petitPng), {
    reservations: [roadTrip({ telephone: "0197000000", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 45 * 60_000).toISOString() })],
  });
  const annulee = await envoyer(formulaire(petitPng), { reservations: [roadTrip({ telephone: "0197000000", statut: "ANNULEE" })] });
  const prixNormal = await envoyer(formulaire(petitPng), { reservations: [roadTrip({ telephone: "0197000000", reductionXof: 0 })] });
  verifier("réduction jamais payée et expirée, annulée, ou road trip au prix normal : la capture est reçue", [expiree.statut, annulee.statut, prixNormal.statut], [201, 201, 201]);
  const autreClient = await envoyer(formulaire(petitPng), { reservations: [roadTrip({})] });
  verifier("un autre client a eu la réduction : rien ne change pour celui-ci", autreClient.statut, 201);
}

console.log("\n— Défaut 9 : la même capture renvoyée juste après n'est pas enregistrée deux fois");
{
  const decor = fauxDecor();
  const premiere = (await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.7.7.1" }, decor.deps)) as { statut: number; corps: Record<string, any> };
  const reprise = (await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.7.7.2" }, decor.deps)) as { statut: number; corps: Record<string, any> };
  verifier("même numéro, même image, aussitôt : la première capture est rendue, un seul email à Bike Land", [
    premiere.statut,
    reprise.statut,
    reprise.corps.preuveId,
    reprise.corps.statut,
    decor.etat.creees.length,
    decor.etat.alertes.length,
  ], [201, 200, premiere.corps.preuveId, "en_attente", 1, 1]);
  const autreImage = (await preuves.recevoirPreuve(formulaire(grandeAvecExif), { ip: "10.7.7.3" }, decor.deps)) as { statut: number };
  const autreNumero = (await preuves.recevoirPreuve(formulaire(petitPng, { telephone: "0161223344", email: "awa.test@example.com" }), { ip: "10.7.7.4" }, decor.deps)) as { statut: number };
  verifier("une autre image, ou un autre numéro : une nouvelle capture", [autreImage.statut, autreNumero.statut, decor.etat.creees.length], [201, 201, 3]);
  const plusTard = fauxDecor();
  await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.7.7.5" }, plusTard.deps);
  plusTard.deps.maintenant = () => MAINTENANT + (preuves.DOUBLON_MINUTES + 1) * 60_000;
  const apresLeDelai = (await preuves.recevoirPreuve(formulaire(petitPng), { ip: "10.7.7.6" }, plusTard.deps)) as { statut: number };
  verifier(`la même image ${preuves.DOUBLON_MINUTES + 1} minutes plus tard : une nouvelle capture`, [apresLeDelai.statut, plusTard.etat.creees.length], [201, 2]);
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
  verifier("« Est-ce que c'est validé ? », pas encore : la réponse viendra par email, sans redire l'adresse", connue.corps.message, "Pas encore : votre capture attend notre vérification. Nous vous écrivons par email dès que c'est fait.");

  // Défaut 10 et décision 25 : une capture validée qui ne peut plus servir le dit, jamais « validée ».
  const statutDe = async (preuve: Record<string, any>, reservations: Record<string, any>[] = []) => {
    const d = fauxDecor({ reservations });
    d.etat.preuves.set(preuve.id, preuve);
    return ((await preuves.statutPreuve(preuve.id, d.deps)) as { corps: Record<string, any> }).corps;
  };
  const validee = { id: "v1", statut: "validee", email: "awa.test@example.com", telephone: "+229 01 97 00 00 00", creeLe: new Date(MAINTENANT).toISOString() };
  const libre = await statutDe(validee);
  verifier("validée et libre : « validee »", [libre.statut, espaces(libre.message)], ["validee", "Votre capture est validée : la réduction de 4 % s'applique à votre road trip en groupe."]);
  const servie = await statutDe({ ...validee, reference: "BL-SERVIE" }, [roadTrip({ reference: "BL-SERVIE", email: "awa.test@example.com" })]);
  verifier("validée, déjà servie à une réservation payée : « deja-utilisee »", [servie.statut, servie.message], [
    "deja-utilisee",
    "Cette capture a déjà servi pour une réservation : la réduction vaut une seule fois par client.",
  ]);
  const ailleurs = await statutDe(validee, [roadTrip({ telephone: "0197000000" })]);
  verifier("validée, mais ce client a déjà eu la réduction ailleurs : « deja-eue »", [ailleurs.statut, ailleurs.message], [
    "deja-eue",
    "Vous avez déjà eu la réduction de 4 % : elle vaut une seule fois par client.",
  ]);
  const liberee = await statutDe({ ...validee, reference: "BL-EXPIRE" }, [
    roadTrip({ reference: "BL-EXPIRE", email: "awa.test@example.com", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 45 * 60_000).toISOString() }),
  ]);
  verifier("validée, rattachée à une demande jamais payée et expirée : de nouveau « validee »", liberee.statut, "validee");
  const sansContact = await statutDe({ ...validee, email: undefined, telephone: undefined }, [roadTrip({ telephone: "0197000000" })]);
  verifier("validée, contact effacé après 30 jours : toujours utilisable par son identifiant", sansContact.statut, "validee");
  const enPanne = fauxDecor();
  enPanne.etat.preuves.set("v1", validee);
  enPanne.deps.depot.listerReservationsRoadTripGroupe = async () => {
    throw new Error("base injoignable");
  };
  verifier("réservations illisibles : le statut se donne quand même (la réservation refera le contrôle)", ((await preuves.statutPreuve("v1", enPanne.deps)) as { statut: number; corps: Record<string, any> }).corps.statut, "validee");
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
  verifier("validée sans rien de réservé avant : ni « prix normal », ni « déjà eue »", [
    "reservationPrixNormal" in decor.etat.emails[0],
    "reductionDejaEue" in decor.etat.emails[0],
    "prixNormal" in valide.corps,
    "dejaEue" in valide.corps,
  ], [false, false, false, false]);
  verifier("emails partis : rien au journal des emails non partis", decor.etat.journal, []);
}

console.log("\n— Décision 24 : valider après une réservation au prix normal, sans remboursement");
{
  const capture = { id: "pc", statut: "en_attente", email: "awa.test@example.com", telephone: "+229 01 97 00 00 00", creeLe: new Date(MAINTENANT - 2 * 60 * 60_000).toISOString() };
  const valider = async (reservations: Record<string, any>[], options: Options = {}) => {
    const d = fauxDecor({ ...options, reservations });
    d.etat.preuves.set(capture.id, { ...capture });
    const r = (await preuves.deciderPreuveParAdmin({ action: "valider", id: capture.id, prenom: "Koffi" }, d.deps)) as { statut: number; corps: Record<string, any> };
    return { ...r, email: d.etat.emails[0], journal: d.etat.journal };
  };
  const apres = await valider([roadTrip({ reference: "BL-NORMAL", email: "awa.test@example.com", reductionXof: 0, creeLe: new Date(MAINTENANT - 60 * 60_000).toISOString() })]);
  verifier("payée au prix normal après la capture : l'email le dit, garde le lien avec la preuve pour le prochain road trip", [
    apres.corps.prixNormal,
    apres.email.reservationPrixNormal,
    apres.email.lienReprise,
    "reductionDejaEue" in apres.email,
  ], ["BL-NORMAL", "BL-NORMAL", "https://site.test/?reserver-en-groupe=road-trip-groupe&preuve=pc", false]);
  const enAttente = await valider([
    roadTrip({ reference: "BL-ATTEND", telephone: "0197000000", reductionXof: 0, statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 5 * 60_000).toISOString() }),
  ]);
  verifier("même chose pour une réservation au prix normal qui attend son paiement (même numéro)", enAttente.email.reservationPrixNormal, "BL-ATTEND");
  const avant = await valider([roadTrip({ reference: "BL-AVANT", email: "awa.test@example.com", reductionXof: 0, creeLe: new Date(MAINTENANT - 5 * JOUR).toISOString() })]);
  verifier("une réservation faite avant la capture ne change rien à l'email", ["reservationPrixNormal" in avant.email, avant.email.lienReprise], [
    false,
    "https://site.test/?reserver-en-groupe=road-trip-groupe&preuve=pc",
  ]);
  const dejaEue = await valider([
    roadTrip({ reference: "BL-REDUIT", email: "awa.test@example.com" }),
    roadTrip({ reference: "BL-NORMAL", email: "awa.test@example.com", reductionXof: 0, creeLe: new Date(MAINTENANT - 60 * 60_000).toISOString() }),
  ]);
  verifier("décision 25 : ce client a déjà eu la réduction, l'email le dit, sans lien qui la promettrait", [
    dejaEue.corps.dejaEue,
    dejaEue.email.reductionDejaEue,
    "reservationPrixNormal" in dejaEue.email,
    dejaEue.email.lienReprise,
  ], ["BL-REDUIT", "BL-REDUIT", false, "https://site.test/?reserver-en-groupe=road-trip-groupe"]);
  const sansEmail = await valider([], { emailClientEnPanne: true });
  verifier("l'email au client ne part pas : noté au journal, pour le rappeler sous « Décidées »", [sansEmail.corps.emailEnvoye, sansEmail.journal], [
    false,
    [{ type: "preuve-email-non-envoye", details: { preuveId: "pc", statut: "validee" }, auteur: "admin (Koffi)" }],
  ]);
  verifier("la situation du client, pour l'écran des preuves", preuves.situationDuClient(capture, [roadTrip({ reference: "BL-R", telephone: "0197000000" })], [], MAINTENANT), { dejaEue: "BL-R" });
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

  // Défaut 15 : le refus automatique ne s'écrit pas, l'image reste (la capture est encore « à vérifier »).
  const enAttente = { id: "ancienne", statut: "en_attente", fichierCle: "base:ancienne", creeLe: new Date(MAINTENANT - 31 * JOUR).toISOString() };
  const effacees: string[] = [];
  const resultat = await preuves.effacerFichiersPreuves({
    depot: {
      listerFichiersPreuvesAEffacer: async () => [enAttente],
      deciderPreuve: async () => {
        throw new Error("base injoignable");
      },
      effacerFichierPreuve: async (id: string) => {
        effacees.push(id);
        return null;
      },
    },
    stockage: { effacer: async () => undefined },
    maintenant: () => MAINTENANT,
  });
  verifier("refus automatique impossible : l'image n'est pas effacée, la tâche de demain reprendra", [resultat, effacees], [{ effaces: 0, echecs: 1, expirees: 0 }, []]);
}

console.log("\n— Défaut 19 : le contact des captures s'efface, 30 jours après la décision ou dès qu'elle a servi");
{
  const tout = await depot.listerPreuves();
  const cree = async (email: string) => depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 1, email, telephone: "0190112233", octets: new Uint8Array([1]) });
  const ancienne = await cree("ancienne.decision@example.com");
  await depot.deciderPreuve(ancienne.id, { statut: "refusee", par: "admin (Koffi)" });
  const recente = await cree("recente.decision@example.com");
  await depot.deciderPreuve(recente.id, { statut: "validee", par: "admin (Koffi)" });
  const attente = await cree("attente@example.com");
  const effaces = await preuves.effacerContactsPreuves({ depot, maintenant: () => Date.now() + (preuves.JOURS_CONSERVATION_CONTACT + 1) * JOUR });
  const relue = async (id: string) => {
    const p = await depot.trouverPreuve(id);
    return [p?.email ?? null, p?.telephone ?? null, p?.statut];
  };
  verifier(`${preuves.JOURS_CONSERVATION_CONTACT + 1} jours après : décidées sans contact, l'attente garde le sien, la validée reste validée`, [
    effaces >= 2,
    await relue(ancienne.id),
    await relue(recente.id),
    await relue(attente.id),
  ], [true, [null, null, "refusee"], [null, null, "validee"], ["attente@example.com", "0190112233", "en_attente"]]);
  const demain = await cree("demain@example.com");
  await depot.deciderPreuve(demain.id, { statut: "validee", par: "admin (Koffi)" });
  await preuves.effacerContactsPreuves({ depot, maintenant: () => Date.now() });
  verifier("décidée hier : le contact reste encore", (await relue(demain.id))[0], "demain@example.com");
  verifier("la page des données personnelles dit la même durée (30 jours)", preuves.JOURS_CONSERVATION_CONTACT, 30);
  verifier("les autres preuves du dépôt de démonstration n'ont pas disparu", (await depot.listerPreuves()).length >= tout.length, true);
}

console.log("\n— Décision 25 dans le dépôt de démonstration : la transaction qui consomme la capture");
{
  const { PreuveReductionInutilisableError } = await charger("src/lib/db/contrat.ts");
  const valideePour = async (email: string, telephone: string) => {
    const p = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 1, email, telephone, octets: new Uint8Array([1]) });
    await depot.deciderPreuve(p.id, { statut: "validee", par: "admin (Koffi)" });
    return p.id;
  };
  const demande = (preuveId: string | undefined, client: Record<string, string>, date = "2027-01-16") => ({
    offre: "road-trip-groupe",
    date,
    debutMinute: 8 * 60,
    finMinute: 12 * 60,
    velos: 10,
    nombrePersonnes: 10,
    totalXof: preuveId ? 30050 : 31250,
    details: { reductionXof: preuveId ? 1200 : 0, totalXof: preuveId ? 30050 : 31250, personnes: 10 },
    client: { prenom: "Awa", nom: "Test", ...client },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...(preuveId ? { preuveId } : {}),
  });
  const raisonDe = async (promesse: Promise<unknown>) => {
    try {
      await promesse;
      return "écrite";
    } catch (e) {
      return e instanceof PreuveReductionInutilisableError ? e.raison : `autre : ${(e as Error).message}`;
    }
  };
  const client = { email: "unique.client@example.com", telephone: "+229 01 66 00 00 01" };
  const premiere = await depot.creerReservationGroupe(demande(await valideePour("unique.client@example.com", "0166000001"), client));
  verifier("première réduction de ce client : écrite, la capture consommée", [premiere.reservation.remiseXof, premiere.reservation.statut], [1200, "EN_ATTENTE_PAIEMENT"]);
  const secondeCapture = await valideePour("autre.adresse@example.com", "0166000001");
  verifier("une seconde capture validée, même numéro : refusée « deja-eue », rien d'écrit", await raisonDe(depot.creerReservationGroupe(demande(secondeCapture, { email: "autre.adresse@example.com", telephone: "0166000001" }, "2027-01-17"))), "deja-eue");
  verifier("la seconde capture n'est pas consommée", (await depot.trouverPreuve(secondeCapture))?.reference, undefined);
  const parEmail = await valideePour("x@example.com", "0177000000");
  verifier("contact de la réservation : le même email, en majuscules : refusée aussi", await raisonDe(depot.creerReservationGroupe(demande(parEmail, { email: " UNIQUE.CLIENT@example.com ", telephone: "0177000000" }, "2027-01-23"))), "deja-eue");
  verifier("au prix normal, ce client réserve encore, sans capture", await raisonDe(depot.creerReservationGroupe(demande(undefined, client, "2027-01-24"))), "écrite");

  // Deux réservations du même client lancées ensemble, chacune avec sa capture validée : une seule a la réduction.
  const autreClient = { email: "double.clic@example.com", telephone: "+229 01 55 00 00 02" };
  const [a, b] = [await valideePour("double.clic@example.com", "0155000002"), await valideePour("double.clic+2@example.com", "0155000002")];
  const issues = await Promise.all([
    raisonDe(depot.creerReservationGroupe(demande(a, autreClient, "2027-01-30"))),
    raisonDe(depot.creerReservationGroupe(demande(b, autreClient, "2027-01-31"))),
  ]);
  verifier("deux réservations simultanées du même client : une écrite, l'autre « deja-eue »", [...issues].sort(), ["deja-eue", "écrite"]);

  // Une demande impayée expirée de ce client, avec la réduction : annulée quand une nouvelle la prend.
  const etatDemo = (globalThis as Record<symbol, any>)[Symbol.for("bikeland.demo.etat")];
  const expireeClient = { email: "expire.client@example.com", telephone: "+229 01 44 00 00 03" };
  const vieille = await depot.creerReservationGroupe(demande(await valideePour("expire.client@example.com", "0144000003"), expireeClient, "2027-02-06"));
  const ligneVieille = etatDemo.reservations.find((r: { reference: string }) => r.reference === vieille.reservation.reference);
  ligneVieille.creeLe = new Date(Date.now() - 45 * 60_000).toISOString();
  const nouvelle = await depot.creerReservationGroupe(demande(await valideePour("expire.client+2@example.com", "0144000003"), expireeClient, "2027-02-07"));
  verifier("la demande expirée qui portait la réduction est annulée ; la nouvelle a la réduction", [
    (await depot.trouverReservationParReference(vieille.reservation.reference))?.statut,
    nouvelle.reservation.remiseXof,
  ], ["ANNULEE", 1200]);
  const liste = await depot.listerReservationsRoadTripGroupe({ avecReduction: true });
  verifier("la liste des réductions : jamais les annulées, avec le contact de la réservation", [
    liste.some((r: { reference: string }) => r.reference === vieille.reservation.reference),
    liste.find((r: { reference: string }) => r.reference === nouvelle.reservation.reference)?.email,
  ], [false, "expire.client@example.com"]);
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

console.log("\n— Le SQL des preuves : additif et rejouable");
{
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(join(projet, "prisma/offres-groupe-preuves.sql"), "utf8");
  const instructions = sql
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((instruction) => instruction.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  verifier(
    "chaque instruction vérifie d'abord que l'objet n'existe pas, ou verrouille la table",
    instructions.every((i) => /^(ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS|CREATE TABLE IF NOT EXISTS|ALTER TABLE "\w+" ENABLE ROW LEVEL SECURITY)/.test(i)),
    true,
  );
  verifier(
    "rien n'est supprimé, vidé, réécrit ni renommé",
    instructions.some((i) => /^(DROP|DELETE|TRUNCATE|UPDATE)\b/i.test(i) || /\b(DROP|RENAME)\b/i.test(i)),
    false,
  );
  const schema = readFileSync(join(projet, "prisma/schema.prisma"), "utf8");
  verifier(
    "le schéma Prisma suit le SQL (email, téléphone, table FichierPreuve)",
    [/email\s+String\?/.test(schema.split("model PreuveReduction")[1] ?? ""), schema.includes("model FichierPreuve"), sql.includes('"FichierPreuve" ENABLE ROW LEVEL SECURITY')],
    [true, true, true],
  );
}

console.log("\n— La tâche quotidienne efface les captures");
{
  const { GET: tache } = await charger("src/app/api/cron/rappels/route.ts");
  process.env.CRON_SECRET = "secret-de-test-assez-long";
  const decidee = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 1, email: "f@example.com", telephone: "0192000000", octets: new Uint8Array([1]) });
  await depot.deciderPreuve(decidee.id, { statut: "validee", par: "admin (Koffi)" });
  const sansCle = await tache(new Request("http://localhost/api/cron/rappels"));
  verifier("sans le secret : refusée, rien d'effacé", [sansCle.status, Boolean((await depot.trouverPreuve(decidee.id))?.fichierCle)], [401, true]);
  const reponse = await tache(new Request("http://localhost/api/cron/rappels", { headers: { authorization: "Bearer secret-de-test-assez-long" } }));
  const corps = await reponse.json();
  verifier("avec le secret : 200, la capture décidée effacée", [reponse.status, corps.preuves?.effaces >= 1, (await depot.trouverPreuve(decidee.id))?.fichierCle], [200, true, undefined]);
  verifier("le ménage dit aussi les contacts et les compteurs effacés", [typeof corps.contacts, typeof corps.compteurs], ["number", "number"]);

  // Défaut 15 : le ménage des captures passe avant les rappels, à part : une panne des rappels ne l'empêche plus.
  const autre = await depot.creerPreuve({ typeMime: "image/webp", tailleOctets: 1, email: "g@example.com", telephone: "0191000000", octets: new Uint8Array([1]) });
  await depot.deciderPreuve(autre.id, { statut: "refusee", par: "admin (Koffi)" });
  const rappels = depot.listerRappelsAEnvoyer;
  depot.listerRappelsAEnvoyer = async () => {
    throw new Error("base des rappels injoignable");
  };
  let panne = "";
  try {
    await tache(new Request("http://localhost/api/cron/rappels", { headers: { authorization: "Bearer secret-de-test-assez-long" } }));
  } catch (e) {
    panne = (e as Error).message;
  } finally {
    depot.listerRappelsAEnvoyer = rappels;
  }
  verifier("les rappels tombent en panne : la capture décidée est quand même effacée", [panne, (await depot.trouverPreuve(autre.id))?.fichierCle], [
    "base des rappels injoignable",
    undefined,
  ]);
  delete process.env.CRON_SECRET;
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
