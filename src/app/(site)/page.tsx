import type { Metadata } from "next";

import { Assistance } from "@/components/accueil/Assistance";
import { Avis } from "@/components/accueil/Avis";
import { CatalogueApercu } from "@/components/accueil/CatalogueApercu";
import { CommentCaMarche } from "@/components/accueil/CommentCaMarche";
import { Hero } from "@/components/accueil/Hero";
import { ItinerairesApercu } from "@/components/accueil/ItinerairesApercu";
import { depot } from "@/lib/db";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `${site.nom} — ${site.baseline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

/**
 * Page d'accueil.
 *
 * Six sections seulement, en alternance franche noir / craie / lagune :
 * le héros, la flotte avec ses tarifs, les tours, la séquence de
 * location, les avis, la clôture.
 *
 * Les sections de l'ancienne version qui empilaient les arguments
 * (« Ce que vous cherchiez », « Raisons », « Passion », le schéma
 * annoté, l'accordéon d'entretien, les deux tuiles aujourd'hui/demain)
 * sont retirées de la composition : elles répétaient le même propos sur
 * six écrans. Leurs fichiers sont conservés, non supprimés.
 */
export default async function PageAccueil() {
  const velos = await depot.listerVelos();
  return (
    <>
      <Hero nombreVelos={velos.length} />
      <CatalogueApercu velos={velos.slice(0, 4)} nombreTotal={velos.length} />
      <ItinerairesApercu />
      <CommentCaMarche />
      <Avis />
      <Assistance />
    </>
  );
}
