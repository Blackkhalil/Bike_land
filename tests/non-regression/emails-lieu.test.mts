// Le lieu du rendez-vous se voit tout de suite : en tête de la confirmation
// (avant le détail), dans l'objet, dans la ligne d'aperçu de la boîte de
// réception, dans le rappel de la veille et dans l'email de la facture.
// Rien n'est envoyé : l'envoi est intercepté avant de sortir.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { site } = await charger("src/lib/site.ts");

let echecs = 0;
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok || !detail ? "" : ` (${detail})`}`);
};

// Une location libre payée, en démonstration.
let jour = ajouterJours(aujourdhui(), 3);
while ([0, 6].includes(new Date(`${jour}T12:00:00Z`).getUTCDay())) jour = ajouterJours(jour, 1);
const libre = ((await depot.velosLibres(jour, 10, 12)) as { id: string }[])[0];
const { reservation } = await depot.creerReservation({
  veloId: libre.id, offre: "location-libre", nombrePersonnes: 1, dureeHeures: 2, dateDebut: jour, dateFin: jour, heureDebut: 10,
  options: [], client: { prenom: "Kossi", nom: "Lieu", email: "kossi.lieu@example.com" },
  moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-lieu-en-tete" },
});

process.env.RESEND_API_KEY = "cle-factice-test-local";
const envois: { sujet: string; html: string; texte: string }[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const corps = JSON.parse(String(init?.body));
  envois.push({ sujet: corps.subject, html: corps.html, texte: corps.text });
  return new Response(JSON.stringify({ id: "test" }), { status: 200 });
}) as typeof fetch;
const email = await charger("src/lib/email.ts");
const lien = "https://bike-land.vercel.app/reservation/jeton";
await email.envoyerConfirmation(reservation, lien);
await email.envoyerFacture(reservation, "FA-TEST", lien);
await email.envoyerRappel(reservation, lien);
const [confirmation, facture, rappel] = envois;
const lieu = site.pointDeDepart.lieu;

console.log("\n— Confirmation");
verifier(`objet : « rendez-vous à ${lieu} »`, confirmation.sujet.includes(`rendez-vous à ${lieu}`), confirmation.sujet);
verifier("objet : toujours « confirmée » et la référence", /confirmée/.test(confirmation.sujet) && confirmation.sujet.includes(reservation.reference), confirmation.sujet);
const apercu = confirmation.html.match(/<div style="display:none[^>]*>([^<]*)<\/div>/)?.[1] ?? "";
verifier("ligne d'aperçu cachée : « Rendez-vous : Fidjrossè Plage… »", apercu.startsWith(`Rendez-vous : ${lieu}.`) && apercu.includes(site.pointDeDepart.indication.replace(/'/g, "&#39;")), apercu);
const posLieu = confirmation.html.indexOf("Où nous trouver");
const posReference = confirmation.html.indexOf(">Référence<");
verifier("html : « Où nous trouver » avant le détail (Référence)", posLieu > 0 && posReference > 0 && posLieu < posReference, `${posLieu} / ${posReference}`);
verifier("html : « Où nous trouver » avant le bouton « Voir ma réservation »", posLieu < confirmation.html.indexOf("Voir ma réservation"));
verifier("html : le bouton « Voir sur la carte » vers la carte", confirmation.html.includes(`href="${site.pointDeDepart.carte}"`) && confirmation.html.includes("Voir sur la carte"));
verifier("html : les numéros WhatsApp restent, plus bas", confirmation.html.indexOf("Écrivez-nous sur WhatsApp") > posReference);
verifier("html : plus de bloc « Recevoir ma réservation sur WhatsApp »", !confirmation.html.includes("Recevoir ma réservation sur WhatsApp"));
const tLieu = confirmation.texte.indexOf("Où nous trouver");
verifier("texte : « Où nous trouver » avant « Référence »", tLieu > 0 && tLieu < confirmation.texte.indexOf("Référence :"));

console.log("\n— Facture");
verifier("facture : le lieu en tête, avant le détail", facture.html.indexOf("Où nous trouver") > 0 && facture.html.indexOf("Où nous trouver") < facture.html.indexOf("Sous-total location"));
verifier("facture : sans les numéros WhatsApp", !facture.html.includes("Écrivez-nous sur WhatsApp"));
verifier("facture, texte : le lieu et la carte", facture.texte.includes(`Où nous trouver : ${lieu}.`) && facture.texte.includes(site.pointDeDepart.carte));

console.log("\n— Rappel de la veille");
verifier(`rappel : objet « C'est demain : départ à 10 h de ${lieu} »`, rappel.sujet === `C'est demain : départ à 10 h de ${lieu}`, rappel.sujet);
verifier("rappel : le lieu en tête", rappel.html.indexOf("Où nous trouver") > 0 && rappel.html.indexOf("Où nous trouver") < rappel.html.indexOf(">Référence<"));
verifier("rappel, texte : « Où nous trouver » avant « Référence »", rappel.texte.indexOf("Où nous trouver") < rappel.texte.indexOf("Référence :"));

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
