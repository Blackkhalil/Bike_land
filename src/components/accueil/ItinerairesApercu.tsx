import { CarteItineraire } from "@/components/CarteItineraire";
import { LienFleche, Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";

/**
 * Les tours, fond vert lagune, bord à bord.
 *
 * Le vert sépare visuellement l'univers « tours » de l'univers
 * « location » : deux offres, deux couleurs, distinguables sans lire
 * (brief §2). La section va d'un bord à l'autre pour casser la grille.
 */
export function ItinerairesApercu() {
  return (
    <Section fond="lagune" bordAbord className="py-20 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <TitreSection className="max-w-2xl">
            Deux circuits
            <br />
            sur la route des Pêches
          </TitreSection>
          <p className="max-w-sm text-[0.92rem] leading-relaxed text-craie/75">
            Départ groupé, coordinateur en tête, coco frais à l&apos;arrivée. Sans caution.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {itineraires.map((itineraire) => (
            <CarteItineraire key={itineraire.slug} itineraire={itineraire} />
          ))}
        </div>

        <div className="mt-10 border-t border-craie/25 pt-6">
          <LienFleche href="/itineraires" className="text-craie">
            Voir les deux circuits
          </LienFleche>
        </div>
      </div>
    </Section>
  );
}
