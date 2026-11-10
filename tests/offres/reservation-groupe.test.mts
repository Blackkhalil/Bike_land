// Devis, réservation en ligne et vente au comptoir des offres de groupe
// (lot 5b), avec un faux dépôt, un faux encaissement et de faux emails :
// aucune base, aucun paiement, aucun email réel (le lanceur retire tous les
// secrets). L'horloge est fixée : lundi 16 novembre 2026, 10 h au Bénin.
//  - devis : interrupteur coupé, réglages illisibles, cas du tableur, refus,
//    réduction seulement avec une preuve validée et libre, créneau le plus
//    proche (même jour pour Bike for All, date suivante sinon) ;
//  - réservation : prix changé (409), vélos pris (409), demande en attente
//    (409), refus du moteur (422), limite de débit (429), succès au bon
//    montant et au bon canal, sans rien croire du navigateur ;
//  - comptoir : prix sans frais, ni date limite ni jour fermé, saisie unique.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "SASPAY_API_KEY", "ANTHROPIC_API_KEY", "VERCEL_ENV", "BIKELAND_ROLE"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const service = await charger("src/lib/offres-groupe/service.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT } = await charger("src/data/reglages-offres.ts");
const { CapaciteInsuffisanteError } = await charger("src/lib/db/contrat.ts");

let echecs = 0;
// Les espaces insécables des montants (U+00A0, U+202F) comptent pour des espaces.
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

/* ------------------------------------------------------------ Le décor */

// Lundi 16 novembre 2026, 10 h à Cotonou (UTC+1).
const MAINTENANT = Date.parse("2026-11-16T09:00:00Z");
const LUNDI = "2026-11-16";
const MARDI = "2026-11-17";
const SAMEDI = "2026-11-21";
const DIMANCHE = "2026-11-22";
const MINUTE = 60_000;

type Gamme = "CLASSIQUE" | "PREMIUM" | "PRESTIGE";
type Occupation = { veloId: string; debutMinute: number; finMinute: number };
// 18 vélos : 8 Classique, 8 Premium, 2 Prestige.
const PARC = Array.from({ length: 18 }, (_, i) => ({
  id: `v${i + 1}`,
  nom: `Vélo ${i + 1}`,
  gamme: (i < 8 ? "CLASSIQUE" : i < 16 ? "PREMIUM" : "PRESTIGE") as Gamme,
}));
/** `nombre` vélos pris de `debut` à `fin` (minutes), les premiers du parc. */
const pris = (nombre: number, debut: number, fin: number): Occupation[] =>
  PARC.slice(0, nombre).map((v) => ({ veloId: v.id, debutMinute: debut, finMinute: fin }));

interface Options {
  actives?: boolean;
  lecture?: { reglages: unknown; source: string; probleme?: string };
  occupations?: Record<string, Occupation[]>;
  joursFermes?: { id: string; date: string; formule: string; creeLe: string }[];
  fournisseur?: string;
  paiement?: Record<string, unknown>;
  maintenant?: number;
  enAttente?: Record<string, unknown>[];
  preuves?: Record<string, Record<string, unknown>>;
  reservationsConnues?: Record<string, unknown>[];
  /** Les road trips en groupe connus, réduits à ce que regarde la règle « une réduction par client » (décision 25). */
  reductions?: Record<string, any>[];
  creer?: (demande: Record<string, unknown>) => void;
  dejaVendue?: Record<string, unknown>;
}

function faux(options: Options = {}) {
  const etat = {
    parcsLus: [] as string[],
    creees: [] as Record<string, unknown>[],
    encaissements: [] as Record<string, unknown>[],
    confirmations: [] as string[],
    emails: [] as string[],
    compteurs: new Map<string, number>(),
    journal: [] as Record<string, unknown>[],
  };
  let numero = 0;
  const depot = {
    async parcDuJour(date: string) {
      etat.parcsLus.push(date);
      return { date, velos: PARC, occupations: options.occupations?.[date] ?? [] };
    },
    async creerReservationGroupe(demande: Record<string, unknown>) {
      options.creer?.(demande);
      etat.creees.push(demande);
      numero += 1;
      const reference = `BL-T${String(numero).padStart(5, "2")}`;
      const client = demande.client as Record<string, string>;
      const reservation = {
        id: `r${numero}`,
        reference,
        statut: demande.encaissement ? "CONFIRMEE" : "EN_ATTENTE_PAIEMENT",
        offre: demande.offre,
        dateDebut: demande.date,
        totalXof: demande.totalXof,
        creeLe: new Date(options.maintenant ?? MAINTENANT).toISOString(),
        client,
        offreDetails: demande.details,
        paiements: [],
        lignes: [],
      };
      return { reservation, token: `jeton-${reference}` };
    },
    async listerReservations() {
      return options.enAttente ?? [];
    },
    async compterEssai(cle: string) {
      const n = (etat.compteurs.get(cle) ?? 0) + 1;
      etat.compteurs.set(cle, n);
      return n;
    },
    async confirmerPaiement(reference: string, transaction: string) {
      etat.confirmations.push(`${reference}:${transaction}`);
      return { reservation: { reference, statut: "CONFIRMEE" }, dejaConfirmee: false };
    },
    async trouverPreuve(id: string) {
      return options.preuves?.[id] ?? null;
    },
    async trouverReservationParReference(reference: string) {
      return (options.reservationsConnues ?? []).find((r) => r.reference === reference) ?? null;
    },
    async listerReservationsRoadTripGroupe(filtre: { avecReduction: boolean }) {
      return (options.reductions ?? []).filter((r) => (filtre.avecReduction ? r.reductionXof > 0 : r.reductionXof === 0));
    },
    async trouverReservationParPaiement(referencePaiement: string) {
      return options.dejaVendue && options.dejaVendue.referencePaiement === referencePaiement ? options.dejaVendue : null;
    },
    async journaliser(evenement: Record<string, unknown>) {
      etat.journal.push(evenement);
      return { id: "j", details: {}, creeLe: "", ...evenement };
    },
    async listerJournal() {
      return [];
    },
  };
  const envoi = (nom: string) => async (reservation: { reference: string }) => {
    etat.emails.push(`${nom}:${reservation.reference}`);
    return { envoye: true };
  };
  const deps = {
    depot,
    maintenant: () => options.maintenant ?? MAINTENANT,
    lireReglages: async () => options.lecture ?? { reglages: REGLAGES_OFFRES_PAR_DEFAUT, source: "defaut" },
    lireOuverture: async () => ({ offresGroupeActives: options.actives ?? true, joursFermes: options.joursFermes ?? [] }),
    fournisseur: () => options.fournisseur ?? "saspay",
    encaisser: async (demande: Record<string, unknown>) => {
      etat.encaissements.push(demande);
      return (
        options.paiement ?? {
          statut: "EN_ATTENTE",
          fournisseur: "saspay",
          referenceTransaction: "pay_1",
          suivi: { paiementId: "pay_1", moyen: "MTN_MONEY", telephone: "0197000000" },
        }
      );
    },
    emails: {
      reception: envoi("reception"),
      confirmation: envoi("confirmation"),
      facture: envoi("facture"),
      alerteAdmin: envoi("alerte"),
    },
    urlSite: () => "https://site.test",
  };
  return { deps, etat };
}

