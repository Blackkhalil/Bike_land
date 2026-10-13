-- Ventes en espèces saisies dans l'administration : qui a reçu l'argent, et
-- ce qui a été rendu au client en cas d'annulation. Purement additif : deux
-- colonnes facultatives, vides pour tous les paiements existants. À
-- appliquer avant de déployer le code qui les lit.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "collectedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedXof" INTEGER;
