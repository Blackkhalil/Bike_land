// Données et administration des offres de groupe, en démonstration (aucune
// base réelle, aucun email, aucun paiement) : l'interrupteur désactivé par
// défaut, les réglages des offres enregistrés puis relus (et « illisible »),
// les vélos indisponibles par date et l'alerte des réservations payées, la
// pénalité de retard, le journal, les remboursements, et le SQL rejouable.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "ANTHROPIC_API_KEY"]) {
  delete process.env[nom];
}
// Le rôle « admin » : la session est ouverte sans mot de passe hors
// production, et le site public n'est pas rafraîchi (pas de secret).
process.env.BIKELAND_ROLE = "admin";
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { depot } = await charger("src/lib/db/index.ts");
const { lireOuverture, offresGroupeActives } = await charger("src/lib/ouverture.ts");
const { lireReglagesOffres } = await charger("src/lib/reglages-offres.ts");
const contrat = await charger("src/data/reglages-offres.ts");
const libelles = await charger("src/data/libelles-reglages-offres.ts");
const journal = await charger("src/lib/journal.ts");
const { formatCreneau, formatPlageReservation, horaireExact, resumeOffre } = await charger("src/lib/format.ts");
const { cocosDe } = await charger("src/lib/reservations.ts");
const { ajouterJours } = await charger("src/lib/dates.ts");
const { heureAuBenin } = await charger("src/data/offres.ts");
const { POST: routeOuverture } = await charger("src/app/api/admin/ouverture/route.ts");
const { POST: routeReglages } = await charger("src/app/api/admin/reglages-offres/route.ts");
const { POST: routeIndispo } = await charger("src/app/api/admin/indisponibilites/route.ts");
const { POST: routeRetard } = await charger("src/app/api/admin/reservations/[reference]/retard/route.ts");
const { POST: routeRembourser } = await charger("src/app/api/admin/remboursements/route.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[  ]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
const espaces = (t: string) => t.replace(/[  ]/g, " ");
const appeler = async (route: (r: Request, c?: unknown) => Promise<Response>, url: string, corps: unknown, contexte?: unknown) => {
  const reponse = await route(
    new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }),
    contexte,
  );
  return { statut: reponse.status, donnees: await reponse.json() };
};
const retard = (reference: string, corps: unknown) =>
  appeler(routeRetard, `/api/admin/reservations/${reference}/retard`, corps, { params: Promise.resolve({ reference }) });
// L'état de la démonstration (créé au premier appel du dépôt), pour faire
// d'une réservation une offre de groupe : leur réservation en ligne vient
// avec un autre lot.
const enOffreDeGroupe = (reference: string, offre = "road-trip-groupe") => {
  const etatDemo = (globalThis as Record<symbol, { reservations: { reference: string; offre: string }[] } | undefined>)[
    Symbol.for("bikeland.demo.etat")
  ];
  const r = etatDemo?.reservations.find((x) => x.reference === reference);
  if (!r) throw new Error(`Réservation ${reference} absente de la démonstration.`);
  r.offre = offre;
};

const jour = heureAuBenin().date;
const D = contrat.REGLAGES_OFFRES_PAR_DEFAUT;
const CLE = contrat.CLE_REGLAGES_OFFRES;

console.log("\n— Interrupteur « Offres de groupe »");
verifier("désactivé par défaut : rien n'apparaît aux clients", offresGroupeActives(await lireOuverture()), false);
const ouvrir = await appeler(routeOuverture, "/api/admin/ouverture", { action: "creneau", code: contrat.CODE_INTERRUPTEUR_OFFRES, actif: true });
verifier("la route l'ouvre (200)", ouvrir.statut, 200);
verifier("ouvert ensuite", offresGroupeActives(await lireOuverture()), true);
verifier("les départs du road trip actuel ne bougent pas", (await lireOuverture()).creneauxActifs.has("samedi-matin"), true);
const [basculeOn] = await depot.listerJournal({ type: "interrupteur-offres" });
verifier("écrit au journal : activées, par « admin »", [basculeOn?.details.actif, basculeOn?.auteur], [true, "admin"]);
await appeler(routeOuverture, "/api/admin/ouverture", { action: "creneau", code: contrat.CODE_INTERRUPTEUR_OFFRES, actif: false, prenom: "Koffi" });
verifier("refermé : de nouveau caché", offresGroupeActives(await lireOuverture()), false);
verifier("le prénom retenu signe le journal", (await depot.listerJournal({ type: "interrupteur-offres" }))[0]?.auteur, "admin (Koffi)");
verifier(
  "le journal le raconte",
  espaces(journal.resumeEvenement((await depot.listerJournal({ type: "interrupteur-offres" }))[0]).titre),
  "Offres de groupe désactivées : cachées aux clients",
);

