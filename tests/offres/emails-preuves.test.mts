// Les emails des captures de réduction (décisions 24 et 25) : l'email à
// Bike Land quand une capture attend, les réponses au client selon ce qu'il
// a déjà réservé, et la réduction abonné dans l'email « Réservation payée ».
// Rien n'est envoyé : l'envoi est intercepté avant de sortir.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "SASPAY_API_KEY", "ADMIN_EMAIL"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { depot } = await charger("src/lib/db/index.ts");
const { site } = await charger("src/lib/site.ts");

let echecs = 0;
const ESPACES_INSECABLES = new RegExp("[\\u00a0\\u202f]", "g");
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(ESPACES_INSECABLES, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
const lisible = (texte: string) => texte.replace(ESPACES_INSECABLES, " ");

process.env.RESEND_API_KEY = "cle-factice-test-local";
const envois: { a: string; sujet: string; html: string; texte: string }[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const corps = JSON.parse(String(init?.body));
  envois.push({ a: corps.to[0], sujet: corps.subject, html: corps.html, texte: corps.text });
  return new Response(JSON.stringify({ id: "test" }), { status: 200 });
}) as typeof fetch;
const email = await charger("src/lib/email.ts");
const dernier = () => envois[envois.length - 1];

/* --------------------------------------------- Décision 24 : Bike Land prévenu */

console.log("\n— Une capture attend : l'email à Bike Land");
{
  // Mardi 10 novembre 2026, 14 h 32 à Londres : 15 h 32 à Cotonou.
  const parti = await email.envoyerAlertePreuve({ recueLe: "2026-11-10T14:32:00.000Z", enAttente: 1 });
  const alerte = dernier();
  verifier("envoyé, à l'adresse des notifications (sans ADMIN_EMAIL : celle du site)", [parti.envoye, alerte.a], [true, site.email]);
  verifier("l'objet", alerte.sujet, "Capture à vérifier : réduction du road trip");
  // Jamais le contact du client : il resterait dans la messagerie (et dans le journal du serveur sans
  // fournisseur d'email) après l'effacement promis par la page Données personnelles.
  verifier("le texte : l'heure de Cotonou, combien attendent, le lien vers les preuves, sans le contact du client", lisible(alerte.texte).split("\n"), [
    "Un client vient d'envoyer une capture pour la réduction du road trip en groupe. Il attend votre réponse par email.",
    "",
    "Reçue : le mardi 10 novembre à 15 h 32",
    "C'est la seule capture qui attend votre vérification.",
    "",
    "Regardez-la, puis validez ou refusez :",
    `${site.urlAdmin}/admin/preuves`,
  ]);
  verifier("le bouton « Vérifier la capture » mène à la page des preuves de l'administration", [
    alerte.html.includes(`href="${site.urlAdmin}/admin/preuves"`),
    alerte.html.includes("Vérifier la capture"),
  ], [true, true]);
  process.env.ADMIN_EMAIL = "equipe@example.com";
  await email.envoyerAlertePreuve({ recueLe: "2026-11-10T07:05:00.000Z", enAttente: 3 });
  verifier("avec ADMIN_EMAIL : envoyé là, et le nombre de captures qui attendent", [dernier().a, lisible(dernier().texte).includes("3 captures attendent votre vérification, celle-ci comprise.")], [
    "equipe@example.com",
    true,
  ]);
  delete process.env.ADMIN_EMAIL;
}

/* ------------------------------------------------- Les réponses au client */

