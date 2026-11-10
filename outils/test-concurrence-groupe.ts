/**
 * Test de concurrence des offres de groupe (lot 3, disponibilite), sur la
 * base de TEST seulement. Lance a la main par le chef de projet, jamais par
 * `npm test` :
 *
 *   DATABASE_URL de la base de test dans l'environnement, puis
 *   npx tsx outils/test-concurrence-groupe.ts
 *
 * Par exemple, avec le fichier local de la base de test :
 *   node --env-file=.env.staging node_modules/tsx/dist/cli.mjs outils/test-concurrence-groupe.ts
 *
 * Ce qu'il verifie : deux demandes de groupe envoyees au meme instant pour
 * les derniers velos d'un creneau. Une seule passe ; l'autre recoit
 * CapaciteInsuffisanteError, plus aucun velo libre. C'est la transaction
 * serialisable de `creerReservationGroupe` qui le garantit : PostgreSQL
 * annule l'une des deux (P2034), qui, rejouee, voit les velos pris par
 * l'autre. Trois manches : les 2 derniers velos (le reste deja pris), tout
 * le parc d'un coup, et le dernier Prestige gamme par gamme (Gbashi Bike).
 * Deux manches de plus pour les paiements tardifs (decision 6) : deux
 * paiements arrives au meme instant pour deux demandes expirees sur les
 * memes velos (un seul confirme), puis un paiement tardif croise avec une
 * nouvelle demande sur ses velos (un seul des deux passe).
 *
 * Precautions :
 *  - il refuse de tourner sans DATABASE_URL, et sur toute autre base que
 *    celle du projet de test, dont l'identifiant doit figurer dans
 *    l'adresse ; l'adresse n'est jamais affichee ;
 *  - un mardi lointain (plus d'un an devant), sans aucune reservation ;
 *  - aucun paiement lance, aucun email envoye : le depot seul, demandes
 *    laissees en attente de paiement ;
 *  - il n'efface que ce qu'il a cree : ses reservations (lignes, paiements),
 *    leurs evenements au journal et ses clients d'essai, aux adresses en
 *    @example.com propres a ce passage. Si l'effacement echoue, les
 *    references sont affichees : `npx tsx outils/nettoyer-tests.ts` les
 *    retire (adresses en @example.com, aucun argent recu).
 *
 * Sortie : des lignes « OK » ou « FAUX », comme les tests ; code de sortie
 * non nul au moindre « FAUX ».
 */
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ajouterJours, aujourdhui, type DateISO } from "../src/lib/dates";
import type { Depot, DemandeReservationGroupe, ParcDuJour } from "../src/lib/db/contrat";
import { velosLibresSurCreneau, type CreneauMinutes } from "../src/lib/disponibilite";

/** Le projet Supabase de test (docs/bike-land/SUIVI.md, « Environnements »). */
const PROJET_DE_TEST = "ypyiwoppmjfrmicaqazo";

let echecs = 0;
function verifier(nom: string, obtenu: unknown, attendu: unknown): void {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
}

/** Les transactions annulees par PostgreSQL puis rejouees, que le depot signale. */
let conflitsSerialisables = 0;
const avertir = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("P2034")) conflitsSerialisables += 1;
  avertir(...args);
};

const passage = randomBytes(3).toString("hex");
const emailDe = (qui: string) => `concurrence.${passage}.${qui}@example.com`;
const references: string[] = [];

function demande(
  date: DateISO,
  creneau: CreneauMinutes,
  velos: DemandeReservationGroupe["velos"],
  qui: string,
): DemandeReservationGroupe {
  const personnes = typeof velos === "number" ? velos : Object.values(velos).reduce((total, n) => total + (n ?? 0), 0);
  return {
    offre: typeof velos === "number" ? "bike-for-all" : "gbashi-groupe",
    date,
    debutMinute: creneau.debutMinute,
    finMinute: creneau.finMinute,
    velos,
    nombrePersonnes: personnes,
    totalXof: 200,
    details: { essai: "test-concurrence-groupe", passage },
    client: { prenom: "Essai", nom: `Concurrence ${qui}`, email: emailDe(qui), telephone: "+229 01 00 00 00 00" },
    moyenPaiement: "MTN_MONEY",
    cgvAcceptees: true,
  };
}