const bikeForAll = (saisie: Record<string, unknown> = {}, date = MARDI) => ({
  offre: "bike-for-all",
  date,
  saisie: { mode: "budget", personnes: 10, budgetXof: 10000, depart: "08:00", ...saisie },
});
const roadTrip = (saisie: Record<string, unknown> = {}, date = SAMEDI) => ({
  offre: "road-trip-groupe",
  date,
  saisie: { personnes: 10, ...saisie },
});
const gbashi = (velos: Record<string, number> = { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }, date = DIMANCHE) => ({
  offre: "gbashi-groupe",
  date,
  saisie: { velos },
});
const client = { prenom: "Awa", nom: "Test", email: "awa.test@example.com", telephone: "+229 01 97 00 00 00" };
const reservation = (devis: Record<string, unknown>, totalXof: number, extra: Record<string, unknown> = {}) => ({
  ...devis,
  client,
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
  attendu: { totalXof },
  ...extra,
});
const devis = (corps: unknown, options?: Options) => {
  const f = faux(options);
  return service.devisOffreGroupe(corps, f.deps).then((r: { statut: number; corps: Record<string, any> }) => ({ ...r, etat: f.etat }));
};
const reserver = (corps: unknown, options?: Options, ip = "10.0.0.1") => {
  const f = faux(options);
  return service.reserverOffreGroupe(corps, { ip }, f.deps).then((r: { statut: number; corps: Record<string, any> }) => ({ ...r, etat: f.etat }));
};

/* ------------------------------------------------------------- Devis */

console.log("\n— Devis : interrupteur, réglages, saisie");
{
  const ferme = await devis(bikeForAll(), { actives: false });
  verifier("interrupteur coupé : 403 FERME", [ferme.statut, ferme.corps.code], [403, "FERME"]);
  verifier("interrupteur coupé : aucun parc lu", ferme.etat.parcsLus, []);
  const illisible = await devis(bikeForAll(), { lecture: { reglages: REGLAGES_OFFRES_PAR_DEFAUT, source: "illisible", probleme: "x" } });
  verifier("réglages illisibles : 503 REGLAGES_ILLISIBLES, jamais le prix par défaut", [illisible.statut, illisible.corps.code], [503, "REGLAGES_ILLISIBLES"]);
  const saisie = await devis({ offre: "bike-for-all", date: MARDI, saisie: { mode: "budget", personnes: "dix" } });
  verifier("saisie illisible : 400 SAISIE", [saisie.statut, saisie.corps.code], [400, "SAISIE"]);
  verifier("le message ne parle pas anglais", /Required|Expected/.test(saisie.corps.message), false);
}

console.log("\n— Devis : les cas du tableur, en ligne");
{
  const cas2 = await devis(bikeForAll());
  const r = cas2.corps.issue.resultat;
  verifier("Bike for All, 10 pers., 10 000 F : 200", cas2.statut, 200);
  verifier("cas 2 : petit coco, 45 min, 11 250 F, barré 17 250 F", [r.coco, r.minutes, r.totalXof, r.prixBarreXof, r.canal], ["petit", 45, 11250, 17250, "en-ligne"]);
  verifier("commission SasPay 3,25 % sur une ligne, et le montant débité", [cas2.corps.commissionXof, cas2.corps.montantADebiterXof], [366, 11616]);
  verifier("capacité : les 18 vélos libres sur le créneau", [cas2.corps.capacite.velosLibres, cas2.corps.capacite.parGamme], [18, { CLASSIQUE: 8, PREMIUM: 8, PRESTIGE: 2 }]);
  verifier("créneau libre : pas de proposition", cas2.corps.prochainCreneau, null);

  const cas7 = await devis(roadTrip());
  verifier("cas 7 : road trip 10 pers., 31 250 F, pas de prix barré", [cas7.corps.issue.resultat.totalXof, cas7.corps.issue.resultat.prixBarreXof], [31250, null]);
  verifier("sans preuve citée, pas de statut de preuve", "preuve" in cas7.corps, false);

  const cas9 = await devis(gbashi());
  verifier("cas 9 : Gbashi 2 Classique, 2 Premium, 1 Prestige : 20 125 F", cas9.corps.issue.resultat.totalXof, 20125);
}

