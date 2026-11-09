// Padel bike réglé depuis l'administration : valeurs de départ, schéma,
// lecture des réglages, règles du jour (ouverture, jours, délai), prix
// réglé, réservation en ligne en démonstration, horaire retenu.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "RESEND_API_KEY", "NEXT_PUBLIC_PADEL_BIKE_OUVERTURE"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const reglagesData = await charger("src/data/reglages.ts");
const padelBike = await charger("src/data/padel-bike.ts");
const { lireReglages, enregistrerReglages } = await charger("src/lib/reglages.ts");
const { POST: reserver } = await charger("src/app/api/reservations/route.ts");
const { POST: disponibilite } = await charger("src/app/api/disponibilite/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { formatCreneau, formatPlageReservation } = await charger("src/lib/format.ts");
const { ajouterJours } = await charger("src/lib/dates.ts");
const { heureAuBenin } = await charger("src/data/offres.ts");
const { lireOuverture, padelBikeOuvertEnLigne } = await charger("src/lib/ouverture.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[\u00a0\u202f]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
const espaces = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");
const appeler = async (route: (r: Request) => Promise<Response>, url: string, corps: unknown, ip: string) => {
  const reponse = await route(
    new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(corps) }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};
// Un instant à l'heure du Bénin (UTC+1).
const benin = (date: string, heure: string) => Date.parse(`${date}T${heure}:00Z`) - 3_600_000;
const jourSemaine = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

const R = reglagesData.REGLAGES_PADEL_PAR_DEFAUT;
// Tous les jours programmés, pour les règles qui ne portent pas sur le programme.
const TOUS = { ...R, jours: [0, 1, 2, 3, 4, 5, 6] };
const SEMAINE = [0, 1, 2, 3, 4, 5, 6];
const P = padelBike;

console.log("\n— Valeurs de départ");
verifier(
  "18 h 30 - 22 h 30, 3 500 F, aucun jour programmé, 2 à 12, ouverture le 20 novembre, 3 h avant",
  [R.depart, R.retour, R.prixXof, R.dureePadelHeures, R.jours.length, R.dates.length, R.personnesMin, R.personnesMax, R.ouverture, R.clotureHeuresAvant],
  ["18:30", "22:30", 3500, 3, 0, 0, 2, 12, "2026-11-20", 3],
);
verifier("vélos pris de 18 h à 23 h", reglagesData.blocPadel(R), { heureDebut: 18, heureFin: 23 });
verifier(
  "en clair : 18 h 30, 3 h, 1 h 30, plage",
  [reglagesData.formatHeureMinute("18:30"), reglagesData.formatHeureMinute("09:00"), reglagesData.formatDureeHeures(3), reglagesData.formatDureeHeures(1.5), P.plageHorairePadel(R)],
  ["18 h 30", "9 h", "3 h", "1 h 30", "18 h 30 - 22 h 30"],
);
verifier(
  "jours en clair",
  [[0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5], [6, 0], [2, 4, 6], [5]].map((j) => reglagesData.joursEnClair(j)),
  ["tous les jours", "du lundi au vendredi", "le samedi et le dimanche", "le mardi, le jeudi et le samedi", "le vendredi"],
);
verifier("ouverture : vendredi 20 novembre", P.jourOuverturePadel(R), "vendredi 20 novembre");

console.log("\n— Ce qu'un réglage peut valoir");
const s = reglagesData.schemaReglagesPadel;
verifier("valeurs de départ acceptées", s.safeParse(R).success, true);
verifier("retour avant le départ refusé", s.safeParse({ ...R, retour: "18:00" }).success, false);
verifier("retour après 23 h refusé", s.safeParse({ ...R, retour: "23:30" }).success, false);
verifier("minimum au-dessus du maximum refusé", s.safeParse({ ...R, personnesMin: 5, personnesMax: 4 }).success, false);
verifier("plus de 12 personnes refusé", s.safeParse({ ...R, personnesMax: 15 }).success, false);
verifier("prix sous 200 F refusé", s.safeParse({ ...R, prixXof: 150 }).success, false);
verifier("aucun jour : accepté (rien de programmé, ou des dates seulement)", s.safeParse({ ...R, jours: [] }).success, true);
verifier("dates dédoublonnées et triées", s.parse({ ...R, dates: ["2026-11-28", "2026-11-21", "2026-11-28"] }).dates, ["2026-11-21", "2026-11-28"]);
verifier("date impossible refusée", s.safeParse({ ...R, dates: ["2026-02-30"] }).success, false);
verifier("heure mal écrite refusée", s.safeParse({ ...R, depart: "18h30" }).success, false);
verifier("durée au quart d'heure refusée, à la demi-heure acceptée", [s.safeParse({ ...R, dureePadelHeures: 1.25 }).success, s.safeParse({ ...R, dureePadelHeures: 1.5 }).success], [false, true]);
verifier("jours dédoublonnés et triés", s.parse({ ...R, jours: [6, 0, 6] }).jours, [0, 6]);

console.log("\n— Lecture des réglages enregistrés");
const lire = (valeur: string | null) => reglagesData.lireReglagesAvec(async () => valeur);
verifier("rien d'enregistré : valeurs de départ", (await lire(null)).padel, R);
const partiel = (await lire(JSON.stringify({ prixXof: 4000 }))).padel;
verifier("un seul champ enregistré : les autres par défaut", [partiel.prixXof, partiel.depart, partiel.jours.length], [4000, "18:30", 0]);
verifier("JSON illisible : valeurs de départ", (await lire("{oups")).padel, R);
verifier("valeur impossible : valeurs de départ", (await lire(JSON.stringify({ retour: "10:00" }))).padel, R);

console.log("\n— Ouverture, jours et délai (horloge fixée)");
const veille = benin("2026-11-19", "12:00");
verifier(
  "19 novembre, midi : fermé, refus FERME, aucun jour proposé",
  [P.padelBikeOuvert(TOUS, veille), P.motifRefusPadel(TOUS, "2026-11-21", veille)?.code, P.joursPadelReservables(TOUS, veille).length],
  [false, "FERME", 0],
);
verifier("l'ouverture : minuit du 20, heure du Bénin", new Date(P.prochainChangementPadel(R, veille)!).toISOString(), "2026-11-19T23:00:00.000Z");
const matin20 = benin("2026-11-20", "10:00");
verifier("le 20 à 10 h : ouvert, le 20 se réserve encore", [P.padelBikeOuvert(TOUS, matin20), P.joursPadelReservables(TOUS, matin20)[0], P.motifRefusPadel(TOUS, "2026-11-20", matin20)], [true, "2026-11-20", null]);
verifier("le départ du 20, 18 h 30 Bénin, soit 17 h 30 UTC", new Date(P.instantDepartPadel(R, "2026-11-20")).toISOString(), "2026-11-20T17:30:00.000Z");
verifier("la clôture du 20 : 15 h 30 Bénin", new Date(P.cloturePadel(R, "2026-11-20")).toISOString(), "2026-11-20T14:30:00.000Z");
const apres = benin("2026-11-20", "15:31");
verifier("le 20 à 15 h 31 : le 20 est clos, le premier jour est le 21", [P.motifRefusPadel(TOUS, "2026-11-20", apres)?.code, P.joursPadelReservables(TOUS, apres)[0]], ["DATE", "2026-11-21"]);
verifier("60 jours proposés au plus, tous les jours de départ", P.joursPadelReservables(TOUS, matin20).length, 61);
verifier("au-delà de 60 jours : refusé", P.motifRefusPadel(TOUS, "2027-01-30", matin20)?.code, "DATE");
const weekend = { ...R, jours: [6, 0] };
verifier("week-end seulement : un mercredi refusé, et le dit", espaces(P.motifRefusPadel(weekend, "2026-11-25", matin20)?.message ?? "").includes("le samedi et le dimanche"), true);
verifier("week-end seulement : rien que des samedis et des dimanches", P.joursPadelReservables(weekend, matin20).every((d: string) => [0, 6].includes(jourSemaine(d))), true);
const matin = { ...TOUS, depart: "09:00", retour: "12:00" };
verifier("un départ le matin : le samedi, pris par le road trip ; le mardi, libre", [P.departPadelCeJour(matin, "2026-11-21"), P.departPadelCeJour(matin, "2026-11-24")], [false, true]);
console.log("\n— Le programme des départs");
verifier("rien de programmé : aucun jour proposé, refus qui le dit", [P.joursPadelReservables(R, matin20).length, espaces(P.motifRefusPadel(R, "2026-11-21", matin20)?.message ?? "").startsWith("Aucun départ de Padel bike n'est programmé")], [0, true]);
verifier("rien de programmé : « Dates bientôt annoncées »", espaces(P.quandPadel(R, matin20)), "Dates bientôt annoncées, 18 h 30 - 22 h 30");
const datesSeules = { ...R, dates: ["2026-11-21", "2026-11-28", "2026-11-19"] };
verifier("dates seules : ces jours-là seulement (le 19, avant l'ouverture, non)", P.joursPadelReservables(datesSeules, matin20), ["2026-11-21", "2026-11-28"]);
verifier("dates seules : un autre jour refusé, « aux dates programmées »", espaces(P.motifRefusPadel(datesSeules, "2026-11-22", matin20)?.message ?? "").includes("il part aux dates programmées, à 18 h 30"), true);
verifier("dates seules : les prochains départs annoncés", espaces(P.quandPadel(datesSeules, matin20)), "Sam. 21 nov., sam. 28 nov., 18 h 30 - 22 h 30");
const semaineEtDates = { ...R, jours: [6], dates: ["2026-11-25"] };
verifier("le samedi et une date : les samedis et le mercredi 25", P.joursPadelReservables(semaineEtDates, matin20).slice(0, 3), ["2026-11-21", "2026-11-25", "2026-11-28"]);
verifier("le samedi seulement : « Le samedi, 18 h 30 - 22 h 30 »", espaces(P.quandPadel({ ...R, jours: [6] }, matin20)), "Le samedi, 18 h 30 - 22 h 30");
verifier("en clair", [reglagesData.programmeEnClair({ jours: [], dates: [] }), reglagesData.programmeEnClair({ jours: [], dates: ["2026-11-21"] }), reglagesData.programmeEnClair({ jours: [6, 0], dates: [] }), reglagesData.programmeEnClair({ jours: [6], dates: ["2026-11-25"] })], ["aucun départ programmé pour le moment", "aux dates programmées", "le samedi et le dimanche", "le samedi, et à d'autres dates programmées"]);
verifier("jour programmé : la semaine ou la date", [P.jourProgrammePadel(semaineEtDates, "2026-11-28"), P.jourProgrammePadel(semaineEtDates, "2026-11-25"), P.jourProgrammePadel(semaineEtDates, "2026-11-26")], [true, true, false]);
verifier("délai à 0 : jusqu'à l'heure du départ", [P.delaiPadelEnClair({ clotureHeuresAvant: 0 }), espaces(P.delaiPadelEnClair(R))], ["jusqu'à l'heure du départ", "jusqu'à 3 h avant le départ"]);

console.log("\n— Le prix réglé");
const avec = (padel: object) => ({ padel: { ...R, ...padel } });
verifier("4 000 F, 2 personnes : 8 000 F", calculerDevis({ offre: "padel-bike", nombrePersonnes: 2 }, avec({ prixXof: 4000 })).totalXof, 8000);
verifier("le détail dit 1 h 30 de padel", espaces(calculerDevis({ offre: "padel-bike", nombrePersonnes: 1 }, avec({ dureePadelHeures: 1.5 })).lignes[0].detail).includes("1 h 30 de padel"), true);
verifier("sans réglages : 3 500 F", calculerDevis({ offre: "padel-bike", nombrePersonnes: 1 }).totalXof, 3500);
verifier("au comptoir, même prix", calculerDevis({ offre: "padel-bike", nombrePersonnes: 2, especes: true }, avec({ prixXof: 4000 })).totalXof, 8000);

console.log("\n— En ligne, avant l'ouverture (réglages de départ)");
const ici = heureAuBenin();
const jour = ajouterJours(ici.date, 3);
const client = { prenom: "Awa", nom: "Padel", email: "awa.padel@example.com", telephone: "+229 01 97 00 00 01" };
const demande = (n: number, date = jour, autre = {}) => ({ offre: "padel-bike", date, nombrePersonnes: n, client, moyenPaiement: "MTN_MONEY", cgvAcceptees: true, ...autre });
let r = await appeler(reserver, "/api/reservations", demande(2), "203.0.113.90");
verifier("avant le 20 novembre : 403 FERME, aucun montant", [r.statut, r.donnees.code], [403, "FERME"]);

console.log("\n— Ouvert dès aujourd'hui, à 4 000 F");
await enregistrerReglages("padel", { ...R, ouverture: ici.date, prixXof: 4000 });
r = await appeler(reserver, "/api/reservations", demande(2), "203.0.113.89");
verifier("ouvert mais rien de programmé : 422 DATE", [r.statut, r.donnees.code], [422, "DATE"]);
await enregistrerReglages("padel", { ...R, ouverture: ici.date, prixXof: 4000, jours: SEMAINE });
verifier("relu après enregistrement", (await lireReglages()).padel.prixXof, 4000);
r = await appeler(reserver, "/api/reservations", demande(1), "203.0.113.91");
verifier("1 personne : 422 GROUPE, le champ le dit", [r.statut, r.donnees.code, Boolean(r.donnees.champs?.nombrePersonnes)], [422, "GROUPE", true]);
const dispo = await appeler(disponibilite, "/api/disponibilite", { toutes: true, dateDebut: jour, dateFin: jour, heureDebut: 18, heureFin: 23 }, "203.0.113.92");
verifier("disponibilité, toutes gammes, de 18 h à 23 h", [dispo.statut, typeof dispo.donnees.libres], [200, "number"]);
const libresAvant = dispo.donnees.libres as number;
// Le matin du même jour, avant la réservation : la comparaison se fait avec
// lui, pas avec le soir, que l'historique de démonstration remplit plus ou
// moins selon le jour où le test tourne.
const matinAvant = (await appeler(disponibilite, "/api/disponibilite", { toutes: true, dateDebut: jour, dateFin: jour, heureDebut: 9, heureFin: 12 }, "203.0.113.92")).donnees.libres as number;
r = await appeler(reserver, "/api/reservations", demande(3, jour, { heureDebut: 9 }), "203.0.113.93");
verifier("3 personnes : 201, confirmée en démonstration", [r.statut, r.donnees.confirmee], [201, true]);
const tokenPremier = r.donnees.token as string;
const reservation = await depot.trouverReservationParToken(tokenPremier);
verifier("vélos pris de 18 h à 23 h, horaire 18 h 30 - 22 h 30 (l'heure envoyée ignorée)", [reservation?.heureDebut, reservation?.heureFin, reservation?.horaire], [18, 23, { depart: "18:30", retour: "22:30" }]);
verifier("3 vélos, 12 000 F", [reservation?.lignes.length, reservation?.totalXof], [3, 12000]);
verifier("le créneau annoncé : de 18 h 30 à 22 h 30", espaces(formatCreneau(reservation)).endsWith("de 18 h 30 à 22 h 30"), true);
verifier("la plage : 18 h 30 - 22 h 30", espaces(formatPlageReservation(reservation)), "18 h 30 - 22 h 30");
const dispoApres = await appeler(disponibilite, "/api/disponibilite", { toutes: true, dateDebut: jour, dateFin: jour, heureDebut: 18, heureFin: 23 }, "203.0.113.92");
verifier("3 vélos de moins ce soir-là", dispoApres.donnees.libres, libresAvant - 3);
const dispoMatin = await appeler(disponibilite, "/api/disponibilite", { toutes: true, dateDebut: jour, dateFin: jour, heureDebut: 9, heureFin: 12 }, "203.0.113.92");
verifier("le matin, les vélos restent libres", dispoMatin.donnees.libres, matinAvant);
const restants = libresAvant - 3;
if (restants + 1 <= 12) {
  r = await appeler(reserver, "/api/reservations", demande(restants + 1, jour), "203.0.113.94");
  verifier("une personne de plus que de vélos libres : 409 PLACES, le compte dit ce qui reste", [r.statut, r.donnees.code, r.donnees.places], [409, "PLACES", restants]);
} else {
  console.log(`(trop de vélos libres, ${restants}, pour dépasser le maximum de 12 : plafond non vérifié ici)`);
}

console.log("\n— L'heure change : la réservation faite garde la sienne");
await enregistrerReglages("padel", { ...R, ouverture: ici.date, prixXof: 4000, depart: "19:00", retour: "23:00", jours: SEMAINE });
verifier("la réservation faite : toujours 18 h 30 - 22 h 30", (await depot.trouverReservationParToken(tokenPremier))?.horaire, { depart: "18:30", retour: "22:30" });
const relue = await depot.trouverReservationParToken((await appeler(reserver, "/api/reservations", demande(2, ajouterJours(ici.date, 4)), "203.0.113.95")).donnees.token);
verifier("une nouvelle part à 19 h : vélos de 19 h à 23 h", [relue?.heureDebut, relue?.heureFin, relue?.horaire?.depart], [19, 23, "19:00"]);

console.log("\n— Jours et délai réglés");
await enregistrerReglages("padel", { ...R, ouverture: ici.date, jours: [6] });
let mercredi = ajouterJours(ici.date, 2);
while (jourSemaine(mercredi) !== 3) mercredi = ajouterJours(mercredi, 1);
r = await appeler(reserver, "/api/reservations", demande(2, mercredi), "203.0.113.96");
verifier("un mercredi, le samedi seulement : 422 DATE, sur le champ du jour", [r.statut, r.donnees.code, Boolean(r.donnees.champs?.date)], [422, "DATE", true]);
if (ici.heure <= 19) {
  const depart = `${String(ici.heure + 1).padStart(2, "0")}:00`;
  const retour = `${String(ici.heure + 3).padStart(2, "0")}:00`;
  await enregistrerReglages("padel", { ...R, ouverture: ici.date, depart, retour, clotureHeuresAvant: 3, jours: SEMAINE });
  r = await appeler(reserver, "/api/reservations", demande(2, ici.date), "203.0.113.97");
  verifier(`aujourd'hui, départ à ${depart}, réservation jusqu'à 3 h avant : 422 DATE`, [r.statut, r.donnees.code], [422, "DATE"]);
} else {
  console.log("(délai du jour non vérifié : trop tard dans la soirée pour régler un départ aujourd'hui)");
}

console.log("\n— Fermé depuis le tableau de bord");
await enregistrerReglages("padel", { ...R, ouverture: ici.date, jours: SEMAINE });
await depot.reglerCreneau("padel-bike", false);
verifier("fermé en ligne", padelBikeOuvertEnLigne(await lireOuverture()), false);
r = await appeler(reserver, "/api/reservations", demande(2, ajouterJours(ici.date, 5)), "203.0.113.98");
verifier("409 COMPLET", [r.statut, r.donnees.code], [409, "COMPLET"]);
await depot.reglerCreneau("padel-bike", true);
const jourFerme = ajouterJours(ici.date, 6);
await depot.fermerJour({ date: jourFerme, formule: "toutes" });
r = await appeler(reserver, "/api/reservations", demande(2, jourFerme), "203.0.113.99");
verifier("un jour fermé à toutes les formules : 409 COMPLET", [r.statut, r.donnees.code], [409, "COMPLET"]);
r = await appeler(reserver, "/api/reservations", demande(2, ajouterJours(ici.date, 7)), "203.0.113.100");
verifier("le lendemain, ouvert : 201", r.statut, 201);

console.log("\n— Le prix et l'horaire montrés au client (relecture du 9 novembre)");
const affiches = (await lireReglages()).padel;
const jourGarde = ajouterJours(ici.date, 8);
r = await appeler(reserver, "/api/reservations", demande(2, jourGarde, { attendu: { prixXof: affiches.prixXof + 500, depart: affiches.depart, retour: affiches.retour } }), "203.0.113.101");
verifier("prix changé depuis l'affichage : 409 REGLAGES, réglages du moment renvoyés", [r.statut, r.donnees.code, r.donnees.reglages?.prixXof], [409, "REGLAGES", affiches.prixXof]);
r = await appeler(reserver, "/api/reservations", demande(2, jourGarde, { attendu: { prixXof: affiches.prixXof, depart: "19:00", retour: affiches.retour } }), "203.0.113.102");
verifier("horaire changé depuis l'affichage : 409 REGLAGES", [r.statut, r.donnees.code], [409, "REGLAGES"]);
r = await appeler(reserver, "/api/reservations", demande(2, jourGarde, { attendu: { prixXof: affiches.prixXof, depart: affiches.depart, retour: affiches.retour } }), "203.0.113.103");
verifier("prix et horaire inchangés : 201, le total enregistré est renvoyé", [r.statut, r.donnees.totalXof], [201, 2 * affiches.prixXof]);
verifier(
  "réglages : départ à 22 h ou plus tard refusé (le comptoir ne l'enregistre pas)",
  [s.safeParse({ ...R, depart: "22:00", retour: "23:00" }).success, s.safeParse({ ...R, depart: "21:30", retour: "23:00" }).success],
  [false, true],
);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
