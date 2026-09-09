import type { Metadata } from "next";

import { BoutonLien } from "@/components/Bouton";
import { CarteItineraire } from "@/components/CarteItineraire";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";

export const metadata: Metadata = {
  title: "Itinéraires",
  description:
    "Quatre road trips à vélo au Bénin, du littoral aux montagnes de l'Atacora : distance, dénivelé, étapes et vélo conseillé pour chacun.",
  alternates: { canonical: "/itineraires" },
};

export default function PageItineraires() {
  return (
    <>
      <Section fond="sable" className="pb-16 pt-32 sm:pt-40">
        <Etiquette numero="01">Idées de parcours</Etiquette>
        <TitreSection as="h1" taille="lg" className="mt-6 max-w-4xl">
          Quatre routes,
          <br />
          quatre Bénin
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-encre-500">
          Ce ne sont pas des circuits organisés : ce sont des itinéraires que nous avons roulés
          nous-mêmes, avec les distances réelles, les points d&apos;eau et les endroits où
          dormir. Vous partez seul, à votre rythme, avec nos traces GPS si vous le souhaitez.
        </p>
      </Section>

      <Section fond="sable" className="pb-24">
        <div className="grid gap-x-8 gap-y-16 md:grid-cols-2">
          {itineraires.map((itineraire) => (
            <CarteItineraire key={itineraire.slug} itineraire={itineraire} className="reveal" />
          ))}
        </div>
      </Section>

      <Section fond="encre" className="py-20">
        <div className="mx-auto max-w-2xl text-center">
          <TitreSection>Un itinéraire sur mesure ?</TitreSection>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-sable-100/70">
            Dites-nous combien de jours vous avez, votre niveau et ce que vous voulez voir. Nous
            traçons le parcours et nous préparons le vélo qui va avec.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <BoutonLien href="/contact" variante="clair">
              Nous écrire
            </BoutonLien>
            <BoutonLien
              href="/velos"
              variante="contour"
              className="border-sable-50/30 text-sable-50 hover:bg-sable-50/10"
            >
              Voir les vélos
            </BoutonLien>
          </div>
        </div>
      </Section>
    </>
  );
}
