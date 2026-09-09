import { CarteItineraire } from "@/components/CarteItineraire";
import { Etiquette, LienFleche, Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";

/** Trois itinéraires mis en avant, renvoyant vers la page dédiée. */
export function ItinerairesApercu() {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="reveal flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Etiquette numero="07">Idées de parcours</Etiquette>
          <TitreSection className="mt-6 max-w-2xl">
            Des itinéraires que
            <br />
            nous avons roulés
          </TitreSection>
        </div>
        <LienFleche href="/itineraires" className="text-terre-700">
          Les quatre itinéraires
        </LienFleche>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {itineraires.slice(0, 3).map((itineraire) => (
          <CarteItineraire key={itineraire.slug} itineraire={itineraire} className="reveal" />
        ))}
      </div>
    </Section>
  );
}
