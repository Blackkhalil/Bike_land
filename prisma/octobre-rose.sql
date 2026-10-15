-- La sortie Octobre rose, réservable et payable en ligne. Purement additif :
-- une valeur de plus dans l'énumération des offres, aucune donnée existante
-- touchée. À appliquer avant de déployer le code qui l'écrit, sans quoi
-- Prisma refuserait d'enregistrer une inscription.
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'OCTOBRE_ROSE';