console.log("\n— Réglages des offres");
verifier("rien d'enregistré : valeurs de départ", (await lireReglagesOffres()).source, "defaut");
verifier(
  "chaque réglage du contrat a son libellé, et aucun libellé de trop",
  [
    libelles.cheminsDesFeuilles(D).filter((c: string) => !libelles.CHAMPS_REGLAGES_OFFRES.has(c)),
    [...libelles.CHAMPS_REGLAGES_OFFRES.keys()].filter((c: string) => !libelles.cheminsDesFeuilles(D).includes(c)),
  ],
  [[], []],
);
const plus = { ...D, roadTrip: { ...D.roadTrip, prixPersonneXof: 3200 } };
const enregistre = await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: plus, prenom: "Koffi" });
verifier("enregistrés (200), un changement", [enregistre.statut, enregistre.donnees.changements], [200, 1]);
const relu = await lireReglagesOffres();
verifier("relus : « enregistre », 3 200 F, le reste inchangé", [relu.source, relu.reglages.roadTrip.prixPersonneXof, relu.reglages.gbashi.prixXof.PRESTIGE], ["enregistre", 3200, 4500]);
const [ligneReglages] = await depot.listerJournal({ type: "reglages-offres" });
verifier(
  "journal : auteur « admin (Koffi) », ce qui a changé",
  [ligneReglages?.auteur, ligneReglages?.details.changements],
  ["admin (Koffi)", [{ chemin: "roadTrip.prixPersonneXof", avant: 3000, apres: 3200 }]],
);
verifier(
  "journal en clair",
  espaces(JSON.stringify(journal.resumeEvenement(ligneReglages))),
  JSON.stringify({ titre: "1 réglage changé", lignes: ["Road trip en groupe · Prix par personne, avant les frais de paiement : 3 000 F → 3 200 F"] }),
);
const impossible = await appeler(routeReglages, "/api/admin/reglages-offres", {
  reglages: { ...plus, roadTrip: { ...plus.roadTrip, retour: "07:00" } },
  prenom: "Koffi",
});
verifier("retour avant le départ : refusé (422), la case le dit", [impossible.statut, impossible.donnees.champs?.["roadTrip.retour"]], [422, "Le retour doit suivre le départ."]);
const vide = await appeler(routeReglages, "/api/admin/reglages-offres", {
  reglages: { ...plus, bikeForAll: { ...plus.bikeForAll, tarifHeurePersonneXof: null, dureeMinMinutes: 2.5 } },
  prenom: "Koffi",
});
verifier(
  "case vide, durée décimale : messages en français",
  [vide.statut, vide.donnees.champs?.["bikeForAll.tarifHeurePersonneXof"], vide.donnees.champs?.["bikeForAll.dureeMinMinutes"]],
  [422, "Montant attendu en francs CFA.", "Nombre entier attendu."],
);
const sansPrenom = await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: plus });
verifier("sans prénom : refusé, la case « prenom » le dit", [sansPrenom.statut, sansPrenom.donnees.champs?.prenom], [422, "Indiquez votre prénom."]);
verifier("rien n'a changé après les refus", (await lireReglagesOffres()).reglages.roadTrip.prixPersonneXof, 3200);
// Les quatre réglages ajoutés après la relecture du moteur : chacun a sa
// case, s'enregistre, se relit et se nomme en clair au journal.
const ajoutes = {
  ...plus,
  accompagnateur: { ...plus.accompagnateur, personnesIncluses: 6 },
  gbashi: { ...plus.gbashi, cocosGrandsParPersonne: 2, eauxParPersonne: 2 },
  delaiMinimumMinutes: 90,
};
const quatre = await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: ajoutes, prenom: "Koffi" });
verifier("personnes comprises, cocos et eau de Gbashi, délai en ligne : enregistrés (200), quatre changements", [quatre.statut, quatre.donnees.changements], [200, 4]);
const reluAjoutes = (await lireReglagesOffres()).reglages;
verifier(
  "relus tels quels",
  [reluAjoutes.accompagnateur.personnesIncluses, reluAjoutes.gbashi.cocosGrandsParPersonne, reluAjoutes.gbashi.eauxParPersonne, reluAjoutes.delaiMinimumMinutes],
  [6, 2, 2, 90],
);
verifier(
  "le journal les nomme en clair, dans l'ordre de la page",
  journal.resumeEvenement((await depot.listerJournal({ type: "reglages-offres" }))[0]).lignes.map(espaces),
  [
    "Accompagnateur · Personnes comprises dans le prix minimum : 5 personnes → 6 personnes",
    "Gbashi Bike · Cocos grand format par personne : 1 → 2",
    "Gbashi Bike · Bouteilles d'eau par personne : 1 → 2",
    "Réservation en ligne · Délai minimum avant le départ : 120 min → 90 min",
  ],
);
const horsLimites = await appeler(routeReglages, "/api/admin/reglages-offres", {
  reglages: { ...ajoutes, delaiMinimumMinutes: -15, accompagnateur: { ...ajoutes.accompagnateur, personnesIncluses: 2.5 } },
  prenom: "Koffi",
});
verifier(
  "délai négatif, personnes décimales : refusés, chaque case le dit en français",
  [horsLimites.statut, horsLimites.donnees.champs?.delaiMinimumMinutes, horsLimites.donnees.champs?.["accompagnateur.personnesIncluses"]],
  [422, "0 au moins.", "Nombre entier attendu."],
);
verifier("rien n'a changé après ce refus", (await lireReglagesOffres()).reglages.delaiMinimumMinutes, 90);
const pourcents = await appeler(routeReglages, "/api/admin/reglages-offres", {
  reglages: {
    ...ajoutes,
    roadTrip: { ...ajoutes.roadTrip, reduction: 0.6 },
    bikeForAll: { ...ajoutes.bikeForAll, partMaxCocos: -0.1 },
  },
  prenom: "Koffi",
});
verifier(
  "réduction à 60 %, part des cocos négative : la borne redite en pour cent, comme la case",
  [pourcents.statut, pourcents.donnees.champs?.["roadTrip.reduction"], pourcents.donnees.champs?.["bikeForAll.partMaxCocos"]],
  [422, "50 % au plus.", "0 % au moins."],
);
await depot.ecrireParametreAdmin(CLE, "{oups");
const casse = await lireReglagesOffres();
verifier("enregistrement cassé : « illisible », avec le problème", [casse.source, typeof casse.probleme], ["illisible", "string"]);

