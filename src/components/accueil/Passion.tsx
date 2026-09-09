import { BoutonLien } from "@/components/Bouton";
import { PaysageIllustration } from "@/components/PaysageIllustration";
import { Etiquette, Section, TitreSection } from "@/components/ui";

/**
 * Bloc éditorial : le plaisir de rouler plutôt que la fiche technique.
 * Visuel plein cadre à gauche, texte à droite.
 */
export function Passion() {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="reveal overflow-hidden rounded-[1.75rem]">
          <PaysageIllustration ambiance="littoral" teintes={["#c75c34", "#f9e6dc"]} className="w-full" />
        </div>

        <div className="reveal" data-delai="120">
          <Etiquette numero="05">L&apos;esprit road trip</Etiquette>
          <TitreSection className="mt-6">
            Retrouvez
            <br />
            votre rythme
          </TitreSection>
          <p className="mt-6 max-w-lg text-[1rem] leading-relaxed text-encre-500">
            À vélo, le paysage arrive à la bonne vitesse. On sent l&apos;odeur du poisson braisé
            avant de voir le village, on s&apos;arrête parce qu&apos;un manguier fait de
            l&apos;ombre, on discute au bord de la piste. C&apos;est un autre rapport au trajet —
            et souvent, c&apos;est de lui qu&apos;on se souvient.
          </p>
          <p className="mt-4 max-w-lg text-[1rem] leading-relaxed text-encre-500">
            Nous préparons le matériel, nous balisons les itinéraires, nous restons joignables.
            Le reste vous appartient.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <BoutonLien href="/itineraires" variante="primaire">
              Choisir un itinéraire
            </BoutonLien>
            <BoutonLien href="/comment-ca-marche" variante="contour" className="text-encre-900">
              Comment ça marche
            </BoutonLien>
          </div>
        </div>
      </div>
    </Section>
  );
}
