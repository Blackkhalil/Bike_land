/**
 * Sauvegarde complète de la base, en JSON.
 *
 * Supabase conserve ses propres sauvegardes, mais elles vivent chez
 * Supabase : si le projet est suspendu ou supprimé, elles partent avec
 * lui. Ce fichier est une copie qu'on garde soi-même.
 *
 * Toutes les tables du schéma public sont copiées, sans liste à tenir à
 * jour : une table ajoutée plus tard (offres de groupe, preuves, journal…)
 * est sauvegardée d'office.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** JSON.stringify ne sait pas écrire les BigInt ni les octets bruts. */
function valeurJson(_cle: string, valeur: unknown): unknown {
  if (typeof valeur === "bigint") return valeur.toString();
  if (valeur instanceof Uint8Array) return { base64: Buffer.from(valeur).toString("base64") };
  if (valeur && typeof valeur === "object" && (valeur as { type?: string }).type === "Buffer") {
    const donnees = (valeur as { data?: number[] }).data;
    if (Array.isArray(donnees)) return { base64: Buffer.from(donnees).toString("base64") };
  }
  return valeur;
}

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );

  const contenu: Record<string, unknown> = { sauvegardeeLe: new Date().toISOString() };
  const comptes: [string, number][] = [];
  for (const { table_name } of tables) {
    const lignes = await prisma.$queryRawUnsafe<unknown[]>(`select * from "${table_name.replace(/"/g, '""')}"`);
    contenu[table_name] = lignes;
    comptes.push([table_name, lignes.length]);
  }

  const dossier = path.join(process.cwd(), "sauvegardes");
  await mkdir(dossier, { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const fichier = path.join(dossier, `bike-land-${horodatage}.json`);
  await writeFile(fichier, JSON.stringify(contenu, valeurJson, 2), "utf-8");

  console.log(`sauvegarde ecrite : sauvegardes/bike-land-${horodatage}.json`);
  for (const [table, nombre] of comptes) console.log(`  ${table.padEnd(24)} ${nombre}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
