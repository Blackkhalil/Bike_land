// Réserver une gamme, pas un vélo, en démonstration : attribution des vélos
// de la gamme, plafond, gamme complète, anciens liens, calendrier de gamme.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { POST: disponibilite } = await charger("src/app/api/disponibilite/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { velosLibresDeLaGamme, occupationsDeLaGamme, messageVelosManquants } = await charger("src/lib/db/contrat.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { CRENEAUX_ROAD_TRIP } = await charger("src/data/offres.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[\u00a0\u202f]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
const appeler = async (route: (r: Request) => Promise<Response>, url: string, corps: unknown, ip = "203.0.113.70") => {
  const reponse = await route(
    new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(corps) }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};

// ------------------------------------------------------------ Fonctions pures
console.log("\n— Attribution par gamme (fonction pure)");
const parc = [
  { id: "c1", gamme: "CLASSIQUE", nom: "Onyx" },
  { id: "p2", gamme: "PREMIUM", nom: "Mongoose" },
  { id: "p1", gamme: "PREMIUM", nom: "Apollo" },
  { id: "p3", gamme: "PREMIUM", nom: "Raleigh" },
];
verifier("2 Premium : les deux premiers dans l'ordre d'attribution (par nom)", velosLibresDeLaGamme("PREMIUM", parc, 2)?.map((v: { id: string }) => v.id), ["p1", "p2"]);
verifier("jamais un vélo d'une autre gamme", velosLibresDeLaGamme("PREMIUM", parc, 3)?.every((v: { gamme: string }) => v.gamme === "PREMIUM"), true);
verifier("pas assez : null", velosLibresDeLaGamme("PREMIUM", parc, 4), null);
verifier("message, gamme complète", messageVelosManquants("PREMIUM", 0), "Plus aucun vélo Premium n'est libre à cette heure : choisissez une autre heure, un autre jour ou une autre gamme.");
verifier("message, un seul vélo", messageVelosManquants("PRESTIGE", 1), "Il ne reste qu'un vélo Prestige libre à cette heure : un seul vélo pour cette réservation.");

console.log("\n— Calendrier d'une gamme : un jour plein seulement si tous les vélos le sont");
const j = "2026-11-03";
const a = [{ debut: j, fin: j, heureDebut: 8, heureFin: 12 }];
const b = [{ debut: j, fin: j, heureDebut: 10, heureFin: 14 }];
verifier("deux vélos, pris 8-12 et 10-14 : plein de 10 h à 12 h seulement", occupationsDeLaGamme([a, b], 8, 22), [{ debut: j, fin: j, heureDebut: 10, heureFin: 12 }]);
verifier("un vélo libre toute la journée : rien de plein", occupationsDeLaGamme([a, []], 8, 22), []);
verifier("tous pris toute la journée : la journée entière", occupationsDeLaGamme([[{ debut: j, fin: j, heureDebut: 8, heureFin: 22 }], [{ debut: j, fin: j, heureDebut: 8, heureFin: 22 }]], 8, 22), [{ debut: j, fin: j, heureDebut: 8, heureFin: 22 }]);
verifier("gamme sans vélo en état : rien", occupationsDeLaGamme([], 8, 22), []);

// ------------------------------------------------------------ API, location libre
console.log("\n— Réserver une gamme en location libre");
let mardi = ajouterJours(aujourdhui(), 1);
while (new Date(`${mardi}T12:00:00Z`).getUTCDay() !== 2) mardi = ajouterJours(mardi, 1);
const libresA = async (jour: string, h: number, d: number) => (await depot.velosLibres(jour, h, h + d)) as { id: string; gamme: string; nom: string }[];
let heure = 9;
while (heure <= 18 && (await libresA(mardi, heure, 2)).filter((v) => v.gamme === "PREMIUM").length < 3) heure += 1;
const premiums = (await libresA(mardi, heure, 2)).filter((v) => v.gamme === "PREMIUM");
console.log(`     mardi ${mardi}, ${heure} h : ${premiums.length} Premium libres`);

const dispo = await appeler(disponibilite, "/api/disponibilite", { gamme: "PREMIUM", dateDebut: mardi, dateFin: mardi, heureDebut: heure, heureFin: heure + 2 });
verifier("disponibilité par gamme : le nombre de Premium libres", [dispo.statut, dispo.donnees.disponible, dispo.donnees.libresGamme], [200, true, premiums.length]);
const sansRien = await appeler(disponibilite, "/api/disponibilite", { dateDebut: mardi, dateFin: mardi, heureDebut: heure, heureFin: heure + 2 });
verifier("disponibilité sans gamme ni vélo : 400", sansRien.statut, 400);

const client = { prenom: "Awa", nom: "Gamme", email: "awa.gamme@example.com", telephone: "+229 01 97 00 44 01" };
const location = (corps: Record<string, unknown>, ip?: string) =>
  appeler(reserver, "/api/reservations", {
    offre: "location-libre",
    nombrePersonnes: 1,
    dureeHeures: 2,
    dateDebut: mardi,
    dateFin: mardi,
    heureDebut: heure,
    options: [],
    client,
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...corps,
  }, ip);

