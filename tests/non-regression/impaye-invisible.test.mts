// Décision 27 du responsable (13 novembre 2026) : tant que le paiement n'est
// pas validé, rien n'est visible dans l'administration et aucun email ne part,
// ni au client ni à Bike Land. Une note technique invisible retient les vélos
// pendant le paiement, et la tâche du soir l'efface si le client ne paie pas.
//
// En démonstration, sans base : SasPay et l'envoi des emails sont simulés par
// un faux `fetch` (rien ne sort de la machine), le webhook est signé avec un
// secret de test. On vérifie :
//  - aucun email avant la confirmation, dans le tunnel comme ailleurs ;
//  - les emails après la confirmation, par chaque chemin (démonstration,
//    navigateur, webhook, paiement tardif), avec le lien de suivi personnel ;
//  - l'invisibilité dans les listes et les comptes du dépôt, et le moteur de
//    disponibilité qui compte toujours la demande dans son délai ;
//  - le paiement tardif : confirmé, ou listé à rembourser, et visible alors ;
//  - l'effacement : ce qui part, ce qui reste, par le dépôt et par la tâche.
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "VERCEL_ENV", "BIKELAND_ROLE", "ADMIN_EMAIL", "PAIEMENT_DEMO_AUTORISE"]) {
  delete process.env[nom];
}
// Des valeurs factices : le faux `fetch` ci-dessous répond à la place de
// SasPay et de Resend, aucun appel ne sort.
process.env.RESEND_API_KEY = "factice";
process.env.SASPAY_API_KEY = "sk_test_factice";
process.env.SASPAY_WEBHOOK_SECRET = "secret-webhook-de-test";
process.env.CRON_SECRET = "secret-de-test-assez-long";

/* ------------------------------------------------- SasPay et Resend simulés */

