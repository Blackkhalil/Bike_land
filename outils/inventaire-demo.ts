/**
 * Inventaire des reservations avant nettoyage.
 *
 * Lecture seule. Le but est de distinguer ce qui vient du jeu de
 * demonstration de ce qui serait une vraie reservation de client, pour
 * ne rien effacer par erreur.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reservations = await prisma.booking.findMany({
    orderBy: { createdAt: "asc" },
    include: { customer: true, payments: true },
  });

  console.log(`${reservations.length} reservation(s) en base\n`);
  console.log(
    "reference    statut              cree le     email                          paiements",
  );
  console.log("-".repeat(100));
  for (const r of reservations) {
    const jour = r.createdAt.toISOString().slice(0, 10);
    const paiements = r.payments.map((p) => p.status).join(",") || "aucun";
    console.log(
      `${r.reference.padEnd(12)} ${String(r.status).padEnd(19)} ${jour}  ` +
        `${(r.customer?.email ?? "?").padEnd(30)} ${paiements}`,
    );
  }

  const clients = await prisma.customer.count();
  const avis = await prisma.review.count();
  const messages = await prisma.contactMessage.count();
  const usages = await prisma.promoUsage.count();
  console.log(
    `\nclients ${clients} | avis ${avis} | messages ${messages} | usages parrainage ${usages}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
