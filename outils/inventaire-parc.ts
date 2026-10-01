/** Etat du parc en base, lecture seule. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
prisma.bike
  .findMany({ orderBy: [{ status: "asc" }, { name: "asc" }],
              select: { id: true, name: true, status: true, tier: true, videoUrl: true } })
  .then((v) => {
    console.log(`${v.length} velo(s)\n`);
    for (const b of v) {
      console.log(`${String(b.status).padEnd(12)} ${String(b.tier).padEnd(10)} ` +
                  `${b.name.padEnd(28)} ${b.videoUrl ? "video" : "SANS VIDEO"}  ${b.id}`);
    }
  })
  .finally(() => prisma.$disconnect());