console.log("\n— Vélos indisponibles par date, alerte du parc");
let mardi = ajouterJours(jour, 2);
while (new Date(`${mardi}T12:00:00Z`).getUTCDay() !== 2) mardi = ajouterJours(mardi, 1);
const velos = (await depot.listerVelos()).filter((v: { statut: string }) => v.statut === "DISPONIBLE");
const libres: { id: string; nom: string }[] = [];
for (const v of velos) if (await depot.estDisponible(v.id, mardi, mardi, 9, 12)) libres.push(v);
const [veloA, veloB, veloC] = libres;
const client = { prenom: "Awa", nom: "Essai", email: "awa.essai@example.com", telephone: "+229 01 00 00 00 01" };
const vendre = (veloId: string, especes = true) =>
  depot.creerReservation({
    veloId,
    offre: "location-libre",
    dureeHeures: 2,
    dateDebut: mardi,
    dateFin: mardi,
    heureDebut: 9,
    options: [],
    client,
    moyenPaiement: especes ? "ESPECES" : "MTN_MONEY",
    cgvAcceptees: true,
    ...(especes ? { encaissement: { par: "Essai" } } : {}),
  });
const { reservation: payee } = await vendre(veloA.id);
const ref = payee.reference;
verifier("une vente payée au comptoir, confirmée", payee.statut, "CONFIRMEE");
const touche = async (depuis = jour) => (await depot.reservationsTouchees(depuis)).find((r: { reference: string }) => r.reference === ref);
verifier("tant que le vélo roule : pas d'alerte", await touche(), undefined);
const ajout = await appeler(routeIndispo, "/api/admin/indisponibilites", {
  action: "ajouter",
  veloId: veloA.id,
  date: mardi,
  motif: "Réparation des freins",
  prenom: "Koffi",
});
verifier("déclaré (200), la réponse liste la réservation à appeler", [ajout.statut, ajout.donnees.touchees?.map((r: { reference: string }) => r.reference)], [200, [ref]]);
const liste = await depot.listerIndisponibilites({ depuis: mardi, jusqua: mardi });
verifier(
  "listé ce jour-là : vélo, motif, auteur",
  liste.map((i: { veloId: string; veloNom: string; motif: string; creePar: string; date: string }) => [i.veloId, i.veloNom, i.motif, i.creePar, i.date]),
  [[veloA.id, veloA.nom, "Réparation des freins", "admin (Koffi)", mardi]],
);
verifier("pas listé la veille", (await depot.listerIndisponibilites({ depuis: ajouterJours(mardi, -1), jusqua: ajouterJours(mardi, -1) })).length, 0);
const alerte = await touche();
verifier(
  "alerte : la réservation, le client, son numéro, le vélo et pourquoi",
  [alerte?.client.prenom, alerte?.client.telephone, alerte?.dateDebut, alerte?.heureDebut, alerte?.velos],
  ["Awa", "+229 01 00 00 00 01", mardi, 9, [{ veloId: veloA.id, veloNom: veloA.nom, raison: "INDISPONIBLE", date: mardi, motif: "Réparation des freins" }]],
);
await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: veloA.id, date: mardi, motif: "Pneu crevé", prenom: "Koffi" });
const redeclare = await depot.listerIndisponibilites({ depuis: mardi, jusqua: mardi });
verifier("redéclaré le même jour : une seule ligne, motif mis à jour", redeclare.map((i: { motif: string }) => i.motif), ["Pneu crevé"]);
verifier("le journal le dit", (await depot.listerJournal({ type: "indisponibilite-ajoutee" }))[0]?.details.dejaDeclare, true);
await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: veloB.id, date: mardi, prenom: "Koffi" });
verifier("un second vélo, sans réservation : deux lignes, toujours une alerte", [(await depot.listerIndisponibilites({ depuis: mardi, jusqua: mardi })).length, (await depot.reservationsTouchees(jour)).filter((r: { reference: string }) => r.reference === ref).length], [2, 1]);
const passe = await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: veloA.id, date: ajouterJours(jour, -1), prenom: "Koffi" });
verifier("un jour passé : refusé", [passe.statut, espaces(passe.donnees.erreur)], [422, "Ce jour est déjà passé."]);
const loin = await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: veloA.id, date: ajouterJours(jour, 400), prenom: "Koffi" });
verifier("plus d'un an à l'avance : refusé", loin.statut, 422);
const inconnu = await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: "velo-qui-n-existe-pas", date: mardi, prenom: "Koffi" });
verifier("vélo inconnu : 404", inconnu.statut, 404);
const sansNom = await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "ajouter", veloId: veloA.id, date: mardi, prenom: "" });
verifier("sans prénom : refusé", [sansNom.statut, sansNom.donnees.champs?.prenom], [422, "Indiquez votre prénom."]);
verifier("vu d'après la sortie : plus d'alerte", await touche(ajouterJours(mardi, 1)), undefined);
const idA = (await depot.listerIndisponibilites({ veloId: veloA.id }))[0].id;
const retrait = await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "retirer", id: idA, prenom: "Koffi" });
verifier("rendu au parc (200) : l'alerte disparaît", [retrait.statut, await touche()], [200, undefined]);
verifier("il ne reste que le second vélo", (await depot.listerIndisponibilites({ depuis: mardi, jusqua: mardi })).map((i: { veloId: string }) => i.veloId), [veloB.id]);
verifier("le retirer deux fois : 404", (await appeler(routeIndispo, "/api/admin/indisponibilites", { action: "retirer", id: idA, prenom: "Koffi" })).statut, 404);
verifier("le journal garde le retrait", (await depot.listerJournal({ type: "indisponibilite-retiree" }))[0]?.details.veloId, veloA.id);
await depot.majVelo(veloA.id, { statut: "MAINTENANCE" });
verifier("vélo passé à l'atelier : alerte « MAINTENANCE »", (await touche())?.velos.map((v: { raison: string }) => v.raison), ["MAINTENANCE"]);
await depot.majVelo(veloA.id, { statut: "RETIRE" });
verifier("vélo retiré du parc : alerte « RETIRE »", (await touche())?.velos.map((v: { raison: string }) => v.raison), ["RETIRE"]);
await depot.majVelo(veloA.id, { statut: "DISPONIBLE" });
verifier("remis en service : plus d'alerte", await touche(), undefined);
const { reservation: annulee } = await vendre(veloC.id);
await depot.annulerReservation(annulee.reference, { rembourseAuComptoir: true });
await depot.ajouterIndisponibilite({ veloId: veloC.id, date: mardi, par: "admin (Koffi)" });
verifier("une réservation annulée ne déclenche pas d'alerte", (await depot.reservationsTouchees(jour)).some((r: { reference: string }) => r.reference === annulee.reference), false);

