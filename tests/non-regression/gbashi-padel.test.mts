// Gbashi bike sur commande (3 500 / 4 000 / 4 500), Padel bike à 3 500 :
// règles, refus en ligne, prix du comptoir, ce que disent les pages.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const offres = await charger("src/data/offres.ts");
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { lireOuverture, motifDeRefus } = await charger("src/lib/ouverture.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { MESSAGES_WHATSAPP } = await charger("src/data/produits.ts");
const { AFFICHES_PADEL } = await charger("src/data/affiches.ts");
const sharp = createRequire(join(projet, "package.json"))("sharp");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
const espaces = (t: string | null) => (t ?? "").replace(/[\u00a0\u202f]/g, " ");

// Des dates loin de toute clôture (la veille 22 h) : dans deux semaines.
const auBenin = new Date(Date.now() + 3600_000);
const jourPlus = (n: number) =>
  new Date(Date.UTC(auBenin.getUTCFullYear(), auBenin.getUTCMonth(), auBenin.getUTCDate() + n)).toISOString().slice(0, 10);
const prochain = (jourSemaine: number, depuis: number) => {
  let n = depuis;
  while (new Date(`${jourPlus(n)}T12:00:00Z`).getUTCDay() !== jourSemaine) n += 1;
  return jourPlus(n);
};
const samedi = prochain(6, 10);
const dimanche = prochain(0, 10);
console.log(`     samedi ${samedi}, dimanche ${dimanche}`);

console.log("— Les prix");
verifier("Gbashi bike : Classique 3 500, Premium 4 000, Prestige 4 500", offres.PRIX_GBASHI_BIKE_XOF, { CLASSIQUE: 3500, PREMIUM: 4000, PRESTIGE: 4500 });
verifier("Gbashi bike : dès 3 500", offres.PRIX_MINIMUM_GBASHI_BIKE_XOF, 3500);
verifier("Padel bike : 3 500 par personne, 3 h de padel", [offres.PRIX_PADEL_BIKE_XOF, offres.DUREE_PADEL_HEURES], [3500, 3]);
verifier("road trip du samedi inchangé : Premium 3 125, Prestige 3 625", offres.PRIX_ROAD_TRIP_XOF, { PREMIUM: 3125, PRESTIGE: 3625 });

console.log("\n— Le dimanche matin : le road trip, comme le samedi");
verifier("les deux départs se réservent en ligne", offres.CRENEAUX_ROAD_TRIP.map((c: { code: string; enLigne: boolean }) => [c.code, c.enLigne]), [["samedi-matin", true], ["dimanche-matin", true]]);
verifier("ouverture par défaut : samedi et dimanche", [...offres.OUVERTURE_PAR_DEFAUT.creneauxActifs], ["samedi-matin", "dimanche-matin"]);
await depot.reglerCreneau("dimanche-matin", true);
const ouverture = await lireOuverture();
verifier("réglage en base « dimanche ouvert » (comme en production) : ouvert", ouverture.creneauxActifs.has("dimanche-matin"), true);
verifier("un dimanche : accepté par le serveur", motifDeRefus(ouverture, { offre: "road-trip", dateDebut: dimanche, dateFin: dimanche, heureDebut: 8 }), null);
verifier("un samedi : accepté", motifDeRefus(ouverture, { offre: "road-trip", dateDebut: samedi, dateFin: samedi, heureDebut: 8 }), null);
verifier("location libre le dimanche à 14 h : acceptée", motifDeRefus(ouverture, { offre: "location-libre", dateDebut: dimanche, dateFin: dimanche, heureDebut: 14, dureeHeures: 2 }), null);
verifier("location libre le dimanche à 9 h : refusée, c'est l'heure du road trip", espaces(motifDeRefus(ouverture, { offre: "location-libre", dateDebut: dimanche, dateFin: dimanche, heureDebut: 9, dureeHeures: 1 })), "Le dimanche, de 8 h à 11 h, c'est l'heure du road trip : la location libre ne peut pas empiéter sur ces heures.");
const { nomDuRoadTrip } = await charger("src/lib/format.ts");
verifier("un dimanche jusqu'au 8 novembre garde le nom Gbashi bike", [nomDuRoadTrip({ dateDebut: "2026-11-08", heureDebut: 8 }), nomDuRoadTrip({ dateDebut: "2026-10-25", heureDebut: 8 })], ["Gbashi bike", "Gbashi bike"]);
verifier("un dimanche à partir du 15 novembre : « Road trip »", nomDuRoadTrip({ dateDebut: "2026-11-15", heureDebut: 8 }), "Road trip");
verifier("le message « sur commande » reste prêt pour un départ qui le serait", espaces(offres.motifDepartSurCommande({ produit: "Gbashi bike", libelle: "Dimanche" })), "Gbashi bike se commande sur WhatsApp, au +229 01 91 00 22 01 : il ne se réserve plus en ligne.");

console.log("\n— Le prix au comptoir et en ligne");
const devis = (gamme: string, date: string, nombrePersonnes: number, especes: boolean) =>
  calculerDevis({ offre: "road-trip", gamme, date, nombrePersonnes, especes });
verifier("road trip du dimanche en ligne : Premium 3 125, Prestige 3 625", [devis("PREMIUM", dimanche, 1, false).totalXof, devis("PRESTIGE", dimanche, 1, false).totalXof], [3125, 3625]);
verifier("comptoir, road trip du dimanche Premium, 2 personnes : 6 000 (125 F retirés)", devis("PREMIUM", dimanche, 2, true).totalXof, 6000);
verifier("la ligne dit « Road trip » le dimanche", devis("PREMIUM", dimanche, 2, true).lignes[0].libelle, "Road trip, 2 personnes");
verifier("comptoir, road trip du samedi Premium, 2 personnes : 6 000 (125 F retirés)", devis("PREMIUM", samedi, 2, true).totalXof, 6000);
verifier("en ligne, road trip du samedi Prestige : 3 625", devis("PRESTIGE", samedi, 1, false).totalXof, 3625);
let refusClassiqueSamedi = "";
try {
  devis("CLASSIQUE", samedi, 1, true);
} catch (erreur) {
  refusClassiqueSamedi = espaces((erreur as Error).message);
}
verifier("Classique le samedi : toujours refusé", refusClassiqueSamedi, "Le road trip du samedi se fait en vélo Premium ou Prestige. En Classique, choisissez la location libre.");

console.log("\n— Ce que disent les pages");
verifier("Classique : plus de sortie encadrée en ligne", offres.sortieEncadreeDe("CLASSIQUE", 3), null);
verifier("Premium (11 vélos) : « road trip dès 3 125 », groupe de 10", offres.sortieEncadreeDe("PREMIUM", 11), { nom: "Road trip", nomDansLaPhrase: "road trip", avantPrix: "dès", prixMinimum: 3125, groupeMin: 10 });
verifier("Prestige (10 vélos) : « road trip le samedi à 3 625 »", offres.sortieEncadreeDe("PRESTIGE", 10)?.prixMinimum, 3625);
verifier("note du Classique : « Le road trip se fait en vélo Premium ou Prestige. »", offres.noteDepartsHorsGamme("CLASSIQUE", 3), "Le road trip se fait en vélo Premium ou Prestige.");
verifier("note du Premium (11 vélos) : aucune", offres.noteDepartsHorsGamme("PREMIUM", 11), null);
verifier("le Classique ne roule plus le dimanche non plus", [offres.roadTripPossible("CLASSIQUE", dimanche), espaces(offres.motifRoadTripGamme("CLASSIQUE", dimanche))], [false, "Le road trip du dimanche se fait en vélo Premium ou Prestige. En Classique, choisissez la location libre."]);
verifier("gammes du dimanche : Premium ou Prestige", offres.gammesDuDepart("dimanche-matin"), "Premium ou Prestige");
verifier("messages WhatsApp : « commander Gbashi bike », « réserver Padel bike »", [MESSAGES_WHATSAPP.gbashiBike.includes("commander Gbashi bike"), MESSAGES_WHATSAPP.padelBike.includes("réserver Padel bike")], [true, true]);

console.log("\n— Les vidéos Padel bike et leurs affiches");
verifier(
  "4 vidéos, chacune présente avec son affiche",
  [AFFICHES_PADEL.length, AFFICHES_PADEL.every((a: { video?: string }) => Boolean(a.video) && existsSync(join(projet, "public", a.video!)))],
  [4, true],
);
for (const affiche of (AFFICHES_PADEL as { src: string; alt: string }[]).filter((a) => !a.src.endsWith("terrain.jpg"))) {
  const fichier = join(projet, "public", affiche.src);
  const meta = existsSync(fichier) ? await sharp(fichier).metadata() : null;
  verifier(`${affiche.src} : présente, 600 x 800, texte alternatif`, [meta?.width, meta?.height, affiche.alt.length > 20], [600, 800, true]);
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