console.log("\n— Devis : la réduction seulement avec une preuve validée et libre");
{
  const payee = { reference: "BL-PAYEE", statut: "CONFIRMEE", creeLe: new Date(MAINTENANT - 60 * MINUTE).toISOString() };
  const expiree = { reference: "BL-EXPIRE", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 45 * MINUTE).toISOString() };
  const enCours = { reference: "BL-ENCOURS", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 10 * MINUTE).toISOString() };
  const preuves = {
    ok: { id: "ok", statut: "validee" },
    attente: { id: "attente", statut: "en_attente" },
    refusee: { id: "refusee", statut: "refusee" },
    servie: { id: "servie", statut: "validee", reference: "BL-PAYEE" },
    liberee: { id: "liberee", statut: "validee", reference: "BL-EXPIRE" },
    retenue: { id: "retenue", statut: "validee", reference: "BL-ENCOURS" },
  };
  const options = { preuves, reservationsConnues: [payee, expiree, enCours] };
  const cas = async (preuveId: string) => {
    const d = await devis(roadTrip({ preuveId }), options);
    return [d.corps.preuve, d.corps.issue.resultat.totalXof, d.corps.issue.resultat.prixBarreXof];
  };
  verifier("cas 8 : preuve validée et libre : 30 050 F, barré 31 250 F", await cas("ok"), ["validee", 30050, 31250]);
  verifier("preuve en attente : pas de réduction", await cas("attente"), ["en_attente", 31250, null]);
  verifier("preuve refusée : pas de réduction", await cas("refusee"), ["refusee", 31250, null]);
  verifier("preuve inconnue : pas de réduction", await cas("n-existe-pas"), ["inconnue", 31250, null]);
  verifier("preuve déjà servie à un groupe payé : pas de réduction", await cas("servie"), ["deja-utilisee", 31250, null]);
  verifier("preuve d'une demande en attente depuis 10 min : retenue", await cas("retenue"), ["deja-utilisee", 31250, null]);
  verifier("preuve d'une demande jamais payée, expirée : de nouveau libre", await cas("liberee"), ["validee", 30050, 31250]);
  const bfa = await devis({ ...bikeForAll(), saisie: { ...bikeForAll().saisie, preuveId: "ok" } }, options);
  verifier("Bike for All : une preuve citée ne change rien", [bfa.corps.issue.resultat.totalXof, "preuve" in bfa.corps], [11250, false]);
}

