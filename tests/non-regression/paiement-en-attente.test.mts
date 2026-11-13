// Un second envoi (double clic, réponse perdue, page rechargée pendant que
// le client valide sur son téléphone) ne crée pas une seconde réservation
// ni une seconde demande Mobile Money : en démonstration.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
let ip = 80;
const appeler = async (corps: unknown) => {
  ip += 1;
  const reponse = await reserver(
    new Request("http://localhost/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${ip}` },
      body: JSON.stringify(corps),
    }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};

// Un jeudi à venir, à une heure où il reste au moins 2 Classique.
let jeudi = ajouterJours(aujourdhui(), 2);
while (new Date(`${jeudi}T12:00:00Z`).getUTCDay() !== 4) jeudi = ajouterJours(jeudi, 1);
const classiquesLibres = async (jour: string, h: number) =>
  ((await depot.velosLibres(jour, h, h + 2)) as { gamme: string }[]).filter((v) => v.gamme === "CLASSIQUE").length;
let heure = 9;
while (heure <= 18 && (await classiquesLibres(jeudi, heure)) < 3) heure += 1;
console.log(`     jeudi ${jeudi}, ${heure} h : ${await classiquesLibres(jeudi, heure)} Classique libres`);

const client = { prenom: "Koffi", nom: "Attente", email: "Koffi.Attente@example.com", telephone: "+229 01 97 00 55 01" };
const demande = {
  gamme: "CLASSIQUE",
  offre: "location-libre",
  nombrePersonnes: 1,
  dureeHeures: 2,
  dateDebut: jeudi,
  dateFin: jeudi,
  heureDebut: heure,
  options: [],
  client,
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
};

// La première demande, créée sans être encaissée : elle attend son paiement,
// comme pendant que le client valide sur son téléphone.
const premiere = await depot.creerReservation({ ...demande, client: { ...client } });
const reference = premiere.reservation.reference;
const enregistree = await depot.trouverReservationParReference(reference);
verifier("première demande : en attente de paiement", enregistree?.statut, "EN_ATTENTE_PAIEMENT");

console.log("\n— Le même client renvoie la demande");
const doublon = await appeler(demande);
verifier("même email, même jour : 409 EN_ATTENTE", [doublon.statut, doublon.donnees.code], [409, "EN_ATTENTE"]);
verifier("…le message donne la référence en attente", String(doublon.donnees.erreur).includes(reference), true);
// Même email ET même numéro : l'onglet a pu se fermer pendant la validation
// (aucun email avant le paiement, décision 27). La réponse rend le lien de la
// première demande, où le paiement se relance : ni seconde demande, ni second vélo.
verifier("…et dit comment la reprendre", /Reprenez-la pour relancer la demande de paiement/.test(String(doublon.donnees.erreur)), true);
verifier(
  "…avec son lien, qui ouvre bien la première demande, jusqu'à la fin de son délai",
  [
    doublon.donnees.reprise?.reference,
    (await depot.trouverReservationParToken(String(doublon.donnees.reprise?.token)))?.reference,
    doublon.donnees.reprise?.expireLe === new Date(enregistree.creeLe).getTime() + 30 * 60_000,
  ],
  [reference, reference, true],
);

const autreCasse = await appeler({ ...demande, client: { ...client, email: "  koffi.attente@EXAMPLE.com " } });
verifier("même email, casse et espaces différents : 409 EN_ATTENTE", [autreCasse.statut, autreCasse.donnees.code], [409, "EN_ATTENTE"]);

const memeNumero = await appeler({ ...demande, client: { ...client, email: "koffi.autre@example.com", telephone: "0197005501" } });
verifier("même numéro, écrit autrement, autre email : 409 EN_ATTENTE", [memeNumero.statut, memeNumero.donnees.code], [409, "EN_ATTENTE"]);
verifier(
  "…sans le lien : il n'est rendu qu'à qui donne l'email ET le numéro de la demande",
  ["reprise" in memeNumero.donnees, /Validez la demande sur votre téléphone/.test(String(memeNumero.donnees.erreur))],
  [false, true],
);
const memeEmailSeul = await appeler({ ...demande, client: { ...client, telephone: "+229 01 97 99 99 99" } });
verifier("même email, autre numéro : 409 EN_ATTENTE, sans le lien", [memeEmailSeul.statut, "reprise" in memeEmailSeul.donnees], [409, false]);

const autreHeure = await appeler({ ...demande, heureDebut: heure + 2 <= 20 ? heure + 2 : heure });
verifier("même jour, autre heure : toujours renvoyé vers la première", [autreHeure.statut, autreHeure.donnees.code], [409, "EN_ATTENTE"]);

// Les demandes pas encore payées ne se lisent qu'expressément (décision 27).
const aucuneEnPlus = (await depot.listerReservations({ statut: "EN_ATTENTE_PAIEMENT", depuis: jeudi, jusqua: jeudi, inclureNonPayees: true })).filter(
  (r: { client: { email: string } }) => r.client.email.toLowerCase().startsWith("koffi."),
).length;
verifier("aucune réservation en plus n'a été créée", aucuneEnPlus, 1);

console.log("\n— Ce qui reste permis");
const autreJour = await appeler({ ...demande, dateDebut: ajouterJours(jeudi, 7), dateFin: ajouterJours(jeudi, 7) });
verifier("le même client, un autre jour : créée", autreJour.statut, 201);
const autrePersonne = await appeler({ ...demande, client: { prenom: "Afi", nom: "Voisine", email: "afi.voisine@example.com", telephone: "+229 01 97 00 55 02" } });
verifier("une autre personne, le même jour : créée", autrePersonne.statut, 201);

// La première payée (ou libérée), le client peut réserver de nouveau ce jour-là.
await depot.annulerReservation(reference);
const apresAnnulation = await appeler(demande);
verifier("la première libérée : le même client peut réserver ce jour-là", apresAnnulation.statut, 201);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
