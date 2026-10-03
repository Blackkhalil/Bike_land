-- Réglages d'ouverture des réservations. Purement additif : deux tables
-- nouvelles, aucune donnée existante touchée.
CREATE TABLE IF NOT EXISTS "CreneauReglage" (
  "code" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreneauReglage_pkey" PRIMARY KEY ("code")
);
CREATE TABLE IF NOT EXISTS "JourFerme" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "formule" TEXT NOT NULL,
  "motif" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JourFerme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JourFerme_date_formule_key" ON "JourFerme"("date", "formule");
CREATE INDEX IF NOT EXISTS "JourFerme_date_idx" ON "JourFerme"("date");
