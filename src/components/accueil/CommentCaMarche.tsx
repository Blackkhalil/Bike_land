import { Section, TitreSection } from "@/components/ui";
import { etapesLocation } from "@/data/contenus";

/**
 * La séquence de location, fond craie.
 *
 * C'est le seul bloc du site où la numérotation est légitime : les
 * étapes s'enchaînent réellement dans cet ordre (brief §2, qui proscrit
 * les 01/02/03 sur tout contenu qui n'est pas une séquence).
 */
export function CommentCaMarche() {
  return (
    <Section fond="craie" className="py-20 sm:py-28">
      <TitreSection className="max-w-2xl">Comment ça marche</TitreSection>

      <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {etapesLocation.map((etape) => (
          <li key={etape.numero} className="border-t-2 border-noir-piste pt-5">
            <p className="font-display text-[1.6rem] leading-none text-orange-sourd">
              {etape.numero}
            </p>
            <h3 className="titre-editorial mt-4 text-[1.35rem]">{etape.titre}</h3>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">{etape.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
