// Réservation et paiement des offres de groupe (lot 5b), avec de faux
// dépôts, de faux emails et un faux encaissement : aucune base, aucun
// email, aucun paiement réel (le lanceur retire tous les secrets).
//  - Références d'essai (décision 17) : « BL-T… » hors production, jamais
//    en production, reconnues par SasPay ; liens des emails vers la branche
//    sur un aperçu.
//  - Confirmation du paiement d'une offre de groupe : payée une seule fois ;
//    payée après les 30 minutes, confirmée si les vélos sont encore libres,
//    sinon remboursement listé une seule fois et emails une seule fois, même
//    si SasPay rejoue ; rien ne change pour les autres offres.
//  - Emails des offres de groupe : confirmation avec le récapitulatif, les
//    lignes du prix et la règle de retard ; alerte avec tout ce qu'il faut
//    préparer ; remboursement. L'envoi est intercepté avant de sortir.
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
// Les espaces insécables (U+00A0, U+202F) comptent pour des espaces.
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

/* ------------------------------------------- Confirmation du paiement */

const { confirmerParSasPay } = await charger("src/lib/paiement-confirmation.ts");
const { ConflitDisponibiliteError } = await charger("src/lib/db/contrat.ts");
const { calculerBikeForAllBudget } = await charger("src/lib/offres/index.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT } = await charger("src/data/reglages-offres.ts");

// Lundi 16 novembre 2026, 10 h à Cotonou.
const MAINTENANT = Date.parse("2026-11-16T09:00:00Z");
const MINUTE = 60_000;
const PARC = Array.from({ length: 18 }, (_, i) => ({ id: `v${i + 1}`, nom: `Vélo ${i + 1}`, gamme: i < 8 ? "CLASSIQUE" : i < 16 ? "PREMIUM" : "PRESTIGE" }));
type Occupation = { veloId: string; debutMinute: number; finMinute: number };

/** Une réservation de groupe de 3 personnes, mardi de 8 h à 8 h 45, créée il y a `minutesAvant` minutes. */
const reservationGroupe = (minutesAvant: number, extra: Record<string, unknown> = {}) => ({
  id: "r1",
  reference: "BL-T23456",
  statut: "EN_ATTENTE_PAIEMENT",
  offre: "bike-for-all",
  nombrePersonnes: 3,
  dateDebut: "2026-11-17",
  dateFin: "2026-11-17",
  heureDebut: 8,
  heureFin: 9,
  minuteDebut: 480,
  minuteFin: 525,
  lignes: ["v1", "v2", "v3"].map((veloId) => ({ veloId, veloNom: veloId, veloSlug: veloId, prixUnitaireXof: 0, totalLigneXof: 0 })),
  totalXof: 11250,
  paiements: [{ id: "p1", fournisseur: "SASPAY", moyen: "MTN_MONEY", statut: "INITIE", montantXof: 11250, estCaution: false, creeLe: "" }],
  client: { id: "c1", prenom: "Awa", nom: "Test", email: "awa.test@example.com", telephone: "0197000000", creeLe: "" },
  creeLe: new Date(MAINTENANT - minutesAvant * MINUTE).toISOString(),
  ...extra,
});
const paiementSasPay = (id = "pay_A", debite = 11616) => ({
  id,
  statut: "SUCCESS",
  montantDemandeXof: 11250,
  montantDebiteXof: debite,
  montantNetXof: 11250,
  urlCheckout: "",
  reference: "BL-T23456",
});

function fauxConfirmation(reservation: Record<string, unknown>, options: { occupations?: Occupation[]; conflit?: boolean; estDisponible?: boolean } = {}) {
  const etat = {
    emails: [] as string[],
    marquees: [] as string[],
    confirmations: [] as string[],
    remboursements: [] as Record<string, unknown>[],
    demandesRemboursement: [] as Record<string, unknown>[],
  };
  const compteurs = new Map<string, number>();
  const depot = {
    async trouverReservationParReference() {
      return structuredClone(reservation);
    },
    async marquerTransactionRecue(_reference: string, transaction: string) {
      etat.marquees.push(transaction);
    },
    async estDisponible() {
      return options.estDisponible ?? true;
    },
    async confirmerPaiement(_reference: string, transaction: string) {
      if (options.conflit) throw new ConflitDisponibiliteError();
      if (reservation.statut !== "EN_ATTENTE_PAIEMENT") return { reservation: structuredClone(reservation), dejaConfirmee: true };
      reservation.statut = "CONFIRMEE";
      etat.confirmations.push(transaction);
      return { reservation: structuredClone(reservation), dejaConfirmee: false };
    },
    async parcDuJour(date: string) {
      return { date, velos: PARC, occupations: options.occupations ?? [] };
    },
    async creerRemboursement(champs: Record<string, unknown>) {
      etat.demandesRemboursement.push(champs);
      // Comme le dépôt de cette branche : la même demande (même montant, même
      // motif, qui cite la transaction) n'en crée pas une seconde.
      const existant = etat.remboursements.find((r) => r.montantXof === champs.montantXof && r.motif === champs.motif);
      if (existant) return existant;
      const cree = { id: `remb${etat.remboursements.length + 1}`, ...champs, statut: "a_faire" };
      etat.remboursements.push(cree);
      return cree;
    },
    async compterEssai(cle: string) {
      const n = (compteurs.get(cle) ?? 0) + 1;
      compteurs.set(cle, n);
      return n;
    },
  };
  const noter = (nom: string) => async (r: { reference: string }) => {
    etat.emails.push(`${nom}:${r.reference}`);
  };
  const emails = {
    confirmation: noter("confirmation"),
    facture: noter("facture"),
    notificationAdmin: noter("alerte"),
    remboursementClient: async (_r: unknown, montant: number) => {
      etat.emails.push(`remboursement-client:${montant}`);
    },
    remboursementAdmin: async (_r: unknown, montant: number, transaction: string) => {
      etat.emails.push(`remboursement-admin:${montant}:${transaction}`);
    },
  };
  return { deps: { depot, emails, maintenant: () => MAINTENANT }, etat };
}
const confirmer = (f: ReturnType<typeof fauxConfirmation>, paiement = paiementSasPay()) =>
  confirmerParSasPay({ reference: "BL-T23456", paiement, lienSuivi: "https://site.test/reservation/jeton" }, f.deps) as Promise<Record<string, any>>;

console.log("\n— Paiement d'une offre de groupe : payée une seule fois");
{
  const r = reservationGroupe(5);
  const f = fauxConfirmation(r);
  const premiere = await confirmer(f);
  verifier("à l'heure : confirmée, avec la transaction SasPay", [premiere.issue, f.etat.confirmations], ["confirmee", ["pay_A"]]);
  verifier("à l'heure : confirmation, facture et alerte, une fois", f.etat.emails, ["confirmation:BL-T23456", "facture:BL-T23456", "alerte:BL-T23456"]);
  const rejeu = await confirmer(f);
  verifier("notification rejouée : déjà confirmée, aucun email de plus", [rejeu.issue, f.etat.emails.length, f.etat.confirmations.length], ["deja-confirmee", 3, 1]);
  const petit = await confirmer(fauxConfirmation(reservationGroupe(5)), paiementSasPay("pay_B", 1000));
  verifier("montant débité insuffisant : refusée", petit.issue, "refusee");
}

console.log("\n— Paiement d'une offre de groupe après les 30 minutes");
{
  const libre = fauxConfirmation(reservationGroupe(45));
  verifier("vélos encore libres : confirmée (décision 6)", (await confirmer(libre)).issue, "confirmee");

  const siens = fauxConfirmation(reservationGroupe(45), {
    occupations: ["v1", "v2", "v3"].map((veloId) => ({ veloId, debutMinute: 480, finMinute: 525 })),
  });
  verifier("ses propres créneaux ne la gênent pas : confirmée", (await confirmer(siens)).issue, "confirmee");

  const apres = fauxConfirmation(reservationGroupe(45), { occupations: [{ veloId: "v2", debutMinute: 525, finMinute: 600 }] });
  verifier("un groupe qui part à 8 h 45, au retour du sien : confirmée", (await confirmer(apres)).issue, "confirmee");

  const r = reservationGroupe(45);
  const reprise = fauxConfirmation(r, { occupations: [{ veloId: "v2", debutMinute: 495, finMinute: 540 }] });
  const perdu = await confirmer(reprise);
  verifier("un vélo repris par un groupe de 8 h 15 : créneau perdu, remboursement listé", [perdu.issue, perdu.remboursementListe], ["creneau-perdu", true]);
  verifier("rien n'est confirmé", [r.statut, reprise.etat.confirmations], ["EN_ATTENTE_PAIEMENT", []]);
  const remboursement = reprise.etat.remboursements[0] ?? {};
  verifier(
    "remboursement : ce que le téléphone a payé (11 616 F), désigné par la transaction, écrit par le site",
    [reprise.etat.remboursements.length, remboursement.montantXof, remboursement.cleIdempotence, remboursement.par, String(remboursement.motif).includes("pay_A")],
    [1, 11616, "pay_A", "site", true],
  );
  verifier("la transaction est notée sur la réservation : elle ne confirmera rien d'autre", reprise.etat.marquees, ["pay_A"]);
  verifier("le client et Bike Land prévenus, sans email de confirmation", reprise.etat.emails, ["remboursement-client:11616", "remboursement-admin:11616:pay_A"]);
  await confirmer(reprise);
  await confirmer(reprise);
  verifier("rejoué deux fois : un seul remboursement, emails une seule fois", [reprise.etat.remboursements.length, reprise.etat.emails.length], [1, 2]);
  verifier("chaque demande rejouée porte la même clé", reprise.etat.demandesRemboursement.map((d) => d.cleIdempotence), ["pay_A", "pay_A", "pay_A"]);

  const transaction = fauxConfirmation(reservationGroupe(45), { conflit: true });
  const vuParLeDepot = await confirmer(transaction);
  verifier("vélos repris vus par la transaction du dépôt : remboursement aussi", [vuParLeDepot.issue, vuParLeDepot.remboursementListe, transaction.etat.remboursements.length], ["creneau-perdu", true, 1]);
}

console.log("\n— Les autres offres ne changent pas");
{
  const locationLibre = (minutesAvant: number) => reservationGroupe(minutesAvant, { offre: "location-libre", minuteDebut: undefined, minuteFin: undefined, nombrePersonnes: 1 });
  const aLheure = fauxConfirmation(locationLibre(5));
  verifier("location libre à l'heure : confirmée, les trois emails", [(await confirmer(aLheure)).issue, aLheure.etat.emails.length], ["confirmee", 3]);
  const tard = fauxConfirmation(locationLibre(45), { estDisponible: false });
  const perdu = await confirmer(tard);
  verifier("location libre payée tard, vélo repris : créneau perdu comme avant", [perdu.issue, perdu.remboursementListe], ["creneau-perdu", undefined]);
  verifier("location libre : ni remboursement listé ni email, la transaction notée comme avant", [tard.etat.remboursements.length, tard.etat.emails, tard.etat.marquees], [0, [], ["pay_A"]]);
}

/* ------------------------------------------- Emails des offres de groupe */

console.log("\n— Emails des offres de groupe (interceptés)");
{
  const envois: { a: string; sujet: string; html: string; texte: string }[] = [];
  process.env.RESEND_API_KEY = "cle-factice-test-local";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const corps = JSON.parse(String(init?.body));
    envois.push({ a: corps.to[0], sujet: corps.subject, html: corps.html, texte: corps.text });
    return new Response(JSON.stringify({ id: "test" }), { status: 200 });
  }) as typeof fetch;
  const email = await charger("src/lib/email.ts");

  // Cas 3 du tableur : Bike for All, 10 personnes, 10 000 F, avec accompagnateur.
  const issue = calculerBikeForAllBudget(
    { personnes: 10, budgetXof: 10000, depart: "08:00", accompagnateur: true },
    REGLAGES_OFFRES_PAR_DEFAUT,
    { canal: "en-ligne", date: "2026-11-17", maintenant: MAINTENANT, velosDisponibles: 18 },
  );
  const r = issue.resultat;
  const reservation = {
    ...reservationGroupe(5),
    statut: "CONFIRMEE",
    reference: "BL-T2K9QX",
    nombrePersonnes: 10,
    totalXof: r.totalXof,
    sousTotalXof: r.totalXof,
    remiseXof: 0,
    optionsXof: 0,
    cautionXof: 0,
    options: [],
    jours: 1,
    lignes: PARC.slice(0, 10).map((v) => ({ veloId: v.id, veloNom: v.nom, veloSlug: v.id, prixUnitaireXof: 0, totalLigneXof: 0 })),
    paiements: [{ id: "p1", fournisseur: "SASPAY", moyen: "MTN_MONEY", statut: "REUSSI", montantXof: r.totalXof, referenceFournisseur: "pay_X", estCaution: false, creeLe: "" }],
    offreDetails: {
      mode: "budget",
      budgetXof: 10000,
      minutes: r.minutes,
      depart: r.depart,
      retour: r.fin,
      coco: r.coco,
      cocos: r.cocos,
      eaux: r.eaux,
      gateaux: r.gateaux,
      accompagnateur: true,
      accompagnateurXof: r.accompagnateurXof,
      totalXof: r.totalXof,
      recapitulatif: r.recapModele,
      lignes: r.lignes,
      retard: { toleranceMinutes: 7, penaliteParMinuteXof: 1000 },
    },
  };
  await email.envoyerConfirmation(reservation, "https://site.test/reservation/jeton");
  const confirmation = envois[0];
  const texte = espaces(confirmation.texte);
  verifier("confirmation : au client, objet avec l'offre et la référence", [confirmation.a, confirmation.sujet.startsWith("Bike for All : réservation BL-T2K9QX confirmée")], ["awa.test@example.com", true]);
  verifier("confirmation : le récapitulatif du moteur, tel quel", texte.includes(espaces(r.recapModele.split("\n")[0])), true);
  verifier("confirmation : 13 750 F, la commission (3,25 %) et le montant débité", [texte.includes("Total : 13 750 F"), texte.includes("Commission du paiement Mobile Money (3,25 %) : 447 F"), texte.includes("Débité de votre téléphone : 14 197 F")], [true, true, true]);
  verifier("confirmation : les lignes du prix, accompagnateur compris", texte.includes("Accompagnateur"), true);
  verifier("confirmation : la règle de retard en chiffres", texte.includes("vous avez une marge de 7 minutes ; au-delà, le groupe paie 1 000 F par minute de retard"), true);
  verifier("confirmation : le lieu, le lien de suivi", [texte.includes("Où nous trouver"), texte.includes("https://site.test/reservation/jeton")], [true, true]);
  verifier("confirmation html : encadré du récapitulatif et facture", [confirmation.html.includes("Votre récapitulatif"), confirmation.html.includes("Votre facture FA-2026-T2K9QX")], [true, true]);
  verifier("confirmation : jamais de tiret long", /[—–]|--/.test(confirmation.texte + confirmation.html.replace(/<!--[\s\S]*?-->/g, "")), false);

  await email.envoyerNotificationAdmin(reservation);
  const alerte = envois[1];
  const texteAlerte = espaces(alerte.texte);
  verifier("alerte : à Bike Land, réservation payée", [alerte.a === "awa.test@example.com", espaces(alerte.sujet).startsWith("Réservation payée BL-T2K9QX : Bike for All, 10 personnes")], [false, true]);
  verifier(
    "alerte : vélos, casques, cocos petit format, eau, gâteaux, accompagnateur",
    [texteAlerte.includes("Vélos : 10 vélos, toutes gammes"), texteAlerte.includes("Casques : 10 casques"), texteAlerte.includes("Cocos : 10 cocos, petit format"), texteAlerte.includes("Eau : aucune"), texteAlerte.includes("Gâteaux : aucun"), texteAlerte.includes("Accompagnateur : oui")],
    [true, true, true, true, true, true],
  );

  await email.envoyerRemboursementGroupe(reservation, 14197);
  await email.envoyerRemboursementGroupeAdmin(reservation, 14197, "pay_X");
  const [client, admin] = envois.slice(2);
  verifier("remboursement : le client, 14 197 F sous 48 heures", [client.a, espaces(client.texte).includes("Nous vous remboursons 14 197 F sous 48 heures")], ["awa.test@example.com", true]);
  verifier("remboursement : Bike Land, la transaction et le montant", [admin.sujet, admin.texte.includes("pay_X")], ["Remboursement à faire BL-T2K9QX : 14 197 F", true].map((v) => (typeof v === "string" ? espaces(v) : v)));
  delete process.env.RESEND_API_KEY;
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
