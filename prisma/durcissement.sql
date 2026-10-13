-- Durcissement après la revue de sécurité. Purement additif : une table
-- nouvelle (verrouillée par RLS comme les autres) et trois colonnes vides
-- sur Booking. À appliquer avant de déployer le code qui les lit.
CREATE TABLE IF NOT EXISTS "CompteurEssais" (
  "cle" TEXT NOT NULL,
  "nombre" INTEGER NOT NULL,
  "expireLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompteurEssais_pkey" PRIMARY KEY ("cle")
);
ALTER TABLE "CompteurEssais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "contactFirstName" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "contactLastName" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
