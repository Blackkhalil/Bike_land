/**
 * Sauvegarde complète de la base, en JSON.
 *
 * Supabase conserve ses propres sauvegardes, mais elles vivent chez
 * Supabase : si le projet est suspendu ou supprimé, elles partent avec
 * lui. Ce fichier est une copie qu'on garde soi-même.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const contenu = {
    sauvegardeeLe: new Date().toISOString(),
    pointsDeRetrait: await prisma.pickupPoint.findMany(),
    velos: await prisma.bike.findMany(),
    clients: await prisma.customer.findMany(),
    reservations: await prisma.booking.findMany({
      include: { items: true, options: true, payments: true, review: true },
    }),
    partenaires: await prisma.partner.findMany(),
    codesParrainage: await prisma.promoCode.findMany(),
    utilisationsParrainage: await prisma.promoUsage.findMany(),
    avis: await prisma.review.findMany(),
    messagesContact: await prisma.contactMessage.findMany(),
  };

  const dossier = path.join(process.cwd(), "sauvegardes");
  await mkdir(dossier, { recursive: true });
  const jour = new Date().toISOString().slice(0, 10);
  const fichier = path.join(dossier, `bike-land-${jour}.json`);
  await writeFile(fichier, JSON.stringify(contenu, null, 2), "utf-8");

  const compte = (c: unknown[]) => c.length;
  console.log(`sauvegarde ecrite : sauvegardes/bike-land-${jour}.json`);
  console.log(`  velos               ${compte(contenu.velos)}`);
  console.log(`  points de retrait   ${compte(contenu.pointsDeRetrait)}`);
  console.log(`  clients             ${compte(contenu.clients)}`);
  console.log(`  reservations        ${compte(contenu.reservations)}`);
  console.log(`  partenaires         ${compte(contenu.partenaires)}`);
  console.log(`  codes parrainage    ${compte(contenu.codesParrainage)}`);
  console.log(`  avis                ${compte(contenu.avis)}`);
  console.log(`  messages contact    ${compte(contenu.messagesContact)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
