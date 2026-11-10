/**
 * Remise a zero de l'activite, avant de prendre de vraies reservations.
 *
 * Tout l'historique d'essai part : reservations, paiements, remboursements,
 * clients, avis, utilisations de parrainage, messages de contact, et les
 * preuves de reduction dont la capture est deja supprimee.
 *
 * Ce qui reste est le parametrage, pas l'activite : le parc de velos et ses
 * indisponibilites par date, les points de retrait, les partenaires et leurs
 * codes, les reglages. Le journal des evenements reste aussi : une ligne ne
 * s'y modifie ni ne s'efface.
 *
 * Les remboursements partent avant les reservations : la base refuse
 * d'effacer une reservation a laquelle de l'argent a rendre est rattache
 * (cle etrangere RESTRICT, offres de groupe). Une preuve de reduction dont
 * la capture est encore stockee reste, elle : effacer sa ligne perdrait la
 * trace du fichier, que plus rien ne supprimerait ensuite. Le nettoyage
 * quotidien efface la capture (30 jours au plus) ; relancer alors l'outil.
 *
 * Le compteur d'utilisation des codes est remis a zero avec les
 * utilisations. Le laisser garni decrirait un quota entame sans qu'une
 * seule utilisation ne subsiste pour le justifier, et le partenaire
 * perdrait des places sur son code sans raison.
 *
 * Une sauvegarde JSON a ete prise avant : `npm run db:sauvegarde`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const avant = {
    reservations: await prisma.booking.count(),
    clients: await prisma.customer.count(),
    paiements: await prisma.payment.count(),
    remboursements: await prisma.remboursement.count(),
    preuves: await prisma.preuveReduction.count(),
    avis: await prisma.review.count(),
    usages: await prisma.promoUsage.count(),
    messages: await prisma.contactMessage.count(),
  };
  console.log("avant :", JSON.stringify(avant));

  const messages = await prisma.contactMessage.findMany({
    select: { email: true, subject: true, createdAt: true },
  });
  if (messages.length) {
    console.log("\nmessages de contact qui vont partir :");
    for (const m of messages) {
      console.log(`  ${m.createdAt.toISOString().slice(0, 10)}  ${m.email}  ${m.subject}`);
    }
  }

  const aFaire = await prisma.remboursement.findMany({
    where: { statut: "a_faire" },
    select: { montantXof: true, motif: true, booking: { select: { reference: true } } },
  });
  if (aFaire.length) {
    console.log("\nremboursements encore a faire qui vont partir :");
    for (const r of aFaire) {
      console.log(`  ${r.booking.reference}  ${r.montantXof} F  ${r.motif}`);
    }
  }

  // L'ordre suit les dependances : les enfants avant les parents. Les
  // remboursements avant les reservations, que la base refuse sinon
  // d'effacer.
  console.log();
  const etapes: [string, () => Promise<{ count: number }>][] = [
    ["avis", () => prisma.review.deleteMany({})],
    ["utilisations de parrainage", () => prisma.promoUsage.deleteMany({})],
    ["remboursements", () => prisma.remboursement.deleteMany({})],
    ["preuves sans capture", () => prisma.preuveReduction.deleteMany({ where: { fichierCle: null } })],
    ["paiements", () => prisma.payment.deleteMany({})],
    ["options de reservation", () => prisma.bookingOption.deleteMany({})],
    ["lignes de reservation", () => prisma.bookingItem.deleteMany({})],
    ["reservations", () => prisma.booking.deleteMany({})],
    ["clients", () => prisma.customer.deleteMany({})],
    ["messages de contact", () => prisma.contactMessage.deleteMany({})],
  ];
  for (const [nom, action] of etapes) {
    const { count } = await action();
    console.log(`  ${nom.padEnd(28)} ${count} supprime(s)`);
  }

  const codes = await prisma.promoCode.updateMany({ data: { useCount: 0 } });
  console.log(`  ${"compteurs de parrainage".padEnd(28)} ${codes.count} remis a zero`);

  // Les preuves gardees : leur capture est encore stockee.
  const preuvesGardees = await prisma.preuveReduction.findMany({
    select: { id: true, statut: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (preuvesGardees.length) {
    console.log("\npreuves de reduction gardees, capture encore stockee (relancer apres le nettoyage quotidien) :");
    for (const p of preuvesGardees) {
      console.log(`  ${p.createdAt.toISOString().slice(0, 10)}  ${p.id}  ${p.statut}`);
    }
  }

  console.log("\napres :");
  console.log(`  reservations        ${await prisma.booking.count()}`);
  console.log(`  clients             ${await prisma.customer.count()}`);
  console.log(`  paiements           ${await prisma.payment.count()}`);
  console.log(`  remboursements      ${await prisma.remboursement.count()}`);
  console.log(`  preuves             ${preuvesGardees.length}`);
  console.log(`  avis                ${await prisma.review.count()}`);
  console.log(`  usages parrainage   ${await prisma.promoUsage.count()}`);
  console.log(`  messages contact    ${await prisma.contactMessage.count()}`);
  console.log("\nconserve :");
  console.log(`  velos               ${await prisma.bike.count()}`);
  console.log(`  indisponibilites    ${await prisma.indisponibiliteVelo.count()}`);
  console.log(`  points de retrait   ${await prisma.pickupPoint.count()}`);
  console.log(`  partenaires         ${await prisma.partner.count()}`);
  console.log(`  codes de parrainage ${await prisma.promoCode.count()}`);
  console.log(`  journal             ${await prisma.journalEvenement.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
