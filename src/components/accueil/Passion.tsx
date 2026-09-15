import Image from "next/image";

import { BoutonLien } from "@/components/Bouton";
import { Etiquette, Section, TitreSection } from "@/components/ui";

/**
 * Bloc éditorial : le plaisir de rouler plutôt que la fiche technique.
 * Visuel plein cadre à gauche, texte à droite.
 */
export function Passion() {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="reveal relative aspect-4/5 overflow-hidden rounded-[var(--radius-bloc)] lg:aspect-auto lg:h-full lg:min-h-[26rem]">
          <Image
            src="/images/hannah-carr-I079C4gOe8s-unsplash.jpg"
            alt="Cycliste roulant seul face au soleil couchant, sur une allée bordée d'arbres"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>

        <div className="reveal" data-delai="120">
          <Etiquette numero="05">L&apos;esprit road trip</Etiquette>
          <TitreSection className="mt-6">
            Retrouvez
            <br />
            votre rythme
          </TitreSection>
          <p className="mt-6 max-w-lg text-[1rem] leading-relaxed text-gris-cadre">
            À vélo, le paysage arrive à la bonne vitesse. On sent l&apos;odeur du poisson braisé
            avant de voir le village, on s&apos;arrête parce qu&apos;un manguier fait de
            l&apos;ombre, on discute au bord de la piste. C&apos;est un autre rapport au trajet —
            et souvent, c&apos;est de lui qu&apos;on se souvient.
          </p>
          <p className="mt-4 max-w-lg text-[1rem] leading-relaxed text-gris-cadre">
            Nous préparons le matériel, nous connaissons la route des Pêches par cœur, nous
            restons joignables. Le reste vous appartient.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <BoutonLien href="/itineraires" variante="primaire">
              Choisir un itinéraire
            </BoutonLien>
            <BoutonLien href="/comment-ca-marche" variante="contour" className="text-noir-piste">
              Comment ça marche
            </BoutonLien>
          </div>
        </div>
      </div>
    </Section>
  );
}