console.log("\n— Décision 25 : la réduction des abonnés, une seule fois par client");
{
  const capture = { id: "pr", statut: "validee", email: "awa.test@example.com", telephone: "+229 01 97 00 00 00" };
  const dejaReduit = (champs: Record<string, unknown>) => ({
    reference: "BL-REDUIT",
    statut: "CONFIRMEE",
    creeLe: new Date(MAINTENANT - 5 * 24 * 60 * MINUTE).toISOString(),
    email: "quelquun@example.com",
    telephone: "+229 01 90 90 90 90",
    reductionXof: 1200,
    ...champs,
  });
  const auDevis = async (reductions: Record<string, unknown>[]) => {
    const d = await devis(roadTrip({ preuveId: "pr" }), { preuves: { pr: capture }, reductions });
    return [d.corps.preuve, d.corps.issue.resultat.totalXof, d.corps.issue.resultat.prixBarreXof];
  };
  verifier("au devis, le numéro de la capture a déjà eu la réduction : « deja-eue », prix normal", await auDevis([dejaReduit({ telephone: "0197000000" })]), ["deja-eue", 31250, null]);
  verifier("au devis, l'email de la capture (casse mise à part) : « deja-eue »", await auDevis([dejaReduit({ email: "AWA.TEST@example.com" })]), ["deja-eue", 31250, null]);
  verifier("réduction annulée, ou demande jamais payée expirée : de nouveau possible", [
    await auDevis([dejaReduit({ telephone: "0197000000", statut: "ANNULEE" })]),
    await auDevis([dejaReduit({ email: "awa.test@example.com", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT - 45 * MINUTE).toISOString() })]),
  ], [["validee", 30050, 31250], ["validee", 30050, 31250]]);
  verifier("un autre client a eu la réduction : rien ne change", await auDevis([dejaReduit({})]), ["validee", 30050, 31250]);

  // En réservant : le contact de la réservation compte aussi, avant tout paiement.
  const parLaReservation = await reserver(
    reservation(roadTrip({ preuveId: "pr" }), 30050, { client: { ...client, email: "nouvelle@example.com", telephone: "+229 01 61 61 61 61" } }),
    { preuves: { pr: { ...capture, email: "autre.capture@example.com", telephone: "0150505050" } }, reductions: [dejaReduit({ email: "nouvelle@example.com" })] },
  );
  verifier("en réservant, l'email de la réservation a déjà eu la réduction : 409 avant tout paiement, avec la phrase", [
    parLaReservation.statut,
    parLaReservation.corps.code,
    espaces(parLaReservation.corps.message),
    parLaReservation.corps.devis?.preuve,
    parLaReservation.corps.devis?.issue?.resultat?.totalXof,
    parLaReservation.etat.creees.length,
    parLaReservation.etat.encaissements.length,
  ], [409, "REGLAGES", "Vous avez déjà eu la réduction de 4 % : elle vaut une seule fois par client.", "deja-eue", 31250, 0, 0]);
  const auPrixNormal = await reserver(reservation(roadTrip({ preuveId: "pr" }), 31250), { preuves: { pr: capture }, reductions: [dejaReduit({ telephone: "0197000000" })] });
  const ecrite = auPrixNormal.etat.creees[0] as Record<string, any>;
  verifier("confirmé au prix normal : écrite sans la capture (elle n'est pas consommée)", [auPrixNormal.statut, ecrite.totalXof, "preuveId" in ecrite, ecrite.details.reductionXof], [201, 31250, false, 0]);

  // Deux réservations simultanées : le dépôt refuse la seconde dans sa transaction (« deja-eue »).
  const reductions: Record<string, unknown>[] = [];
  const course = await reserver(reservation(roadTrip({ preuveId: "pr" }), 30050), {
    preuves: { pr: capture },
    reductions,
    creer: () => {
      // L'autre réservation du même client vient de prendre la réduction, à la même seconde.
      reductions.push(dejaReduit({ reference: "BL-LAUTRE", email: "awa.test@example.com", statut: "EN_ATTENTE_PAIEMENT", creeLe: new Date(MAINTENANT).toISOString() }));
      const e = new Error("Ce client a déjà eu la réduction des abonnés : elle vaut une seule fois par client.");
      e.name = "PreuveReductionInutilisableError";
      throw e;
    },
  });
  verifier("course perdue : 409 REGLAGES, la phrase de la décision 25, le prix normal à confirmer", [
    course.statut,
    course.corps.code,
    espaces(course.corps.message),
    course.corps.devis?.preuve,
    course.corps.devis?.issue?.resultat?.totalXof,
  ], [409, "REGLAGES", "Vous avez déjà eu la réduction de 4 % : elle vaut une seule fois par client.", "deja-eue", 31250]);

  // Défaut 13 : réduction réglée à 0 %, la capture validée n'est pas consommée.
  const zero = { reglages: { ...REGLAGES_OFFRES_PAR_DEFAUT, roadTrip: { ...REGLAGES_OFFRES_PAR_DEFAUT.roadTrip, reduction: 0 } }, source: "base" };
  const aZero = await reserver(reservation(roadTrip({ preuveId: "pr" }), 31250), { preuves: { pr: capture }, lecture: zero });
  const ecriteAZero = aZero.etat.creees[0] as Record<string, any>;
  verifier("réduction à 0 % : réservée au prix normal, la capture reste libre pour plus tard", [aZero.statut, ecriteAZero.totalXof, "preuveId" in ecriteAZero], [201, 31250, false]);
}

console.log("\n— Devis : plein, et le créneau libre le plus proche");
{
  // Mardi : 12 vélos pris de 8 h à 9 h, il en reste 6.
  const plein = await devis(bikeForAll(), { occupations: { [MARDI]: pris(12, 480, 540) } });
  verifier("Bike for All à 8 h : refus PARC, 6 vélos au plus", [plein.corps.issue.ok, plein.corps.issue.refus.code, plein.corps.issue.refus.maximum], [false, "PARC", 6]);
  verifier("capacité du créneau : 6", plein.corps.capacite.velosLibres, 6);
  verifier("proposition : 9 h le même jour, premier départ où les 10 vélos sont libres 45 min", plein.corps.prochainCreneau, { date: MARDI, depart: "09:00" });
  verifier("pas de commission sur un refus", ["commissionXof" in plein.corps, "montantADebiterXof" in plein.corps], [false, false]);

  // Aujourd'hui, 10 h : 12 vélos pris de 12 h à 13 h. 11 h 15 serait libre,
  // mais en ligne il faut réserver 2 h avant : le moteur le refuse.
  const aujourdhui = await devis(bikeForAll({ depart: "12:00" }, LUNDI), { occupations: { [LUNDI]: pris(12, 720, 780) } });
  verifier("le jour même : refus PARC à 12 h", aujourdhui.corps.issue.refus?.code, "PARC");
  verifier("proposition : 13 h, pas 11 h 15 (trop proche pour réserver en ligne)", aujourdhui.corps.prochainCreneau, { date: LUNDI, depart: "13:00" });

  // Samedi : 10 vélos pris toute la matinée ; dimanche libre.
  const rt = await devis(roadTrip(), { occupations: { [SAMEDI]: pris(10, 480, 720) } });
  verifier("road trip samedi : refus PARC, 8 vélos au plus", [rt.corps.issue.refus.code, rt.corps.issue.refus.maximum], ["PARC", 8]);
  verifier("proposition : dimanche, à l'heure du road trip", rt.corps.prochainCreneau, { date: DIMANCHE, depart: "08:00" });

  const stock = await devis(gbashi({ PRESTIGE: 3, PREMIUM: 2 }));
  verifier("Gbashi : 3 Prestige pour 2 au parc, refus STOCK_GAMME", [stock.corps.issue.refus.code, stock.corps.issue.refus.gamme, stock.corps.issue.refus.maximum], ["STOCK_GAMME", "PRESTIGE", 2]);
  verifier("aucun dimanche n'a 3 Prestige : pas de proposition", stock.corps.prochainCreneau, null);
  verifier("3 Prestige pour 2 au parc : aucune autre date relue, la recherche s'arrête", stock.etat.parcsLus.length, 1);
  const enorme = await devis(roadTrip({ personnes: 40 }));
  verifier("road trip de 40 pour 18 vélos : pas de proposition, un seul parc lu", [enorme.corps.prochainCreneau, enorme.etat.parcsLus.length], [null, 1]);

  const ferme = await devis(roadTrip(), { joursFermes: [{ id: "f", date: SAMEDI, formule: "toutes", creeLe: "" }] });
  verifier("jour fermé à toutes les formules : aucun vélo en ligne, refus PARC", [ferme.corps.issue.refus.code, ferme.corps.capacite.velosLibres], ["PARC", 0]);
  verifier("jour fermé : le lendemain proposé", ferme.corps.prochainCreneau, { date: DIMANCHE, depart: "08:00" });
  const fermeRoadTrip = await devis(bikeForAll({}, SAMEDI), { joursFermes: [{ id: "f", date: SAMEDI, formule: "road-trip", creeLe: "" }] });
  verifier("jour fermé au road trip : Bike for All reste ouvert", fermeRoadTrip.corps.issue.ok, true);
  const rtFerme = await devis(roadTrip(), { joursFermes: [{ id: "f", date: SAMEDI, formule: "road-trip", creeLe: "" }] });
  verifier("jour fermé au road trip : le road trip en groupe aussi (décision 1)", rtFerme.corps.issue.refus?.code, "PARC");
}

