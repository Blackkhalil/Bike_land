// Réserver plusieurs vélos de la gamme choisie, en démonstration : prix,
// caution, attribution d'un vélo par personne, plafond, refus clairs.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { resumeOffre } = await charger("src/lib/format.ts");
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { POST: disponibilite } = await charger("src/app/api/disponibilite/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { messageWhatsAppReservation } = await charger("src/lib/whatsapp.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[\u00a0\u202f]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
const vrai = (nom: string, condition: boolean, detail = "") => verifier(nom + (detail && !condition ? ` [${detail}]` : ""), condition, true);
const appeler = async (route: (r: Request) => Promise<Response>, url: string, corps: unknown) => {
  const reponse = await route(
    new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.50" }, body: JSON.stringify(corps) }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};

// ------------------------------------------------------------ Prix
console.log("\n— Prix : par vélo, caution comprise");
const un = calculerDevis({ offre: "location-libre", gamme: "PREMIUM", dureeHeures: 2 });
const trois = calculerDevis({ offre: "location-libre", gamme: "PREMIUM", dureeHeures: 2, nombrePersonnes: 3 });
verifier("3 vélos Premium 2 h : 3 fois le prix d'un", trois.totalXof, 3 * un.totalXof);
verifier("…et 3 cautions", trois.cautionXof, 3 * un.cautionXof);
verifier("la ligne dit le nombre de vélos", trois.lignes[0].libelle, "Location libre, 2 h, 3 vélos");
verifier("résumé : Location libre · 2 h · 3 vélos", resumeOffre({ offre: "location-libre", nombrePersonnes: 3, dureeHeures: 2 }), "Location libre · 2 h · 3 vélos");
verifier("un seul vélo : rien ne change", resumeOffre({ offre: "location-libre", nombrePersonnes: 1, dureeHeures: 2 }), "Location libre · 2 h");

// ------------------------------------------------------------ Réservation
console.log("\n— Plusieurs vélos de la même gamme, libres à l'heure choisie");
let mardi = ajouterJours(aujourdhui(), 1);
while (new Date(`${mardi}T12:00:00Z`).getUTCDay() !== 2) mardi = ajouterJours(mardi, 1);
const velos = await depot.listerVelos();
const libresA = async (h: number, d: number) => (await depot.velosLibres(mardi, h, h + d)) as { id: string; gamme: string; nom: string }[];
// Une heure du mardi où au moins trois Premium sont libres.
let heure = 9;
while (heure <= 18 && (await libresA(heure, 2)).filter((v) => v.gamme === "PREMIUM").length < 3) heure += 1;
const premiumsLibres = (await libresA(heure, 2)).filter((v) => v.gamme === "PREMIUM");
const choisi = premiumsLibres[0];
console.log(`     mardi ${mardi}, ${heure} h : ${premiumsLibres.length} Premium libres`);

const dispo = await appeler(disponibilite, "/api/disponibilite", { veloId: choisi.id, dateDebut: mardi, dateFin: mardi, heureDebut: heure, heureFin: heure + 2 });
verifier("disponibilité : le nombre de Premium libres à cette heure", [dispo.statut, dispo.donnees.disponible, dispo.donnees.libresGamme], [200, true, premiumsLibres.length]);

const client = { prenom: "Kofi", nom: "Groupe", email: "kofi.groupe@example.com", telephone: "+229 01 97 00 33 01" };
const location = (n: number, autre: Record<string, unknown> = {}) =>
  appeler(reserver, "/api/reservations", {
    veloId: choisi.id,
    offre: "location-libre",
    nombrePersonnes: n,
    dureeHeures: 2,
    dateDebut: mardi,
    dateFin: mardi,
    heureDebut: heure,
    options: [],
    client,
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...autre,
  });

const tropDeVelos = await location(premiumsLibres.length + 1);
verifier("plus de vélos qu'il n'en reste de la gamme : 409 PLACES, avec le compte", [tropDeVelos.statut, tropDeVelos.donnees.code, tropDeVelos.donnees.places], [409, "PLACES", premiumsLibres.length]);
verifier("…et le message le dit", /Il ne reste que \d+ vélos Premium libres à cette heure/.test(String(tropDeVelos.donnees.erreur)), true);

const reservee = await location(3);
verifier("3 vélos Premium : 201", reservee.statut, 201);
const reservation = await depot.trouverReservationParReference(reservee.donnees.reference);
verifier("3 lignes, 3 vélos distincts", [reservation.lignes.length, new Set(reservation.lignes.map((l: { veloId: string }) => l.veloId)).size], [3, 3]);
verifier("le vélo choisi en premier", reservation.lignes[0].veloId, choisi.id);
const gammes = reservation.lignes.map((l: { veloId: string }) => velos.find((v: { id: string }) => v.id === l.veloId)?.gamme);
verifier("tous de la gamme choisie", gammes, ["PREMIUM", "PREMIUM", "PREMIUM"]);
verifier("total et caution pour 3 vélos", [reservation.totalXof, reservation.cautionXof, reservation.nombrePersonnes], [trois.totalXof, trois.cautionXof, 3]);
verifier("chaque ligne au prix d'un vélo", reservation.lignes.map((l: { totalLigneXof: number }) => l.totalLigneXof), [un.totalXof, un.totalXof, un.totalXof]);
verifier("les 3 vélos sont pris à cette heure", (await libresA(heure, 2)).filter((v) => v.gamme === "PREMIUM").length, premiumsLibres.length - 3);
const message = messageWhatsAppReservation(reservation, "https://bike-land.vercel.app/reservation/jeton").replace(/[\u00a0\u202f]/g, " ");
verifier("WhatsApp : les trois vélos nommés", reservation.lignes.every((l: { veloNom: string }) => message.includes(l.veloNom)) && message.includes("Vélos : "), true);

// ------------------------------------------------------------ Road trip à plusieurs
console.log("\n— Road trip à plusieurs : un vélo par personne");
let samedi = ajouterJours(aujourdhui(), 1);
while (new Date(`${samedi}T12:00:00Z`).getUTCDay() !== 6) samedi = ajouterJours(samedi, 1);
samedi = ajouterJours(samedi, 7); // un samedi sans Octobre rose ni fermeture
// Directement au dépôt : la réservation en ligne du road trip ferme la nuit,
// et ce test peut tourner à toute heure.
const libresRoadTrip = ((await depot.velosLibres(samedi, 8, 11)) as { id: string; gamme: string }[]).filter((v) => v.gamme === "PREMIUM");
vrai("au moins 2 Premium libres ce samedi matin", libresRoadTrip.length >= 2, String(libresRoadTrip.length));
const duo = await depot.creerReservation({
  veloId: libresRoadTrip[0].id,
  offre: "road-trip",
  nombrePersonnes: 2,
  dateDebut: samedi,
  dateFin: samedi,
  heureDebut: 8,
  options: [],
  client: { ...client, email: "duo.roadtrip@example.com", telephone: "+229 01 97 00 33 02" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
});
verifier("road trip pour 2 : 2 vélos Premium réservés", duo.reservation.lignes.length, 2);
verifier("…au prix de 2 places, chacune sur sa ligne", duo.reservation.lignes.map((l: { totalLigneXof: number }) => l.totalLigneXof), [duo.reservation.sousTotalXof / 2, duo.reservation.sousTotalXof / 2]);
const tropAuRoadTrip = await depot.creerReservation({
  veloId: libresRoadTrip[0].id === duo.reservation.lignes[0].veloId ? libresRoadTrip[libresRoadTrip.length - 1].id : libresRoadTrip[0].id,
  offre: "road-trip",
  nombrePersonnes: 12,
  dateDebut: samedi,
  dateFin: samedi,
  heureDebut: 8,
  options: [],
  client: { ...client, email: "foule.roadtrip@example.com", telephone: "+229 01 97 00 33 03" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
}).then(() => "écrite", (e: Error) => e.message);
vrai("12 personnes sur une gamme qui n'a pas 12 vélos libres : refusé", tropAuRoadTrip !== "écrite", tropAuRoadTrip);

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
