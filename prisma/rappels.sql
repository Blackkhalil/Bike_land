-- Rappel de la veille. Purement additif : une colonne nouvelle, vide,
-- aucune donnée existante touchée. À appliquer avant de déployer le code
-- qui la lit, sans quoi Prisma demanderait une colonne absente.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
