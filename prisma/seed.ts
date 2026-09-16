/**
 * Peuplement initial de la base PostgreSQL.
 *
 * Reprend le catalogue du site (`src/data/catalogue.ts`) comme source de
 * vérité, de façon que la base de production démarre avec exactement le
 * parc, les points de retrait et les règles tarifaires présentés en ligne.
 *
 * Idempotent : chaque enregistrement est créé ou mis à jour sur sa clé
 * naturelle, donc la commande peut être relancée sans dupliquer quoi que
 * ce soit.
 *
 * Usage : DATABASE_URL="postgresql://…" npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

import { optionsLocation, pointsDeRetrait, velos } from "../src/data/catalogue";

const prisma = new PrismaClient();

async function main() {
  console.info("Peuplement de la base Bike Land…");

  for (const point of pointsDeRetrait) {
    await prisma.pickupPoint.upsert({
      where: { id: point.id },
      create: {
        id: point.id,
        name: point.nom,
        city: point.ville,
        address: point.adresse,
        openingHours: point.horaires,
        isActive: point.actif,
      },
      update: {
        name: point.nom,
        city: point.ville,
        address: point.adresse,
        openingHours: point.horaires,
        isActive: point.actif,
      },
    });
  }
  console.info(`  ${pointsDeRetrait.length} points de retrait`);

  for (const velo of velos) {
    const donnees = {
      slug: velo.slug,
      name: velo.nom,
      category: velo.categorie,
      size: velo.taille,
      status: velo.statut,
      shortPitch: velo.accroche,
      description: velo.description,
      heroImageUrl: velo.photo ?? null,
      weightKg: velo.poidsKg,
      gearCount: velo.vitesses,
      maxLoadKg: velo.chargeMaxKg,
      suggestedRangeKm: velo.autonomieConseilleeKm,
      assistanceRangeKm: velo.autonomieAssistanceKm ?? null,
      motorWatts: velo.moteurWatts ?? null,
      batteryWh: velo.batterieWh ?? null,
      includedEquipment: velo.equipementInclus,
      pickupPointId: velo.pointDeRetraitId,
    };

    await prisma.bike.upsert({
      where: { slug: velo.slug },
      create: { id: velo.id, ...donnees },
      update: donnees,
    });
  }
  console.info(`  ${velos.length} vélos`);

  // Les options de location restent définies dans le code : elles font
  // partie de l'offre commerciale affichée, pas des données d'exploitation.
  console.info(`  ${optionsLocation.length} options de location (définies côté application)`);

  console.info("Terminé.");
}

main()
  .catch((erreur) => {
    console.error("Le peuplement a échoué :", erreur);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
