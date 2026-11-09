-- Gbashi bike et Padel bike, sorties sur commande enregistrées au comptoir
-- (novembre 2026), et Padel bike réservé en ligne à heure réglée.
-- Purement additif : deux valeurs de plus dans l'énumération des offres,
-- deux colonnes facultatives sur les réservations (l'horaire exact d'une
-- sortie réglée à la minute), aucune donnée existante touchée. À appliquer
-- avant de déployer le code qui les lit et les écrit : sans les colonnes,
-- Prisma ne pourrait plus lire aucune réservation.
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'GBASHI_BIKE';
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'PADEL_BIKE';
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "endTime" TEXT;