const sansGamme = await location({});
verifier("ni gamme ni vélo : 422", [sansGamme.statut, Boolean(sansGamme.donnees.champs?.gamme)], [422, true]);
const gammeInventee = await location({ gamme: "LUXE" });
verifier("gamme inventée : 422", gammeInventee.statut, 422);

const trop = await location({ gamme: "PREMIUM", nombrePersonnes: premiums.length + 1 });
verifier("plus de vélos qu'il n'en reste : 409 PLACES, avec le compte", [trop.statut, trop.donnees.code, trop.donnees.places], [409, "PLACES", premiums.length]);

const trois = await location({ gamme: "PREMIUM", nombrePersonnes: 3 });
verifier("3 vélos Premium : réservation créée", trois.statut, 201);
const resa = trois.statut === 201 ? await depot.trouverReservationParReference(trois.donnees.reference) : null;
const lignes = (resa?.lignes ?? []) as { veloId: string }[];
const ids = lignes.map((l) => l.veloId);
verifier("3 lignes, 3 vélos différents", [lignes.length, new Set(ids).size], [3, 3]);
verifier("tous Premium et libres à cette heure", ids.every((id) => premiums.some((v) => v.id === id)), true);
verifier("le prix est celui de 3 vélos Premium 2 h", resa?.totalXof, calculerDevis({ offre: "location-libre", gamme: "PREMIUM", dureeHeures: 2, nombrePersonnes: 3 }).totalXof);