console.log("\n— Devis : limite par adresse");
{
  const f = faux();
  let dernier = { statut: 0, corps: {} as Record<string, any> };
  for (let i = 0; i <= service.DEVIS_PAR_HEURE_ADRESSE; i += 1) {
    dernier = await service.devisOffreGroupe(bikeForAll(), f.deps, { ip: "10.9.9.9" });
  }
  verifier(`${service.DEVIS_PAR_HEURE_ADRESSE + 1}e devis de la même adresse en une heure : 429`, [dernier.statut, dernier.corps.code], [429, "TROP_DE_DEMANDES"]);
  const autre = await service.devisOffreGroupe(bikeForAll(), f.deps, { ip: "10.9.9.8" });
  verifier("une autre adresse : 200", autre.statut, 200);
}

/* ------------------------------------------------------- Réservation */

console.log("\n— Réservation : refus");
{
  const prix = await reserver(reservation(bikeForAll(), 10000));
  verifier("prix affiché différent : 409 REGLAGES, avec le nouveau devis", [prix.statut, prix.corps.code, prix.corps.devis?.issue?.resultat?.totalXof], [409, "REGLAGES", 11250]);
  verifier("prix changé : rien d'écrit, rien d'encaissé", [prix.etat.creees.length, prix.etat.encaissements.length], [0, 0]);

  const dispo = await reserver(reservation(bikeForAll(), 11250), { occupations: { [MARDI]: pris(12, 480, 540) } });
  verifier("créneau plein : 409 DISPO, avec le créneau le plus proche", [dispo.statut, dispo.corps.code, dispo.corps.prochainCreneau], [409, "DISPO", { date: MARDI, depart: "09:00" }]);

  const pris2 = await reserver(reservation(bikeForAll(), 11250), {
    creer: () => {
      throw new CapaciteInsuffisanteError(4, { CLASSIQUE: 4, PREMIUM: 0, PRESTIGE: 0 });
    },
  });
  verifier("vélos pris pendant l'écriture : 409 DISPO", [pris2.statut, pris2.corps.code], [409, "DISPO"]);
  verifier("vélos pris pendant l'écriture : rien d'encaissé", pris2.etat.encaissements.length, 0);

  const attente = {
    reference: "BL-ATTEND",
    offre: "bike-for-all",
    statut: "EN_ATTENTE_PAIEMENT",
    dateDebut: MARDI,
    creeLe: new Date(MAINTENANT - 5 * MINUTE).toISOString(),
    client: { email: "AWA.TEST@example.com", telephone: "" },
  };
  const doublon = await reserver(reservation(bikeForAll(), 11250), { enAttente: [attente] });
  verifier("même email, demande en attente ce jour : 409 EN_ATTENTE", [doublon.statut, doublon.corps.code], [409, "EN_ATTENTE"]);
  verifier("le message cite la référence en attente", doublon.corps.message.includes("BL-ATTEND"), true);
  const parNumero = await reserver(reservation(bikeForAll(), 11250), {
    enAttente: [{ ...attente, client: { email: "autre@example.com", telephone: "0197000000" } }],
  });
  verifier("même numéro : 409 EN_ATTENTE", parNumero.corps.code, "EN_ATTENTE");
  const expiree = await reserver(reservation(bikeForAll(), 11250), {
    enAttente: [{ ...attente, creeLe: new Date(MAINTENANT - 31 * MINUTE).toISOString() }],
  });
  verifier("demande expirée (31 min) : on peut réserver de nouveau", expiree.statut, 201);

  const refus = await reserver(reservation(bikeForAll({ depart: "11:00" }, LUNDI), 11250));
  verifier("départ à moins de 2 h : 422 REFUS DELAI", [refus.statut, refus.corps.code, refus.corps.refus?.code], [422, "REFUS", "DELAI"]);
  const jour = await reserver(reservation(roadTrip({}, MARDI), 31250));
  verifier("road trip un mardi : 422 REFUS JOUR", [jour.statut, jour.corps.refus?.code], [422, "JOUR"]);

  const ferme = await reserver(reservation(bikeForAll(), 11250), { actives: false });
  verifier("interrupteur coupé : 403 FERME", [ferme.statut, ferme.corps.code], [403, "FERME"]);
  const sansPaiement = await reserver(reservation(bikeForAll(), 11250), { fournisseur: "indisponible" });
  verifier("aucun moyen de payer : 503 PAIEMENT, rien d'écrit", [sansPaiement.statut, sansPaiement.corps.code, sansPaiement.etat.creees.length], [503, "PAIEMENT", 0]);
  const sansCgv = await reserver({ ...reservation(bikeForAll(), 11250), cgvAcceptees: false });
  verifier("CGV non acceptées : 400 SAISIE", [sansCgv.statut, sansCgv.corps.code], [400, "SAISIE"]);
  const sansEmail = await reserver({ ...reservation(bikeForAll(), 11250), client: { ...client, email: "" } });
  verifier("email obligatoire (décision 14) : 400 SAISIE", sansEmail.corps.code, "SAISIE");
}