console.log("\n— Pénalité de retard");
verifier("location libre : pas de pénalité de retard", await depot.enregistrerRetard(ref, 10, "admin (Koffi)"), { ok: false, raison: "offre" });
enOffreDeGroupe(ref);
verifier("offre de groupe, réglages illisibles : refusée", await depot.enregistrerRetard(ref, 10, "admin (Koffi)"), { ok: false, raison: "reglages" });
verifier("rien n'a été rangé sur la réservation", (await depot.trouverReservationParReference(ref))?.retard, undefined);
const restaure = await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: D, prenom: "Koffi" });
verifier("réglages remis aux valeurs de départ (200)", [restaure.statut, (await lireReglagesOffres()).source], [200, "enregistre"]);
verifier(
  "le journal note qu'ils ne se lisaient plus",
  espaces(journal.resumeEvenement((await depot.listerJournal({ type: "reglages-offres" }))[0]).lignes[0]),
  "Les réglages enregistrés avant ne se lisaient plus : ils sont remplacés.",
);
const sept = await depot.enregistrerRetard(ref, 7, "admin (Koffi)");
verifier("7 min (la tolérance) : 0 F", [sept.ok, sept.reservation?.retard], [true, { minutes: 7, penaliteXof: 0, saisiPar: "admin (Koffi)" }]);
const dix = await retard(ref, { minutes: 10, prenom: "Koffi" });
verifier("10 min : 3 000 F, par la route (200)", [dix.statut, dix.donnees.retard], [200, { minutes: 10, penaliteXof: 3000, saisiPar: "admin (Koffi)" }]);
verifier("rangé sur la réservation", (await depot.trouverReservationParReference(ref))?.retard, { minutes: 10, penaliteXof: 3000, saisiPar: "admin (Koffi)" });
const lignesRetard = await depot.listerJournal({ type: "retard", reference: ref.toLowerCase() });
verifier(
  "journal : deux saisies, la plus récente d'abord, avec la précédente",
  [lignesRetard.length, lignesRetard[0]?.details.minutes, lignesRetard[0]?.details.avant, lignesRetard[1]?.details.minutes],
  [2, 10, { minutes: 7, penaliteXof: 0 }, 7],
);
verifier("en clair", espaces(journal.resumeEvenement(lignesRetard[0]).titre), "10 min de retard : pénalité de 3 000 F");
await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: { ...D, retard: { toleranceMinutes: 5, penaliteParMinuteXof: 500 } }, prenom: "Koffi" });
verifier("les réglages du moment : 5 min puis 500 F, 10 min = 2 500 F", (await retard(ref, { minutes: 10, prenom: "Koffi" })).donnees.retard?.penaliteXof, 2500);
await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: D, prenom: "Koffi" });
verifier("zéro efface la pénalité", (await retard(ref, { minutes: 0, prenom: "Koffi" })).donnees.retard, { minutes: 0, penaliteXof: 0, saisiPar: "admin (Koffi)" });
verifier("minutes décimales : refusées", [(await retard(ref, { minutes: 10.5, prenom: "Koffi" })).statut, (await retard(ref, { minutes: 10.5, prenom: "Koffi" })).donnees.champs?.minutes], [422, "Minutes entières."]);
verifier("minutes négatives : refusées", (await retard(ref, { minutes: -1, prenom: "Koffi" })).statut, 422);
verifier("réservation inconnue : 404", (await retard("BL-INCONNU", { minutes: 10, prenom: "Koffi" })).statut, 404);
// Le second vélo est déclaré indisponible ce mardi : il ne roule ce jour-là
// pour aucune offre, location libre comprise (lot 3).
verifier(
  "vélo déclaré indisponible ce jour-là : refusé, même en location libre",
  espaces(await vendre(veloB.id, false).then(() => "créée", (e: Error) => e.message)),
  "Ce vélo n'est pas disponible ce jour-là : choisissez-en un autre.",
);
// Une demande en ligne, pas encore payée, sur un vélo resté libre ce mardi.
const veloD = libres.find((v) => ![veloA.id, veloB.id, veloC.id].includes(v.id));
if (!veloD) throw new Error("Aucun quatrième vélo libre ce mardi dans la démonstration.");
const { reservation: enAttente } = await vendre(veloD.id, false);
enOffreDeGroupe(enAttente.reference, "bike-for-all");
verifier("pas encore payée : refusée", (await retard(enAttente.reference, { minutes: 10, prenom: "Koffi" })).donnees.code, "statut");
await depot.ecrireParametreAdmin(CLE, JSON.stringify({ retard: { toleranceMinutes: -3 } }));
const bloque = await retard(ref, { minutes: 10, prenom: "Koffi" });
verifier("réglages illisibles : 409, rien de calculé au prix par défaut", [bloque.statut, bloque.donnees.code], [409, "reglages"]);
await appeler(routeReglages, "/api/admin/reglages-offres", { reglages: D, prenom: "Koffi" });

