// Vérifie le compteur des réservations refusées faute de vélo, sans toucher
// à la base (mode démo) : la ligne écrite au journal, ce qu'elle contient,
// et la phrase que l'administration en tire.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

delete process.env.DATABASE_URL;
const charger = (chemin: string) => import(pathToFileURL(join(process.cwd(), chemin)).href);
const refus = await charger("src/lib/refus.ts");
const journal = await charger("src/lib/journal.ts");
const { depot } = await charger("src/lib/db/index.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
};
/** Les espaces insécables de l'affichage, ramenées à des espaces simples pour comparer. */
const simple = (texte: string) => texte.replace(/[  ]/g, " ");

// 1. La ligne : le jour, la gamme, le créneau, et rien du client.
const gammePleine = {
  code: "INDISPONIBLE",
  offre: "location-libre",
  gamme: "CLASSIQUE",
  date: "2026-11-28",
  heureDebut: 16,
  heureFin: 18,
  personnes: 2,
  places: 0,
};
verifier("ligne d'une gamme pleine", refus.evenementDeRefus(gammePleine), {
  type: "reservation-refusee",
  details: {
    code: "INDISPONIBLE",
    offre: "location-libre",
    date: "2026-11-28",
    personnes: 2,
    gamme: "CLASSIQUE",
    heureDebut: 16,
    heureFin: 18,
    places: 0,
  },
  auteur: "site",
});
verifier(
  "sans gamme ni places connues, la ligne ne les invente pas",
  Object.keys(refus.evenementDeRefus({ code: "COMPLET", offre: "padel-bike", date: "2026-11-28", personnes: 4 }).details),
  ["code", "offre", "date", "personnes"],
);

// 2. L'écriture au journal, et sa relecture par type.
const avant = (await depot.listerJournal({ type: refus.TYPE_REFUS })).length;
await refus.journaliserRefus(gammePleine);
await refus.journaliserRefus({
  code: "PLACES",
  offre: "padel-bike",
  date: "2026-11-29",
  heureDebut: 18,
  heureFin: 23,
  personnes: 6,
  places: 3,
});
const lignes = await depot.listerJournal({ type: refus.TYPE_REFUS });
verifier("deux refus, deux lignes au journal", lignes.length - avant, 2);
verifier("écrites par le site", lignes.every((ligne: { auteur: string }) => ligne.auteur === "site"), true);

// 3. Ce que l'administration affiche.
verifier("nom de l'événement", journal.libelleEvenement("reservation-refusee"), "Réservation refusée faute de vélo");
const parDate = (date: string) => lignes.find((ligne: { details: { date: string } }) => ligne.details.date === date);
const resumeGamme = journal.resumeEvenement(parDate("2026-11-28"));
verifier("titre d'une gamme pleine", simple(resumeGamme.titre), "Gamme Classique : complet le samedi 28 novembre, de 16 h à 18 h");
verifier("détail d'une gamme pleine", simple(resumeGamme.lignes[0]), "Location libre, 2 demandés, 0 vélo libre.");
const resumePadel = journal.resumeEvenement(parDate("2026-11-29"));
verifier("titre de Padel bike", simple(resumePadel.titre), "Padel bike : pas assez de vélos le dimanche 29 novembre, de 18 h à 23 h");
verifier("détail de Padel bike", simple(resumePadel.lignes[0]), "Padel bike, 6 demandés, 3 vélos libres.");

if (echecs > 0) process.exitCode = 1;
