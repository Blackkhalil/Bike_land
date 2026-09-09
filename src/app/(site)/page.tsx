import type { Metadata } from "next";

import { Assistance } from "@/components/accueil/Assistance";
import { Avis } from "@/components/accueil/Avis";
import { CatalogueApercu } from "@/components/accueil/CatalogueApercu";
import { CeQueVousCherchiez } from "@/components/accueil/CeQueVousCherchiez";
import { Entretien } from "@/components/accueil/Entretien";
import { Hero } from "@/components/accueil/Hero";
import { ItinerairesApercu } from "@/components/accueil/ItinerairesApercu";
import { Passion } from "@/components/accueil/Passion";
import { Raisons } from "@/components/accueil/Raisons";
import { Specifications } from "@/components/accueil/Specifications";
import { depot } from "@/lib/db";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `${site.nom} — ${site.baseline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function PageAccueil() {
  const velos = await depot.listerVelos();
  // Le schéma annoté met en avant un vélo à assistance : c'est le modèle
  // qui porte le plus d'éléments techniques à légender.
  const veloVedette = velos.find((velo) => velo.categorie === "VAE") ?? velos[0];

  return (
    <>
      <Hero />
      <CeQueVousCherchiez />
      <Raisons />
      {veloVedette && <Specifications velo={veloVedette} />}
      <Entretien />
      <CatalogueApercu velos={velos.slice(0, 4)} />
      <Passion />
      <ItinerairesApercu />
      <Avis />
      <Assistance />
    </>
  );
}