console.log("\n— Journal");
const tout = await depot.listerJournal();
verifier("le plus récent d'abord", tout.every((e: { creeLe: string }, i: number) => i === 0 || tout[i - 1].creeLe >= e.creeLe), true);
verifier("limité à la demande", (await depot.listerJournal({ limite: 2 })).length, 2);
verifier("filtré par type", (await depot.listerJournal({ type: "indisponibilite-ajoutee" })).every((e: { type: string }) => e.type === "indisponibilite-ajoutee"), true);
// Quelques millisecondes d'écart, pour que l'événement précédent ne tombe
// pas dans la même milliseconde que l'instant de départ.
await new Promise((resoudre) => setTimeout(resoudre, 5));
const depuisMaintenant = new Date().toISOString();
await new Promise((resoudre) => setTimeout(resoudre, 5));
await depot.journaliser({ type: "essai-inconnu", details: { lot: 2 }, auteur: "site" });
const inconnus = await depot.listerJournal({ depuis: depuisMaintenant });
verifier("depuis un instant : le seul événement écrit après", inconnus.map((e: { type: string }) => e.type), ["essai-inconnu"]);
verifier("un type inconnu s'affiche quand même", espaces(JSON.stringify(journal.resumeEvenement(inconnus[0]))), JSON.stringify({ titre: "essai-inconnu", lignes: ["lot : 2"] }));
verifier("auteurs : « admin (Koffi) » se lit « Koffi », « site » « le site »", [journal.prenomDeAuteur("admin (Koffi)"), journal.prenomDeAuteur("site"), journal.auteurAdmin("  Awa "), journal.auteurAdmin("")], ["Koffi", "le site", "admin (Awa)", "admin"]);

