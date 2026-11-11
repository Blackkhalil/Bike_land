// La disponibilité des offres de groupe (lot 3), en démonstration : aucune
// base réelle, aucun email envoyé, aucun paiement. Le calcul pur au quart
// d'heure, le parc du jour, l'exemple du cahier des charges (18 vélos), la
// retenue de 30 minutes et le paiement arrivé après, Gbashi Bike gamme par
// gamme, les créneaux qui se touchent, les vélos déclarés indisponibles un
// jour (pour toutes les offres), les heures pleines que voient les anciennes
// offres, la vente au comptoir, la preuve de réduction du road trip et les
// remboursements sans doublon.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "ADMIN_PASSWORD", "REVALIDATION_SECRET", "SASPAY_API_KEY", "ANTHROPIC_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { depot } = await charger("src/lib/db/index.ts");
const { occupationsDeLaGamme, MESSAGE_VELO_INDISPONIBLE } = await charger("src/lib/db/contrat.ts");
const D = await charger("src/lib/disponibilite/index.ts");
const { ajouterJours, aujourdhui } = await charger("src/lib/dates.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT } = await charger("src/data/reglages-offres.ts");
const { confirmerParSasPay } = await charger("src/lib/paiement-confirmation.ts");
const { POST: routeDisponibilite } = await charger("src/app/api/disponibilite/route.ts");

let echecs = 0;
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(/[  ]/g, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};

type Gammes = Record<string, number>;
interface Erreur extends Error {
  velosLibres?: number;
  parGamme?: Gammes;
  raison?: string;
}
interface Resa {
  reference: string;
  statut: string;
  offre: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: number;
  heureFin: number;
  minuteDebut?: number;
  minuteFin?: number;
  horaire?: { depart: string; retour: string };
  jours: number;
  nombrePersonnes: number;
  sousTotalXof: number;
  remiseXof: number;
  totalXof: number;
  offreDetails?: Record<string, unknown>;
  lignes: { veloId: string; prixUnitaireXof: number }[];
  paiements: { statut: string; fournisseur: string; moyen: string; montantXof: number; encaissePar?: string; referenceFournisseur?: string }[];
  confirmeLe?: string;
}
interface Parc {
  date: string;
  velos: { id: string; nom: string; gamme: string }[];
  occupations: { veloId: string; debutMinute: number; finMinute: number }[];
}

/** Ce qu'une promesse a levé, ou null si elle a réussi. */
const erreurDe = async (promesse: Promise<unknown>): Promise<Erreur | null> => {
  try {
    await promesse;
    return null;
  } catch (erreur) {
    return erreur as Erreur;
  }
};
const c = (debutMinute: number, finMinute: number) => ({ debutMinute, finMinute });
const jourSemaine = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

console.log("\n— Le calcul pur, au quart d'heure");
verifier("8 h - 8 h 30 et 8 h 30 - 9 h ne se gênent pas, dans un sens comme dans l'autre", [D.seChevauchent(c(480, 510), c(510, 540)), D.seChevauchent(c(510, 540), c(480, 510))], [false, false]);
verifier("une minute en commun suffit à se gêner", D.seChevauchent(c(480, 510), c(509, 540)), true);
verifier("un créneau dans un autre, ou le même deux fois : ils se gênent", [D.seChevauchent(c(480, 540), c(495, 510)), D.seChevauchent(c(480, 510), c(480, 510))], [true, true]);
verifier(
  "les minutes d'une réservation : exactes si notées, sinon ses heures pleines",
  [
    D.minutesDeLigne({ heureDebut: 8, heureFin: 9, minuteDebut: 495, minuteFin: 525 }),
    D.minutesDeLigne({ heureDebut: 8, heureFin: 11 }),
    D.minutesDeLigne({ heureDebut: 8, heureFin: 9, minuteDebut: null, minuteFin: null }),
    D.minutesDeLigne({ heureDebut: 8, heureFin: 9, minuteDebut: 525, minuteFin: 495 }),
  ],
  [c(495, 525), c(480, 660), c(480, 540), c(480, 540)],
);
verifier(
  "les heures pleines rangées couvrent les minutes : 8 h 15 - 9 h 15 prend 8 h - 10 h",
  [D.heuresCouvrantes(c(495, 555)), D.heuresCouvrantes(c(480, 510)), D.heuresCouvrantes(c(510, 540)), D.heuresCouvrantes(c(1290, 1320))],
  [{ heureDebut: 8, heureFin: 10 }, { heureDebut: 8, heureFin: 9 }, { heureDebut: 8, heureFin: 9 }, { heureDebut: 21, heureFin: 22 }],
);
verifier("08:15 vaut 495 minutes, et 495 minutes « 08:15 »", [D.minutesDeHeure("08:15"), D.heureDeMinutes(495), D.heureDeMinutes(1320)], [495, "08:15", "22:00"]);

const melange = [
  { id: "a", nom: "Zèbre", gamme: "PREMIUM", statut: "DISPONIBLE" },
  { id: "b", nom: "Atelier", gamme: "CLASSIQUE", statut: "MAINTENANCE" },
  { id: "c", nom: "Retiré", gamme: "CLASSIQUE", statut: "RETIRE" },
  { id: "d", nom: "Bravo", gamme: "CLASSIQUE", statut: "DISPONIBLE" },
  { id: "e", nom: "Alpha", gamme: "CLASSIQUE", statut: "EN_LOCATION" },
  { id: "f", nom: "Panne", gamme: "PRESTIGE", statut: "DISPONIBLE" },
];
const parcMelange = D.construireParcDuJour("2027-01-02", melange, new Set(["f"]), [
  { veloId: "d", heureDebut: 10, heureFin: 12 },
  { veloId: "b", heureDebut: 8, heureFin: 9 },
  { veloId: "a", heureDebut: 8, heureFin: 9, minuteDebut: 495, minuteFin: 525 },
]);
verifier(
  "le parc du jour : ni atelier, ni retiré, ni déclaré indisponible ce jour-là ; le Classique d'abord",
  parcMelange.velos.map((v: { id: string }) => v.id),
  ["e", "d", "a"],
);
verifier(
  "ses créneaux pris : ceux de ses vélos seulement, triés, à la minute ou à l'heure",
  parcMelange.occupations,
  [{ veloId: "a", debutMinute: 495, finMinute: 525 }, { veloId: "d", debutMinute: 600, finMinute: 720 }],
);

// Le parc de l'exemple du cahier : 10 Classique, 6 Premium, 2 Prestige.
const gammeFictive = (i: number) => (i < 10 ? "CLASSIQUE" : i < 16 ? "PREMIUM" : "PRESTIGE");
const dixHuit = Array.from({ length: 18 }, (_, i) => ({
  id: `v${String(i + 1).padStart(2, "0")}`,
  nom: `Vélo ${String(i + 1).padStart(2, "0")}`,
  gamme: gammeFictive(i),
  statut: "DISPONIBLE",
}));
const parcVide = D.construireParcDuJour("2027-01-02", dixHuit, new Set(), []);
const parcPur = D.construireParcDuJour(
  "2027-01-02",
  dixHuit,
  new Set(),
  dixHuit.slice(0, 10).map((v) => ({ veloId: v.id, heureDebut: 8, heureFin: 9, minuteDebut: 480, minuteFin: 510 })),
);
const B = REGLAGES_OFFRES_PAR_DEFAUT.bikeForAll;
const grille = {
  premier: D.minutesDeHeure(B.premierDepart),
  dernier: D.minutesDeHeure(B.dernierDepart),
  pas: B.pasMinutes,
  retourAuPlusTard: D.minutesDeHeure(B.retourAuPlusTard),
};
verifier("exemple du cahier : un groupe de 10 de 8 h à 8 h 30 sur 18 vélos, il en reste 8", D.velosLibresSurCreneau(parcPur, c(480, 510)).total, 8);
verifier("…de nouveau 18 dès 8 h 30", D.velosLibresSurCreneau(parcPur, c(510, 540)).total, 18);
verifier("…un autre groupe de 10 à 8 h 15 : le départ libre le plus proche est 8 h 30", D.heureDeMinutes(D.prochainDepartLibre(parcPur, 10, 30, 495, grille)), "08:30");
verifier(
  "suffit : le total toutes gammes, ou chaque gamme",
  [
    D.suffit(D.velosLibresSurCreneau(parcPur, c(480, 510)), 8),
    D.suffit(D.velosLibresSurCreneau(parcPur, c(480, 510)), 9),
    D.suffit(D.velosLibresSurCreneau(parcPur, c(480, 510)), { PREMIUM: 6, PRESTIGE: 2 }),
    D.suffit(D.velosLibresSurCreneau(parcPur, c(480, 510)), { CLASSIQUE: 1 }),
  ],
  [true, false, true, false],
);
verifier("le retour au plus tard compte : 60 min à 21 h 30 demandées, départ proposé à 21 h", D.heureDeMinutes(D.prochainDepartLibre(parcVide, 1, 60, 1290, grille)), "21:00");
verifier(
  "un départ que la vente écarte (délai minimum, départ passé) n'est pas proposé",
  D.heureDeMinutes(D.prochainDepartLibre(parcPur, 10, 30, 495, grille, (depart: number) => depart < 540)),
  "09:00",
);
verifier("à égalité d'écart, le plus tôt", D.heureDeMinutes(D.prochainDepartLibre(parcVide, 1, 30, 495, grille, (depart: number) => depart === 495)), "08:00");
verifier("19 vélos demandés sur 18 : aucun départ, null", D.prochainDepartLibre(parcVide, 19, 30, 480, grille), null);
const douze = D.attribuerVelos(parcVide, c(480, 510), 12);
verifier("12 vélos toutes gammes : les 10 Classique puis 2 Premium", douze.velos?.map((v: { gamme: string }) => v.gamme), [...Array(10).fill("CLASSIQUE"), "PREMIUM", "PREMIUM"]);
const gbashiPur = D.attribuerVelos(parcVide, c(420, 660), { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 });
verifier("Gbashi : le nombre exact de chaque gamme", gbashiPur.velos?.map((v: { id: string }) => v.id), ["v01", "v02", "v11", "v12", "v17"]);
// Le scénario de la relecture : un groupe Q a les 6 Premium et les 2
// Prestige de 9 h à 10 h. Le groupe R, 8 vélos de 8 h à 9 h, prend au plus
// serré les vélos que Q prend à 9 h ; le groupe S, 10 vélos de 8 h à 10 h,
// trouve alors encore les 10 Classique.
const vingtQuatre = (velos: typeof dixHuit, debut: number, fin: number) =>
  velos.map((v) => ({ veloId: v.id, heureDebut: Math.floor(debut / 60), heureFin: Math.ceil(fin / 60), minuteDebut: debut, minuteFin: fin }));
const lignesQ = vingtQuatre(dixHuit.slice(10), 540, 600);
const groupeR = D.attribuerVelos(D.construireParcDuJour("2027-01-02", dixHuit, new Set(), lignesQ), c(480, 540), 8);
verifier(
  "au plus serré : un groupe de 8 h à 9 h prend les vélos qu'un autre groupe prend à 9 h",
  groupeR.velos?.map((v: { id: string }) => v.id),
  dixHuit.slice(10).map((v) => v.id),
);
const lignesR = (groupeR.velos ?? []).map((v: { id: string }) => ({ veloId: v.id, heureDebut: 8, heureFin: 9, minuteDebut: 480, minuteFin: 540 }));
const groupeS = D.attribuerVelos(D.construireParcDuJour("2027-01-02", dixHuit, new Set(), [...lignesQ, ...lignesR]), c(480, 600), 10);
verifier("…et un groupe de 10 de 8 h à 10 h trouve encore les 10 Classique", groupeS.velos?.map((v: { gamme: string }) => v.gamme), Array(10).fill("CLASSIQUE"));
const troisPrestige = D.attribuerVelos(parcVide, c(420, 660), { PRESTIGE: 3 });
verifier("3 Prestige demandés pour 2 au parc : rien d'attribué, et ce qui reste", [troisPrestige.velos, troisPrestige.libres.total, troisPrestige.libres.parGamme], [null, 18, { CLASSIQUE: 10, PREMIUM: 6, PRESTIGE: 2 }]);

/* ------------------------------------------------------------ Le dépôt */

// Le parc de démonstration compte 11 vélos : 7 de plus pour celui du cahier,
// 18 vélos (10 Classique, 6 Premium, 2 Prestige).
const ajoutes: [string, string][] = [
  ["Essai Lagune", "CLASSIQUE"],
  ["Essai Cocotier", "CLASSIQUE"],
  ["Essai Dantokpa", "CLASSIQUE"],
  ["Essai Ganvié", "CLASSIQUE"],
  ["Essai Ouidah", "PREMIUM"],
  ["Essai Possotomé", "PREMIUM"],
  ["Essai Grand-Popo", "PRESTIGE"],
];
for (const [nom, gamme] of ajoutes) {
  await depot.creerVelo({
    nom,
    categorie: "VTC",
    gamme,
    taille: "M",
    accroche: "Vélo d'essai",
    description: "Vélo d'essai du parc de démonstration.",
    poidsKg: 14,
    vitesses: 7,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 30,
    equipementInclus: [],
  });
}
const tousLesVelos: { id: string; nom: string; gamme: string; statut: string }[] = await depot.listerVelos();
const gammeDu = new Map(tousLesVelos.map((v) => [v.id, v.gamme]));
const gammesDe = (resa: Resa) => {
  const compte: Gammes = {};
  for (const ligne of resa.lignes) compte[gammeDu.get(ligne.veloId) ?? "?"] = (compte[gammeDu.get(ligne.veloId) ?? "?"] ?? 0) + 1;
  return compte;
};
const ids = (resa: Resa) => resa.lignes.map((l) => l.veloId).sort();

// L'état de la démonstration (créé au premier appel du dépôt) : pour vieillir
// une demande en attente de paiement, et y ranger des preuves de réduction.
type EtatDemo = {
  reservations: { reference: string; creeLe: string }[];
  preuves: { id: string; statut: string; reference?: string; creeLe: string }[];
};
const etatDemo = () => (globalThis as Record<symbol, EtatDemo | undefined>)[Symbol.for("bikeland.demo.etat")]!;
const vieillir = (reference: string, minutes: number) => {
  const r = etatDemo().reservations.find((x) => x.reference === reference);
  if (!r) throw new Error(`Réservation ${reference} absente de la démonstration.`);
  r.creeLe = new Date(Date.now() - minutes * 60_000).toISOString();
};

// Des samedis lointains, que l'historique de démonstration (deux mois devant
// au plus) ne touche pas : un par scénario, pour qu'ils ne se gênent pas.
let samedi = ajouterJours(aujourdhui(), 500);
while (jourSemaine(samedi) !== 6) samedi = ajouterJours(samedi, 1);
const S1 = samedi;
const S2 = ajouterJours(samedi, 7);
const S3 = ajouterJours(samedi, 14);
const S4 = ajouterJours(samedi, 21);
const S5 = ajouterJours(samedi, 28);
const S6 = ajouterJours(samedi, 35);
const S7 = ajouterJours(samedi, 42);
const dimanche = ajouterJours(samedi, 1);

let numero = 0;
const groupe = (date: string, debut: number, fin: number, velos: number | Gammes, autre: Record<string, unknown> = {}) => {
  numero += 1;
  const personnes = typeof velos === "number" ? velos : Object.values(velos).reduce((t, n) => t + n, 0);
  return {
    offre: "bike-for-all",
    date,
    debutMinute: debut,
    finMinute: fin,
    velos,
    nombrePersonnes: personnes,
    totalXof: 6250,
    details: { mode: "duree", minutes: fin - debut, depart: D.heureDeMinutes(debut), retour: D.heureDeMinutes(fin), totalXof: 6250 },
    client: { prenom: "Awa", nom: `Groupe ${numero}`, email: `groupe.${numero}@example.com`, telephone: "+229 01 97 00 00 01" },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...autre,
  };
};
const reserverGroupe = async (...args: Parameters<typeof groupe>): Promise<Resa> => (await depot.creerReservationGroupe(groupe(...args))).reservation;
const parcDu = (date: string): Promise<Parc> => depot.parcDuJour(date);

console.log("\n— Le parc du jour, en démonstration");
const parcS1: Parc = await parcDu(S1);
verifier("18 vélos, rien de pris ce samedi lointain", [parcS1.velos.length, parcS1.occupations.length], [18, 0]);
verifier("10 Classique, 6 Premium, 2 Prestige", D.velosLibresSurCreneau(parcS1, c(480, 510)).parGamme, { CLASSIQUE: 10, PREMIUM: 6, PRESTIGE: 2 });
verifier("le Classique d'abord, comme l'attribution", parcS1.velos.slice(0, 10).every((v) => v.gamme === "CLASSIQUE"), true);
verifier("une date impossible : refusée", (await erreurDe(depot.parcDuJour("2027-02-30")))?.message, "Date attendue au format AAAA-MM-JJ.");

console.log("\n— L'exemple du cahier : 18 vélos, deux groupes de 10");
const reponseA = await depot.creerReservationGroupe(groupe(S1, 480, 510, 10));
const A: Resa = reponseA.reservation;
verifier("le premier groupe, 8 h - 8 h 30 : en attente de paiement, Bike for All", [A.statut, A.offre, A.nombrePersonnes], ["EN_ATTENTE_PAIEMENT", "bike-for-all", 10]);
verifier(
  "le jour, les heures pleines qui couvrent (8 h - 9 h), les minutes exactes et l'horaire lu par la page de suivi",
  [A.dateDebut, A.dateFin, A.jours, A.heureDebut, A.heureFin, A.minuteDebut, A.minuteFin, A.horaire],
  [S1, S1, 1, 8, 9, 480, 510, { depart: "08:00", retour: "08:30" }],
);
verifier("10 vélos, les Classique d'abord", gammesDe(A), { CLASSIQUE: 10 });
verifier(
  "le paiement en attente, du montant calculé ; rien de remisé",
  [A.paiements.length, A.paiements[0].statut, A.paiements[0].fournisseur, A.paiements[0].montantXof, A.totalXof, A.sousTotalXof, A.remiseXof],
  [1, "INITIE", "SASPAY", 6250, 6250, 6250, 0],
);
verifier("l'instantané du calcul rangé tel quel", A.offreDetails, groupe(S1, 480, 510, 10).details);
verifier("le lien de suivi retrouve la réservation", (await depot.trouverReservationParToken(reponseA.token))?.reference, A.reference);
const [evenementA] = await depot.listerJournal({ type: "reservation-groupe", reference: A.reference });
verifier(
  "écrite au journal, par le site",
  [evenementA?.auteur, evenementA?.details.offre, evenementA?.details.depart, evenementA?.details.retour, evenementA?.details.velos, evenementA?.details.comptoir],
  ["site", "bike-for-all", "08:00", "08:30", 10, false],
);
let parc = await parcDu(S1);
verifier("le parc voit ses 10 vélos pris de 8 h à 8 h 30", [parc.occupations.length, parc.occupations.every((o) => o.debutMinute === 480 && o.finMinute === 510)], [10, true]);
verifier("entre 8 h et 8 h 30, il ne reste que 8 vélos", D.velosLibresSurCreneau(parc, c(480, 510)).total, 8);
const refus815 = await erreurDe(depot.creerReservationGroupe(groupe(S1, 495, 525, 10)));
verifier(
  "un autre groupe de 10 à 8 h 15 : refusé, il ne reste que 8 vélos (6 Premium, 2 Prestige)",
  [refus815?.name, refus815?.velosLibres, refus815?.parGamme],
  ["CapaciteInsuffisanteError", 8, { CLASSIQUE: 0, PREMIUM: 6, PRESTIGE: 2 }],
);
verifier("…le départ libre le plus proche : 8 h 30", D.heureDeMinutes(D.prochainDepartLibre(parc, 10, 30, 495, grille)), "08:30");
verifier("…rien n'a été écrit", (await parcDu(S1)).occupations.length, 10);
const A2: Resa = await reserverGroupe(S1, 510, 540, 10);
verifier("le second groupe de 10, dès 8 h 30 : accepté", [A2.statut, A2.lignes.length, A2.heureDebut, A2.heureFin], ["EN_ATTENTE_PAIEMENT", 10, 8, 9]);
verifier("…sur les mêmes vélos, rendus à 8 h 30", ids(A2), ids(A));
parc = await parcDu(S1);
verifier("à 8 h 15, un groupe de 8 passe encore", D.suffit(D.velosLibresSurCreneau(parc, c(495, 525)), 8), true);
verifier("un troisième groupe de 10 à 8 h 15 : le plus proche est maintenant 9 h", D.heureDeMinutes(D.prochainDepartLibre(parc, 10, 30, 495, grille)), "09:00");

console.log("\n— Les créneaux qui se touchent, à la minute");
const X: Resa = await reserverGroupe(S3, 480, 510, 18);
const Y: Resa = await reserverGroupe(S3, 510, 540, 18);
verifier("18 vélos de 8 h à 8 h 30, puis les 18 mêmes de 8 h 30 à 9 h : acceptés", [X.lignes.length, Y.lignes.length, ids(X).join() === ids(Y).join()], [18, 18, true]);
const chevauche = await erreurDe(depot.creerReservationGroupe(groupe(S3, 495, 525, 1)));
verifier("un vélo de 8 h 15 à 8 h 45, à cheval sur les deux : refusé, plus rien de libre", [chevauche?.name, chevauche?.velosLibres], ["CapaciteInsuffisanteError", 0]);
verifier("dès 9 h, les 18 sont libres", D.velosLibresSurCreneau(await parcDu(S3), c(540, 570)).total, 18);

console.log("\n— La retenue de 30 minutes pendant le paiement");
const P: Resa = await reserverGroupe(S5, 600, 630, 10);
vieillir(P.reference, 29);
verifier("au bout de 29 minutes, la demande retient toujours ses vélos", (await parcDu(S5)).occupations.length, 10);
vieillir(P.reference, 31);
verifier("au bout de 31 minutes, elle ne retient plus rien", [(await parcDu(S5)).occupations.length, D.velosLibresSurCreneau(await parcDu(S5), c(600, 630)).total], [0, 18]);
const Q: Resa = await reserverGroupe(S5, 600, 630, 18);
verifier("un autre groupe prend alors les 18 vélos, ceux de la demande expirée compris", [Q.statut, ids(P).every((id) => ids(Q).includes(id))], ["EN_ATTENTE_PAIEMENT", true]);
const paiementDe = (resa: Resa, id: string) => ({
  id,
  statut: "SUCCESS",
  montantDemandeXof: resa.totalXof,
  montantDebiteXof: resa.totalXof,
  montantNetXof: resa.totalXof,
  urlCheckout: "",
  reference: resa.reference,
});
const tardP = await confirmerParSasPay({ reference: P.reference, paiement: paiementDe(P, "TX-ESSAI-P"), lienSuivi: "http://localhost/suivi" });
verifier(
  "le paiement arrive après 30 minutes, les vélos ont été repris : à rembourser, rien de confirmé (décision 6)",
  [tardP.issue, (await depot.trouverReservationParReference(P.reference))?.statut],
  ["creneau-perdu", "EN_ATTENTE_PAIEMENT"],
);
const R: Resa = await reserverGroupe(S5, 480, 510, 10);
vieillir(R.reference, 31);
const T: Resa = await reserverGroupe(S5, 510, 540, 10);
verifier("une demande de 8 h à 8 h 30 expire ; un groupe de 8 h 30 prend les mêmes vélos", ids(T), ids(R));
const tardR = await confirmerParSasPay({ reference: R.reference, paiement: paiementDe(R, "TX-ESSAI-R"), lienSuivi: "http://localhost/suivi" });
verifier(
  "son paiement arrive après 30 minutes : ses vélos sont encore libres jusqu'à 8 h 30, confirmée",
  [tardR.issue, (await depot.trouverReservationParReference(R.reference))?.statut],
  ["confirmee", "CONFIRMEE"],
);
const paiementR = ((await depot.trouverReservationParReference(R.reference)) as Resa).paiements[0];
verifier("le paiement est noté réussi, avec sa transaction", [paiementR.statut, paiementR.referenceFournisseur], ["REUSSI", "TX-ESSAI-R"]);
const U: Resa = await reserverGroupe(S5, 720, 750, 5);
vieillir(U.reference, 45);
verifier("payée 45 minutes après, personne n'a pris ses vélos : confirmée", (await depot.confirmerPaiement(U.reference, "TX-ESSAI-U"))?.reservation.statut, "CONFIRMEE");
const V: Resa = await reserverGroupe(S5, 780, 810, 5);
vieillir(V.reference, 31);
await depot.majVelo(V.lignes[0].veloId, { statut: "MAINTENANCE" });
verifier(
  "payée en retard, un de ses vélos passé à l'atelier entre-temps : confirmée, avec un autre vélo à sa place",
  [
    (await depot.confirmerPaiement(V.reference, "TX-ESSAI-V"))?.reservation.statut,
    ids((await depot.trouverReservationParReference(V.reference)) as Resa).includes(V.lignes[0].veloId),
  ],
  ["CONFIRMEE", false],
);
await depot.majVelo(V.lignes[0].veloId, { statut: "DISPONIBLE" });

console.log("\n— Gbashi Bike, gamme par gamme");
const G: Resa = (
  await depot.creerReservationGroupe({
    ...groupe(dimanche, 420, 660, { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }),
    offre: "gbashi-groupe",
    totalXof: 20125,
    details: { gammes: { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }, depart: "07:00", retour: "11:00", totalXof: 20125 },
  })
).reservation;
verifier(
  "2 Classique, 2 Premium, 1 Prestige, de 7 h à 11 h",
  [G.offre, gammesDe(G), G.heureDebut, G.heureFin, G.horaire, G.nombrePersonnes],
  ["gbashi-groupe", { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 }, 7, 11, { depart: "07:00", retour: "11:00" }, 5],
);
verifier("le journal garde les gammes", (await depot.listerJournal({ type: "reservation-groupe", reference: G.reference }))[0]?.details.gammes, { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 });
const gbashi = (velos: Gammes) => depot.creerReservationGroupe({ ...groupe(dimanche, 420, 660, velos), offre: "gbashi-groupe" });
const deuxPrestige = await erreurDe(gbashi({ PRESTIGE: 2 }));
verifier(
  "2 Prestige de plus : refusé, il n'en reste qu'un (13 vélos libres en tout)",
  [deuxPrestige?.name, deuxPrestige?.velosLibres, deuxPrestige?.parGamme],
  ["CapaciteInsuffisanteError", 13, { CLASSIQUE: 8, PREMIUM: 4, PRESTIGE: 1 }],
);
const reste = (await gbashi({ CLASSIQUE: 8, PREMIUM: 4, PRESTIGE: 1 })).reservation as Resa;
verifier("tout ce qui reste, gamme par gamme : accepté", gammesDe(reste), { CLASSIQUE: 8, PREMIUM: 4, PRESTIGE: 1 });
verifier("un Classique de plus : refusé", (await erreurDe(gbashi({ CLASSIQUE: 1 })))?.parGamme, { CLASSIQUE: 0, PREMIUM: 0, PRESTIGE: 0 });
verifier("une gamme inconnue : refusée", (await erreurDe(gbashi({ ELECTRIQUE: 1 })))?.message, "Gamme inconnue : ELECTRIQUE.");
verifier(
  "Gbashi Bike avec un nombre de vélos sans gamme : refusé",
  (await erreurDe(depot.creerReservationGroupe({ ...groupe(dimanche, 420, 660, 3), offre: "gbashi-groupe" })))?.message,
  "Gbashi Bike se réserve gamme par gamme : le nombre de vélos de chaque gamme.",
);

console.log("\n— 3 vélos déclarés indisponibles un samedi : toutes les offres");
const [i1, i2, i3] = (await parcDu(S2)).velos.slice(0, 3).map((v) => v.id);
for (const veloId of [i1, i2, i3]) await depot.ajouterIndisponibilite({ veloId, date: S2, motif: "Réparation", par: "admin (Koffi)" });
const parcS2 = await parcDu(S2);
verifier("ce samedi-là : 15 vélos au parc, sans les 3", [parcS2.velos.length, parcS2.velos.some((v) => [i1, i2, i3].includes(v.id))], [15, false]);
verifier("le lendemain et le samedi suivant : 18", [(await parcDu(ajouterJours(S2, 1))).velos.length, (await parcDu(ajouterJours(S2, 7))).velos.length], [18, 18]);
const seize = await erreurDe(depot.creerReservationGroupe(groupe(S2, 600, 630, 16)));
verifier("un groupe de 16 ce jour-là : refusé, 15 vélos libres", [seize?.name, seize?.velosLibres], ["CapaciteInsuffisanteError", 15]);
const location = (veloId: string | undefined, date: string, heureDebut: number, autre: Record<string, unknown> = {}) =>
  depot.creerReservation({
    ...(veloId ? { veloId } : {}),
    offre: "location-libre",
    dureeHeures: 2,
    dateDebut: date,
    dateFin: date,
    heureDebut,
    options: [],
    client: { prenom: "Koffi", nom: "Essai", email: `location.${date}.${heureDebut}@example.com`, telephone: "+229 01 97 00 00 02" },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
    ...autre,
  });
verifier("ni estDisponible ce jour-là, à aucune heure", [await depot.estDisponible(i1, S2, S2, 8, 10), await depot.estDisponible(i1, S2, S2, 18, 20)], [false, false]);
verifier("ni sur une période de plusieurs jours qui le traverse", await depot.estDisponible(i1, ajouterJours(S2, -1), ajouterJours(S2, 1), 9, 11), false);
verifier("le lendemain : libre", await depot.estDisponible(i1, ajouterJours(S2, 1), ajouterJours(S2, 1), 9, 11), true);
const libres911 = (await depot.velosLibres(S2, 9, 11)) as { id: string; gamme: string }[];
verifier(
  "velosLibres (comptoir, Padel bike, départs du road trip) : 15, dont 7 Classique",
  [libres911.length, libres911.filter((v) => v.gamme === "CLASSIQUE").length, libres911.some((v) => [i1, i2, i3].includes(v.id))],
  [15, 7, false],
);
verifier(
  "location libre en ligne sur l'un d'eux : refusée, et le message le dit",
  (await erreurDe(location(i1, S2, 9)))?.message.replace(/[  ]/g, " "),
  MESSAGE_VELO_INDISPONIBLE.replace(/[  ]/g, " "),
);
verifier(
  "vendu au comptoir, en espèces : refusé de même",
  (await erreurDe(location(i2, S2, 14, { moyenPaiement: "ESPECES", encaissement: { par: "Essai" } })))?.message.replace(/[  ]/g, " "),
  MESSAGE_VELO_INDISPONIBLE.replace(/[  ]/g, " "),
);
const parGamme = (await location(undefined, S2, 9, { gamme: "CLASSIQUE" })).reservation as Resa;
verifier("réservée par gamme (le site) : un autre Classique est attribué", [gammesDe(parGamme), [i1, i2, i3].includes(parGamme.lignes[0].veloId)], [{ CLASSIQUE: 1 }, false]);
verifier("le même vélo, le lendemain : la location passe", ((await location(i1, ajouterJours(S2, 1), 9)).reservation as Resa).statut, "EN_ATTENTE_PAIEMENT");
const padel = (await depot.creerReservation({
  offre: "padel-bike",
  nombrePersonnes: 3,
  dateDebut: S2,
  dateFin: S2,
  heureDebut: 18,
  options: [],
  client: { prenom: "Afi", nom: "Padel", email: "afi.padel.indispo@example.com", telephone: "+229 01 97 00 00 03" },
  moyenPaiement: "MTN_MONEY",
  cgvAcceptees: true,
})).reservation as Resa;
verifier("Padel bike, vélos attribués d'office : aucun des 3", [padel.lignes.length, padel.lignes.some((l) => [i1, i2, i3].includes(l.veloId))], [3, false]);
verifier(
  "le calendrier d'un vélo : ce samedi-là pris en entier",
  ((await depot.periodesIndisponibles(i1)) as { debut: string; fin: string; heureDebut: number; heureFin: number }[]).filter((p) => p.debut === S2),
  [{ debut: S2, fin: S2, heureDebut: 0, heureFin: 24 }],
);
const catalogueS2 = ((await depot.listerVelos({ dateDebut: S2, dateFin: S2 })) as { id: string }[]).map((v) => v.id);
const catalogueLendemain = ((await depot.listerVelos({ dateDebut: ajouterJours(S2, 1), dateFin: ajouterJours(S2, 1) })) as { id: string }[]).map((v) => v.id);
verifier("le catalogue filtré sur ce samedi ne les propose pas ; le lendemain, si", [[i1, i2, i3].some((id) => catalogueS2.includes(id)), [i1, i2, i3].every((id) => catalogueLendemain.includes(id))], [false, true]);
const appelDispo = async (corps: unknown) => (await routeDisponibilite(new Request("http://localhost/api/disponibilite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }))).json();
verifier(
  "/api/disponibilite : 15 vélos de 8 h à 9 h, et l'un des 3 n'est pas libre",
  [(await appelDispo({ toutes: true, dateDebut: S2, dateFin: S2, heureDebut: 8, heureFin: 9 })).libres, (await appelDispo({ veloId: i1, dateDebut: S2, dateFin: S2, heureDebut: 8, heureFin: 9 })).disponible],
  [15, false],
);
const quinze: Resa = await reserverGroupe(S2, 780, 810, 15);
verifier("un groupe de 15 à 13 h ce jour-là : accepté, sans les 3", [quinze.lignes.length, quinze.lignes.some((l) => [i1, i2, i3].includes(l.veloId))], [15, false]);
// Les deux Prestige déclarés indisponibles un autre samedi : la gamme est
// pleine toute la journée dans le calendrier de réservation par gamme.
const prestiges = tousLesVelos.filter((v) => v.gamme === "PRESTIGE").map((v) => v.id);
for (const veloId of prestiges) await depot.ajouterIndisponibilite({ veloId, date: S6, par: "admin (Koffi)" });
const pleines = occupationsDeLaGamme(await Promise.all(prestiges.map((id) => depot.periodesIndisponibles(id))), 8, 22).filter((p: { debut: string }) => p.debut === S6);
verifier("toute la gamme Prestige indisponible un samedi : la journée pleine, de 8 h à 22 h", pleines, [{ debut: S6, fin: S6, heureDebut: 8, heureFin: 22 }]);

console.log("\n— Les anciennes offres, à l'heure pleine, et les groupes, à la minute");
const L = (await location(undefined, S4, 10, { gamme: "PREMIUM", moyenPaiement: "ESPECES", encaissement: { par: "Essai" } })).reservation as Resa;
verifier("une location libre de 10 h à 12 h, payée au comptoir", [L.statut, L.heureDebut, L.heureFin], ["CONFIRMEE", 10, 12]);
verifier("le parc du jour la compte de 10 h à 12 h", (await parcDu(S4)).occupations, [{ veloId: L.lignes[0].veloId, debutMinute: 600, finMinute: 720 }]);
const dixHuitA11 = await erreurDe(depot.creerReservationGroupe(groupe(S4, 660, 690, 18)));
verifier("un groupe de 18 à 11 h : refusé, 17 vélos libres (5 Premium)", [dixHuitA11?.name, dixHuitA11?.velosLibres, dixHuitA11?.parGamme?.PREMIUM], ["CapaciteInsuffisanteError", 17, 5]);
const dixHuitA12: Resa = await reserverGroupe(S4, 720, 750, 18);
verifier("le même groupe à 12 h, au retour du vélo : accepté, rangé de 12 h à 13 h", [dixHuitA12.lignes.length, dixHuitA12.heureDebut, dixHuitA12.heureFin], [18, 12, 13]);
verifier(
  "il bloque la location libre sur l'heure qu'il touche, et seulement elle",
  [((await depot.velosLibres(S4, 12, 13)) as unknown[]).length, ((await depot.velosLibres(S4, 13, 14)) as unknown[]).length],
  [0, 18],
);
verifier("une location libre de 12 h à 14 h sur l'un de ses vélos : refusée", (await erreurDe(location(L.lignes[0].veloId, S4, 12)))?.name, "ConflitDisponibiliteError");
verifier("de 13 h à 15 h : acceptée", ((await location(L.lignes[0].veloId, S4, 13)).reservation as Resa).statut, "EN_ATTENTE_PAIEMENT");
const matin: Resa = await reserverGroupe(S4, 480, 510, 10);
verifier(
  "un groupe de 8 h à 8 h 30, au plus serré : le vélo loué de 10 h à 12 h, puis 9 Classique",
  [ids(matin).includes(L.lignes[0].veloId), gammesDe(matin)],
  [true, { PREMIUM: 1, CLASSIQUE: 9 }],
);
verifier(
  "le road trip actuel (8 h - 11 h) voit encore 8 vélos, aucun du groupe",
  [((await depot.velosLibres(S4, 8, 11)) as { id: string }[]).length, ((await depot.velosLibres(S4, 8, 11)) as { id: string }[]).some((v) => ids(matin).includes(v.id))],
  [8, false],
);
verifier(
  "une location libre par gamme Classique à 8 h : le dernier Classique libre",
  ((await location(undefined, S4, 8, { gamme: "CLASSIQUE" })).reservation as Resa).statut,
  "EN_ATTENTE_PAIEMENT",
);
verifier(
  "une seconde : refusée, plus aucun Classique",
  (await erreurDe(location(undefined, S4, 8, { gamme: "CLASSIQUE" })))?.message.replace(/[  ]/g, " "),
  "Plus aucun vélo Classique n'est libre à cette heure : choisissez une autre heure, un autre jour ou une autre gamme.",
);
const soir: Resa = await reserverGroupe(S4, 1110, 1140, 18);
verifier("un groupe de 18 à 18 h 30 : rangé de 18 h à 19 h", [soir.heureDebut, soir.heureFin], [18, 19]);
verifier(
  "Padel bike ce soir-là (18 h - 23 h) : plus aucune place",
  (
    await erreurDe(
      depot.creerReservation({
        offre: "padel-bike",
        nombrePersonnes: 2,
        dateDebut: S4,
        dateFin: S4,
        heureDebut: 18,
        options: [],
        client: { prenom: "Afi", nom: "Padel", email: "afi.padel.soir@example.com", telephone: "+229 01 97 00 00 04" },
        moyenPaiement: "MTN_MONEY",
        cgvAcceptees: true,
      }),
    )
  )?.message,
  "Plus aucune place ce jour-là : tous les vélos de la sortie sont pris.",
);

console.log("\n— Une ancienne location sur plusieurs jours");
// Le site ne vend plus qu'à la journée, mais le dépôt en garde peut-être :
// mêmes heures chaque jour de la période, comme `creneauxSeChevauchent`.
const mercredi = ajouterJours(S1, 4);
const vendredi = ajouterJours(mercredi, 2);
const veloLong = parcS1.velos[17].id;
const longue = (await location(veloLong, mercredi, 9, { dateFin: vendredi, dureeHeures: 3, moyenPaiement: "ESPECES", encaissement: { par: "Essai" } })).reservation as Resa;
verifier("du mercredi au vendredi, de 9 h à 12 h", [longue.dateDebut, longue.dateFin, longue.heureDebut, longue.heureFin], [mercredi, vendredi, 9, 12]);
verifier(
  "le parc la compte chaque jour de la période, de 9 h à 12 h, et pas la veille",
  [(await parcDu(ajouterJours(mercredi, 1))).occupations, (await parcDu(vendredi)).occupations, (await parcDu(ajouterJours(mercredi, -1))).occupations],
  [[{ veloId: veloLong, debutMinute: 540, finMinute: 720 }], [{ veloId: veloLong, debutMinute: 540, finMinute: 720 }], []],
);
const jeudi18 = await erreurDe(depot.creerReservationGroupe(groupe(ajouterJours(mercredi, 1), 600, 630, 18)));
verifier("un groupe de 18 le jeudi à 10 h : refusé, 17 vélos libres", [jeudi18?.name, jeudi18?.velosLibres], ["CapaciteInsuffisanteError", 17]);
verifier("le même à 12 h, le vélo rendu : accepté", ((await depot.creerReservationGroupe(groupe(ajouterJours(mercredi, 1), 720, 750, 18))).reservation as Resa).lignes.length, 18);

console.log("\n— Vente au comptoir");
const comptoir = (autre: Record<string, unknown>) => depot.creerReservationGroupe(groupe(S7, 840, 870, 4, { moyenPaiement: "ESPECES", ...autre }));
const vente = (await comptoir({ encaissement: { par: "Koffi", reference: "CPT-ESSAI-1" } })).reservation as Resa;
verifier(
  "encaissée en espèces : née confirmée et payée, signée",
  [vente.statut, Boolean(vente.confirmeLe), vente.paiements[0].statut, vente.paiements[0].fournisseur, vente.paiements[0].moyen, vente.paiements[0].encaissePar, vente.paiements[0].referenceFournisseur],
  ["CONFIRMEE", true, "REUSSI", "ESPECES", "ESPECES", "Koffi", "CPT-ESSAI-1"],
);
const [evenementVente] = await depot.listerJournal({ type: "reservation-groupe", reference: vente.reference });
verifier("au journal : « admin (Koffi) », au comptoir", [evenementVente?.auteur, evenementVente?.details.comptoir], ["admin (Koffi)", true]);
const doublon = await erreurDe(comptoir({ encaissement: { par: "Koffi", reference: "CPT-ESSAI-1" } }));
verifier("la même saisie envoyée deux fois : refusée, rien de compté deux fois", [doublon?.name, doublon?.message], ["TransactionDejaUtiliseeError", "Cette vente est déjà enregistrée."]);
verifier("encaissée, mais pas en espèces : refusée", (await erreurDe(comptoir({ moyenPaiement: "MTN_MONEY", encaissement: { par: "Koffi" } })))?.message, "Une vente encaissée au comptoir se règle en espèces.");

console.log("\n— Ce que le dépôt refuse d'écrire");
const refus = async (autre: Record<string, unknown>) => (await erreurDe(depot.creerReservationGroupe(groupe(S7, 600, 630, 2, autre))))?.message;
verifier(
  "date, créneau, vélos, personnes, conditions, offre",
  [
    await refus({ date: "2027-13-01" }),
    await refus({ debutMinute: 630, finMinute: 600 }),
    await refus({ debutMinute: 600.5 }),
    await refus({ velos: 0 }),
    await refus({ nombrePersonnes: 0 }),
    await refus({ cgvAcceptees: false }),
    await refus({ offre: "location-libre" }),
  ],
  [
    "Date attendue au format AAAA-MM-JJ.",
    "Créneau impossible : départ et retour en minutes depuis minuit, le retour après le départ.",
    "Créneau impossible : départ et retour en minutes depuis minuit, le retour après le départ.",
    "Le nombre de vélos à bloquer, toutes gammes confondues : un entier, un au moins.",
    "Une personne au moins.",
    "Les conditions générales doivent être acceptées.",
    "Cette offre n'est pas une offre de groupe.",
  ],
);
verifier("rien n'a été écrit ce jour-là", (await parcDu(S7)).occupations.length, 4);

console.log("\n— La preuve de réduction du road trip, une par groupe");
const maintenant = new Date().toISOString();
// Le contact donné avec chaque capture : celui du client des réservations de ce test (décision 25).
const contactCapture = { email: "groupe@example.com", telephone: "+229 01 97 00 00 01" };
etatDemo().preuves.push(
  { id: "preuve-validee", statut: "validee", creeLe: maintenant, ...contactCapture },
  { id: "preuve-attente", statut: "en_attente", creeLe: maintenant, ...contactCapture },
  { id: "preuve-refusee", statut: "refusee", creeLe: maintenant, ...contactCapture },
);
const roadTrip = (heure: number, preuveId?: string, autre: Record<string, unknown> = {}) =>
  depot.creerReservationGroupe({
    ...groupe(S7, heure * 60, heure * 60 + 240, 10),
    offre: "road-trip-groupe",
    totalXof: 30050,
    details: { reductionXof: 1200, prixBarreXof: 31250, totalXof: 30050 },
    ...(preuveId ? { preuveId } : {}),
    ...autre,
  });
const avecPreuve = (await roadTrip(8, "preuve-validee")).reservation as Resa;
verifier(
  "preuve validée : réduction rangée (sous-total, remise, total), la preuve consommée",
  [avecPreuve.offre, avecPreuve.sousTotalXof, avecPreuve.remiseXof, avecPreuve.totalXof, etatDemo().preuves.find((p) => p.id === "preuve-validee")?.reference],
  ["road-trip-groupe", 31250, 1200, 30050, avecPreuve.reference],
);
const raison = async (...args: Parameters<typeof roadTrip>) => {
  const e = await erreurDe(roadTrip(...args));
  return [e?.name, e?.raison];
};
verifier("la même preuve pour un second groupe : refusée", await raison(16, "preuve-validee"), ["PreuveReductionInutilisableError", "deja-utilisee"]);
verifier(
  "en attente, refusée, inconnue : refusées, chacune dit pourquoi",
  [await raison(16, "preuve-attente"), await raison(16, "preuve-refusee"), await raison(16, "preuve-inconnue")],
  [["PreuveReductionInutilisableError", "en_attente"], ["PreuveReductionInutilisableError", "refusee"], ["PreuveReductionInutilisableError", "inconnue"]],
);
verifier("une preuve sur un Bike for All : refusée, la réduction n'existe que pour le road trip", await raison(16, "preuve-validee", { offre: "bike-for-all" }), ["PreuveReductionInutilisableError", "offre"]);
verifier("rien n'a été écrit par ces refus", (await parcDu(S7)).occupations.length, 14);
await depot.annulerReservation(avecPreuve.reference);
const reprise = (await roadTrip(8, "preuve-validee")).reservation as Resa;
verifier("le premier groupe annulé : sa preuve resservit au groupe qui recommence", etatDemo().preuves.find((p) => p.id === "preuve-validee")?.reference, reprise.reference);
vieillir(reprise.reference, 31);
const apresExpiration = (await roadTrip(8, "preuve-validee")).reservation as Resa;
verifier("une demande jamais payée, expirée : sa preuve resservit aussi", etatDemo().preuves.find((p) => p.id === "preuve-validee")?.reference, apresExpiration.reference);
verifier(
  "la demande expirée qui la retenait est annulée : son paiement tardif ne donnera pas une seconde réduction",
  (await depot.trouverReservationParReference(reprise.reference))?.statut,
  "ANNULEE",
);
const tardReprise = await confirmerParSasPay({ reference: reprise.reference, paiement: paiementDe(reprise, "TX-ESSAI-REPRISE"), lienSuivi: "http://localhost/suivi" });
verifier("… et ce paiement, s'il arrive quand même, est à rembourser", tardReprise.issue, "annulee");

console.log("\n— Paiement tardif d'un groupe : les vélos repris remplacés");
// Un seul de ses vélos repris, d'autres libres : le groupe garde les siens et
// en reçoit un autre à la place (décision 6 : confirmé si les vélos sont libres).
const S8 = ajouterJours(samedi, 49);
const W: Resa = await reserverGroupe(S8, 600, 645, 10);
vieillir(W.reference, 31);
const veloRepris = W.lignes[0].veloId;
await location(veloRepris, S8, 10);
const tardW = await confirmerParSasPay({ reference: W.reference, paiement: paiementDe(W, "TX-ESSAI-W"), lienSuivi: "http://localhost/suivi" });
const apresW = (await depot.trouverReservationParReference(W.reference)) as Resa;
verifier(
  "payée en retard, un seul vélo repris par une location : confirmée, avec un autre vélo à sa place",
  [tardW.issue, apresW.statut, apresW.lignes.length, ids(apresW).includes(veloRepris), new Set(ids(apresW)).size],
  ["confirmee", "CONFIRMEE", 10, false, 10],
);
verifier("ses 9 autres vélos sont gardés", ids(W).filter((id) => id !== veloRepris).every((id) => ids(apresW).includes(id)), true);
const gbashiTard: Resa = await reserverGroupe(S8, 840, 1080, { PRESTIGE: 2 }, { offre: "gbashi-groupe" });
vieillir(gbashiTard.reference, 31);
await location(gbashiTard.lignes[0].veloId, S8, 14);
verifier(
  "Gbashi payé en retard, un de ses 2 Prestige repris : pas d'autre Prestige, rien de confirmé (remboursé)",
  [(await erreurDe(depot.confirmerPaiement(gbashiTard.reference, "TX-ESSAI-G")))?.name, (await depot.trouverReservationParReference(gbashiTard.reference))?.statut],
  ["ConflitDisponibiliteError", "EN_ATTENTE_PAIEMENT"],
);

console.log("\n— Remboursements sans doublon");
const motif = "Paiement reçu après l'expiration de la demande (transaction TX-ESSAI-9)";
const r1 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif });
const r2 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif });
verifier("la même demande deux fois : un seul remboursement", [r1?.statut, r2?.id === r1?.id], ["a_faire", true]);
await depot.marquerRemboursementFait(r1?.id, "admin (Koffi)");
const r3 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif });
const deA = async () => ((await depot.listerRemboursements()) as { reference: string }[]).filter((r) => r.reference === A.reference).length;
verifier("noté fait, puis redemandé : pas de second remboursement", [r3?.id === r1?.id, r3?.statut, await deA()], [true, "fait", 1]);
const k1 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif: "Paiement en double", cleIdempotence: "TX-ESSAI-10" });
const k2 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif: "Paiement en double, relu", cleIdempotence: " TX-ESSAI-10 " });
verifier("avec une clé : la clé fait foi, même si le motif change", [k1?.cleIdempotence, k2?.id === k1?.id, await deA()], ["TX-ESSAI-10", true, 2]);
await depot.marquerRemboursementFait(k1?.id, "admin (Koffi)");
const k3 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif: "Paiement en double", cleIdempotence: "TX-ESSAI-10" });
verifier("la clé, après le remboursement fait : toujours le même", [k3?.id === k1?.id, k3?.statut, await deA()], [true, "fait", 2]);
const k4 = await depot.creerRemboursement({ reference: A.reference, montantXof: 6250, motif: "Paiement en double", cleIdempotence: "TX-ESSAI-11" });
verifier("une autre transaction, même motif : un second remboursement", [k4?.id !== k1?.id, await deA()], [true, 3]);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
