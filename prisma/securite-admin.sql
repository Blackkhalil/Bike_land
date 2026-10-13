-- Double authentification de l'administration. Purement additif : une
-- table nouvelle, verrouillée comme les autres (RLS sans règle, seul le
-- serveur y accède). À appliquer avant de déployer le code qui la lit.
CREATE TABLE IF NOT EXISTS "ParametreAdmin" (
  "cle" TEXT NOT NULL,
  "valeur" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParametreAdmin_pkey" PRIMARY KEY ("cle")
);
ALTER TABLE "ParametreAdmin" ENABLE ROW LEVEL SECURITY;
