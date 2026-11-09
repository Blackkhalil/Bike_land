// Ventes en espèces : la route d'admin et le dépôt, en mode démonstration
// (aucune base réelle, aucun email réel).
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "ADMIN_PASSWORD", "REVALIDATION_SECRET"]) {
  delete process.env[nom];
}
process.env.BIKELAND_ROLE = "admin";
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { POST } = await charger("src/app/api/admin/especes/route.ts");
const { depot } = await charger("src/lib/db/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { exporterCsv, calculerStatistiques } = await charger("src/lib/statistiques.ts");
const { estVenteEspeces } = await charger("src/lib/reservations.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};
const appel = async (corps: unknown) => {
  const reponse: Response = await POST(
    new Request("http://localhost/api/admin/especes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    }),
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};

const jour = aujourdhui();
const velos = await depot.listerVelos();
const libres = velos.filter((v: { statut: string }) => v.statut === "DISPONIBLE");
// Un mardi à venir, pour la location libre, loin de tout road trip.
let mardi = ajouterJours(jour, 1);
while (new Date(`${mardi}T12:00:00Z`).getUTCDay() !== 2) mardi = ajouterJours(mardi, 1);
// Deux vélos libres ce mardi aux heures du test (9 h - 16 h) : l'historique
// de démonstration en occupe certains, selon les heures qu'il a tirées.
const libresCeMardi: typeof libres = [];
for (const v of libres) if (await depot.estDisponible(v.id, mardi, mardi, 9, 16)) libresCeMardi.push(v);
const [veloA, veloB] = libresCeMardi;
let samedi = ajouterJours(jour, 1);
while (new Date(`${samedi}T12:00:00Z`).getUTCDay() !== 6) samedi = ajouterJours(samedi, 1);

const base = {
  veloId: veloA.id,
  offre: "location-libre",
  dureeHeures: 2,
  date: mardi,
  heureDebut: 14,
  codeParrainage: "",
};
const client = { prenom: "Awa", nom: "Test", email: "awa.test@example.com", telephone: "" };

// 1. Devis : le prix de la grille, sans rien écrire.
const devis = await appel({ action: "devis", ...base });
verifier("devis : 200", devis.statut, 200);
verifier("devis : vélo libre", devis.donnees.libre, true);
verifier("devis : caution de la location libre", devis.donnees.cautionXof, 5000);
const prix = devis.donnees.totalXof as number;

// 1 bis. Le prix au comptoir : celui de la plaquette, 125 F de moins que le site.
const { calculerDevis } = await charger("src/lib/tarification.ts");
const { GRILLE_HORAIRE, PRIX_ROAD_TRIP_XOF } = await charger("src/data/offres.ts");
const prixSite = calculerDevis({ offre: "location-libre", gamme: veloA.gamme, dureeHeures: 2 }).totalXof;
verifier("devis au comptoir = prix du site moins 125 F", prix, prixSite - 125);
const plaquette: Record<string, number[]> = { CLASSIQUE: [1000, 2000, 3000, 3500], PREMIUM: [1500, 3000, 4500, 5500], PRESTIGE: [2000, 4000, 6000, 7000] };
for (const [gamme, prixPlaquette] of Object.entries(plaquette)) {
  verifier(
    `grille ${gamme} au comptoir = plaquette`,
    [1, 2, 3, 4].map((h) => calculerDevis({ offre: "location-libre", gamme, dureeHeures: h, especes: true }).totalXof),
    prixPlaquette,
  );
  verifier(
    `grille ${gamme} en ligne inchangée`,
    [1, 2, 3, 4].map((h) => calculerDevis({ offre: "location-libre", gamme, dureeHeures: h }).totalXof),
    GRILLE_HORAIRE[gamme].map((p: { prixXof: number }) => p.prixXof),
  );
}
verifier("road trip Premium, 2 personnes : 6 000 F au comptoir, 6 250 F en ligne",
  [calculerDevis({ offre: "road-trip", gamme: "PREMIUM", nombrePersonnes: 2, especes: true }).totalXof,
   calculerDevis({ offre: "road-trip", gamme: "PREMIUM", nombrePersonnes: 2 }).totalXof],
  [6000, 2 * PRIX_ROAD_TRIP_XOF.PREMIUM]);
verifier("road trip au comptoir, par personne : 3 000 / 3 500 (Premium, Prestige)",
  ["PREMIUM", "PRESTIGE"].map((g) => calculerDevis({ offre: "road-trip", gamme: g, nombrePersonnes: 1, especes: true }).totalXof),
  [3000, 3500]);
let classiqueSamediRefuse = false;
try {
  calculerDevis({ offre: "road-trip", gamme: "CLASSIQUE", nombrePersonnes: 1, especes: true });
} catch (erreur) {
  classiqueSamediRefuse = /Premium ou Prestige/.test(String(erreur));
}
verifier("road trip du samedi en Classique : pas de prix, refusé avec le motif", classiqueSamediRefuse, true);
verifier("la caution reste de 5 000 F au comptoir", calculerDevis({ offre: "location-libre", gamme: "CLASSIQUE", dureeHeures: 1, especes: true }).cautionXof, 5000);

// 2. Montant différent de celui du devis : refusé, rien n'est écrit.
const avant = (await depot.listerReservations()).length;
const faux = await appel({ ...base, client, encaissePar: "Koffi", montantAttenduXof: prix - 100, cleVente: "cle-test-0001", cgvAcceptees: true });
verifier("montant faux : 409 MONTANT", [faux.statut, faux.donnees.code], [409, "MONTANT"]);
verifier("montant faux : le bon montant est renvoyé", faux.donnees.devis?.totalXof, prix);
verifier("montant faux : aucune réservation créée", (await depot.listerReservations()).length, avant);

// 3. La vente : confirmée et payée d'emblée, signée du vendeur.
const vente = await appel({ ...base, client, encaissePar: "Koffi", montantAttenduXof: prix, cleVente: "cle-test-0001", cgvAcceptees: true });
verifier("vente : 201", vente.statut, 201);
verifier("vente : montant enregistré", vente.donnees.totalXof, prix);
verifier("vente : email non parti en démo, et dit franchement", vente.donnees.emailEnvoye, false);
const enregistree = await depot.trouverReservationParReference(vente.donnees.reference);
const paiement = enregistree?.paiements.find((p: { estCaution: boolean }) => !p.estCaution);
verifier("réservation confirmée", enregistree?.statut, "CONFIRMEE");
verifier("confirmée à l'instant", Boolean(enregistree?.confirmeLe), true);
verifier("paiement réussi, en espèces, signé", [paiement?.statut, paiement?.moyen, paiement?.fournisseur, paiement?.encaissePar], ["REUSSI", "ESPECES", "ESPECES", "Koffi"]);
verifier("référence de paiement = la saisie, pas « TX- »", paiement?.referenceFournisseur, "ESP-cle-test-0001");
verifier("reconnue comme vente en espèces", estVenteEspeces(enregistree), true);
verifier("facture FA-année-suffixe", vente.donnees.facture, `FA-${enregistree?.confirmeLe?.slice(0, 4)}-${vente.donnees.reference.replace(/^BL-/, "")}`);

// 4. La même saisie renvoyée : la vente déjà faite, une seule fois.
const nombreAvant = (await depot.listerReservations()).length;
const doublon = await appel({ ...base, client, encaissePar: "Koffi", montantAttenduXof: prix, cleVente: "cle-test-0001", cgvAcceptees: true });
verifier("même saisie : 200, la même vente, marquée déjà faite", [doublon.statut, doublon.donnees.reference, doublon.donnees.deja, doublon.donnees.emailEnvoye], [200, vente.donnees.reference, true, null]);
verifier("même saisie : rien de plus en base", (await depot.listerReservations()).length, nombreAvant);
// Réponse perdue, puis formulaire changé (autre vélo, autre client) avant de renvoyer avec la même clé :
// c'est la vente déjà enregistrée qui revient, avec SES détails, et rien de plus n'est écrit.
const change = await appel({ ...base, veloId: veloB.id, client: { ...client, prenom: "Autre", email: "autre@example.com" }, encaissePar: "Koffi", montantAttenduXof: prix, cleVente: "cle-test-0001", cgvAcceptees: true });
verifier("formulaire changé, même clé : la vente enregistrée, telle qu'elle est",
  [change.statut, change.donnees.reference, change.donnees.deja, change.donnees.veloNom, change.donnees.email],
  [200, vente.donnees.reference, true, veloA.nom, "awa.test@example.com"]);
verifier("formulaire changé, même clé : rien de plus en base", (await depot.listerReservations()).length, nombreAvant);
// Deux envois simultanés d'une nouvelle saisie : une vente, deux réponses qui la désignent.
const baseSimultane = { ...base, heureDebut: 9, veloId: veloB.id };
const devisSimultane = await appel({ action: "devis", ...baseSimultane });
const [s1, s2] = await Promise.all([1, 2].map(() => appel({ ...baseSimultane, client, encaissePar: "Koffi", montantAttenduXof: devisSimultane.donnees.totalXof, cleVente: "cle-test-simultanee", cgvAcceptees: true })));
verifier("envois simultanés : une seule vente", (await depot.listerReservations()).length, nombreAvant + 1);
verifier("envois simultanés : les deux réponses désignent la même vente", [s1.donnees.reference === s2.donnees.reference, [s1.statut, s2.statut].sort().join(",")], [true, "200,201"]);

// 5. Le même vélo sur le même créneau, nouvelle saisie : refusé.
const pris = await appel({ ...base, client, encaissePar: "Koffi", montantAttenduXof: prix, cleVente: "cle-test-0002", cgvAcceptees: true });
verifier("vélo déjà pris : 409 INDISPONIBLE", [pris.statut, pris.donnees.code], [409, "INDISPONIBLE"]);
const devisPris = await appel({ action: "devis", ...base });
verifier("devis : le vélo n'est plus libre", devisPris.donnees.libre, false);

// 6. Règles de saisie.
const refus = async (nom: string, corps: Record<string, unknown>, champ: string) => {
  const r = await appel({ ...base, client, encaissePar: "Koffi", montantAttenduXof: prix, cleVente: `cle-${champ}-${nom.length}`, cgvAcceptees: true, ...corps });
  verifier(`${nom} : 422 sur ${champ}`, [r.statut, Boolean(r.donnees.champs?.[champ])], [422, true]);
};
await refus("road trip un mardi", { offre: "road-trip", dureeHeures: undefined, heureDebut: 8 }, "date");
await refus("retour après 22 h", { dureeHeures: 4, heureDebut: 19 }, "heureDebut");
await refus("date passée", { date: ajouterJours(jour, -1) }, "date");
await refus("nom de vendeur avec saut de ligne", { encaissePar: "Koffi\nBcc: x@y.z" }, "encaissePar");
await refus("email absent", { client: { ...client, email: "" } }, "client.email");
await refus("conditions non acceptées", { cgvAcceptees: false }, "cgvAcceptees");
await refus("durée hors grille", { dureeHeures: 5, heureDebut: 9 }, "dureeHeures");

// 7. Le road trip : un samedi à 8 h, plafond de personnes par gamme.
const veloRoadTrip = libres.find((v: { gamme: string }) => v.gamme === "PREMIUM") ?? veloB;
// Un Classique au comptoir, sur le road trip du samedi : refusé, avec le motif.
const veloClassique = libres.find((v: { gamme: string }) => v.gamme === "CLASSIQUE");
if (veloClassique) {
  const classiqueRT = await appel({ action: "devis", veloId: veloClassique.id, offre: "road-trip", nombrePersonnes: 1, date: samedi, heureDebut: 8 });
  verifier("comptoir : road trip du samedi sur un Classique, 409 GAMME", [classiqueRT.statut, classiqueRT.donnees.code], [409, "GAMME"]);
  verifier("…le motif dit Premium ou Prestige, et la location libre", /Premium ou Prestige[\s\S]*location libre/.test(String(classiqueRT.donnees.erreur)), true);
}
const nombreGamme = velos.filter((v: { gamme: string; statut: string }) => v.gamme === veloRoadTrip.gamme && v.statut !== "MAINTENANCE" && v.statut !== "RETIRE").length;
const trop = await appel({ action: "devis", veloId: veloRoadTrip.id, offre: "road-trip", nombrePersonnes: nombreGamme + 1, date: samedi, heureDebut: 8 });
verifier("road trip : trop de personnes, 422", trop.statut, 422);
const rt = await appel({ action: "devis", veloId: veloRoadTrip.id, offre: "road-trip", nombrePersonnes: 2, date: samedi, heureDebut: 8 });
verifier("road trip du samedi, 2 personnes : refusé au comptoir aussi (groupe de 10)", [rt.statut, rt.donnees.code], [422, "GROUPE"]);

// 8. Code de parrainage : vérifié, puis compté au partenaire tout de suite.
const partenaire = await depot.creerPartenaire({ nom: "Hôtel Test" });
await depot.creerCodeParrainage({ code: "HOTELTEST", partenaireId: partenaire.id });
const base2 = { ...base, veloId: veloB.id, heureDebut: 14 };
const avecCode = await appel({ action: "devis", ...base2, codeParrainage: "hoteltest" });
verifier("code : remise accordée", avecCode.donnees.remiseXof > 0, true);
const venteCode = await appel({ ...base2, codeParrainage: "hoteltest", client, encaissePar: "Koffi", montantAttenduXof: avecCode.donnees.totalXof, cleVente: "cle-test-0003", cgvAcceptees: true });
verifier("vente avec code : 201 au montant remisé", [venteCode.statut, venteCode.donnees.totalXof], [201, avecCode.donnees.totalXof]);
const stats = (await depot.statistiquesPartenaires()).find((s: { partenaire: { id: string } }) => s.partenaire.id === partenaire.id);
verifier("le client compte déjà pour le partenaire, commission due", [stats?.utilisations, (stats?.commissionDueXof ?? 0) > 0], [1, true]);
const codeInconnu = await appel({ action: "devis", ...base2, heureDebut: 9, codeParrainage: "NEXISTEPAS" });
verifier("code inconnu : prix plein et motif", [codeInconnu.donnees.remiseXof, Boolean(codeInconnu.donnees.refusCode)], [0, true]);

// 9. Renvoi de la facture : seulement pour une vente en espèces payée.
const renvoi = await appel({ action: "renvoyer", reference: vente.donnees.reference });
verifier("renvoi sans fournisseur d'email : 502, dit franchement", renvoi.statut, 502);
const enLigne = (await depot.listerReservations()).find((r: { paiements: { moyen: string; estCaution: boolean }[] }) => !estVenteEspeces(r));
const renvoiEnLigne = await appel({ action: "renvoyer", reference: enLigne?.reference ?? "BL-XXXXXX" });
verifier("renvoi d'une réservation en ligne : 404", renvoiEnLigne.statut, 404);

// 10. Comptes : la vente entre au chiffre du jour, sans frais SasPay, et l'export nomme le vendeur.
const reservations = await depot.listerReservations();
const csv = exporterCsv(reservations.filter((r: { reference: string }) => r.reference === vente.donnees.reference));
verifier("export CSV : colonne encaisse_par", csv.split("\n")[0].includes("encaisse_par"), true);
verifier("export CSV : vendeur nommé", csv.split("\n")[1]?.includes(";Koffi;"), true);
const stats2 = calculerStatistiques(
  reservations.filter((r: { reference: string }) => [vente.donnees.reference, venteCode.donnees.reference].includes(r.reference)),
  velos,
  await depot.listerClients(),
  { debut: jour, fin: jour, libelle: "Aujourd'hui" },
);
verifier("chiffre du jour = les deux ventes", stats2.chiffreAffaires.valeur, prix + avecCode.donnees.totalXof);
verifier("aucun frais SasPay sur des espèces", stats2.fraisRetenus, 0);

// 10 bis. Une réservation EN LIGNE garde le prix du site, frais compris.
const enLigneCree = (await depot.creerReservation({
  veloId: veloA.id, offre: "location-libre", dureeHeures: 1, dateDebut: mardi, dateFin: mardi, heureDebut: 17,
  options: [], client, moyenPaiement: "MTN_MONEY", cgvAcceptees: true,
})).reservation;
verifier("réservation en ligne : prix du site, en attente de paiement",
  [enLigneCree.totalXof, enLigneCree.statut],
  [calculerDevis({ offre: "location-libre", gamme: veloA.gamme, dureeHeures: 1 }).totalXof, "EN_ATTENTE_PAIEMENT"]);
const venteCodeLue = await depot.trouverReservationParReference(venteCode.donnees.reference);
verifier("vente au comptoir avec code : remise de 1 % sur le prix plaquette",
  venteCodeLue?.remiseXof,
  Math.floor(calculerDevis({ offre: "location-libre", gamme: veloB.gamme, dureeHeures: 2, especes: true }).totalXof * 0.01));

// 10 ter. Même clé, saisie changée : la réponse le signale.
verifier("saisie changée : signalée", change.donnees.saisieDifferente, true);
verifier("même saisie : pas signalée", doublon.donnees.saisieDifferente, false);

// 10 quater. Annulation au comptoir : argent rendu sur-le-champ, code de parrainage libéré.
const { montantARendre } = await charger("src/lib/reservations.ts");
const statsAvant = (await depot.statistiquesPartenaires()).find((s: { partenaire: { id: string } }) => s.partenaire.id === partenaire.id);
const annulation = await appel({ action: "annuler", reference: venteCode.donnees.reference });
verifier("annulation au comptoir : 200, montant rendu", [annulation.statut, annulation.donnees.renduXof], [200, avecCode.donnees.totalXof]);
const annuleeLue = await depot.trouverReservationParReference(venteCode.donnees.reference);
const paiementAnnule = annuleeLue?.paiements.find((p: { estCaution: boolean }) => !p.estCaution);
verifier("annulée, paiement rendu et daté", [annuleeLue?.statut, paiementAnnule?.statut, Boolean(paiementAnnule?.rembourseLe), Boolean(annuleeLue?.annuleLe)], ["ANNULEE", "REMBOURSE", true, true]);
const statsApres = (await depot.statistiquesPartenaires()).find((s: { partenaire: { id: string } }) => s.partenaire.id === partenaire.id);
verifier("le partenaire perd l'utilisation (erreur de saisie)", [statsAvant?.utilisations, statsApres?.utilisations ?? 0], [1, 0]);
verifier("seconde annulation : 409", (await appel({ action: "annuler", reference: venteCode.donnees.reference })).statut, 409);
await depot.marquerDepart(vente.donnees.reference);
const apresDepart = await appel({ action: "annuler", reference: vente.donnees.reference });
verifier("vélo parti : l'annulation au comptoir est refusée", [apresDepart.statut, (await depot.trouverReservationParReference(vente.donnees.reference))?.statut], [409, "EN_COURS"]);
verifier("réservation en ligne : pas d'annulation au comptoir", (await appel({ action: "annuler", reference: enLigne?.reference ?? "BL-XXXXXX" })).statut, 404);

verifier("annulation au comptoir : montant rendu noté", paiementAnnule?.montantRenduXof, avecCode.donnees.totalXof);

// 10 quater bis. Deux annulations simultanées de la même vente : une seule passe.
const pourDoubleAnnulation = await depot.creerReservation({
  veloId: veloB.id, offre: "location-libre", dureeHeures: 1, dateDebut: mardi, dateFin: mardi, heureDebut: 17,
  options: [], client, moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-double-annulation" },
});
const [a1, a2] = await Promise.all([1, 2].map(() => appel({ action: "annuler", reference: pourDoubleAnnulation.reservation.reference })));
verifier("annulations simultanées : une seule réussit", [a1.statut, a2.statut].sort().join(","), "200,409");

// 10 quater ter. Créneau passé : plus d'annulation au comptoir.
const hier = ajouterJours(jour, -1);
// Un vélo libre hier à 10 h : les données de démonstration en occupent certains.
const libreHier: { id: string } | undefined = (await Promise.all(libres.map(async (v: { id: string }) => ((await depot.estDisponible(v.id, hier, hier, 10, 11)) ? v : null)))).find(Boolean);
const passee = await depot.creerReservation({
  veloId: libreHier!.id, offre: "location-libre", dureeHeures: 1, dateDebut: hier, dateFin: hier, heureDebut: 10,
  options: [], client, moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-creneau-passe" },
});
const surPassee = await appel({ action: "annuler", reference: passee.reservation.reference });
verifier("créneau passé : l'annulation au comptoir est refusée", [surPassee.statut, (await depot.trouverReservationParReference(passee.reservation.reference))?.statut], [409, "CONFIRMEE"]);

// 10 quater quater. Annulée par le client, puis argent rendu au comptoir : noté une fois, au montant des CGV.
const parClient = await depot.creerReservation({
  veloId: veloB.id, offre: "location-libre", dureeHeures: 2, dateDebut: mardi, dateFin: mardi, heureDebut: 12,
  options: [], client, moyenPaiement: "ESPECES", cgvAcceptees: true, encaissement: { par: "Koffi", reference: "ESP-annulee-client" },
});
await depot.annulerReservation(parClient.reservation.reference);
const avantRendu = await depot.trouverReservationParReference(parClient.reservation.reference);
verifier("annulée par le client : argent encore à rendre", avantRendu?.paiements.find((p: { estCaution: boolean }) => !p.estCaution)?.statut, "REUSSI");
const rendu = await appel({ action: "rendre", reference: parClient.reservation.reference });
const attendu = montantARendre(avantRendu, aujourdhui());
verifier("argent rendu : noté, au montant des CGV", [rendu.statut, rendu.donnees.renduXof], [200, attendu]);
const apresRendu = await depot.trouverReservationParReference(parClient.reservation.reference);
const paiementRendu = apresRendu?.paiements.find((p: { estCaution: boolean }) => !p.estCaution);
verifier("paiement REMBOURSE, daté, montant rendu", [paiementRendu?.statut, Boolean(paiementRendu?.rembourseLe), paiementRendu?.montantRenduXof], ["REMBOURSE", true, attendu]);
verifier("argent rendu une seconde fois : refusé", (await appel({ action: "rendre", reference: parClient.reservation.reference })).statut, 409);
verifier("vente non annulée : rien à rendre", (await appel({ action: "rendre", reference: passee.reservation.reference })).statut, 404);

// 10 quater quinquies. Départ sur une vente annulée : refusé, la vente reste annulée.
const departSurAnnulee = await depot.marquerDepart(pourDoubleAnnulation.reservation.reference);
verifier("départ sur une vente annulée : elle reste annulée", departSurAnnulee?.statut, "ANNULEE");

// 10 quinquies. CGV : tout rendu jusqu'à 72 h avant, la moitié ensuite.
verifier("CGV : annulation 4 jours avant, tout est rendu", montantARendre({ totalXof: 2500, dateDebut: "2026-10-20" }, "2026-10-16"), 2500);
verifier("CGV : annulation 3 jours avant, tout est rendu", montantARendre({ totalXof: 2500, dateDebut: "2026-10-20" }, "2026-10-17"), 2500);
verifier("CGV : annulation 2 jours avant, la moitié", montantARendre({ totalXof: 2500, dateDebut: "2026-10-20" }, "2026-10-18"), 1250);

// 10 sexies. Sans la clé des liens de suivi, en base réelle : refus dès le devis, rien n'est lu ni écrit.
const cleSuivi = process.env.BOOKING_TOKEN_SECRET;
delete process.env.BOOKING_TOKEN_SECRET;
process.env.DATABASE_URL = "postgres://exemple.invalid/base";
const sansCle = await appel({ action: "devis", ...base });
delete process.env.DATABASE_URL;
if (cleSuivi) process.env.BOOKING_TOKEN_SECRET = cleSuivi;
verifier("clé des liens absente : 503 dès le devis", sansCle.statut, 503);

// 11. Le dépôt refuse une vente au comptoir qui ne serait pas en espèces.
let refusMoyen = "";
try {
  await depot.creerReservation({ veloId: veloB.id, offre: "location-libre", dureeHeures: 1, dateDebut: mardi, dateFin: mardi, heureDebut: 8, options: [], client, moyenPaiement: "MTN_MONEY", cgvAcceptees: true, encaissement: { par: "Koffi" } });
} catch (e) {
  refusMoyen = (e as Error).message;
}
verifier("encaissement Mobile Money refusé par le dépôt", refusMoyen.includes("espèces"), true);

console.log(echecs === 0 ? "\nTout est bon." : `\n${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
