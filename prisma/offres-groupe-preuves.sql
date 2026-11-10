-- Offres de groupe, lot 5b : les preuves de réduction du road trip.
--
-- Purement additif, à lancer après prisma/offres-groupe.sql : deux colonnes
-- facultatives sur les preuves (l'email et le téléphone du client, pour lui
-- écrire quand sa capture est vérifiée à la main, décisions 14 et 21) et une
-- table nouvelle, le fichier de la capture quand il est gardé dans la base.
-- Aucune donnée existante n'est touchée, rien n'est renommé ni supprimé.
--
-- Le fichier va dans la base tant qu'aucun stockage privé de fichiers n'est
-- configuré (BLOB_PREUVES_READ_WRITE_TOKEN, un magasin Vercel Blob privé) :
-- il n'a ainsi jamais d'adresse publique. Il est déjà réencodé (tourné,
-- réduit à 2 576 pixels au plus, sans métadonnées), effacé dès la décision
-- et 30 jours au plus tard ; il disparaît avec sa preuve.
--
-- Rejouable : chaque instruction vérifie d'abord que l'objet n'existe pas.
-- La table nouvelle est verrouillée comme les autres (RLS sans règle : seul
-- le serveur y accède, avec sa propre connexion).
--
-- À appliquer sur la base de test d'abord, puis, avec l'accord écrit du
-- responsable et après une sauvegarde, sur la production, AVANT de déployer
-- le code qui lit ces colonnes.

ALTER TABLE "PreuveReduction" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "PreuveReduction" ADD COLUMN IF NOT EXISTS "telephone" TEXT;

CREATE TABLE IF NOT EXISTS "FichierPreuve" (
  "preuveId" TEXT NOT NULL,
  "octets" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FichierPreuve_pkey" PRIMARY KEY ("preuveId"),
  CONSTRAINT "FichierPreuve_preuveId_fkey" FOREIGN KEY ("preuveId")
    REFERENCES "PreuveReduction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "FichierPreuve" ENABLE ROW LEVEL SECURITY;
