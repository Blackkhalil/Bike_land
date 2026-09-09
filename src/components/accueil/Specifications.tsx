import { BoutonLien } from "@/components/Bouton";
import { SpecificationsAnnotees } from "@/components/SpecificationsAnnotees";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import type { Velo } from "@/lib/types";

/**
 * Section technique de la page d'accueil : le vélo mis en avant, annoté
 * pièce par pièce, comme sur la maquette.
 */
export function Specifications({ velo }: { velo: Velo }) {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="reveal flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Etiquette numero="03">Sous le capot</Etiquette>
          <TitreSection className="mt-6 max-w-2xl">
            Des équipements
            <br />
            pensés pour la distance
          </TitreSection>
        </div>
        <BoutonLien href={`/velos/${velo.slug}`} variante="sombre" className="shrink-0">
          Voir la fiche complète
        </BoutonLien>
      </div>

      <div className="reveal mt-6" data-delai="120">
        <SpecificationsAnnotees velo={velo} />
      </div>
    </Section>
  );
}