console.log("\n— Réservation : limite de débit");
{
  const f = faux();
  let dernier = { statut: 0, corps: {} as Record<string, unknown> };
  for (let i = 0; i < 13; i += 1) {
    dernier = await service.reserverOffreGroupe(
      reservation(bikeForAll(), 11250, { client: { ...client, email: `c${i}@example.com`, telephone: `0197${String(i).padStart(6, "0")}` } }),
      { ip: "10.9.9.9" },
      f.deps,
    );
  }
  verifier("13e demande de la même adresse en une heure : 429 TROP_DE_DEMANDES", [dernier.statut, dernier.corps.code], [429, "TROP_DE_DEMANDES"]);
  const g = faux();
  for (let i = 0; i < 7; i += 1) {
    dernier = await service.reserverOffreGroupe(reservation(bikeForAll(), 11250), { ip: `10.8.8.${i}` }, g.deps);
  }
  verifier("7e demande du même numéro en une heure : 429", dernier.statut, 429);
}

console.log("\n— Réservation : succès, au bon montant et au bon canal");
{
  const ok = await reserver(reservation(bikeForAll(), 11250, { message: "Anniversaire de Kossi" }));
  const ecrite = ok.etat.creees[0] as Record<string, any>;
  verifier("201 et la référence", [ok.statut, ok.corps.ok, ok.corps.reference], [201, true, "BL-T22221"]);
  verifier("écrite : Bike for All, mardi, 8 h à 8 h 45, 10 vélos toutes gammes", [ecrite.offre, ecrite.date, ecrite.debutMinute, ecrite.finMinute, ecrite.velos, ecrite.nombrePersonnes], ["bike-for-all", MARDI, 480, 525, 10, 10]);
  verifier(
    "écrite : 11 250 F, canal en ligne, récapitulatif du moteur",
    [ecrite.totalXof, ecrite.details.canal, espaces(ecrite.details.recapitulatif).startsWith("BIKE FOR ALL : Cher client, pour votre groupe de 10 personnes, vous paierez 11 250 F")],
    [11250, "en-ligne", true],
  );
  verifier("écrite : instantané (petit coco, 10 cocos, règle de retard, lignes du prix)", [ecrite.details.coco, ecrite.details.cocos, ecrite.details.retard, ecrite.details.lignes.length > 0], ["petit", 10, { toleranceMinutes: 7, penaliteParMinuteXof: 1000 }, true]);
  verifier("écrite : client, Mobile Money, CGV, message, sans preuve", [ecrite.client.email, ecrite.moyenPaiement, ecrite.cgvAcceptees, ecrite.message, "preuveId" in ecrite, "encaissement" in ecrite], ["awa.test@example.com", "MTN_MONEY", true, "Anniversaire de Kossi", false, false]);
  const encaissement = ok.etat.encaissements[0] as Record<string, any>;
  verifier("encaissé : le total de la réservation (SasPay ajoute sa commission), la référence", [encaissement.montantXof, encaissement.reference, encaissement.moyen], [11250, "BL-T22221", "MTN_MONEY"]);
  verifier("réponse : montant débité, lien de suivi, paiement en attente et son suivi", [ok.corps.totalXof, ok.corps.montantADebiterXof, ok.corps.lienSuivi, ok.corps.paiement.statut, ok.corps.paiement.suivi.paiementId], [11250, 11616, "https://site.test/reservation/jeton-BL-T22221", "EN_ATTENTE", "pay_1"]);
  verifier("paiement en attente : l'accusé de réception part, rien n'est confirmé", [ok.etat.emails, ok.etat.confirmations], [["reception:BL-T22221"], []]);

  const demo = await reserver(reservation(bikeForAll(), 11250), {
    fournisseur: "demo",
    paiement: { statut: "REUSSI", fournisseur: "demo", referenceTransaction: "DEMO-X" },
  });
  verifier("démonstration : confirmée tout de suite, emails de confirmation", [demo.etat.confirmations, demo.etat.emails.sort()], [["BL-T22221:DEMO-X"], ["alerte:BL-T22221", "confirmation:BL-T22221", "facture:BL-T22221"]]);

  const echec = await reserver(reservation(bikeForAll(), 11250), {
    paiement: { statut: "ECHOUE", fournisseur: "saspay", referenceTransaction: "", message: "Solde insuffisant" },
  });
  verifier("paiement refusé : 201, statut ECHOUE et un message pour le client, réservation gardée 30 min", [echec.statut, echec.corps.paiement.statut, typeof echec.corps.paiement.message, echec.etat.creees.length], [201, "ECHOUE", "string", 1]);
  verifier("paiement refusé : le lien de suivi part quand même par email, pour relancer le paiement", echec.etat.emails, ["reception:BL-T22221"]);

  // Le navigateur ne décide de rien : canal, réduction et total glissés dans la demande sont ignorés.
  const triche = await reserver({
    ...reservation(roadTrip({ reductionValidee: true }), 31250),
    canal: "comptoir",
    totalXof: 1,
    reductionXof: 1200,
  });
  const ecriteTriche = triche.etat.creees[0] as Record<string, any>;
  verifier("triche : prix en ligne plein (31 250 F), sans réduction, canal en ligne", [triche.statut, ecriteTriche.totalXof, ecriteTriche.details.reductionXof, ecriteTriche.details.canal], [201, 31250, 0, "en-ligne"]);
  verifier("triche : encaissé 31 250 F", (triche.etat.encaissements[0] as Record<string, unknown>).montantXof, 31250);

  const avecPreuve = await reserver(reservation(roadTrip({ preuveId: "ok" }), 30050), { preuves: { ok: { id: "ok", statut: "validee" } } });
  const ecritePreuve = avecPreuve.etat.creees[0] as Record<string, any>;
  verifier("road trip avec preuve validée : 30 050 F, la preuve consommée avec la réservation", [avecPreuve.statut, ecritePreuve.totalXof, ecritePreuve.preuveId, ecritePreuve.details.reductionXof], [201, 30050, "ok", 1200]);

  const preuves = { ok: { id: "ok", statut: "validee" } as Record<string, unknown> };
  const preuvePrise = await reserver(reservation(roadTrip({ preuveId: "ok" }), 30050), {
    preuves,
    reservationsConnues: [{ reference: "BL-AUTRE", statut: "CONFIRMEE", creeLe: new Date(MAINTENANT).toISOString() }],
    creer: () => {
      // Un autre groupe vient de la consommer, à la même seconde.
      preuves.ok = { id: "ok", statut: "validee", reference: "BL-AUTRE" };
      const e = new Error("Cette preuve de réduction a déjà servi pour une autre réservation.");
      e.name = "PreuveReductionInutilisableError";
      throw e;
    },
  });
  verifier("preuve consommée entre-temps : 409 REGLAGES, nouveau prix sans réduction", [preuvePrise.statut, preuvePrise.corps.code, preuvePrise.corps.devis?.preuve, preuvePrise.corps.devis?.issue?.resultat?.totalXof], [409, "REGLAGES", "deja-utilisee", 31250]);

  const gb = await reserver(reservation(gbashi(), 20125));
  const ecriteGbashi = gb.etat.creees[0] as Record<string, any>;
  verifier("Gbashi : les vélos de chaque gamme, 7 h à 11 h", [ecriteGbashi.velos, ecriteGbashi.debutMinute, ecriteGbashi.finMinute], [{ CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }, 420, 660]);
}

