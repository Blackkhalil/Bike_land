import { CarteVelo } from "@/components/CarteVelo";
import { LienFleche, Section, TitreSection } from "@/components/ui";
import type { Velo } from "@/lib/types";

/**
 * Aperçu du parc sur la page d'accueil : quatre vélos, puis le catalogue.
 *
 * La taille du parc n'est jamais annoncée. Elle ne renseigne le client
 * sur rien qu'il puisse utiliser, ce qui l'intéresse, c'est de savoir
 * si le vélo qu'il veut est libre à sa date, et afficher un petit
 * nombre dessert l'entreprise sans contrepartie.
 */
export function CatalogueApercu({ velos }: { velos: Velo[] }) {
  return (
    <Section fond="noir" className="py-20 sm:py-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <TitreSection className="max-w-2xl">
          Des vélos
          <br />
          choisis un par un
        </TitreSection>
        <p className="max-w-sm text-[0.92rem] leading-relaxed text-craie/65">
          Un parc volontairement restreint&nbsp;: c&apos;est la condition pour connaître chaque
          machine et la rendre irréprochable avant chaque départ.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {velos.map((velo) => (
          <CarteVelo key={velo.id} velo={velo} />
        ))}
      </div>

      <div className="mt-10 border-t border-craie/15 pt-6">
        <LienFleche href="/velos" className="text-orange-signal">
          Voir tout le catalogue et vérifier les disponibilités
        </LienFleche>
      </div>
    </Section>
  );
}
