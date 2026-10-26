import type { Metadata } from "next";

import { BoutonLien } from "@/components/Bouton";
import { CarteItineraire } from "@/components/CarteItineraire";
import { Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { filDAriane } from "@/lib/donnees-structurees";
import { DESCRIPTION_MAX, metadonneesPage, premierQuiTient } from "@/lib/seo";

/** « Togbin (30 km, environ 3 h) et l'Amazone (18 km, environ 2 h) », tiré des circuits. */
const CIRCUITS = itineraires
  .map((i) => `${i.titre.replace(/^La route des Pêches jusqu'à /, "")} (${i.distanceKm} km, ${i.duree.toLowerCase()})`)
  .join(" et ");

export const metadata: Metadata = metadonneesPage({
  titre: "Circuits à vélo sur la route des Pêches",
  description: premierQuiTient(
    [
      `Circuits à vélo au départ de Cotonou, sur la route des Pêches : ${CIRCUITS}, en groupe encadré.`,
      `Circuits à vélo au départ de Cotonou, sur la route des Pêches : ${CIRCUITS}.`,
      "Circuits à vélo au départ de Cotonou, sur la route des Pêches : distance, durée, étapes et vélo conseillé pour chacun, en groupe encadré.",
    ],
    DESCRIPTION_MAX,
  ),
  chemin: "/itineraires",
});

export default function PageItineraires() {
  return (
    <>
      <DonneesStructurees donnees={filDAriane([{ nom: "Itinéraires", chemin: "/itineraires" }])} />
      <Section fond="noir" className="pb-16 pt-32 sm:pt-40">
        <TitreSection as="h1" taille="lg" className="max-w-4xl">
          Deux circuits,
          <br />
          une seule route
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-craie/70">
          Nos deux circuits partent du même endroit, sur la route des Pêches, et se roulent en
          groupe avec un coordinateur. Il ouvre la route, remet les vélos et les kits au départ,
          et les récupère à l&apos;arrivée. Aucune caution n&apos;est demandée.
        </p>
      </Section>

      <Section fond="craie" className="pb-24 pt-12 sm:pt-16">
        <div className="grid gap-x-8 gap-y-16 md:grid-cols-2">
          {itineraires.map((itineraire) => (
            <CarteItineraire key={itineraire.slug} itineraire={itineraire} className="reveal" />
          ))}
        </div>
      </Section>

      <Section fond="noir-releve" className="py-20">
        <div className="mx-auto max-w-2xl text-center">
          <TitreSection>Un itinéraire sur mesure ?</TitreSection>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-craie/70">
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
              className="border-craie/30 text-craie hover:bg-craie/10"
            >
              Voir les vélos
            </BoutonLien>
          </div>
        </div>
      </Section>
    </>
  );
}