console.log("\n— Remboursements");
const motif = "Paiement reçu après l'expiration de la demande (transaction TX-123)";
const remb = await depot.creerRemboursement({ reference: ref, montantXof: 31250, motif });
verifier("créé : à faire, avec le client à rembourser", [remb?.statut, remb?.reference, remb?.montantXof, remb?.client.prenom, remb?.client.telephone], ["a_faire", ref, 31250, "Awa", "+229 01 00 00 00 01"]);
const encore = await depot.creerRemboursement({ reference: ref, montantXof: 31250, motif });
verifier("la même demande deux fois : un seul remboursement", [encore?.id === remb?.id, (await depot.listerRemboursements({ statut: "a_faire" })).filter((r: { reference: string }) => r.reference === ref).length], [true, 1]);
const second = await depot.creerRemboursement({ reference: ref, montantXof: 31250, motif: `${motif.slice(0, -4)}456)` });
verifier("un second paiement, autre transaction : un second remboursement", [second?.id !== remb?.id, (await depot.listerRemboursements({ statut: "a_faire" })).length], [true, 2]);
verifier("réservation inconnue : rien", await depot.creerRemboursement({ reference: "BL-INCONNU", montantXof: 1000, motif: "essai" }), null);
const fait = await appeler(routeRembourser, "/api/admin/remboursements", { action: "fait", id: remb?.id, prenom: "Awa" });
verifier("noté fait (200), par qui et quand", [fait.statut, fait.donnees.remboursement?.statut, fait.donnees.remboursement?.faitPar, typeof fait.donnees.remboursement?.faitLe], [200, "fait", "admin (Awa)", "string"]);
verifier("noté deux fois : 404, rien de compté deux fois", (await appeler(routeRembourser, "/api/admin/remboursements", { action: "fait", id: remb?.id, prenom: "Awa" })).statut, 404);
verifier(
  "listes : un à faire, un fait",
  [(await depot.listerRemboursements({ statut: "a_faire" })).map((r: { id: string }) => r.id), (await depot.listerRemboursements({ statut: "fait" })).map((r: { id: string }) => r.id)],
  [[second?.id], [remb?.id]],
);
verifier("sans filtre : à faire d'abord", (await depot.listerRemboursements()).map((r: { statut: string }) => r.statut), ["a_faire", "fait"]);
const [cree] = await depot.listerJournal({ type: "remboursement-cree", reference: ref });
const [faitJournal] = await depot.listerJournal({ type: "remboursement-fait" });
verifier("journal : créé par le site, fait par Awa", [cree?.auteur, faitJournal?.auteur, espaces(journal.resumeEvenement(faitJournal).titre)], ["site", "admin (Awa)", "31 250 F remboursés"]);
verifier("sans prénom : refusé", (await appeler(routeRembourser, "/api/admin/remboursements", { action: "fait", id: second?.id })).statut, 422);
// La demande en ligne jamais payée s'efface d'habitude (décision 27) ; plus
// quand de l'argent à rendre y est rattaché (la base le refuserait : ON
// DELETE RESTRICT). Une limite dans le futur : toutes sont assez anciennes.
const aRendre = await depot.creerRemboursement({ reference: enAttente.reference, montantXof: 1000, motif: "Essai d'effacement" });
const effacement = await depot.purgerDemandesNonPayees(new Date(Date.now() + 60_000).toISOString());
verifier(
  "une demande qui porte un remboursement ne s'efface pas, et se voit",
  [
    Boolean(aRendre),
    effacement.references.includes(enAttente.reference),
    Boolean(await depot.trouverReservationParReference(enAttente.reference)),
    (await depot.listerReservations()).some((r: { reference: string }) => r.reference === enAttente.reference),
  ],
  [true, false, true, true],
);

