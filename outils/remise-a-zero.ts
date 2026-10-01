/**
 * Remise a zero de l'activite, avant de prendre de vraies reservations.
 *
 * Tout l'historique d'essai part : reservations, paiements, clients,
 * avis, utilisations de parrainage, messages de contact.
 *
 * Ce qui reste est le parametrage, pas l'activite : le parc de velos,
 * les points de retrait, les partenaires et leurs codes.
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

  // L'ordre suit les dependances : les enfants avant les parents.
  console.log();
  const etapes: [string, () => Promise<{ count: number }>][] = [
    ["avis", () => prisma.review.deleteMany({})],
    ["utilisations de parrainage", () => prisma.promoUsage.deleteMany({})],
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

  console.log("\napres :");
  console.log(`  reservations        ${await prisma.booking.count()}`);
  console.log(`  clients             ${await prisma.customer.count()}`);
  console.log(`  paiements           ${await prisma.payment.count()}`);
  console.log(`  avis                ${await prisma.review.count()}`);
  console.log(`  usages parrainage   ${await prisma.promoUsage.count()}`);
  console.log(`  messages contact    ${await prisma.contactMessage.count()}`);
  console.log("\nconserve :");
  console.log(`  velos               ${await prisma.bike.count()}`);
  console.log(`  points de retrait   ${await prisma.pickupPoint.count()}`);
  console.log(`  partenaires         ${await prisma.partner.count()}`);
  console.log(`  codes de parrainage ${await prisma.promoCode.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