/* ---------------------------------------------------------- Comptoir */

console.log("\n— Comptoir");
{
  const vendre = (corps: unknown, options?: Options) => {
    const f = faux(options);
    return service.vendreAuComptoir(corps, f.deps).then((r: { statut: number; corps: Record<string, any> }) => ({ ...r, etat: f.etat }));
  };
  const devisComptoir = await vendre({ action: "devis", ...bikeForAll() });
  verifier("devis au comptoir : 10 000 F, sans les 125 F, sans commission", [devisComptoir.statut, devisComptoir.corps.issue.resultat.totalXof, devisComptoir.corps.issue.resultat.canal, devisComptoir.corps.commissionXof], [200, 10000, "comptoir", 0]);
  // Décision 26 : jamais de réduction au comptoir, même pour un groupe qui montre son abonnement.
  const roadTripComptoir = await vendre({ action: "devis", ...roadTrip() });
  verifier("décision 26 : road trip au comptoir, 30 000 F, aucune réduction", [
    roadTripComptoir.corps.issue.resultat.totalXof,
    roadTripComptoir.corps.issue.resultat.reductionXof,
    roadTripComptoir.corps.issue.resultat.prixBarreXof,
    "preuve" in roadTripComptoir.corps,
  ], [30000, 0, null, false]);
  // Même une capture validée citée dans la demande (le formulaire n'en envoie jamais) ne compte pas au comptoir.
  const capturePresentee = await vendre({ action: "devis", ...roadTrip({ preuveId: "ok" }) }, { preuves: { ok: { id: "ok", statut: "validee" } } });
  verifier("décision 26 : une capture validée citée au comptoir est ignorée, 30 000 F", [
    capturePresentee.corps.issue.resultat.totalXof,
    capturePresentee.corps.issue.resultat.reductionXof,
    "preuve" in capturePresentee.corps,
  ], [30000, 0, false]);
  const venteAvecCapture = await vendre(
    {
      ...roadTrip({ preuveId: "ok" }),
      client: { prenom: "Koffi", nom: "Client", email: "koffi.capture@example.com", telephone: "" },
      encaissePar: "Koffi",
      attendu: { totalXof: 30000 },
      cleVente: "vente-capture-1",
      cgvAcceptees: true,
    },
    { preuves: { ok: { id: "ok", statut: "validee" } } },
  );
  const ecriteAvecCapture = venteAvecCapture.etat.creees[0] as Record<string, any> | undefined;
  verifier("décision 26 : vente au comptoir avec une capture citée, au prix normal, la capture n'est pas consommée", [
    venteAvecCapture.statut,
    ecriteAvecCapture?.totalXof,
    ecriteAvecCapture ? "preuveId" in ecriteAvecCapture : null,
  ], [201, 30000, false]);

  const vente = {
    ...roadTrip(),
    client: { prenom: "Koffi", nom: "Client", email: "koffi.client@example.com", telephone: "" },
    encaissePar: "Koffi",
    attendu: { totalXof: 30000 },
    cleVente: "vente-abc-123",
    cgvAcceptees: true,
  };
  // Vendredi 20 h : en ligne, le samedi est clos ; au comptoir, non.
  const vendredi = Date.parse("2026-11-20T19:00:00Z");
  const enLigne = await reserver(reservation(roadTrip(), 31250), { maintenant: vendredi });
  verifier("vendredi 20 h, en ligne : samedi refusé (date limite)", enLigne.corps.refus?.code, "DATE_LIMITE");
  const ok = await vendre(vente, { maintenant: vendredi, joursFermes: [{ id: "f", date: SAMEDI, formule: "toutes", creeLe: "" }] });
  const ecrite = ok.etat.creees[0] as Record<string, any>;
  verifier("comptoir : 201, ni date limite ni jour fermé", [ok.statut, ok.corps.ok], [201, true]);
  verifier("comptoir : 30 000 F, en espèces, au nom de qui a reçu l'argent", [ecrite.totalXof, ecrite.moyenPaiement, ecrite.encaissement, ecrite.details.canal], [30000, "ESPECES", { par: "Koffi", reference: "ESP-vente-abc-123" }, "comptoir"]);
  verifier("comptoir : au journal, signé admin (Koffi)", ok.etat.journal.map((j) => [j.type, j.auteur]), [["vente-comptoir-groupe", "admin (Koffi)"]]);
  verifier("comptoir : confirmation, facture et alerte, lien de suivi", [ok.etat.emails.length, ok.corps.lienSuivi, ok.corps.emailEnvoye], [3, "https://site.test/reservation/jeton-BL-T22221", true]);
  verifier("comptoir : rien n'est encaissé par SasPay", ok.etat.encaissements.length, 0);

  const deuxFois = await vendre(vente, { dejaVendue: { referencePaiement: "ESP-vente-abc-123", reference: "BL-T22221", totalXof: 30000 } });
  verifier("la même saisie deux fois : 200, déjà enregistrée, rien de plus", [deuxFois.statut, deuxFois.corps.deja, deuxFois.etat.creees.length], [200, true, 0]);
  const montant = await vendre({ ...vente, attendu: { totalXof: 31250 } });
  verifier("montant vu différent : 409 REGLAGES, rien d'écrit", [montant.statut, montant.corps.code, montant.etat.creees.length], [409, "REGLAGES", 0]);
  const sansNom = await vendre({ ...vente, encaissePar: "" });
  verifier("sans le prénom de qui a reçu l'argent : 400, message en français", [sansNom.statut, sansNom.corps.message], [400, "Indiquez qui a reçu l'argent."]);
  const ferme = await vendre(vente, { actives: false });
  verifier("interrupteur coupé : pas de vente de groupe au comptoir non plus", [ferme.statut, ferme.corps.code], [403, "FERME"]);
}

