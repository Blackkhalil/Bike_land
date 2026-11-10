-- Offres de groupe : Bike for All, Road trip en groupe et Gbashi Bike sur
-- réservation (cahier des charges et décisions du responsable du
-- 9 novembre 2026, docs/bike-land/SUIVI.md).
--
-- Purement additif : trois valeurs de plus dans l'énumération des offres
-- (GBASHI_BIKE reste pour les ventes passées au comptoir), des colonnes
-- facultatives sur les réservations (le créneau au quart d'heure, le retard
-- et sa pénalité, l'instantané du calcul), deux sur leurs lignes de vélos,
-- et quatre tables nouvelles : les vélos indisponibles un jour précis, le
-- journal des événements, les preuves de réduction et les remboursements
-- (avec leur clé d'idempotence facultative, ajoutée par le lot 3).
-- Aucune donnée existante n'est touchée, rien n'est renommé ni supprimé.
--
-- Rejouable : chaque instruction vérifie d'abord que l'objet n'existe pas.
-- Les nouvelles tables sont verrouillées comme les autres (RLS sans règle :
-- seul le serveur y accède, avec sa propre connexion).
--
-- À appliquer sur la base de test d'abord, puis, avec l'accord écrit du
-- responsable et après une sauvegarde, sur la production, AVANT de déployer
-- le code qui lit ces colonnes : sans elles, Prisma ne pourrait plus lire
-- aucune réservation. Les valeurs ajoutées à l'énumération ne s'utilisent
-- pas dans la même transaction que leur ajout : lancer ce fichier tel quel,
-- sans l'envelopper dans une transaction qui écrirait aussi des données.

-- Les trois offres de groupe.
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'BIKE_FOR_ALL';
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'ROAD_TRIP_GROUPE';
ALTER TYPE "BookingOffer" ADD VALUE IF NOT EXISTS 'GBASHI_GROUPE';

-- Le créneau au quart d'heure (minutes depuis minuit), le retard saisi au
-- retour et sa pénalité, et ce que le calcul a donné à la réservation.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "startMinute" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "endMinute" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "retardMinutes" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "penaliteRetardXof" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "penaliteSaisiePar" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "offreDetails" JSONB;

-- Les mêmes minutes sur chaque vélo de la réservation.
ALTER TABLE "BookingItem" ADD COLUMN IF NOT EXISTS "startMinute" INTEGER;
ALTER TABLE "BookingItem" ADD COLUMN IF NOT EXISTS "endMinute" INTEGER;

-- Un vélo indisponible un jour précis (réparation, prêt), une fois par jour.
CREATE TABLE IF NOT EXISTS "IndisponibiliteVelo" (
  "id" TEXT NOT NULL,
  "bikeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "motif" TEXT,
  "creePar" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndisponibiliteVelo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IndisponibiliteVelo_bikeId_fkey" FOREIGN KEY ("bikeId")
    REFERENCES "Bike"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IndisponibiliteVelo_bikeId_date_key" ON "IndisponibiliteVelo"("bikeId", "date");
CREATE INDEX IF NOT EXISTS "IndisponibiliteVelo_date_idx" ON "IndisponibiliteVelo"("date");
ALTER TABLE "IndisponibiliteVelo" ENABLE ROW LEVEL SECURITY;

-- Le journal des événements : on y ajoute, on n'y modifie rien.
CREATE TABLE IF NOT EXISTS "JournalEvenement" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reference" TEXT,
  "details" JSONB NOT NULL,
  "auteur" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEvenement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JournalEvenement_type_createdAt_idx" ON "JournalEvenement"("type", "createdAt");
ALTER TABLE "JournalEvenement" ENABLE ROW LEVEL SECURITY;

-- Les captures envoyées pour la réduction du road trip, et la décision prise.
CREATE TABLE IF NOT EXISTS "PreuveReduction" (
  "id" TEXT NOT NULL,
  "reference" TEXT,
  "fichierCle" TEXT,
  "typeMime" TEXT NOT NULL,
  "tailleOctets" INTEGER NOT NULL,
  "statut" TEXT NOT NULL DEFAULT 'en_attente',
  "verdict" JSONB,
  "motif" TEXT,
  "decidePar" TEXT,
  "decideLe" TIMESTAMP(3),
  "supprimeLe" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreuveReduction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreuveReduction_statut_createdAt_idx" ON "PreuveReduction"("statut", "createdAt");
ALTER TABLE "PreuveReduction" ENABLE ROW LEVEL SECURITY;

-- L'argent à rendre aux clients. Une réservation qui en porte ne s'efface
-- pas (ON DELETE RESTRICT) : c'est une pièce comptable.
CREATE TABLE IF NOT EXISTS "Remboursement" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "montantXof" INTEGER NOT NULL,
  "motif" TEXT NOT NULL,
  "statut" TEXT NOT NULL DEFAULT 'a_faire',
  "faitPar" TEXT,
  "faitLe" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Remboursement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Remboursement_bookingId_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Remboursement_statut_createdAt_idx" ON "Remboursement"("statut", "createdAt");
CREATE INDEX IF NOT EXISTS "Remboursement_bookingId_idx" ON "Remboursement"("bookingId");
ALTER TABLE "Remboursement" ENABLE ROW LEVEL SECURITY;

-- La clé qui désigne une demande de remboursement (la transaction reçue, par
-- exemple) : unique, la même demande rejouée ne crée pas un second
-- remboursement, même après que le premier a été noté fait. Facultative :
-- les lignes déjà écrites restent sans clé (plusieurs valeurs vides ne se
-- gênent pas dans un index unique).
ALTER TABLE "Remboursement" ADD COLUMN IF NOT EXISTS "cleIdempotence" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Remboursement_cleIdempotence_key" ON "Remboursement"("cleIdempotence");
