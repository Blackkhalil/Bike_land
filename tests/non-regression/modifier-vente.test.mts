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
verifier("l'agent qui a encaissé corrigé sur le paiement", paiementDe(lueCorrigee)?.encaissePar, "Zayed");
const ligneClient = (await depot.listerJournal({ type: "vente-modifiee", reference: refLocation }))[0];
verifier("journal : les champs du client et du vendeur", ligneClient.details.champs, ["prenom", "nom", "telephone", "email", "encaissePar"]);
const resumeClient = resumeEvenement(ligneClient);
verifier("journal : titre sans montant, puis une ligne par champ", [net(resumeClient.titre), resumeClient.lignes.map(net)], [
  `${refLocation} : vente corrigée, par Zayed`,
  ["Client : Awa Test → Aminata Diallo", "Téléphone : aucun → +229 01 97 00 00 00", "Email : awa.modif@example.com → aminata@example.com", "Encaissé par : Koffi → Zayed"],
]);
const sansTelephone = await modifier(refLocation, { telephone: "", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed" });
verifier("téléphone retiré", [sansTelephone.statut, (await lire(refLocation)).client.telephone ?? ""], [200, ""]);
verifier("« Modifié par » obligatoire : 422", (await modifier(refLocation, { prenom: "Awa", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "" })).donnees.champs?.modifiePar, "Indiquez qui modifie la vente.");
verifier("« Modifié par » : mêmes règles que l'agent qui a encaissé", (await modifier(refLocation, { prenom: "Awa", totalAttenduXof: prix(3), nouveauTotalXof: prix(3), modifiePar: "Zayed\nBcc: x@y.z" })).statut, 422);
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

/* ----------------------------------------------- Le prix : ni refait par un jour changé, ni figé */

// Deux ventes d'avant, quand le comptoir comptait encore 3 625 F par personne (réglage à 3 750 F).
const padelRegle = { ...REGLAGES_PADEL_PAR_DEFAUT, depart: "17:30", retour: "20:30", jours: [5], ouverture: jour };
await enregistrerReglages("padel", { ...padelRegle, prixXof: 3750 });
const vendrediPlusTard = ajouterJours(vendredi, 14);
const aQuatre = await vendre({
  cleVente: "cle-modif-ancien-prix-4", offre: "padel-bike", nombrePersonnes: 4, date: vendrediPlusTard, heureDebut: 17,
  client, encaissePar: "Koffi", montantAttenduXof: 14500, cgvAcceptees: true,
});
const seule = await vendre({
  cleVente: "cle-modif-ancien-prix-1", offre: "padel-bike", nombrePersonnes: 1, date: vendrediPlusTard, heureDebut: 17,
  client, encaissePar: "Koffi", montantAttenduXof: 3625, cgvAcceptees: true,
});
verifier("ventes d'avant : 4 personnes à 14 500 F, 1 personne à 3 625 F", [aQuatre.donnees.totalXof, seule.donnees.totalXof], [14500, 3625]);
// Aujourd'hui, le comptoir compte 3 500 F (réglage à 3 625 F).
await enregistrerReglages("padel", { ...padelRegle, prixXof: 3625 });
const refQuatre = aQuatre.donnees.reference as string;
const refSeule = seule.donnees.reference as string;

// Un jour changé seul : le montant payé reste (et non 14 000 F).
const jourSeul = await modifier(refQuatre, { date: ajouterJours(vendrediPlusTard, 7), totalAttenduXof: 14500, nouveauTotalXof: 14500, modifiePar: "Zayed" });
const lueQuatre = await lire(refQuatre);
verifier("Padel bike déplacé seul : le montant enregistré reste 14 500 F", [jourSeul.statut, lueQuatre.totalXof, lueQuatre.dateDebut, paiementDe(lueQuatre)?.montantXof], [200, 14500, ajouterJours(vendrediPlusTard, 7), 14500]);
verifier("…le serveur refuse le prix d'aujourd'hui annoncé pour un simple changement de jour", (await modifier(refQuatre, { date: vendrediPlusTard, totalAttenduXof: 14500, nouveauTotalXof: 14000, modifiePar: "Zayed" })).donnees.code, "MONTANT");
// Le nombre change : le prix est refait, au prix du comptoir d'aujourd'hui.
const aTrois = await modifier(refQuatre, { nombrePersonnes: 3, totalAttenduXof: 14500, nouveauTotalXof: 10500, modifiePar: "Zayed" });
verifier("4 → 3 personnes : prix refait au comptoir d'aujourd'hui, 10 500 F", [aTrois.statut, aTrois.donnees.totalXof], [200, 10500]);

// La case « Remettre au prix du comptoir d'aujourd'hui » : la vente BL-KAKWFY, 3 625 F notés, 3 500 F encaissés.
const { venteAModifier, prixDuComptoirAujourdhui, calculerModification } = await charger("src/lib/modification-vente.ts");
const { lireReglages } = await charger("src/lib/reglages.ts");
const reglagesDuJour = await lireReglages();
verifier("la case se propose : 3 500 F au comptoir d'aujourd'hui, 3 625 F notés", [prixDuComptoirAujourdhui(venteAModifier(await lire(refSeule)), reglagesDuJour, jour), (await lire(refSeule)).totalXof], [3500, 3625]);
verifier("une vente au prix du jour : rien à proposer", prixDuComptoirAujourdhui(venteAModifier(await lire(reference)), reglagesDuJour, jour), (await lire(reference)).totalXof);
verifier("une offre de groupe : jamais", prixDuComptoirAujourdhui(venteAModifier(await lire(refGroupe)), reglagesDuJour, jour), null);
const caseMauvaisMontant = await modifier(refSeule, { remettreAuPrixDuComptoir: true, totalAttenduXof: 3625, nouveauTotalXof: 3000, modifiePar: "Zayed" });
verifier("case sans le bon montant : 409 MONTANT, le bon renvoyé, rien d'écrit", [caseMauvaisMontant.statut, caseMauvaisMontant.donnees.code, caseMauvaisMontant.donnees.totalXof, (await lire(refSeule)).totalXof], [409, "MONTANT", 3500, 3625]);
const remiseAuPrix = await modifier(refSeule, { remettreAuPrixDuComptoir: true, totalAttenduXof: 3625, nouveauTotalXof: 3500, modifiePar: "Zayed" });
const lueSeule = await lire(refSeule);
verifier("case cochée, rien d'autre : 200, 3 500 F sur la vente, le paiement et le vélo",
  [remiseAuPrix.statut, lueSeule.totalXof, paiementDe(lueSeule)?.montantXof, lueSeule.lignes[0].prixUnitaireXof, lueSeule.nombrePersonnes, lueSeule.dateDebut],
  [200, 3500, 3500, 3500, 1, vendrediPlusTard]);
const ligneRemise = (await depot.listerJournal({ type: "vente-modifiee", reference: refSeule }))[0];
verifier("journal : le total a changé, et la remise au prix du comptoir est notée", [ligneRemise.details.champs, ligneRemise.details.prixRemisAuComptoir], [["totalXof"], true]);
const resumeRemise = resumeEvenement(ligneRemise);
verifier("journal : la remise au prix du comptoir en clair", [net(resumeRemise.titre), resumeRemise.lignes.map(net)], [`${refSeule} : 3 625 F → 3 500 F, par Zayed`, ["Montant remis au prix du comptoir."]]);
const remiseRepetee = await modifier(refSeule, { remettreAuPrixDuComptoir: true, totalAttenduXof: 3625, nouveauTotalXof: 3500, modifiePar: "Zayed" });
verifier("case renvoyée (réponse perdue) : déjà faite, une seule ligne au journal", [remiseRepetee.statut, remiseRepetee.donnees.deja, (await depot.listerJournal({ type: "vente-modifiee", reference: refSeule })).length], [200, true, 1]);
const caseSansEcart = await modifier(refQuatre, { remettreAuPrixDuComptoir: true, totalAttenduXof: 10500, nouveauTotalXof: 10500, modifiePar: "Zayed" });
verifier("case sur une vente déjà au prix du jour : rien à écrire", [caseSansEcart.statut, caseSansEcart.donnees.deja, (await lire(refQuatre)).totalXof], [200, true, 10500]);
const caseGroupe = await modifier(refGroupe, { remettreAuPrixDuComptoir: true, totalAttenduXof: 5000, nouveauTotalXof: 5000, modifiePar: "Zayed" });
verifier("case sur une offre de groupe : 422", [caseGroupe.statut, caseGroupe.donnees.champs?.remettreAuPrixDuComptoir], [422, "Ne se modifie pas pour une offre de groupe."]);
verifier("case mal formée : 422", (await modifier(refSeule, { remettreAuPrixDuComptoir: "oui", totalAttenduXof: 3500, nouveauTotalXof: 3500, modifiePar: "Zayed" })).statut, 422);

// La règle, formule par formule : seuls le road trip et Octobre rose ont un prix qui dépend du jour.
const venteType = (offre: string, plus: Record<string, unknown> = {}) => ({
  offre, nombrePersonnes: 2, dateDebut: "2026-11-21", heureDebut: 10, heureFin: 12, gamme: "PREMIUM",
  sousTotalXof: 9999, remiseXof: 0, cautionXof: 0, totalXof: 9999, ...plus,
});
const calcul = (vente: Record<string, unknown>, demande: Record<string, unknown>) => {
  const issue = calculerModification(vente, demande, reglagesDuJour, "2026-11-19");
  return issue.ok ? [issue.calcul.recalcule, issue.calcul.totalXof] : issue.champs;
};
verifier("location libre, jour seul : montant gardé", calcul(venteType("location-libre", { dureeHeures: 2 }), { date: "2026-11-24" }), [false, 9999]);
verifier("location libre, durée changée : prix refait", calcul(venteType("location-libre", { dureeHeures: 2 }), { dureeHeures: 3 }), [true, calculerDevis({ offre: "location-libre", gamme: "PREMIUM", dureeHeures: 3, nombrePersonnes: 2, especes: true }).totalXof]);
verifier("Gbashi bike, jour seul : montant gardé", calcul(venteType("gbashi-bike", { heureFin: 13 }), { date: "2026-11-24" }), [false, 9999]);
verifier("Padel bike, jour seul : montant gardé", calcul(venteType("padel-bike", { heureDebut: 17, heureFin: 21, horaire: { depart: "17:30", retour: "20:30" } }), { date: "2026-11-27" }), [false, 9999]);
verifier("road trip, jour changé : prix du nouveau jour", calcul(venteType("road-trip", { heureDebut: 8, heureFin: 11 }), { date: "2026-11-22" }), [true, calculerDevis({ offre: "road-trip", gamme: "PREMIUM", date: "2026-11-22", nombrePersonnes: 2, especes: true }).totalXof]);
verifier("la case refait le prix sans rien changer d'autre", calcul(venteType("padel-bike", { heureDebut: 17, heureFin: 21 }), { remettreAuPrixDuComptoir: true }), [true, 7000]);

/* ----------------------------------------------- L'agent qui a encaissé : un prénom, pas un montant */

const { ressembleAUnPrenom, MESSAGE_PRENOM_ATTENDU, LIBELLE_AGENT } = await charger("src/lib/prenom-agent.ts");
verifier("un prénom a deux lettres au moins", ["Zayed", "Jo", "Awa 2", "3500", "1 500", "K9", ""].map((valeur) => ressembleAUnPrenom(valeur)), [true, true, true, false, false, false, false]);
verifier("le libellé du champ et son message", [LIBELLE_AGENT, MESSAGE_PRENOM_ATTENDU], ["Agent qui a encaissé (votre prénom)", "Écrivez votre prénom, pas un montant."]);
const venteMontant = await vendre({
  cleVente: "cle-modif-agent-montant", offre: "padel-bike", nombrePersonnes: 1, date: vendrediPlusTard, heureDebut: 17,
  client, encaissePar: "3500", montantAttenduXof: 3500, cgvAcceptees: true,
});
verifier("vente : un montant à la place du prénom, 422", [venteMontant.statut, venteMontant.donnees.champs?.encaissePar], [422, "Écrivez votre prénom, pas un montant."]);
const { schemaVenteComptoirGroupe } = await charger("src/lib/offres-groupe/api.ts");
const analyseGroupe = schemaVenteComptoirGroupe.safeParse({ encaissePar: "1500" });
verifier("vente de groupe : le même refus", !analyseGroupe.success && analyseGroupe.error.errors.find((e: { path: unknown[] }) => e.path.join(".") === "encaissePar")?.message, "Écrivez votre prénom, pas un montant.");
verifier("modification : « Modifié par » refuse un montant", (await modifier(refSeule, { prenom: "Awa", totalAttenduXof: 3500, nouveauTotalXof: 3500, modifiePar: "3500" })).donnees.champs?.modifiePar, "Écrivez votre prénom, pas un montant.");
verifier("modification : l'agent qui a encaissé aussi", (await modifier(refSeule, { encaissePar: "1500", totalAttenduXof: 3500, nouveauTotalXof: 3500, modifiePar: "Zayed" })).donnees.champs?.encaissePar, "Écrivez votre prénom, pas un montant.");
// Une ancienne vente qui porte « 3500 » : elle s'affiche toujours, et se corrige.
const vieille = await depot.creerReservation({
  offre: "padel-bike", nombrePersonnes: 1, dateDebut: vendrediPlusTard, dateFin: vendrediPlusTard, heureDebut: 17, options: [],
  client: { prenom: "Kossi", nom: "Ancien", email: "kossi.ancien@example.com" }, moyenPaiement: "ESPECES", cgvAcceptees: true,
  encaissement: { par: "3500", reference: "ESP-modif-ancien-agent" },
});
const refVieille = vieille.reservation.reference;
verifier("ancienne vente : « 3500 » reste lisible", [estVenteEspeces(await lire(refVieille)), paiementDe(await lire(refVieille))?.encaissePar], [true, "3500"]);
const agentCorrige = await modifier(refVieille, { encaissePar: "Zayed", totalAttenduXof: 3500, nouveauTotalXof: 3500, modifiePar: "Zayed" });
verifier("ancienne vente : le prénom remplace le montant", [agentCorrige.statut, paiementDe(await lire(refVieille))?.encaissePar], [200, "Zayed"]);
verifier("journal : « Encaissé par », avant et après", resumeEvenement((await depot.listerJournal({ type: "vente-modifiee", reference: refVieille }))[0]).lignes.map(net), ["Encaissé par : 3500 → Zayed"]);
verifier("journal : la vente de groupe au comptoir dit « Encaissé par »",
  resumeEvenement({ id: "jrn-2", type: "vente-comptoir-groupe", reference: "BL-GROUPE", auteur: "admin (Koffi)", creeLe: new Date().toISOString(), details: { offre: "bike-for-all", date: "2026-11-21", personnes: 12, totalXof: 30000, encaissePar: "Koffi" } }).lignes.map(net).at(-1),
  "Encaissé par Koffi.");

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