/* ------------------------------------------- Les routes, branchées au vrai dépôt */

console.log("\n— Routes, en démonstration (interrupteur coupé par défaut)");
{
  const { POST: routeDevis } = await charger("src/app/api/offres-groupe/devis/route.ts");
  const { POST: routeReservations } = await charger("src/app/api/offres-groupe/reservations/route.ts");
  const { POST: routeComptoir } = await charger("src/app/api/admin/offres-groupe/comptoir/route.ts");
  const { depot } = await charger("src/lib/db/index.ts");
  const { CLE_REGLAGES_OFFRES, CODE_INTERRUPTEUR_OFFRES } = await charger("src/data/reglages-offres.ts");
  const appeler = async (route: (r: Request) => Promise<Response>, corps: unknown) => {
    const reponse = await route(
      new Request("http://localhost/api/offres-groupe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }),
    );
    return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
  };
  verifier("devis : 403 FERME tant que l'interrupteur n'est pas ouvert", (await appeler(routeDevis, bikeForAll())).corps.code, "FERME");
  verifier("réservation : 403 FERME", (await appeler(routeReservations, reservation(bikeForAll(), 11250))).statut, 403);
  verifier("comptoir : 403 FERME", (await appeler(routeComptoir, { action: "devis", ...bikeForAll() })).corps.code, "FERME");
  process.env.BIKELAND_ROLE = "site";
  verifier("comptoir sur le site public : 401, sans session d'administration", (await appeler(routeComptoir, { action: "devis", ...bikeForAll() })).statut, 401);
  delete process.env.BIKELAND_ROLE;
  // Interrupteur ouvert, réglages enregistrés impossibles : jamais de vente aux valeurs par défaut.
  await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, true);
  await depot.ecrireParametreAdmin(CLE_REGLAGES_OFFRES, "{ pas du json");
  const illisible = await appeler(routeDevis, bikeForAll());
  verifier("interrupteur ouvert, réglages illisibles : 503 REGLAGES_ILLISIBLES", [illisible.statut, illisible.corps.code], [503, "REGLAGES_ILLISIBLES"]);
  const saisie = await appeler(routeReservations, { offre: "bike-for-all" });
  verifier("réservation mal formée : 400 SAISIE", [saisie.statut, saisie.corps.code], [400, "SAISIE"]);
  await depot.effacerParametreAdmin(CLE_REGLAGES_OFFRES);
  await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, false);
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