// Les Premium restants pris, la gamme est complète à cette heure.
const restants = premiums.length - 3;
if (restants > 0) {
  const reste = await location({ gamme: "PREMIUM", nombrePersonnes: restants, client: { ...client, email: "awa.reste@example.com" } }, "203.0.113.71");
  verifier("les Premium restants : réservés", reste.statut, 201);
}
const complete = await location({ gamme: "PREMIUM", client: { ...client, email: "awa.complet@example.com" } }, "203.0.113.72");
verifier("gamme complète à cette heure : 409 INDISPONIBLE, 0 place", [complete.statut, complete.donnees.code, complete.donnees.places], [409, "INDISPONIBLE", 0]);
verifier("…et le message propose une autre heure ou une autre gamme", /Plus aucun vélo Premium n'est libre/.test(String(complete.donnees.erreur)), true);
const dispoComplete = await appeler(disponibilite, "/api/disponibilite", { gamme: "PREMIUM", dateDebut: mardi, dateFin: mardi, heureDebut: heure, heureFin: heure + 2 });
verifier("disponibilité : Premium complet, 0", [dispoComplete.donnees.disponible, dispoComplete.donnees.libresGamme], [false, 0]);
const classiqueAMemeHeure = await location({ gamme: "CLASSIQUE", client: { ...client, email: "awa.classique@example.com" } }, "203.0.113.73");
verifier("une autre gamme à la même heure : possible", classiqueAMemeHeure.statut, 201);

// ------------------------------------------------------------ Prestige
console.log("\n— Prestige, exemplaire unique");
let mercredi = ajouterJours(mardi, 1);
const prestiges = (await libresA(mercredi, 10, 2)).filter((v) => v.gamme === "PRESTIGE");
const deuxPrestige = await location({ gamme: "PRESTIGE", nombrePersonnes: 2, dateDebut: mercredi, dateFin: mercredi, heureDebut: 10, client: { ...client, email: "awa.prestige@example.com" } }, "203.0.113.74");
verifier("2 Prestige : refusé (un seul vélo dans la gamme)", [deuxPrestige.statut, deuxPrestige.donnees.places], [409, prestiges.length]);
const unPrestige = await location({ gamme: "PRESTIGE", dateDebut: mercredi, dateFin: mercredi, heureDebut: 10, client: { ...client, email: "awa.prestige1@example.com" } }, "203.0.113.75");
verifier("1 Prestige : créé si libre", unPrestige.statut, prestiges.length >= 1 ? 201 : 409);

// ------------------------------------------------------------ Ancien lien : un vélo précis
console.log("\n— Un tunnel ouvert avant le changement envoie encore un vélo");
mercredi = ajouterJours(mercredi, 7);
const unLibre = (await libresA(mercredi, 14, 2)).find((v) => v.gamme === "CLASSIQUE");
const ancien = await location({ veloId: unLibre?.id, dateDebut: mercredi, dateFin: mercredi, heureDebut: 14, client: { ...client, email: "awa.ancien@example.com" } }, "203.0.113.76");
verifier("veloId seul : toujours accepté", ancien.statut, 201);
const resaAncienne = ancien.statut === 201 ? await depot.trouverReservationParReference(ancien.donnees.reference) : null;
verifier("…et c'est bien ce vélo-là", (resaAncienne?.lignes as { veloId: string }[] | undefined)?.[0]?.veloId, unLibre?.id);

// ------------------------------------------------------------ Road trip par gamme
console.log("\n— Road trip par gamme");
const samedi = (() => {
  let d = ajouterJours(aujourdhui(), 2);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = ajouterJours(d, 1);
  return d;
})();
const depart = CRENEAUX_ROAD_TRIP[0].heureDebut;
// Le road trip du samedi se roule en Premium ou Prestige : un Classique est
// refusé, avec le motif, avant toute écriture.
const classiqueSamedi = await appeler(reserver, "/api/reservations", {
  gamme: "CLASSIQUE",
  offre: "road-trip",
  nombrePersonnes: 1,
  dateDebut: samedi,
  dateFin: samedi,
  heureDebut: depart,
  options: [],
  client: { ...client, email: "awa.classique.samedi@example.com", telephone: "+229 01 97 00 44 09" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
}, "203.0.113.79");
if (classiqueSamedi.statut === 403 && classiqueSamedi.donnees.code === "FERME") {
  console.log("     road trip : réservations fermées à cette heure de la nuit, refus Classique non vérifié");
} else {
  verifier("road trip du samedi en Classique : 409 GAMME", [classiqueSamedi.statut, classiqueSamedi.donnees.code], [409, "GAMME"]);
  verifier("…« Le road trip du samedi se fait en vélo Premium ou Prestige »", /^Le road trip du samedi se fait en vélo Premium ou Prestige\./.test(String(classiqueSamedi.donnees.erreur)), true);
}
const classiquesRT = (await libresA(samedi, depart, 3)).filter((v) => v.gamme === "PREMIUM");
const roadTrip = await appeler(reserver, "/api/reservations", {
  gamme: "PREMIUM",
  offre: "road-trip",
  nombrePersonnes: 2,
  dateDebut: samedi,
  dateFin: samedi,
  heureDebut: depart,
  options: [],
  client: { ...client, email: "awa.roadtrip@example.com" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
}, "203.0.113.77");
if (roadTrip.statut === 403 && roadTrip.donnees.code === "FERME") {
  console.log("     road trip : réservations fermées à cette heure de la nuit, non vérifié");
} else if (classiquesRT.length < 2) {
  console.log(`     samedi ${samedi} : moins de 2 Premium libres, non vérifié`);
} else {
  // Depuis novembre 2026, le road trip du samedi se fait en groupe de dix au
  // moins (test-groupe-10.mts vérifie un groupe de dix).
  verifier("road trip, 2 personnes, gamme Premium : refusé, groupe de 10 au moins", [roadTrip.statut, roadTrip.donnees.code, roadTrip.donnees.reference], [422, "GROUPE", undefined]);
}

// ------------------------------------------------------------ Le Classique : samedi non, dimanche oui
console.log("\n— Classique : pas le samedi, Gbashi bike le dimanche");
const classiqueLibre = (await libresA(samedi, depart, 3)).find((v) => v.gamme === "CLASSIQUE");
if (classiqueLibre) {
  const parVelo = await appeler(reserver, "/api/reservations", {
    veloId: classiqueLibre.id, offre: "road-trip", nombrePersonnes: 1, dateDebut: samedi, dateFin: samedi, heureDebut: depart, options: [],
    client: { ...client, email: "awa.ancien.samedi@example.com", telephone: "+229 01 97 00 44 11" }, moyenPaiement: "MTN_MONEY", cgvAcceptees: true,
  }, "203.0.113.81");
  if (parVelo.donnees.code !== "FERME") {
    verifier("ancien lien (veloId Classique), samedi : 409 GAMME", [parVelo.statut, parVelo.donnees.code], [409, "GAMME"]);
  }
}
// Le dimanche matin est un road trip depuis le 9 novembre 2026, comme le
// samedi : le Classique n'y va pas.
await depot.reglerCreneau("dimanche-matin", true);
const dimanche = ajouterJours(samedi, 1);
const classiqueDimanche = await appeler(reserver, "/api/reservations", {
  gamme: "CLASSIQUE", offre: "road-trip", nombrePersonnes: 10, dateDebut: dimanche, dateFin: dimanche, heureDebut: depart, options: [],
  client: { ...client, email: "awa.dimanche@example.com", telephone: "+229 01 97 00 44 12" }, moyenPaiement: "MTN_MONEY", cgvAcceptees: true,
}, "203.0.113.82");
if (classiqueDimanche.donnees.code === "FERME") {
  console.log("     dimanche : réservations fermées à cette heure de la nuit, non vérifié");
} else {
  verifier("road trip du dimanche en Classique : refusé (409 GAMME)", [classiqueDimanche.statut, classiqueDimanche.donnees.code], [409, "GAMME"]);
  verifier(
    "…le motif : Premium ou Prestige, et la location libre",
    String(classiqueDimanche.donnees.erreur ?? "").replace(/[\u00a0\u202f]/g, " "),
    "Le road trip du dimanche se fait en vélo Premium ou Prestige. En Classique, choisissez la location libre.",
  );
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