interface Email {
  a: string;
  sujet: string;
  texte: string;
}
const emails: Email[] = [];
const paiementsSasPay = new Map<string, { statut: string; reference: string; montant: number }>();
let compteurPaiements = 0;
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const adresse = String(url);
  if (adresse === "https://api.resend.com/emails") {
    const corps = JSON.parse(String(init?.body));
    emails.push({ a: corps.to[0], sujet: corps.subject, texte: corps.text });
    return new Response("{}", { status: 200 });
  }
  if (adresse.endsWith("/payments/softpay/")) {
    const corps = JSON.parse(String(init?.body));
    compteurPaiements += 1;
    const id = `pay_essai_${compteurPaiements}`;
    paiementsSasPay.set(id, { statut: "PENDING", reference: corps.metadata.reference, montant: Number.parseFloat(corps.amount) });
    return Response.json({ data: { id, status: "PENDING", amount: corps.amount, metadata: corps.metadata } }, { status: 201 });
  }
  const verification = adresse.match(/\/payments\/([^/]+)\/verify\/$/);
  if (verification) {
    const id = decodeURIComponent(verification[1]);
    const paiement = paiementsSasPay.get(id);
    if (!paiement) return new Response("{}", { status: 404 });
    return Response.json({
      data: {
        id,
        status: paiement.statut,
        requested_amount: `${paiement.montant}.00`,
        debited_amount: `${paiement.montant}.00`,
        net_amount: `${paiement.montant}.00`,
        metadata: { reference: paiement.reference },
      },
    });
  }
  throw new Error(`Appel réseau inattendu pendant le test : ${adresse}`);
}) as typeof fetch;

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { POST: suivrePaiement } = await charger("src/app/api/paiement/saspay/route.ts");
const { POST: webhook } = await charger("src/app/api/paiement/webhook/route.ts");
const { GET: tacheDuSoir } = await charger("src/app/api/cron/rappels/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { genererToken } = await charger("src/lib/tokens.ts");
const { site, urlDuSite } = await charger("src/lib/site.ts");
const { confirmerParSasPay } = await charger("src/lib/paiement-confirmation.ts");
const { jamaisPayee, paiementARembourser, limiteEffacementDemandes, DELAI_EFFACEMENT_DEMANDES_HEURES } = await charger(
  "src/lib/reservations.ts",
);

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

interface Paiement {
  statut: string;
  referenceFournisseur?: string;
  estCaution: boolean;
}
interface Resa {
  id: string;
  reference: string;
  statut: string;
  clientId: string;
  client: { email: string };
  dateDebut: string;
  heureDebut: number;
  heureFin: number;
  totalXof: number;
  confirmeLe?: string;
  lignes: { veloId: string }[];
  paiements: Paiement[];
}
type EtatDemo = {
  reservations: { reference: string; creeLe: string }[];
  clients: { id: string; email: string }[];
  preuves: { id: string; statut: string; reference?: string; creeLe: string; email?: string; telephone?: string }[];
};
const etatDemo = () => (globalThis as Record<symbol, EtatDemo | undefined>)[Symbol.for("bikeland.demo.etat")]!;
const vieillir = (reference: string, minutes: number) => {
  const r = etatDemo().reservations.find((x) => x.reference === reference);
  if (!r) throw new Error(`Réservation ${reference} absente de la démonstration.`);
  r.creeLe = new Date(Date.now() - minutes * 60_000).toISOString();
};
const HEURE = 60;

const lire = (reference: string): Promise<Resa | null> => depot.trouverReservationParReference(reference);
const visibles = async (): Promise<string[]> => (await depot.listerReservations()).map((r: Resa) => r.reference);
const toutes = async (): Promise<string[]> => (await depot.listerReservations({ inclureNonPayees: true })).map((r: Resa) => r.reference);
const emailsClients = async (): Promise<string[]> => (await depot.listerClients()).map((c: { email: string }) => c.email);
const lienAttendu = (reference: string) => `${urlDuSite()}/reservation/${genererToken(reference)}`;
const emailsDepuis = (depuis: number) => emails.slice(depuis);
const destinataires = (liste: Email[]) => liste.map((e) => e.a).sort();

/* ------------------------------------------------------------ Le décor */

// Des jeudis lointains, que l'historique de démonstration ne touche pas.
let jeudi = ajouterJours(aujourdhui(), 400);
while (new Date(`${jeudi}T12:00:00Z`).getUTCDay() !== 4) jeudi = ajouterJours(jeudi, 1);
const jour = (n: number) => ajouterJours(jeudi, 7 * n);

let numero = 0;
const demande = (date: string, heure = 10, email?: string) => {
  numero += 1;
  return {
    gamme: "CLASSIQUE",
    offre: "location-libre",
    nombrePersonnes: 1,
    dureeHeures: 2,
    dateDebut: date,
    dateFin: date,
    heureDebut: heure,
    options: [],
    client: {
      prenom: "Awa",
      nom: `Impayé ${numero}`,
      email: email ?? `impaye.${numero}@example.com`,
      telephone: `+229 01 97 10 ${String(10 + numero).padStart(2, "0")} 00`,
    },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
  };
};
const appeler = async (gestionnaire: (r: Request) => Promise<Response>, adresse: string, corps: unknown, entetes: Record<string, string> = {}) => {
  const reponse = await gestionnaire(
    new Request(`http://localhost${adresse}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...entetes },
      body: typeof corps === "string" ? corps : JSON.stringify(corps),
    }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};
/** Une demande passée par le tunnel, qui attend la validation sur le téléphone. */
const reserverEnLigne = async (date: string, heure = 10, email?: string) => {
  const r = await appeler(reserver, "/api/reservations", demande(date, heure, email));
  if (r.statut !== 201) throw new Error(`Réservation refusée (${r.statut}) : ${JSON.stringify(r.donnees)}`);
  return r.donnees as {
    reference: string;
    token: string;
    lienSuivi: string;
    confirmee: boolean;
    paiement: { statut: string; suivi?: { paiementId: string } };
  };
};
const valider = (paiementId: string) => {
  const paiement = paiementsSasPay.get(paiementId);
  if (!paiement) throw new Error(`Paiement ${paiementId} inconnu.`);
  paiement.statut = "SUCCESS";
};
const notifier = async (paiementId: string, reference: string) => {
  const corps = JSON.stringify({ event: "transaction.success", data: { id: paiementId, metadata: { reference } } });
  const horodatage = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "secret-webhook-de-test").update(`${horodatage}.${corps}`).digest("hex");
  return appeler(webhook, "/api/paiement/webhook", corps, { "x-webhook-signature": signature, "x-webhook-timestamp": horodatage });
};

/* ------------------------------------- Avant le paiement : rien, nulle part */

console.log("\n— Avant le paiement : aucun email, rien dans l'administration");
const avantA = emails.length;
const A = await reserverEnLigne(jour(0));
verifier("tunnel : 201, en attente de la validation sur le téléphone", [A.confirmee, A.paiement.statut, Boolean(A.paiement.suivi?.paiementId)], [false, "EN_ATTENTE", true]);
verifier("aucun email n'est parti, ni au client ni à Bike Land", emailsDepuis(avantA).length, 0);
verifier("le navigateur reçoit le lien de suivi personnel, refait de la référence", [A.lienSuivi, A.token], [lienAttendu(A.reference), genererToken(A.reference)]);
verifier("ce lien ouvre bien la demande (page de suivi pendant l'attente)", (await depot.trouverReservationParToken(A.token))?.reference, A.reference);
const ficheA = (await lire(A.reference))!;
verifier("la note technique existe, jamais payée", [ficheA.statut, jamaisPayee(ficheA)], ["EN_ATTENTE_PAIEMENT", true]);
verifier("absente de la liste des réservations de l'administration", (await visibles()).includes(A.reference), false);
verifier("absente de la liste avec un filtre de statut", (await depot.listerReservations({ statut: "EN_ATTENTE_PAIEMENT" })).length, 0);
verifier("absente sur son jour (sortie du jour, planning)", (await depot.listerReservations({ depuis: jour(0), jusqua: jour(0) })).length, 0);
verifier("son client n'apparaît pas dans les clients", (await emailsClients()).includes(ficheA.client.email), false);
verifier("seuls les contrôles du site la lisent, expressément", (await toutes()).includes(A.reference), true);
verifier(
  "le moteur de disponibilité compte toujours la demande : son vélo n'est pas libre",
  await depot.estDisponible(ficheA.lignes[0].veloId, jour(0), jour(0), ficheA.heureDebut, ficheA.heureFin),
  false,
);
const doublon = await appeler(reserver, "/api/reservations", { ...demande(jour(0)), client: { ...demande(jour(0)).client, email: ficheA.client.email } });
verifier("le même client renvoie la demande : renvoyé vers la première, sans parler d'email", [doublon.statut, doublon.donnees.code, /email/i.test(doublon.donnees.erreur)], [409, "EN_ATTENTE", false]);
verifier("toujours aucun email", emailsDepuis(avantA).length, 0);

/* ------------------------------------------- La confirmation, par chemin */

console.log("\n— Payée, validée par le navigateur : visible, et les emails partent");
valider(A.paiement.suivi!.paiementId);
const avantConfirmationA = emails.length;
const suiviA = await appeler(suivrePaiement, "/api/paiement/saspay", { token: A.token, paiementId: A.paiement.suivi!.paiementId });
verifier("le navigateur apprend la confirmation", [suiviA.statut, suiviA.donnees.etat], [200, "confirmee"]);
const envoisA = emailsDepuis(avantConfirmationA);
verifier("trois emails : confirmation et facture au client, alerte à Bike Land", destinataires(envoisA), [ficheA.client.email, ficheA.client.email, site.email].sort());
verifier("la confirmation porte le lien de suivi personnel", envoisA.some((e) => /confirmée/.test(e.sujet) && e.texte.includes(lienAttendu(A.reference))), true);
verifier("la facture aussi", envoisA.some((e) => /^Facture/.test(e.sujet) && e.texte.includes(lienAttendu(A.reference))), true);
verifier("visible dans l'administration, son client aussi", [(await visibles()).includes(A.reference), (await emailsClients()).includes(ficheA.client.email)], [true, true]);
const avantRejeu = emails.length;
await appeler(suivrePaiement, "/api/paiement/saspay", { token: A.token, paiementId: A.paiement.suivi!.paiementId });
verifier("le navigateur redemande : aucun email de plus", emails.length - avantRejeu, 0);

console.log("\n— Payée, le navigateur fermé : le webhook confirme, avec le même lien");
const B = await reserverEnLigne(jour(1));
const ficheB = (await lire(B.reference))!;
valider(B.paiement.suivi!.paiementId);
const avantB = emails.length;
const notifB = await notifier(B.paiement.suivi!.paiementId, B.reference);
verifier("webhook : confirmé", [notifB.statut, notifB.donnees.confirme, notifB.donnees.issue], [200, true, "confirmee"]);
const envoisB = emailsDepuis(avantB);
verifier("trois emails, l'alerte à Bike Land comprise", destinataires(envoisB), [ficheB.client.email, ficheB.client.email, site.email].sort());
verifier("le lien de suivi, refait par le serveur sans le navigateur", envoisB.some((e) => /confirmée/.test(e.sujet) && e.texte.includes(lienAttendu(B.reference))), true);
verifier("visible dans l'administration", (await visibles()).includes(B.reference), true);
const avantRejeuB = emails.length;
await notifier(B.paiement.suivi!.paiementId, B.reference);
verifier("notification rejouée : aucun email de plus", emails.length - avantRejeuB, 0);

console.log("\n— Démonstration : confirmée tout de suite, emails avec le lien");
delete process.env.SASPAY_API_KEY;
const avantDemo = emails.length;
const demo = await appeler(reserver, "/api/reservations", demande(jour(2)));
process.env.SASPAY_API_KEY = "sk_test_factice";
const ficheDemo = (await lire(demo.donnees.reference))!;
verifier("201, confirmée", [demo.statut, demo.donnees.confirmee, ficheDemo.statut], [201, true, "CONFIRMEE"]);
verifier("trois emails, la confirmation avec le lien de suivi", [emailsDepuis(avantDemo).length, emailsDepuis(avantDemo).some((e) => e.texte.includes(lienAttendu(ficheDemo.reference)))], [3, true]);
verifier("visible dans l'administration", (await visibles()).includes(ficheDemo.reference), true);

/* --------------------------------------------------- Le paiement tardif */

console.log("\n— Paiement tardif : la demande expirée et cachée se confirme, ou se rembourse");
const C = await reserverEnLigne(jour(3));
const ficheC = (await lire(C.reference))!;
vieillir(C.reference, 45);
verifier(
  "expirée : le vélo est de nouveau libre, la demande toujours invisible",
  [await depot.estDisponible(ficheC.lignes[0].veloId, jour(3), jour(3), ficheC.heureDebut, ficheC.heureFin), (await visibles()).includes(C.reference)],
  [true, false],
);
valider(C.paiement.suivi!.paiementId);
const avantC = emails.length;
const tardC = await appeler(suivrePaiement, "/api/paiement/saspay", { token: C.token, paiementId: C.paiement.suivi!.paiementId });
verifier("payée 45 minutes après, le vélo encore libre : confirmée", [tardC.donnees.etat, (await lire(C.reference))?.statut], ["confirmee", "CONFIRMEE"]);
verifier("les emails partent alors, avec le lien", [emailsDepuis(avantC).length, emailsDepuis(avantC).some((e) => e.texte.includes(lienAttendu(C.reference)))], [3, true]);
verifier("et elle apparaît dans l'administration", (await visibles()).includes(C.reference), true);

const D = await reserverEnLigne(jour(4), 10);
const ficheD = (await lire(D.reference))!;
vieillir(D.reference, 45);
// Un autre client prend le même vélo au même créneau, et paie.
const autre = await depot.creerReservation({ ...demande(jour(4), 10), gamme: undefined, veloId: ficheD.lignes[0].veloId });
await depot.confirmerPaiement(autre.reservation.reference, "pay_autre_client");
valider(D.paiement.suivi!.paiementId);
const avantD = emails.length;
const tardD = await appeler(suivrePaiement, "/api/paiement/saspay", { token: D.token, paiementId: D.paiement.suivi!.paiementId });
const ficheDTard = (await lire(D.reference))!;
verifier("payée trop tard, le vélo repris : rien de confirmé, le client est prévenu à l'écran", [tardD.statut, tardD.donnees.code, ficheDTard.statut], [409, "CRENEAU_PERDU", "EN_ATTENTE_PAIEMENT"]);
verifier("aucun email de confirmation", emailsDepuis(avantD).filter((e) => /confirmée/.test(e.sujet)).length, 0);
verifier("l'argent reçu est à rendre : la réservation devient visible", [paiementARembourser(ficheDTard), jamaisPayee(ficheDTard), (await visibles()).includes(D.reference)], [true, false, true]);

console.log("\n— Paiement tardif d'une offre de groupe : le remboursement est listé (décision 6)");
let samedi = ajouterJours(aujourdhui(), 600);
while (new Date(`${samedi}T12:00:00Z`).getUTCDay() !== 6) samedi = ajouterJours(samedi, 1);
const groupe = (date: string, debut: number, fin: number, velos: number, email: string, autreChamps: Record<string, unknown> = {}) => ({
  offre: "bike-for-all",
  date,
  debutMinute: debut,
  finMinute: fin,
  velos,
  nombrePersonnes: velos,
  totalXof: 6250,
  details: { mode: "duree", minutes: fin - debut, depart: `${String(Math.floor(debut / HEURE)).padStart(2, "0")}:${String(debut % HEURE).padStart(2, "0")}`, retour: `${String(Math.floor(fin / HEURE)).padStart(2, "0")}:${String(fin % HEURE).padStart(2, "0")}`, totalXof: 6250 },
  client: { prenom: "Kossi", nom: "Groupe", email, telephone: "+229 01 97 20 00 01" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
  ...autreChamps,
});
// Tous les vélos en état du parc de démonstration, ce samedi lointain.
const parcDeDemonstration = (await depot.parcDuJour(samedi)).velos.length;
const G = (await depot.creerReservationGroupe(groupe(samedi, 600, 630, 8, "groupe.tard@example.com"))).reservation as Resa;
verifier("demande de groupe : invisible, rien au journal", [(await visibles()).includes(G.reference), (await depot.listerJournal({ reference: G.reference })).length], [false, 0]);
vieillir(G.reference, 31);
const Q = (await depot.creerReservationGroupe(groupe(samedi, 600, 630, parcDeDemonstration, "groupe.autre@example.com"))).reservation as Resa;
await depot.confirmerPaiement(Q.reference, "pay_groupe_autre");
const avantG = emails.length;
const tardG = await confirmerParSasPay({
  reference: G.reference,
  paiement: { id: "pay_groupe_tard", statut: "SUCCESS", montantDemandeXof: 6250, montantDebiteXof: 6250, montantNetXof: 6250, urlCheckout: "", reference: G.reference },
  lienSuivi: lienAttendu(G.reference),
});
verifier("payée trop tard, les vélos repris : remboursement listé", [tardG.issue, tardG.remboursementListe], ["creneau-perdu", true]);
verifier("le client et Bike Land en sont prévenus par email", destinataires(emailsDepuis(avantG)), ["groupe.tard@example.com", site.email].sort());
verifier(
  "visible alors, avec son remboursement à faire",
  [(await visibles()).includes(G.reference), (await depot.listerRemboursements({ statut: "a_faire" })).some((r: { reference: string }) => r.reference === G.reference)],
  [true, true],
);

console.log("\n— Annulée avant d'être payée, puis payée : à rembourser, visible");
const E = await reserverEnLigne(jour(5));
await depot.annulerReservation(E.reference);
verifier("annulée sans paiement : invisible", [(await lire(E.reference))?.statut, (await visibles()).includes(E.reference)], ["ANNULEE", false]);
valider(E.paiement.suivi!.paiementId);
const avantE = emails.length;
const payeeE = await appeler(suivrePaiement, "/api/paiement/saspay", { token: E.token, paiementId: E.paiement.suivi!.paiementId });
const ficheE = (await lire(E.reference))!;
verifier("le paiement arrive sur une demande annulée : refusé, sans email", [payeeE.statut, emailsDepuis(avantE).length], [409, 0]);
verifier("l'argent est à rendre : visible, « à rembourser »", [paiementARembourser(ficheE), (await visibles()).includes(E.reference)], [true, true]);

console.log("\n— La règle « jamais payée », la même pour les deux dépôts");
const ligne = (statut: string, referenceFournisseur?: string, moyen = "MTN_MONEY") => ({ statut, moyen, estCaution: false, montantXof: 1000, ...(referenceFournisseur ? { referenceFournisseur } : {}) });
verifier(
  "jamais payées : en attente, annulée sans paiement, référence provisoire « TX- » de la démonstration",
  [
    jamaisPayee({ statut: "EN_ATTENTE_PAIEMENT", paiements: [ligne("INITIE")] }),
    jamaisPayee({ statut: "ANNULEE", paiements: [ligne("INITIE")] }),
    jamaisPayee({ statut: "EN_ATTENTE_PAIEMENT", paiements: [ligne("INITIE", "TX-BL-T2K9QX")] }),
  ],
  [true, true, true],
);
verifier(
  "payées un jour : confirmée, payée puis annulée, vente au comptoir annulée et rendue, paiement reçu trop tard",
  [
    jamaisPayee({ statut: "CONFIRMEE", paiements: [ligne("REUSSI", "pay_1")] }),
    jamaisPayee({ statut: "ANNULEE", confirmeLe: "2026-11-13T10:00:00.000Z", paiements: [ligne("REUSSI", "pay_2")] }),
    jamaisPayee({ statut: "ANNULEE", paiements: [ligne("REMBOURSE", "ESP-1", "ESPECES")] }),
    jamaisPayee({ statut: "EN_ATTENTE_PAIEMENT", paiements: [ligne("INITIE", "pay_3")] }),
  ],
  [false, false, false, false],
);

/* ------------------------------------------------------- L'effacement */

console.log(`\n— L'effacement des demandes jamais payées (${DELAI_EFFACEMENT_DEMANDES_HEURES} heures après le délai)`);
const VIEILLE = 30 + DELAI_EFFACEMENT_DEMANDES_HEURES * HEURE + 60;
const RECENTE = 30 + DELAI_EFFACEMENT_DEMANDES_HEURES * HEURE - 60;
const abandonnee = await reserverEnLigne(jour(6));
const clientAbandonnee = (await lire(abandonnee.reference))!.client.email;
await depot.journaliser({ type: "reservation-groupe", reference: abandonnee.reference, details: {}, auteur: "site" });
const annuleeSansPaiement = await reserverEnLigne(jour(7));
await depot.annulerReservation(annuleeSansPaiement.reference);
const recente = await reserverEnLigne(jour(8));
// Le client de la réservation A, payée : sa nouvelle demande abandonnée s'efface, pas lui.
const dejaClient = await reserverEnLigne(jour(9), 10, ficheA.client.email);
// Payée, puis annulée par le client : reste.
await depot.annulerReservation(B.reference);
// Une demande de road trip en groupe qui avait pris une capture validée.
etatDemo().preuves.push({ id: "preuve-impaye", statut: "validee", creeLe: new Date().toISOString(), email: "groupe.preuve@example.com", telephone: "+229 01 97 30 00 01" });
const avecPreuve = (
  await depot.creerReservationGroupe({
    ...groupe(ajouterJours(samedi, 7), 480, 720, 8, "groupe.preuve@example.com"),
    offre: "road-trip-groupe",
    totalXof: 30050,
    details: { reductionXof: 1200, prixBarreXof: 31250, totalXof: 30050 },
    preuveId: "preuve-impaye",
    client: { prenom: "Kossi", nom: "Preuve", email: "groupe.preuve@example.com", telephone: "+229 01 97 30 00 01" },
  })
).reservation as Resa;
verifier("la capture est prise par la demande", etatDemo().preuves.find((p) => p.id === "preuve-impaye")?.reference, avecPreuve.reference);

for (const reference of [abandonnee.reference, annuleeSansPaiement.reference, dejaClient.reference, avecPreuve.reference, D.reference, E.reference, G.reference, B.reference]) {
  vieillir(reference, VIEILLE);
}
vieillir(recente.reference, RECENTE);

const effacement = await depot.purgerDemandesNonPayees(limiteEffacementDemandes());
const effacees = new Set(effacement.references);
verifier(
  "effacées : la demande abandonnée, l'annulée sans paiement, celle d'un client qui a déjà payé, celle qui avait pris une capture",
  [abandonnee.reference, annuleeSansPaiement.reference, dejaClient.reference, avecPreuve.reference].map((r) => effacees.has(r)),
  [true, true, true, true],
);
verifier(
  "gardées : la récente (encore dans les 48 heures), les paiements tardifs à rendre, l'annulée après paiement, le groupe remboursé",
  [recente.reference, D.reference, E.reference, B.reference, G.reference].map((r) => effacees.has(r)),
  [false, false, false, false, false],
);
verifier(
  "les effacées n'existent plus, même pour le site",
  await Promise.all([abandonnee.reference, annuleeSansPaiement.reference, dejaClient.reference, avecPreuve.reference].map(async (r) => Boolean(await lire(r)))),
  [false, false, false, false],
);
verifier(
  "la fiche du client sans autre réservation part ; celle du client qui a payé reste",
  [etatDemo().clients.some((c) => c.email === clientAbandonnee), etatDemo().clients.some((c) => c.email === ficheA.client.email)],
  [false, true],
);
verifier("la ligne écrite au journal par une ancienne version part avec elle", (await depot.listerJournal({ reference: abandonnee.reference })).length, 0);
const preuve = etatDemo().preuves.find((p) => p.id === "preuve-impaye");
verifier("la capture reste validée et redevient libre pour son client", [preuve?.statut, preuve?.reference ?? null], ["validee", null]);
verifier("la réservation payée puis annulée reste visible", (await visibles()).includes(B.reference), true);
verifier("un second passage n'efface rien de plus", (await depot.purgerDemandesNonPayees(limiteEffacementDemandes())).references.length, 0);

console.log("\n— La tâche du soir efface aussi");
const parLaTache = await reserverEnLigne(jour(10));
vieillir(parLaTache.reference, VIEILLE);
const reponse = await tacheDuSoir(new Request("http://localhost/api/cron/rappels", { headers: { authorization: "Bearer secret-de-test-assez-long" } }));
const corps = await reponse.json();
verifier("la tâche répond, et compte la demande effacée", [reponse.status, corps.demandes?.effacees], [200, 1]);
verifier("la demande n'existe plus", Boolean(await lire(parLaTache.reference)), false);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
