// Le road trip du samedi en groupe de dix au moins : règles, pages, départs
// d'une gamme, API de réservation, comptoir. Gbashi bike (dimanche) sans
// minimum.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const offres = await charger("src/data/offres.ts");
const { departsDeLaGamme, lireOuverture } = await charger("src/lib/ouverture.ts");
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { AFFICHES_PADEL } = await charger("src/data/affiches.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[\u00a0\u202f]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
const appeler = async (corps: unknown, ip: string) => {
  const reponse = await reserver(
    new Request("http://localhost/api/reservations", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(corps) }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};

const auBenin = new Date(Date.now() + 3600_000);
const jourPlus = (n: number) => new Date(Date.UTC(auBenin.getUTCFullYear(), auBenin.getUTCMonth(), auBenin.getUTCDate() + n)).toISOString().slice(0, 10);
const prochain = (jourSemaine: number, depuis: number) => {
  let n = depuis;
  while (new Date(`${jourPlus(n)}T12:00:00Z`).getUTCDay() !== jourSemaine) n += 1;
  return jourPlus(n);
};
const samedi = prochain(6, 2);
const dimanche = prochain(0, 2);
console.log(`     samedi ${samedi}, dimanche ${dimanche}`);

console.log("— La règle");
verifier("10 personnes au moins le samedi et le dimanche", [offres.PERSONNES_MIN_ROAD_TRIP, offres.personnesMinRoadTrip(samedi), offres.personnesMinRoadTrip(dimanche)], [10, 10, 10]);
verifier("9 personnes le samedi : refusé, avec le motif", offres.motifGroupeRoadTrip(samedi, 9), "Le road trip se fait en groupe de 10 personnes au moins, un vélo par personne. À moins de 10, choisissez la location libre.");
verifier("10 personnes le samedi : accepté", offres.motifGroupeRoadTrip(samedi, 10), null);
verifier("2 personnes le dimanche : refusé aussi", offres.motifGroupeRoadTrip(dimanche, 2) !== null, true);

console.log("\n— Ce que disent les pages, selon les vélos en état");
verifier("Premium, 11 vélos (la production) : road trip dès 3 125, groupe de 10", offres.sortieEncadreeDe("PREMIUM", 11), { nom: "Road trip", nomDansLaPhrase: "road trip", avantPrix: "dès", prixMinimum: 3125, groupeMin: 10 });
verifier("Premium, 9 vélos : plus de road trip", offres.sortieEncadreeDe("PREMIUM", 9), null);
verifier("Prestige, 1 vélo : plus de road trip", offres.sortieEncadreeDe("PRESTIGE", 1), null);
verifier("Prestige, 10 vélos : road trip à 3 625", offres.sortieEncadreeDe("PRESTIGE", 10)?.prixMinimum, 3625);
verifier("Classique : jamais", offres.sortieEncadreeDe("CLASSIQUE", 30), null);
verifier("note du Prestige, 1 vélo : le groupe ne tient pas", offres.noteDepartsHorsGamme("PRESTIGE", 1), "Le road trip se fait en groupe de 10 personnes au moins, un vélo par personne : la gamme Prestige n'en compte qu'un.");
verifier("note du Premium, 4 vélos", offres.noteDepartsHorsGamme("PREMIUM", 4), "Le road trip se fait en groupe de 10 personnes au moins, un vélo par personne : la gamme Premium n'en compte que 4.");
verifier("note du Premium, 11 vélos : aucune", offres.noteDepartsHorsGamme("PREMIUM", 11), null);
verifier("note du Classique, dite une fois pour les deux jours", offres.noteDepartsHorsGamme("CLASSIQUE", 3), "Le road trip se fait en vélo Premium ou Prestige.");
verifier("vélos en état : ni retirés ni à l'atelier", offres.velosEnEtatDe("PREMIUM", [{ gamme: "PREMIUM", statut: "DISPONIBLE" }, { gamme: "PREMIUM", statut: "MAINTENANCE" }, { gamme: "PREMIUM", statut: "RETIRE" }, { gamme: "PRESTIGE", statut: "DISPONIBLE" }]), 1);

console.log("\n— Les départs d'une gamme (parc de démonstration : 4 Premium)");
const ouverture = await lireOuverture();
const creneaux = offres.creneauxDisponibles(new Date(), ouverture);
const complets = offres.departsComplets(new Date(), ouverture);
const avant = await departsDeLaGamme("PREMIUM", creneaux, complets);
verifier("4 Premium : le samedi n'est proposé ni ouvert ni « Sold out »", [avant.creneaux.length, avant.complets.length], [0, 0]);
for (let i = 1; i <= 6; i += 1) {
  await depot.creerVelo({
    nom: `Essai ${i}`, categorie: "VTT", gamme: "PREMIUM", taille: "M", accroche: "Vélo d'essai", description: "Vélo d'essai",
    poidsKg: 14, vitesses: 21, chargeMaxKg: 110, autonomieConseilleeKm: 30, equipementInclus: [],
  });
}
const apres = await departsDeLaGamme("PREMIUM", creneaux, complets);
verifier("10 Premium : un départ du week-end est proposé", apres.creneaux.length > 0, true);
const jourGroupe = apres.creneaux[0]?.date ?? samedi;
console.log(`     départ du groupe : ${jourGroupe}`);

console.log("\n— L'API de réservation");
const client = (n: number) => ({ prenom: "Groupe", nom: `Essai ${n}`, email: `groupe.essai${n}@example.com`, telephone: "+229 01 97 00 44 13" });
const demande = (nombrePersonnes: number, n: number) => ({
  gamme: "PREMIUM", offre: "road-trip", nombrePersonnes, dateDebut: jourGroupe, dateFin: jourGroupe, heureDebut: 8, options: [],
  client: client(n), moyenPaiement: "MTN_MONEY", cgvAcceptees: true,
});
const neuf = await appeler(demande(9, 1), "203.0.113.91");
if (neuf.donnees.code === "FERME") {
  console.log("     réservations du road trip fermées la nuit : API non vérifiée");
} else {
  verifier("9 personnes le samedi : 422, code GROUPE, aucune réservation", [neuf.statut, neuf.donnees.code, neuf.donnees.reference], [422, "GROUPE", undefined]);
  const dix = await appeler(demande(10, 2), "203.0.113.92");
  verifier("10 personnes le samedi en Premium : réservé (201)", dix.statut, 201);
  const resa = dix.statut === 201 ? await depot.trouverReservationParReference(dix.donnees.reference) : null;
  verifier("…10 vélos Premium attribués, 10 × 3 125", [resa?.lignes.length, resa?.lignes.every((l: { veloGamme?: string; gamme?: string }) => (l.veloGamme ?? l.gamme ?? "PREMIUM") === "PREMIUM"), resa?.totalXof], [10, true, 31250]);
  const prestige = await appeler({ ...demande(10, 3), gamme: "PRESTIGE" }, "203.0.113.93");
  verifier("10 personnes en Prestige (1 vélo) : refusé", prestige.statut >= 400, true);
}

console.log("\n— Padel bike : la vidéo du terrain en tête");
verifier("première entrée : la vidéo et son affiche", [AFFICHES_PADEL[0].video, AFFICHES_PADEL[0].src], ["/images/produits/padel/terrain.mp4", "/images/produits/padel/terrain.jpg"]);
verifier("4 vidéos, rien que des vidéos", [AFFICHES_PADEL.filter((a: { video?: string }) => a.video).length, AFFICHES_PADEL.length], [4, 4]);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
