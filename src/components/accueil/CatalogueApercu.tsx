import { CarteVelo } from "@/components/CarteVelo";
import { Etiquette, LienFleche, Section, TitreSection } from "@/components/ui";
import type { Velo } from "@/lib/types";

/** Aperçu du parc sur la page d'accueil : quatre vélos, puis le catalogue. */
export function CatalogueApercu({ velos }: { velos: Velo[] }) {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="reveal flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Etiquette numero="08">Le parc</Etiquette>
          <TitreSection className="mt-6 max-w-2xl">
            Neuf vélos,
            <br />
            pas un de plus
          </TitreSection>
        </div>
        <p className="max-w-sm text-[0.92rem] leading-relaxed text-encre-500">
          Un parc volontairement restreint : c&apos;est la condition pour connaître chaque
          machine et la rendre irréprochable avant chaque départ.
        </p>
      </div>

      <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {velos.map((velo) => (
          <CarteVelo key={velo.id} velo={velo} className="reveal" />
        ))}
      </div>

      <div className="mt-12 border-t border-encre-900/12 pt-6">
        <LienFleche href="/velos" className="text-terre-700">
          Voir tout le catalogue et vérifier les disponibilités
        </LienFleche>
      </div>
    </Section>
  );
}