console.log("\n— Les offres de groupe se nomment partout");
verifier(
  "résumés",
  [
    resumeOffre({ offre: "bike-for-all", nombrePersonnes: 10, minuteDebut: 480, minuteFin: 525 }),
    resumeOffre({ offre: "bike-for-all", nombrePersonnes: 12, minuteDebut: 480, minuteFin: 570 }),
    resumeOffre({ offre: "road-trip-groupe", nombrePersonnes: 10 }),
    resumeOffre({ offre: "gbashi-groupe", nombrePersonnes: 5 }),
  ].map(espaces),
  ["Bike for All · 10 personnes · 45 min", "Bike for All · 12 personnes · 1 h 30", "Road trip en groupe · 10 personnes", "Gbashi Bike sur réservation · 5 personnes"],
);
verifier(
  "l'horaire au quart d'heure, tiré des minutes",
  [
    formatPlageReservation({ dateDebut: "2026-11-14", heureDebut: 8, heureFin: 9, minuteDebut: 480, minuteFin: 525 }),
    formatCreneau({ dateDebut: "2026-11-14", heureDebut: 8, heureFin: 9, minuteDebut: 480, minuteFin: 525 }),
    formatPlageReservation({ dateDebut: "2026-11-14", heureDebut: 8, heureFin: 11 }),
  ].map(espaces),
  ["8 h - 8 h 45", "14 novembre 2026, de 8 h à 8 h 45", "8 h - 11 h"],
);
verifier(
  "l'horaire exact (rappel de la veille) : celui noté (Padel bike), sinon les minutes, sinon les heures pleines",
  [
    horaireExact({ horaire: { depart: "18:30", retour: "22:30" }, minuteDebut: 480, minuteFin: 525 }),
    horaireExact({ minuteDebut: 495, minuteFin: 540 }),
    horaireExact({}),
  ],
  [{ depart: "18:30", retour: "22:30" }, { depart: "08:15", retour: "09:00" }, undefined],
);
verifier(
  "cocos : ceux que le calcul a prévus, sinon zéro",
  [cocosDe({ offre: "road-trip-groupe", nombrePersonnes: 10, offreDetails: { cocos: 20 } }), cocosDe({ offre: "bike-for-all", nombrePersonnes: 10 }), cocosDe({ offre: "road-trip", nombrePersonnes: 2 })],
  [20, 0, 4],
);