/** Deux demandes lancees au meme instant : celles qui passent, et ce que levent les autres. */
async function course(depot: Depot, a: DemandeReservationGroupe, b: DemandeReservationGroupe) {
  const issues = await Promise.allSettled([depot.creerReservationGroupe(a), depot.creerReservationGroupe(b)]);
  const passees: string[] = [];
  const refus: { nom: string; velosLibres?: number; parGamme?: unknown }[] = [];
  for (const issue of issues) {
    if (issue.status === "fulfilled") {
      references.push(issue.value.reservation.reference);
      passees.push(issue.value.reservation.reference);
    } else {
      const erreur = issue.reason as { name?: string; message?: string; velosLibres?: number; parGamme?: unknown };
      refus.push({ nom: erreur?.name ?? String(issue.reason), velosLibres: erreur?.velosLibres, parGamme: erreur?.parGamme });
      if (erreur?.name !== "CapaciteInsuffisanteError") console.log(`     erreur inattendue : ${erreur?.message?.split("\n")[0]}`);
    }
  }
  return { passees, refus };
}

/** Aucun velo pris deux fois sur des minutes communes, ce jour-la. */
function sansDoubleReservation(parc: ParcDuJour): boolean {
  return parc.occupations.every((o, i) =>
    parc.occupations.every(
      (autre, j) => j === i || autre.veloId !== o.veloId || autre.finMinute <= o.debutMinute || o.finMinute <= autre.debutMinute,
    ),
  );
}

async function nettoyer(prisma: PrismaClient): Promise<void> {
  // Les reservations de ce passage : celles dont la reference est connue, et
  // toute autre de ses clients d'essai (une ecriture passee alors que la
  // reponse s'est perdue).
  const reservations = await prisma.booking.findMany({
    where: { OR: [{ reference: { in: references } }, { customer: { email: { startsWith: `concurrence.${passage}.` } } }] },
    select: { id: true, reference: true },
  });
  let restees = 0;
  for (const r of reservations) {
    try {
      await prisma.$transaction([
        prisma.journalEvenement.deleteMany({ where: { reference: r.reference } }),
        prisma.payment.deleteMany({ where: { bookingId: r.id } }),
        prisma.bookingOption.deleteMany({ where: { bookingId: r.id } }),
        prisma.bookingItem.deleteMany({ where: { bookingId: r.id } }),
        prisma.booking.delete({ where: { id: r.id } }),
      ]);
    } catch (erreur) {
      restees += 1;
      console.log(`  gardee ${r.reference} : ${erreur instanceof Error ? erreur.message.split("\n")[0] : String(erreur)}`);
    }
  }
  const clients = await prisma.customer.deleteMany({
    where: { email: { startsWith: `concurrence.${passage}.` }, bookings: { none: {} } },
  });
  console.log(
    `\nnettoyage : ${reservations.length - restees} reservation(s) d'essai effacee(s), ${clients.count} client(s) d'essai` +
      (restees ? `, ${restees} restee(s) : lancer outils/nettoyer-tests.ts` : ""),
  );
}

