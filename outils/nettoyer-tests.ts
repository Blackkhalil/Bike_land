/**
 * Retire les reservations d'essai, et elles seules.
 *
 * Deux categories partent :
 *
 *  - celles creees par les tests automatiques, reconnaissables a leur
 *    adresse en `@example.com` ;
 *  - les paniers abandonnes, restes en attente de paiement avec un
 *    paiement au mieux `INITIE`, donc jamais encaisse.
 *
 * Tout ce qui porte un paiement `REUSSI` est conserve, sans exception.
 * Une reservation payee est une trace comptable : meme faite pour
 * essayer, elle atteste d'un mouvement d'argent et ne s'efface pas sur
 * une supposition. Le tri est laisse a qui sait si l'argent a bouge.
 *
 * Les clients ne sont supprimes que s'il ne leur reste plus aucune
 * reservation.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reservations = await prisma.booking.findMany({
    include: { customer: true, payments: true },
  });

  const aPaye = (r: (typeof reservations)[number]) =>
    r.payments.some((p) => p.status === "REUSSI");

  const aRetirer = reservations.filter((r) => {
    if (aPaye(r)) return false;
    const email = r.customer?.email ?? "";
    if (email.endsWith("@example.com")) return true;
    return r.status === "EN_ATTENTE_PAIEMENT" || r.status === "ANNULEE";
  });

  const gardees = reservations.filter((r) => !aRetirer.includes(r));

  console.log(`${aRetirer.length} a retirer, ${gardees.length} conservees\n`);

  for (const r of aRetirer) {
    await prisma.promoUsage.deleteMany({ where: { bookingId: r.id } });
    await prisma.payment.deleteMany({ where: { bookingId: r.id } });
    await prisma.bookingOption.deleteMany({ where: { bookingId: r.id } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: r.id } });
    await prisma.review.deleteMany({ where: { bookingId: r.id } });
    await prisma.booking.delete({ where: { id: r.id } });
    console.log(`  retiree  ${r.reference}  ${r.status}  ${r.customer?.email ?? "?"}`);
  }

  console.log("\nconservees :");
  for (const r of gardees) {
    const p = r.payments.map((x) => x.status).join(",");
    console.log(`  ${r.reference}  ${r.status}  ${r.customer?.email ?? "?"}  [${p}]`);
  }

  // Les clients devenus orphelins n'ont plus de raison de figurer.
  const orphelins = await prisma.customer.findMany({
    where: { bookings: { none: {} } },
    select: { id: true, email: true },
  });
  for (const c of orphelins) {
    await prisma.customer.delete({ where: { id: c.id } });
  }
  console.log(`\n${orphelins.length} client(s) sans reservation supprime(s)`);

  console.log(
    `\nreste : ${await prisma.booking.count()} reservation(s), ` +
      `${await prisma.customer.count()} client(s)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
