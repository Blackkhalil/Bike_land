/**
 * Retire la valeur `CARTE_BANCAIRE` de l'enumeration PaymentMethod.
 *
 * La carte bancaire n'est plus proposee : elle est tres minoritaire au
 * Benin, et l'afficher obligeait a offrir un moyen que presque personne
 * n'utilise. Le schema Prisma et le code ne la mentionnent plus depuis
 * longtemps ; seule la base portait encore la valeur.
 *
 * PostgreSQL ne sait pas retirer une valeur d'une enumeration. Il faut
 * creer le type voulu, y basculer les colonnes, puis jeter l'ancien.
 *
 * Le script refuse d'agir si une ligne utilise encore la valeur : la
 * conversion echouerait de toute facon, mais autant le dire clairement
 * plutot que de laisser PostgreSQL le signaler a sa maniere.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VOULUES = ["MTN_MONEY", "MOOV_MONEY", "CELTIIS_CASH", "ESPECES"];

async function main() {
  const valeurs = await prisma.$queryRaw<{ valeur: string }[]>`
    SELECT e.enumlabel AS valeur
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentMethod'
    ORDER BY e.enumsortorder
  `;
  const presentes = valeurs.map((v) => v.valeur);
  console.log("valeurs en base :", presentes.join(", "));

  const enTrop = presentes.filter((v) => !VOULUES.includes(v));
  if (enTrop.length === 0) {
    console.log("\nrien a retirer, l'enumeration est deja propre");
    return;
  }
  console.log("a retirer       :", enTrop.join(", "));

  // Les colonnes qui portent le type, quelles qu'elles soient.
  const colonnes = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.udt_name = 'PaymentMethod'
  `;
  console.log(
    "colonnes        :",
    colonnes.map((c) => `${c.table_name}.${c.column_name}`).join(", ") || "aucune",
  );

  for (const { table_name: table, column_name: colonne } of colonnes) {
    const [{ compte }] = await prisma.$queryRawUnsafe<{ compte: bigint }[]>(
      `SELECT count(*) AS compte FROM "${table}" WHERE "${colonne}"::text = ANY($1)`,
      enTrop,
    );
    if (Number(compte) > 0) {
      console.log(`\nREFUS : ${table}.${colonne} contient ${compte} ligne(s) a retirer.`);
      console.log("Reaffectez ces lignes avant de relancer.");
      return;
    }
  }

  const liste = VOULUES.map((v) => `'${v}'`).join(", ");
  await prisma.$executeRawUnsafe(`ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_ancien"`);
  await prisma.$executeRawUnsafe(`CREATE TYPE "PaymentMethod" AS ENUM (${liste})`);
  for (const { table_name: table, column_name: colonne } of colonnes) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ALTER COLUMN "${colonne}" TYPE "PaymentMethod" ` +
        `USING "${colonne}"::text::"PaymentMethod"`,
    );
    console.log(`  bascule ${table}.${colonne}`);
  }
  await prisma.$executeRawUnsafe(`DROP TYPE "PaymentMethod_ancien"`);

  const apres = await prisma.$queryRaw<{ valeur: string }[]>`
    SELECT e.enumlabel AS valeur
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentMethod'
    ORDER BY e.enumsortorder
  `;
  console.log("\nvaleurs apres   :", apres.map((v) => v.valeur).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
