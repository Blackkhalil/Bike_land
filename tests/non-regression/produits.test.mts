// Nos produits : la saison d'Octobre rose (au jour du Bénin), le nom de
// Gbashi bike sur le road trip du dimanche, et l'email de confirmation.
// Mode démonstration, envois interceptés.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) delete process.env[nom];
process.env.RESEND_API_KEY = "factice";
process.env.ADMIN_EMAIL = "gerant@example.com";

const envois: { a: string; sujet: string; texte: string; html: string }[] = [];
globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  const corps = JSON.parse(String(init?.body));
  envois.push({ a: corps.to[0], sujet: corps.subject, texte: corps.text, html: corps.html });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (chemin: string) => import(pathToFileURL(join(projet, chemin)).href);
const produits = await charger("src/data/produits.ts");
const offres = await charger("src/data/offres.ts");
const format = await charger("src/lib/format.ts");
const dates = await charger("src/lib/dates.ts");
const site = await charger("src/lib/site.ts");
const { depot } = await charger("src/lib/db/index.ts");
const email = await charger("src/lib/email.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const espaces = (v: unknown) => JSON.stringify(v)?.replace(/[  ]/g, " ");
  const ok = espaces(obtenu) === espaces(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

const { OCTOBRE_ROSE } = await charger("src/data/octobre-rose.ts");
const { octobreRoseEnCours, rendezVousOctobreRose } = produits;

// --- La saison, sortie non fixée : tout octobre, et rien d'autre, à l'heure
// du Bénin (UTC+1) quel que soit le fuseau de l'appareil.
const a = (iso: string) => octobreRoseEnCours(new Date(iso));
const sortiesFixees = OCTOBRE_ROSE.sorties;
OCTOBRE_ROSE.sorties = [];
verifier("30 sept. 23 h 59 au Bénin (22:59 UTC) : hors saison", a("2026-09-30T22:59:59.999Z"), false);
verifier("1er oct. 0 h au Bénin (30 sept. 23:00 UTC) : en saison", a("2026-09-30T23:00:00.000Z"), true);
verifier("mi-octobre : en saison", a("2026-10-14T12:00:00Z"), true);
verifier("sans sortie fixée, 31 oct. 23 h 59 au Bénin : en saison", a("2026-10-31T22:59:59.999Z"), true);
verifier("1er nov. 0 h au Bénin (31 oct. 23:00 UTC) : hors saison", a("2026-10-31T23:00:00.000Z"), false);
verifier("octobre de l'année suivante, sans date : rien d'annoncé, la campagne est de 2026", a("2027-10-05T12:00:00Z"), false);
OCTOBRE_ROSE.annee = 2027;
verifier("campagne renouvelée pour 2027 : en saison en octobre 2027", a("2027-10-05T12:00:00Z"), true);
OCTOBRE_ROSE.annee = 2026;
const { tarifOctobreRose } = produits;
verifier("sortie non fixée : pas de tarif", tarifOctobreRose(), null);
verifier("sortie non fixée : pas de rendez-vous", rendezVousOctobreRose(), null);
OCTOBRE_ROSE.sorties = sortiesFixees.map((sortie: Record<string, unknown>) => ({ ...sortie, prixXof: 0 }));
verifier("sortie gratuite : « Gratuit », pas « 0 FCFA »", tarifOctobreRose(), "Gratuit");
OCTOBRE_ROSE.sorties = sortiesFixees;
verifier("le 1er du mois s'écrit « 1er »", [format.formatDate("2026-11-01"), format.formatDateAvecJour("2026-11-01")], ["1er novembre 2026", "dimanche 1er novembre"]);
verifier("les autres jours ne bougent pas", [format.formatDate("2026-11-11"), format.formatDateAvecJour("2026-10-21")], ["11 novembre 2026", "mercredi 21 octobre"]);

// --- Sorties fixées : jusqu'au départ du dernier groupe, à la minute.
verifier("rendez-vous en toutes lettres", rendezVousOctobreRose(), "samedi 24 et dimanche 25 octobre, rassemblement à 16 h, départ 16 h 30");
verifier("la veille : en saison", a("2026-10-23T20:00:00Z"), true);
verifier("samedi 16 h 30 : le dimanche reste à venir, en saison", a("2026-10-24T15:30:00Z"), true);
verifier("dimanche 16 h 29 au Bénin : en saison", a("2026-10-25T15:29:00Z"), true);
verifier("dimanche 16 h 30 au Bénin : effacée, le dernier groupe est parti", a("2026-10-25T15:30:00Z"), false);
verifier("31 oct. : effacée sans attendre la fin du mois", a("2026-10-31T22:59:59.999Z"), false);
verifier("octobre suivant avec la sortie d'avant : rien d'annoncé", a("2027-10-05T12:00:00Z"), false);
void dates;

// --- Gbashi bike : le créneau du dimanche porte son nom.
verifier("créneau du dimanche 8 h : le road trip, sans nom propre", offres.creneauDuDepart("2026-10-18", 8)?.produit, null);
verifier("créneau du samedi 8 h : sans nom propre", offres.creneauDuDepart("2026-10-17", 8)?.produit, null);
verifier("un mercredi : aucun créneau", offres.creneauDuDepart("2026-10-14", 8), undefined);
verifier("dimanche à une autre heure : aucun créneau", offres.creneauDuDepart("2026-10-18", 14), undefined);
verifier("créneau du jour, un dimanche passé : dimanche-matin", offres.creneauDuJour("2026-10-11")?.code, "dimanche-matin");
verifier("plus de consigne de tenue de sport le dimanche", offres.creneauDuDepart("2026-10-18", 8)?.consigne, null);
verifier("le samedi : pas de consigne", offres.creneauDuDepart("2026-10-17", 8)?.consigne, null);
verifier(
  "résumé d'un road trip du dimanche",
  format.resumeOffre({ offre: "road-trip", nombrePersonnes: 2, dateDebut: "2026-10-18", heureDebut: 8 }),
  "Gbashi bike · 2 personnes",
);
verifier(
  "résumé d'un road trip du samedi",
  format.resumeOffre({ offre: "road-trip", nombrePersonnes: 1, dateDebut: "2026-10-17", heureDebut: 8 }),
  "Road trip · 1 personne",
);
verifier(
  "résumé sans date (ancien appel) : Road trip",
  format.resumeOffre({ offre: "road-trip", nombrePersonnes: 3 }),
  "Road trip · 3 personnes",
);
verifier(
  "location libre un dimanche : inchangée",
  format.resumeOffre({ offre: "location-libre", nombrePersonnes: 1, dureeHeures: 2, dateDebut: "2026-10-18", heureDebut: 11 }),
  "Location libre · 2 h",
);
verifier(
  "les départs proposés : le samedi et le dimanche (road trip, depuis le 9 novembre 2026)",
  offres.creneauxDisponibles(new Date("2026-10-14T10:00:00Z"), {
    creneauxActifs: new Set(["samedi-matin", "dimanche-matin"]),
    joursFermes: [],
  }).map((c: { code: string; produit: string | null; date: string }) => [c.code, c.produit, c.date]),
  [["samedi-matin", null, "2026-10-17"], ["dimanche-matin", null, "2026-10-18"]],
);

// --- « Sold out » : un départ fermé reste affiché, à sa date.
const mercredi = new Date("2026-10-14T10:00:00Z"); // mercredi 14 octobre, 11 h au Bénin
const ouvertures = (actifs: string[], joursFermes: { date: string; formule: string }[] = []) => ({
  creneauxActifs: new Set(actifs),
  joursFermes,
});
const resume = (liste: { code: string; date: string }[]) => liste.map((d) => `${d.code}:${d.date}`);
verifier(
  "tout ouvert : aucun sold out",
  resume(offres.departsComplets(mercredi, ouvertures(["samedi-matin", "dimanche-matin"]))),
  [],
);
verifier(
  "samedi fermé dans le tableau de bord : samedi 17 sold out, rien de proposé le samedi",
  [
    resume(offres.departsComplets(mercredi, ouvertures(["dimanche-matin"]))),
    resume(offres.creneauxDisponibles(mercredi, ouvertures(["dimanche-matin"]))),
  ],
  [["samedi-matin:2026-10-17"], ["dimanche-matin:2026-10-18"]],
);
verifier(
  "jour du 17 fermé seulement : samedi 17 sold out, samedi 24 proposé",
  [
    resume(offres.departsComplets(mercredi, ouvertures(["samedi-matin", "dimanche-matin"], [{ date: "2026-10-17", formule: "road-trip" }]))),
    resume(offres.creneauxDisponibles(mercredi, ouvertures(["samedi-matin", "dimanche-matin"], [{ date: "2026-10-17", formule: "road-trip" }]))),
  ],
  [["samedi-matin:2026-10-17"], ["samedi-matin:2026-10-24", "dimanche-matin:2026-10-18"]],
);
verifier(
  "jour fermé pour « toutes » les formules : aussi sold out",
  resume(offres.departsComplets(mercredi, ouvertures(["samedi-matin", "dimanche-matin"], [{ date: "2026-10-17", formule: "toutes" }]))),
  ["samedi-matin:2026-10-17"],
);
verifier(
  "jour fermé à la seule location libre : le road trip n'est pas sold out",
  resume(offres.departsComplets(mercredi, ouvertures(["samedi-matin", "dimanche-matin"], [{ date: "2026-10-17", formule: "location-libre" }]))),
  [],
);
verifier(
  "vendredi 23 h, samedi fermé : le samedi du lendemain est clos, c'est le suivant qui est sold out",
  resume(offres.departsComplets(new Date("2026-10-16T22:00:00Z"), ouvertures(["dimanche-matin"]))),
  ["samedi-matin:2026-10-24"],
);
verifier(
  "tout fermé : le samedi et le dimanche sold out",
  resume(offres.departsComplets(mercredi, ouvertures([]))),
  ["samedi-matin:2026-10-17", "dimanche-matin:2026-10-18"],
);

// --- WhatsApp : la seconde ligne, message encodé.
verifier(
  "lien WhatsApp avec message",
  site.lienWhatsApp("Bonjour Bike Land, j'ai une question."),
  "https://wa.me/2290191002201?text=Bonjour%20Bike%20Land%2C%20j'ai%20une%20question.",
);
verifier("navigation : Nos produits en tête", site.navigationPrincipale[0], { libelle: "Nos produits", href: "/produits" });

// --- Depuis le 9 novembre 2026, le dimanche matin est un road trip comme le
// samedi ; un dimanche passé garde son nom de Gbashi bike.
const { calculerDevis } = await charger("src/lib/tarification.ts");
verifier(
  "résumé d'un road trip d'un dimanche à venir (15 novembre)",
  format.resumeOffre({ offre: "road-trip", nombrePersonnes: 10, dateDebut: "2026-11-15", heureDebut: 8 }),
  "Road trip · 10 personnes",
);
verifier(
  "road trip du dimanche : Premium 3 125, Prestige 3 625, comme le samedi",
  ["PREMIUM", "PRESTIGE"].map((gamme) => calculerDevis({ offre: "road-trip", gamme, date: "2026-11-15", nombrePersonnes: 1 }).totalXof),
  [3125, 3625],
);
verifier("la ligne d'un dimanche à venir dit « Road trip »", calculerDevis({ offre: "road-trip", gamme: "PREMIUM", date: "2026-11-15", nombrePersonnes: 10 }).lignes[0].libelle, "Road trip, 10 personnes");
verifier("roadTripPossible : le Classique ni le samedi ni le dimanche", [offres.roadTripPossible("CLASSIQUE", "2026-11-14"), offres.roadTripPossible("CLASSIQUE", "2026-11-15")], [false, false]);

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