console.log("\n— La réponse au client, selon ce qu'il a déjà réservé");
const lienAvec = "https://site.test/?reserver-en-groupe=road-trip-groupe&preuve=pc";
const lienSans = "https://site.test/?reserver-en-groupe=road-trip-groupe";
{
  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "validee", lienReprise: lienAvec, reduction: "4 %" });
  const ordinaire = dernier();
  verifier("validée, rien de réservé avant : la réduction comptée en reprenant, une seule fois par client", [
    ordinaire.a,
    lisible(ordinaire.sujet),
    lisible(ordinaire.texte).includes("La réduction de 4 % s'applique à votre road trip en groupe, une seule fois par client."),
    lisible(ordinaire.texte).includes("Reprenez votre réservation ici, la réduction est déjà comptée :"),
    ordinaire.html.includes("Reprendre ma réservation"),
  ], ["awa@example.com", "Bonne nouvelle : la réduction de 4 % est validée", true, true, true]);
  // La capture validée sert 30 jours (son contact est effacé ensuite) : l'email le dit.
  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "validee", lienReprise: lienAvec, reduction: "4 %", valableJours: 30 });
  const avecDelai = dernier();
  verifier("validée : le lien vaut 30 jours, l'email le dit", [
    lisible(avecDelai.texte).includes("Reprenez votre réservation ici dans les 30 jours, la réduction est déjà comptée :"),
    lisible(avecDelai.html).includes("depuis ce bouton dans les 30 jours."),
  ], [true, true]);

  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "validee", lienReprise: lienAvec, reduction: "4 %", reservationPrixNormal: "BL-NORMAL" });
  const prochain = dernier();
  verifier("validée après une réservation au prix normal : elle garde ce prix, la réduction pour le prochain road trip", [
    lisible(prochain.sujet),
    lisible(prochain.texte).includes("Votre réservation BL-NORMAL reste au prix normal : la réduction ne s'ajoute pas à une réservation déjà faite."),
    lisible(prochain.texte).includes("La réduction de 4 % vous servira une seule fois, sur votre prochain road trip en groupe."),
    prochain.texte.includes(lienAvec),
    prochain.html.includes("Réserver avec la réduction"),
  ], ["Votre capture est validée : la réduction de 4 % pour votre prochain road trip", true, true, true, true]);
  verifier("… sans jamais dire « déjà comptée », ni promettre un remboursement", [
    /déjà comptée/.test(prochain.texte + prochain.html),
    /rembours/i.test(prochain.texte + prochain.html),
    prochain.html.includes("Reprendre ma réservation"),
  ], [false, false, false]);

  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "validee", lienReprise: lienSans, reduction: "4 %", reductionDejaEue: "BL-REDUIT" });
  const dejaEue = dernier();
  verifier("décision 25 : déjà eue, l'email le dit, sans réduction à reprendre", [
    lisible(dejaEue.texte).includes("Vous avez déjà eu la réduction de 4 % sur votre réservation BL-REDUIT : elle vaut une seule fois par client."),
    /déjà comptée/.test(dejaEue.texte + dejaEue.html),
    dejaEue.texte.includes(lienSans) && !dejaEue.texte.includes("preuve="),
    dejaEue.html.includes("Réserver un road trip"),
  ], [true, false, true, true]);

  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "validee", lienReprise: lienSans, sansReduction: true });
  const aZero = dernier();
  verifier("validée alors que la réduction est réglée à 0 % : ni pourcentage, ni promesse, un lien pour réserver au prix normal", [
    aZero.sujet,
    lisible(aZero.texte).includes("La réduction des abonnés n'est pas proposée en ce moment : vos road trips en groupe se réservent au prix normal."),
    /\d+ %/.test(aZero.texte),
    aZero.html.includes("Réserver un road trip"),
  ], ["Votre capture pour la réduction du road trip", true, false, true]);
  await email.envoyerDecisionPreuve({ email: "awa@example.com", statut: "refusee", lienReprise: lienSans, reduction: "4 %", motif: "On ne voit pas « Abonné(e) »." });
  const refus = dernier();
  verifier("refusée : inchangée, le motif et ce que le client peut faire", [
    lisible(refus.sujet),
    lisible(refus.texte).includes("Ce que nous avons vu : On ne voit pas « Abonné(e) »."),
  ], ["Votre capture pour la réduction du road trip", true]);
  verifier("aucun tiret long dans ces emails", envois.filter((envoi) => /—|–/.test(envoi.texte + envoi.sujet)).length, 0);
}

/* ------------------------------------- La réduction abonné dans « Réservation payée » */

console.log("\n— Réservation payée : la réduction abonné, pour regarder le téléphone au départ");
{
  const demande = (reductionXof: number, date: string, message?: string) => ({
    offre: "road-trip-groupe",
    date,
    debutMinute: 8 * 60,
    finMinute: 12 * 60,
    velos: 10,
    nombrePersonnes: 10,
    totalXof: 31250 - reductionXof,
    details: { reductionXof, totalXof: 31250 - reductionXof, personnes: 10, cocos: 20, eaux: 10, gateaux: 0 },
    client: { prenom: "Awa", nom: "Test", email: "awa.paye@example.com", telephone: "+229 01 97 00 00 00" },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...(message ? { message } : {}),
  });
  const { reservation: reduite } = await depot.creerReservationGroupe(demande(1200, "2027-03-06"));
  await email.envoyerNotificationAdmin(reduite);
  const avec = dernier();
  verifier("avec la réduction : une ligne « Réduction abonné », juste après le montant, et dans le tableau", [
    lisible(avec.texte).includes("Montant : 30 050 F\nRéduction abonné : 1 200 F (capture validée)"),
    lisible(avec.html).includes("Réduction abonné"),
  ], [true, true]);
  const { reservation: pleine } = await depot.creerReservationGroupe(demande(0, "2027-03-07", "Anniversaire"));
  await email.envoyerNotificationAdmin(pleine);
  const sans = dernier();
  verifier("sans réduction : rien de plus, le message du client suit le montant comme avant", [
    sans.texte.includes("Réduction abonné"),
    lisible(sans.texte).includes("Montant : 31 250 F\nMessage du client : Anniversaire"),
  ], [false, true]);
}

if (echecs) {
  console.log(`\n${echecs} vérification(s) fausse(s).`);
  process.exit(1);
}
console.log("\nTout est bon.");
