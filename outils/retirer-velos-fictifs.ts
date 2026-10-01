/**
 * Retire les velos fictifs du jeu de depart.
 *
 * Ce sont des noms de lieux du Benin utilises comme garnissage avant que
 * le parc reel soit photographie. Ils sont en statut RETIRE, donc deja
 * invisibles du site, mais ils faussent le compte du parc dans l'espace
 * d'exploitation.
 *
 * Seul part un velo a la fois RETIRE, sans video, et sans aucune
 * reservation a son nom. Les trois conditions ensemble : un velo
 * reellement sorti du parc mais qui a servi garde son historique.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidats = await prisma.bike.findMany({
    where: { status: "RETIRE", videoUrl: null, bookingItems: { none: {} }, reviews: { none: {} } },
    select: { id: true, name: true },
  });

  for (const v of candidats) {
    await prisma.bike.delete({ where: { id: v.id } });
    console.log(`  retire  ${v.name}  (${v.id})`);
  }

  const restants = await prisma.bike.groupBy({ by: ["status"], _count: true });
  console.log(`\n${candidats.length} velo(s) fictif(s) supprime(s)`);
  for (const g of restants) {
    console.log(`  ${String(g.status).padEnd(12)} ${g._count}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