console.log("\n— SQL rejouable");
const sql = readFileSync(join(projet, "prisma/offres-groupe.sql"), "utf8");
const schemaPrisma = readFileSync(join(projet, "prisma/schema.prisma"), "utf8");
const tables = ["IndisponibiliteVelo", "JournalEvenement", "PreuveReduction", "Remboursement"];
verifier("chaque table : créée si absente, verrouillée (RLS), décrite dans le schéma", tables.map((t) => [sql.includes(`CREATE TABLE IF NOT EXISTS "${t}"`), sql.includes(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`), schemaPrisma.includes(`model ${t} {`)]), tables.map(() => [true, true, true]));
verifier("trois offres ajoutées si absentes", ["BIKE_FOR_ALL", "ROAD_TRIP_GROUPE", "GBASHI_GROUPE"].map((o) => sql.includes(`ADD VALUE IF NOT EXISTS '${o}'`)), [true, true, true]);
const colonnes = sql.split("\n").filter((l) => l.includes("ADD COLUMN"));
verifier("neuf colonnes (dont la clé d'idempotence des remboursements), toutes « IF NOT EXISTS »", [colonnes.length, colonnes.every((l) => l.includes("ADD COLUMN IF NOT EXISTS"))], [9, true]);
verifier(
  "la clé d'idempotence : unique en base et dans le schéma",
  [sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS "Remboursement_cleIdempotence_key"'), /cleIdempotence\s+String\?\s+@unique/.test(schemaPrisma)],
  [true, true],
);
verifier("rien de supprimé ni de renommé", /\b(DROP|RENAME|DELETE|TRUNCATE|UPDATE)\b/i.test(sql.replace(/^--.*$/gm, "").replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT)/g, "")), false);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
