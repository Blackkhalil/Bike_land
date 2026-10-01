import type { Metadata } from "next";

import { Assistance } from "@/components/accueil/Assistance";
import { Avis } from "@/components/accueil/Avis";
import { CarrouselPhotos } from "@/components/accueil/CarrouselPhotos";
import { LesGammes } from "@/components/accueil/LesGammes";
import { CatalogueApercu } from "@/components/accueil/CatalogueApercu";
import { CommentCaMarche } from "@/components/accueil/CommentCaMarche";
import { Hero } from "@/components/accueil/Hero";
import { ItinerairesApercu } from "@/components/accueil/ItinerairesApercu";
import { VeloEnVedette } from "@/components/accueil/VeloEnVedette";
import { depot } from "@/lib/db";
import { photosDuCarrousel } from "@/lib/photos-carrousel";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `${site.nom}, ${site.baseline}`,
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
/**
 * Page rendue une fois puis servie telle quelle pendant cinq minutes.
 *
 * Rien ici n'a besoin d'être frais à la seconde : le parc change deux
 * fois par an, les avis quand on en publie un. Sans ce cache, chaque
 * visiteur déclenchait deux requêtes en base, et à soixante visiteurs
 * simultanés, le pool de connexions était épuisé et la page renvoyait
 * une erreur. C'est mesuré, pas supposé.
 *
 * La disponibilité des vélos, elle, n'est jamais servie depuis un cache :
 * elle se joue dans le tunnel et, en dernier ressort, dans la
 * transaction sérialisable qui écrit la réservation.
 */
export const revalidate = 300;

export default async function PageAccueil() {
  const [velos, photos] = await Promise.all([
    depot.listerVelos(),
    photosDuCarrousel(),
  ]);
  return (
    <>
      <Hero />
      <CatalogueApercu velos={velos.slice(0, 4)} />
      {/* Les trois gammes juste après l'aperçu du parc : le visiteur
          vient de voir des vélos, c'est le moment où il se demande
          pourquoi ils n'ont pas tous le même prix. */}
      <LesGammes velos={velos} />
      <ItinerairesApercu />
      <CommentCaMarche />
      <VeloEnVedette />
      <Avis />
      {/* Les photos, en bas : on laisse la page dire d'abord ce qu'on
          fait, avant de montrer l'ambiance. Le dossier public/carrousel
          les fournit, rien à tenir à jour ici. */}
      <CarrouselPhotos photos={photos} />
      <Assistance />
    </>
  );
}