async function main(): Promise<void> {
  const adresse = process.env.DATABASE_URL ?? "";
  if (!adresse) {
    console.error("DATABASE_URL absent : ce test ne tourne que sur la base de test, rien a faire en demonstration.");
    process.exitCode = 2;
    return;
  }
  if (!adresse.includes(PROJET_DE_TEST)) {
    console.error("Cette base n'est pas celle du projet de test : le test refuse de tourner ailleurs.");
    process.exitCode = 2;
    return;
  }
  // Les liens de suivi de ces reservations d'essai ne servent jamais : une
  // cle tiree pour ce passage suffit quand aucune n'est fournie.
  if ((process.env.BOOKING_TOKEN_SECRET ?? "").length < 16) {
    process.env.BOOKING_TOKEN_SECRET = randomBytes(32).toString("hex");
  }

  // Un seul client Prisma pour le depot et le nettoyage : le depot reprend
  // celui range sous cette cle (src/lib/db/postgres.ts, `client()`), et le
  // processus se termine des qu'il est deconnecte.
  const prisma = new PrismaClient();
  (globalThis as Record<symbol, unknown>)[Symbol.for("bikeland.prisma")] = prisma;
  const { depotPostgres: depot } = await import("../src/lib/db/postgres");
  try {
    // Un mardi lointain, sans aucune reservation ce jour-la.
    let date = ajouterJours(aujourdhui(), 400);
    while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 2) date = ajouterJours(date, 1);
    let parc = await depot.parcDuJour(date);
    for (let essai = 0; essai < 20 && parc.occupations.length > 0; essai += 1) {
      date = ajouterJours(date, 7);
      parc = await depot.parcDuJour(date);
    }
    if (parc.occupations.length > 0) throw new Error("Aucun mardi lointain sans reservation trouve.");
    console.log(`passage ${passage}, mardi ${date}, ${parc.velos.length} velo(s) au parc ce jour-la\n`);

    console.log("Manche 1 : les 2 derniers velos, le reste deja pris");
    const dix = { debutMinute: 600, finMinute: 630 };
    const libres = velosLibresSurCreneau(parc, dix).total;
    if (libres < 2) throw new Error(`Il faut au moins 2 velos libres, il y en a ${libres}.`);
    if (libres > 2) {
      const remplissage = await depot.creerReservationGroupe(demande(date, dix, libres - 2, "remplissage"));
      references.push(remplissage.reservation.reference);
    }
    verifier("il reste 2 velos de 10 h a 10 h 30", velosLibresSurCreneau(await depot.parcDuJour(date), dix).total, 2);
    const m1 = await course(depot, demande(date, dix, 2, "a1"), demande(date, dix, 2, "b1"));
    verifier("deux demandes simultanees de 2 velos : une seule passe", m1.passees.length, 1);
    verifier("l'autre : CapaciteInsuffisanteError, plus aucun velo libre", m1.refus.map((r) => [r.nom, r.velosLibres]), [["CapaciteInsuffisanteError", 0]]);

    console.log("\nManche 2 : tout le parc d'un coup");
    const onze = { debutMinute: 660, finMinute: 690 };
    const tous = velosLibresSurCreneau(await depot.parcDuJour(date), onze).total;
    const m2 = await course(depot, demande(date, onze, tous, "a2"), demande(date, onze, tous, "b2"));
    verifier(`deux demandes simultanees de ${tous} velos : une seule passe`, m2.passees.length, 1);
    verifier("l'autre : CapaciteInsuffisanteError, plus aucun velo libre", m2.refus.map((r) => [r.nom, r.velosLibres]), [["CapaciteInsuffisanteError", 0]]);

    console.log("\nManche 3 : le dernier Prestige, gamme par gamme (Gbashi Bike)");
    const midi = { debutMinute: 720, finMinute: 960 };
    const parGamme = velosLibresSurCreneau(await depot.parcDuJour(date), midi).parGamme;
    if (parGamme.PRESTIGE < 1) {
      console.log("(aucun Prestige au parc ce jour-la : manche passee)");
    } else {
      const m3 = await course(
        depot,
        demande(date, midi, { PRESTIGE: parGamme.PRESTIGE }, "a3"),
        demande(date, midi, { PRESTIGE: parGamme.PRESTIGE }, "b3"),
      );
      verifier(`deux demandes simultanees de ${parGamme.PRESTIGE} Prestige : une seule passe`, m3.passees.length, 1);
      verifier(
        "l'autre : CapaciteInsuffisanteError, plus aucun Prestige libre",
        m3.refus.map((r) => [r.nom, (r.parGamme as Record<string, number> | undefined)?.PRESTIGE]),
        [["CapaciteInsuffisanteError", 0]],
      );
    }

    // Une demande vieillie de 31 minutes ne retient plus ses velos (base de
    // test seulement, sur les reservations de ce passage).
    const vieillir = (reference: string) =>
      prisma.booking.update({ where: { reference }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });

    console.log("\nManche 4 : deux paiements tardifs au meme instant, sur les memes velos");
    const quatorze = { debutMinute: 840, finMinute: 870 };
    const tousQuatorze = velosLibresSurCreneau(await depot.parcDuJour(date), quatorze).total;
    const a4 = (await depot.creerReservationGroupe(demande(date, quatorze, tousQuatorze, "a4"))).reservation;
    references.push(a4.reference);
    await vieillir(a4.reference);
    const b4 = (await depot.creerReservationGroupe(demande(date, quatorze, tousQuatorze, "b4"))).reservation;
    references.push(b4.reference);
    await vieillir(b4.reference);
    verifier("la seconde demande a pris les velos de la premiere, expiree", [...b4.lignes.map((l) => l.veloId)].sort(), [...a4.lignes.map((l) => l.veloId)].sort());
    const paiements4 = await Promise.allSettled([
      depot.confirmerPaiement(a4.reference, `TX-ESSAI-${passage}-A4`),
      depot.confirmerPaiement(b4.reference, `TX-ESSAI-${passage}-B4`),
    ]);
    verifier(
      "deux paiements tardifs simultanes : un seul confirme",
      paiements4.filter((p) => p.status === "fulfilled" && p.value && !p.value.dejaConfirmee).length,
      1,
    );
    verifier(
      "l'autre : ConflitDisponibiliteError, donc rembourse",
      paiements4.filter((p) => p.status === "rejected").map((p) => (p as PromiseRejectedResult).reason?.name),
      ["ConflitDisponibiliteError"],
    );

    console.log("\nManche 5 : un paiement tardif et une nouvelle demande au meme instant, sur les memes velos");
    const quinze = { debutMinute: 900, finMinute: 930 };
    const tousQuinze = velosLibresSurCreneau(await depot.parcDuJour(date), quinze).total;
    const a5 = (await depot.creerReservationGroupe(demande(date, quinze, tousQuinze, "a5"))).reservation;
    references.push(a5.reference);
    await vieillir(a5.reference);
    const [paiement5, nouvelle5] = await Promise.allSettled([
      depot.confirmerPaiement(a5.reference, `TX-ESSAI-${passage}-A5`),
      depot.creerReservationGroupe(demande(date, quinze, tousQuinze, "b5")),
    ]);
    if (nouvelle5.status === "fulfilled") references.push(nouvelle5.value.reservation.reference);
    const passes5 = [
      paiement5.status === "fulfilled" && Boolean(paiement5.value) && !paiement5.value?.dejaConfirmee,
      nouvelle5.status === "fulfilled",
    ].filter(Boolean).length;
    verifier("un seul des deux passe", passes5, 1);
    verifier(
      "l'autre est refuse proprement (velos repris, ou plus aucun velo libre)",
      [paiement5, nouvelle5]
        .filter((p) => p.status === "rejected")
        .map((p) => ["ConflitDisponibiliteError", "CapaciteInsuffisanteError"].includes((p as PromiseRejectedResult).reason?.name)),
      [true],
    );

    const final = await depot.parcDuJour(date);
    verifier("jamais un velo pris deux fois sur les memes minutes", sansDoubleReservation(final), true);
    console.log(
      `\ntransactions annulees par PostgreSQL puis rejouees (P2034) : ${conflitsSerialisables}` +
        (conflitsSerialisables === 0
          ? "\n(aucune : les demandes ont pu passer l'une apres l'autre. Le resultat reste juste, mais le croisement" +
            " n'est pas prouve ; relancer, et verifier que l'adresse ne limite pas a une connexion, connection_limit=1.)"
          : ""),
    );
  } finally {
    await nettoyer(prisma).catch((erreur: unknown) => {
      echecs += 1;
      console.log(`FAUX nettoyage impossible : ${erreur instanceof Error ? erreur.message.split("\n")[0] : String(erreur)}`);
      console.log(`     references creees : ${references.join(", ") || "aucune"}`);
    });
    await prisma.$disconnect();
  }
  console.log(echecs ? `\n${echecs} echec(s).` : "\nTout est bon.");
  if (echecs) process.exitCode = 1;
}

main().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message.split("\n")[0] : String(erreur));
  process.exitCode = 1;
});
