import { BoutonLien } from "@/components/Bouton";
import { Section, TitreSection } from "@/components/ui";
import { site } from "@/lib/site";

/**
 * Bloc de clôture : un grand titre centré, le numéro d'assistance et
 * les deux actions principales, la construction du pied de page de la
 * maquette, avec la roue en filigrane.
 */
export function Assistance() {
  return (
    <Section fond="noir" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <TitreSection taille="lg">
          Une question avant
          <br />
          de vous lancer&nbsp;?
        </TitreSection>
        <p className="mx-auto mt-6 max-w-xl text-[1rem] leading-relaxed text-craie/70">
          Choix du vélo, faisabilité d&apos;une sortie, groupe de dix personnes&nbsp;: appelez-nous,
          quelqu&apos;un décroche.
        </p>

        <a
          href={`tel:${site.telephoneLien}`}
          className="mt-9 inline-block font-display text-[clamp(1.6rem,4vw,2.6rem)] text-orange-signal transition-colors hover:text-orange-vif"
        >
          {site.telephone}
        </a>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BoutonLien href="/velos" variante="primaire" taille="lg">
            Réserver un vélo
          </BoutonLien>
          <BoutonLien href="/contact" variante="contour" taille="lg" className="text-craie">
            Écrire à l&apos;équipe
          </BoutonLien>
        </div>
      </div>
    </Section>
  );
}
