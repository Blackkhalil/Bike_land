// Modifier une vente en espèces déjà enregistrée (demande du responsable du
// 19 novembre 2026) : la route d'admin, le dépôt de démonstration, le journal.
// Aucune base réelle, aucun email réel : les envois sont interceptés.
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "ADMIN_PASSWORD", "REVALIDATION_SECRET"]) {
  delete process.env[nom];
}
process.env.BIKELAND_ROLE = "admin";

// Les envois d'email passent par fetch (Resend) : interceptés et comptés,
// rien ne quitte la machine. La clé factice n'est posée qu'une fois
// l'interception en place.
const envoisEmail: string[] = [];
const fetchOrigine = globalThis.fetch;
globalThis.fetch = (async (adresse: string | URL | Request, options?: RequestInit) => {
  const url = String(adresse instanceof Request ? adresse.url : adresse);
  if (url.includes("api.resend.com")) {
    envoisEmail.push(url);
    return new Response(JSON.stringify({ id: "factice" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return fetchOrigine(adresse, options);
}) as typeof fetch;
process.env.RESEND_API_KEY = "re_factice_pour_les_tests";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { POST } = await charger("src/app/api/admin/especes/route.ts");
const { PATCH } = await charger("src/app/api/admin/especes/[reference]/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { estVenteEspeces } = await charger("src/lib/reservations.ts");
const { dateEncaissement } = await charger("src/lib/statistiques.ts");
const { REGLAGES_PADEL_PAR_DEFAUT } = await charger("src/data/reglages.ts");
const { enregistrerReglages } = await charger("src/lib/reglages.ts");
const { resumeEvenement, TYPES_EVENEMENT } = await charger("src/lib/journal.ts");
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { velosApresModification, champsModifiables } = await charger("src/lib/modification-vente.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
/** Le texte tel qu'on le lit : espaces insécables et liants remis à plat. */
const net = (texte: string) => texte.replace(/[  ]/g, " ").replace(/⁠/g, "");

const vendre = async (corps: Record<string, unknown>) => {
  const reponse: Response = await POST(
    new Request("http://localhost/api/admin/especes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};
/** Les emails partis pendant une modification, toutes confondues : il n'en faut aucun. */
let emailsPendantModifications = 0;
const modifier = async (reference: string, corps: Record<string, unknown>) => {
  const avant = envoisEmail.length;
  const reponse: Response = await PATCH(
    new Request(`http://localhost/api/admin/especes/${reference}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }),
    { params: Promise.resolve({ reference }) },
  );
  const resultat = { statut: reponse.status, donnees: await reponse.json() };
  emailsPendantModifications += envoisEmail.length - avant;
  return resultat;
};
const lire = async (reference: string) => depot.trouverReservationParReference(reference);
type Ligne = { veloId: string; veloNom: string };
type Paiement = { estCaution: boolean; montantXof: number; encaissePar?: string; statut: string };
const paiementDe = (r: { paiements: Paiement[] }) => r.paiements.find((p) => !p.estCaution);

const jour = aujourdhui();
const client = { prenom: "Awa", nom: "Test", email: "awa.modif@example.com", telephone: "" };

// Padel bike réglé comme en production : 3 625 F en ligne, 3 500 F au comptoir, 17 h 30 - 20 h 30, le vendredi.
await enregistrerReglages("padel", { ...REGLAGES_PADEL_PAR_DEFAUT, prixXof: 3625, depart: "17:30", retour: "20:30", jours: [5], ouverture: jour });
let vendredi = ajouterJours(jour, 1);
while (new Date(`${vendredi}T12:00:00Z`).getUTCDay() !== 5) vendredi = ajouterJours(vendredi, 1);

/* ----------------------------------------------- 1. Moins de personnes */

const caisseDuJour = async () =>
  (await depot.listerReservations())
    .filter((r: { statut: string } & Record<string, unknown>) => estVenteEspeces(r) && r.statut !== "EN_ATTENTE_PAIEMENT" && dateEncaissement(r) === jour)
    .reduce((total: number, r: { totalXof: number }) => total + r.totalXof, 0);

const emailsAvantVente = envoisEmail.length;
const vente = await vendre({
  cleVente: "cle-modif-padel-1", offre: "padel-bike", nombrePersonnes: 7, date: vendredi, heureDebut: 17,
  client, encaissePar: "Koffi", montantAttenduXof: 24500, cgvAcceptees: true,
});
verifier("vente Padel bike pour 7 : 201 à 24 500 F", [vente.statut, vente.donnees.totalXof], [201, 24500]);
verifier("la vente envoie bien ses emails (l'interception fonctionne)", envoisEmail.length > emailsAvantVente, true);
const reference = vente.donnees.reference as string;
const venduePadel = await lire(reference);
const libresAvant = (await depot.velosLibres(vendredi, venduePadel.heureDebut, venduePadel.heureFin)).length;
const caisseAvant = await caisseDuJour();
const journalAvant = (await depot.listerJournal({ type: "vente-modifiee" })).length;

const emailsAvantModification = envoisEmail.length;
const infos: string[] = [];
const infoOrigine = console.info;
console.info = (...morceaux: unknown[]) => {
  infos.push(morceaux.map(String).join(" "));
};
const moins = await modifier(reference, { nombrePersonnes: 6, totalAttenduXof: 24500, nouveauTotalXof: 21000, modifiePar: "Zayed" });
console.info = infoOrigine;
verifier("7 → 6 personnes : 200, 21 000 F, 3 500 F de moins", [moins.statut, moins.donnees.totalXof, moins.donnees.ancienTotalXof, moins.donnees.differenceXof], [200, 21000, 24500, -3500]);
const apresMoins = await lire(reference);
verifier("6 personnes, 6 vélos, total et paiement à 21 000 F", [apresMoins.nombrePersonnes, apresMoins.lignes.length, apresMoins.totalXof, paiementDe(apresMoins)?.montantXof], [6, 6, 21000, 21000]);
verifier("prix de chaque vélo : 3 500 F", apresMoins.lignes.map((l: { prixUnitaireXof: number }) => l.prixUnitaireXof), [3500, 3500, 3500, 3500, 3500, 3500]);
verifier("un vélo libéré, nommé dans la réponse", moins.donnees.velosRetires.length, 1);
verifier("ce vélo n'est plus sur la vente", apresMoins.lignes.some((l: Ligne) => l.veloNom === moins.donnees.velosRetires[0]), false);
verifier("le créneau compte un vélo libre de plus", (await depot.velosLibres(vendredi, apresMoins.heureDebut, apresMoins.heureFin)).length, libresAvant + 1);
verifier("la caisse du jour suit : 3 500 F de moins", (await caisseDuJour()) - caisseAvant, -3500);
verifier("vente toujours encaissée le même jour, par Koffi", [dateEncaissement(apresMoins), paiementDe(apresMoins)?.encaissePar], [jour, "Koffi"]);

/* ----------------------------------------------- 8. Aucun email */

verifier("modification : aucun email envoyé", envoisEmail.length, emailsAvantModification);
verifier("modification : aucun email même journalisé", infos.filter((ligne) => ligne.includes("[email]")).length, 0);

/* ----------------------------------------------- 5. Le journal */

const lignes = await depot.listerJournal({ type: "vente-modifiee" });
verifier("une ligne de plus au journal", lignes.length, journalAvant + 1);
const ligne = lignes[0];
verifier("journal : type, référence, auteur", [ligne.type, ligne.reference, ligne.auteur], ["vente-modifiee", reference, "admin (Zayed)"]);
verifier("journal : avant et après en valeurs simples", [ligne.details.avant.personnes, ligne.details.avant.totalXof, ligne.details.apres.personnes, ligne.details.apres.totalXof, ligne.details.apres.encaissePar], [7, 24500, 6, 21000, "Koffi"]);
verifier("journal : champs changés", ligne.details.champs, ["personnes", "totalXof"]);
verifier("journal : le vélo libéré", ligne.details.velosRetires, moins.donnees.velosRetires);
verifier("journal : libellé du type", TYPES_EVENEMENT["vente-modifiee"], "Vente en espèces modifiée");
const resume = resumeEvenement(ligne);
verifier("journal : résumé en clair", net(resume.titre), `${reference} : 7 → 6 personnes, 24 500 F → 21 000 F, par Zayed`);
verifier("journal : le vélo libéré en clair", resume.lignes.map(net), [`Vélo libéré : ${moins.donnees.velosRetires[0]}`]);
const reduit = resumeEvenement({
  id: "jrn-1", type: "vente-modifiee", reference: "BL-ZPS2C5", auteur: "admin (Zayed)", creeLe: new Date().toISOString(),
  details: { avant: { personnes: 7, totalXof: 24500 }, apres: { personnes: 6, totalXof: 21000 }, veloRetire: "Mongoose", motif: "Six personnes et non sept" },
});
verifier("journal : la forme réduite se lit aussi", [net(reduit.titre), reduit.lignes.map(net)], [
  "BL-ZPS2C5 : 7 → 6 personnes, 24 500 F → 21 000 F, par Zayed",
  ["Vélo libéré : Mongoose", "Motif : Six personnes et non sept"],
]);
verifier("journal : espace insécable avant les deux-points", resume.titre.includes(" :"), true);

/* ----------------------------------------------- 7. Le total périmé : 409 */

const perime = await modifier(reference, { prenom: "Aminata", totalAttenduXof: 24500, nouveauTotalXof: 24500, modifiePar: "Zayed" });
verifier("total périmé : 409 CHANGEE, le total à jour renvoyé", [perime.statut, perime.donnees.code, perime.donnees.totalXof], [409, "CHANGEE", 21000]);
verifier("total périmé : rien n'est écrit", (await lire(reference)).client.prenom, "Awa");
const repete = await modifier(reference, { nombrePersonnes: 6, totalAttenduXof: 24500, nouveauTotalXof: 21000, modifiePar: "Zayed" });
verifier("même modification renvoyée (réponse perdue) : 200, déjà faite, rien de plus au journal",
  [repete.statut, repete.donnees.deja, (await depot.listerJournal({ type: "vente-modifiee" })).length],
  [200, true, journalAvant + 1]);
const mauvaisMontant = await modifier(reference, { nombrePersonnes: 5, totalAttenduXof: 21000, nouveauTotalXof: 20000, modifiePar: "Zayed" });
verifier("nouveau montant faux : 409 MONTANT, le bon renvoyé, rien d'écrit",
  [mauvaisMontant.statut, mauvaisMontant.donnees.code, mauvaisMontant.donnees.totalXof, (await lire(reference)).nombrePersonnes],
  [409, "MONTANT", 17500, 6]);

/* ----------------------------------------------- 2. Plus de personnes */

const plus = await modifier(reference, { nombrePersonnes: 7, totalAttenduXof: 21000, nouveauTotalXof: 24500, modifiePar: "Zayed" });
verifier("6 → 7 personnes avec un vélo libre : 200, 24 500 F, un vélo pris", [plus.statut, plus.donnees.totalXof, plus.donnees.velosAjoutes.length], [200, 24500, 1]);
// Plus aucun vélo libre ce soir-là : tous déclarés indisponibles.
const restants = await depot.velosLibres(vendredi, apresMoins.heureDebut, apresMoins.heureFin);
const indispos = [];
for (const velo of restants) indispos.push(await depot.ajouterIndisponibilite({ veloId: velo.id, date: vendredi, motif: "test", par: "admin (Test)" }));
const complet = await modifier(reference, { nombrePersonnes: 8, totalAttenduXof: 24500, nouveauTotalXof: 28000, modifiePar: "Zayed" });
verifier("7 → 8 sans vélo libre : 409 PLACES, dit en clair", [complet.statut, complet.donnees.code, net(complet.donnees.erreur)], [409, "PLACES", "Il ne reste que 7 vélos libres pour cette vente sur ce créneau : 7 personnes au plus."]);
verifier("refusé : la vente n'a pas bougé", [(await lire(reference)).nombrePersonnes, (await lire(reference)).totalXof], [7, 24500]);
for (const indispo of indispos) if (indispo) await depot.retirerIndisponibilite(indispo.id, "admin (Test)");

/* ----------------------------------------------- 3. Le jour et l'heure */

// Padel bike un autre vendredi : l'horaire des réglages, les vélos revus sur ce jour.
const autreVendredi = ajouterJours(vendredi, 7);
const deplacee = await modifier(reference, { date: autreVendredi, totalAttenduXof: 24500, nouveauTotalXof: 24500, modifiePar: "Zayed" });
const lueDeplacee = await lire(reference);
verifier("Padel bike déplacé d'une semaine : 200, même prix, horaire des réglages",
  [deplacee.statut, lueDeplacee.dateDebut, lueDeplacee.horaire, lueDeplacee.heureDebut, lueDeplacee.heureFin, lueDeplacee.totalXof, lueDeplacee.lignes.length],
  [200, autreVendredi, { depart: "17:30", retour: "20:30" }, 17, 21, 24500, 7]);
verifier("journal : le jour changé en clair", resumeEvenement((await depot.listerJournal({ type: "vente-modifiee" }))[0]).lignes.map(net).some((l: string) => l.startsWith("Jour : ")), true);
verifier("une date passée : 422 sur la date", (await modifier(reference, { date: ajouterJours(jour, -1), totalAttenduXof: 24500, nouveauTotalXof: 24500, modifiePar: "Zayed" })).donnees.champs?.date, "Cette date est passée.");
verifier("l'heure de Padel bike ne se choisit pas : 422", (await modifier(reference, { heureDebut: 9, totalAttenduXof: 24500, nouveauTotalXof: 24500, modifiePar: "Zayed" })).statut, 422);

// Location libre : l'heure et la durée, sur un mardi à venir.
let mardi = ajouterJours(jour, 1);
while (new Date(`${mardi}T12:00:00Z`).getUTCDay() !== 2) mardi = ajouterJours(mardi, 1);
const velos = await depot.listerVelos();
let veloLibre: { id: string; gamme: string } | undefined;
for (const v of velos) if (v.statut === "DISPONIBLE" && (await depot.estDisponible(v.id, mardi, mardi, 9, 21))) { veloLibre = v; break; }
const prix = (heures: number) => calculerDevis({ offre: "location-libre", gamme: veloLibre!.gamme, dureeHeures: heures, especes: true }).totalXof;
const location = await vendre({
  cleVente: "cle-modif-libre-1", veloId: veloLibre!.id, offre: "location-libre", dureeHeures: 2, date: mardi, heureDebut: 14,
  codeParrainage: "", client, encaissePar: "Koffi", montantAttenduXof: prix(2), cgvAcceptees: true,
});
const refLocation = location.donnees.reference as string;
const decalee = await modifier(refLocation, { heureDebut: 15, dureeHeures: 3, totalAttenduXof: prix(2), nouveauTotalXof: prix(3), modifiePar: "Zayed" });
const lueLocation = await lire(refLocation);
verifier("location libre : 14 h, 2 h → 15 h, 3 h, au prix de 3 h", [decalee.statut, lueLocation.heureDebut, lueLocation.heureFin, lueLocation.dureeHeures, lueLocation.totalXof], [200, 15, 18, 3, prix(3)]);
verifier("location libre : le même vélo garde la sortie", lueLocation.lignes.map((l: Ligne) => l.veloId), [veloLibre!.id]);
verifier("location libre : retour après 22 h refusé", (await modifier(refLocation, { heureDebut: 20, totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed" })).donnees.champs?.heureDebut?.includes("22 h"), true);

/* ----------------------------------------------- 4. Le client et le vendeur */

const corrige = await modifier(refLocation, {
  prenom: "Aminata", nom: "Diallo", telephone: "+229 01 97 00 00 00", email: "aminata@example.com", encaissePar: "Zayed",
  totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed",
});
const lueCorrigee = await lire(refLocation);
verifier("client et vendeur : 200, montant inchangé", [corrige.statut, corrige.donnees.totalXof, corrige.donnees.differenceXof], [200, prix(3), 0]);
verifier("le client corrigé sur la vente", [lueCorrigee.client.prenom, lueCorrigee.client.nom, lueCorrigee.client.telephone, lueCorrigee.client.email], ["Aminata", "Diallo", "+229 01 97 00 00 00", "aminata@example.com"]);
verifier("« Argent reçu par » corrigé sur le paiement", paiementDe(lueCorrigee)?.encaissePar, "Zayed");
const ligneClient = (await depot.listerJournal({ type: "vente-modifiee", reference: refLocation }))[0];
verifier("journal : les champs du client et du vendeur", ligneClient.details.champs, ["prenom", "nom", "telephone", "email", "encaissePar"]);
const resumeClient = resumeEvenement(ligneClient);
verifier("journal : titre sans montant, puis une ligne par champ", [net(resumeClient.titre), resumeClient.lignes.map(net)], [
  `${refLocation} : vente corrigée, par Zayed`,
  ["Client : Awa Test → Aminata Diallo", "Téléphone : aucun → +229 01 97 00 00 00", "Email : awa.modif@example.com → aminata@example.com", "Argent reçu par : Koffi → Zayed"],
]);
const sansTelephone = await modifier(refLocation, { telephone: "", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed" });
verifier("téléphone retiré", [sansTelephone.statut, (await lire(refLocation)).client.telephone ?? ""], [200, ""]);
verifier("« Modifié par » obligatoire : 422", (await modifier(refLocation, { prenom: "Awa", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "" })).donnees.champs?.modifiePar, "Indiquez qui modifie la vente.");
verifier("« Modifié par » : mêmes règles que « Argent reçu par »", (await modifier(refLocation, { prenom: "Awa", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed\nBcc: x@y.z" })).statut, 422);
verifier("email invalide : 422", (await modifier(refLocation, { email: "pas-un-email", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed" })).donnees.champs?.email, "Adresse email invalide.");

// Un code de parrainage garde sa remise de 1 % sur le nouveau montant.
const partenaire = await depot.creerPartenaire({ nom: "Hôtel Modif" });
await depot.creerCodeParrainage({ code: "MODIFTEST", partenaireId: partenaire.id });
let autreVelo: { id: string; gamme: string } | undefined;
for (const v of velos) if (v.id !== veloLibre!.id && v.statut === "DISPONIBLE" && (await depot.estDisponible(v.id, mardi, mardi, 9, 21))) { autreVelo = v; break; }
const brut = (heures: number) => calculerDevis({ offre: "location-libre", gamme: autreVelo!.gamme, dureeHeures: heures, especes: true }).totalXof;
const remise = (montant: number) => Math.floor(montant * 0.01);
const devisCode = await vendre({ action: "devis", veloId: autreVelo!.id, offre: "location-libre", dureeHeures: 1, date: mardi, heureDebut: 10, codeParrainage: "MODIFTEST" });
const avecCode = await vendre({
  cleVente: "cle-modif-code-1", veloId: autreVelo!.id, offre: "location-libre", dureeHeures: 1, date: mardi, heureDebut: 10,
  codeParrainage: "MODIFTEST", client, encaissePar: "Koffi", montantAttenduXof: devisCode.donnees.totalXof, cgvAcceptees: true,
});
const attendu2h = brut(2) - remise(brut(2));
const codeModifie = await modifier(avecCode.donnees.reference, { dureeHeures: 2, totalAttenduXof: avecCode.donnees.totalXof, nouveauTotalXof: attendu2h, modifiePar: "Zayed" });
verifier("code de parrainage : la remise de 1 % suit la nouvelle durée", [codeModifie.statut, codeModifie.donnees.totalXof, (await lire(avecCode.donnees.reference)).remiseXof], [200, attendu2h, remise(brut(2))]);

/* ----------------------------------------------- 6. Vente annulée, vente en ligne, offre de groupe */

const aAnnuler = await vendre({
  cleVente: "cle-modif-annulee-1", veloId: veloLibre!.id, offre: "location-libre", dureeHeures: 1, date: mardi, heureDebut: 9,
  codeParrainage: "", client, encaissePar: "Koffi", montantAttenduXof: prix(1), cgvAcceptees: true,
});
await vendre({ action: "annuler", reference: aAnnuler.donnees.reference });
const surAnnulee = await modifier(aAnnuler.donnees.reference, { prenom: "Autre", totalAttenduXof: prix(1), nouveauTotalXof: prix(1), modifiePar: "Zayed" });
verifier("vente annulée : 409 ANNULEE, rien d'écrit", [surAnnulee.statut, surAnnulee.donnees.code, (await lire(aAnnuler.donnees.reference)).client.prenom], [409, "ANNULEE", "Awa"]);

const enLigne = (await depot.listerReservations()).find((r: { statut: string } & Record<string, unknown>) => !estVenteEspeces(r) && r.statut === "CONFIRMEE");
if (enLigne) {
  verifier("réservation payée en Mobile Money : 404", (await modifier(enLigne.reference, { prenom: "Autre", totalAttenduXof: enLigne.totalXof, nouveauTotalXof: enLigne.totalXof, modifiePar: "Zayed" })).statut, 404);
}

const groupe = await depot.creerReservationGroupe({
  offre: "bike-for-all", date: mardi, debutMinute: 16 * 60, finMinute: 17 * 60, velos: 2, nombrePersonnes: 2, totalXof: 5000,
  details: { mode: "duree", minutes: 60 }, client: { prenom: "Groupe", nom: "Test", email: "groupe@example.com", telephone: "" },
  moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-modif-groupe-1" },
});
const refGroupe = groupe.reservation.reference;
const groupePlus = await modifier(refGroupe, { nombrePersonnes: 3, totalAttenduXof: 5000, nouveauTotalXof: 5000, modifiePar: "Zayed" });
verifier("offre de groupe : le groupe ne change pas ici (422)", [groupePlus.statut, groupePlus.donnees.champs?.nombrePersonnes], [422, "Ne se modifie pas pour une offre de groupe."]);
verifier("offre de groupe : ni le jour", (await modifier(refGroupe, { date: ajouterJours(mardi, 7), totalAttenduXof: 5000, nouveauTotalXof: 5000, modifiePar: "Zayed" })).statut, 422);
const groupeClient = await modifier(refGroupe, { nom: "Tchibozo", encaissePar: "Zayed", totalAttenduXof: 5000, nouveauTotalXof: 5000, modifiePar: "Zayed" });
const lueGroupe = await lire(refGroupe);
verifier("offre de groupe : client et vendeur changent, rien d'autre", [groupeClient.statut, lueGroupe.client.nom, paiementDe(lueGroupe)?.encaissePar, lueGroupe.totalXof, lueGroupe.nombrePersonnes, lueGroupe.lignes.length], [200, "Tchibozo", "Zayed", 5000, 2, 2]);
verifier("ce qui se modifie, par formule", [champsModifiables("location-libre"), champsModifiables("padel-bike"), champsModifiables("road-trip-groupe")], [
  { personnes: true, date: true, heure: true, duree: true },
  { personnes: true, date: true, heure: false, duree: false },
  { personnes: false, date: false, heure: false, duree: false },
]);

/* ----------------------------------------------- Les vélos rendus : la gamme la plus rare d'abord */

const v = (id: string, gamme: string) => ({ id, nom: id, gamme });
const rendus = velosApresModification({
  offre: "padel-bike", actuels: [v("c1", "CLASSIQUE"), v("c2", "CLASSIQUE"), v("p1", "PRESTIGE")], nombre: 2, creneauChange: false,
  libres: [], parcParGamme: { CLASSIQUE: 8, PRESTIGE: 1 },
});
verifier("moins de personnes : le Prestige, plus rare, est rendu d'abord", rendus.ok && rendus.retires.map((x: { id: string }) => x.id), ["p1"]);
const memeGamme = velosApresModification({
  offre: "location-libre", gamme: "PREMIUM", actuels: [v("a", "PREMIUM"), v("b", "PREMIUM"), v("c", "PREMIUM")], nombre: 1, creneauChange: false,
  libres: [], parcParGamme: { PREMIUM: 5 },
});
verifier("même gamme : les derniers rendus d'abord, le vélo choisi gardé", memeGamme.ok && [memeGamme.gardes.map((x: { id: string }) => x.id), memeGamme.retires.map((x: { id: string }) => x.id)], [["a"], ["c", "b"]]);

verifier("aucun email pendant toutes les modifications", emailsPendantModifications, 0);
verifier("…alors que les ventes, elles, en envoient", envoisEmail.length > 0, true);

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
