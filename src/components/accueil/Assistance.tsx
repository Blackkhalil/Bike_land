import { BoutonLien } from "@/components/Bouton";
import { Section, TitreSection } from "@/components/ui";
import { site } from "@/lib/site";

/**
 * Bloc de clôture : un grand titre centré, le numéro d'assistance et
 * les deux actions principales — la construction du pied de page de la
 * maquette, avec la roue en filigrane.
 */
export function Assistance() {
  return (
    <Section fond="sable" className="relative overflow-hidden py-24 sm:py-32">
      {/* Roue en filigrane, comme le tracé fantôme de la maquette */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 400"
        className="pointer-events-none absolute -bottom-24 left-1/2 w-[34rem] -translate-x-1/2 text-encre-900/[0.045]"
      >
        <circle cx="200" cy="200" r="190" stroke="currentColor" strokeWidth="3" fill="none" />
        <circle cx="200" cy="200" r="150" stroke="currentColor" strokeWidth="2" fill="none" />
        {Array.from({ length: 24 }, (_, index) => (index * 360) / 24).map((angle) => (
          <line
            key={angle}
            x1="200"
            y1="200"
            x2="200"
            y2="52"
            stroke="currentColor"
            strokeWidth="1.6"
            transform={`rotate(${angle} 200 200)`}
          />
        ))}
      </svg>

      <div className="reveal relative mx-auto max-w-3xl text-center">
        <TitreSection taille="lg">
          Une question avant
          <br />
          de vous lancer ?
        </TitreSection>
        <p className="mx-auto mt-6 max-w-xl text-[1rem] leading-relaxed text-encre-500">
          Choix du vélo, faisabilité d&apos;un itinéraire, groupe de dix personnes, retour dans
          une autre ville : appelez-nous, quelqu&apos;un décroche.
        </p>

        <a
          href={`tel:${site.telephoneLien}`}
          className="mt-9 inline-block font-display text-[clamp(1.5rem,4vw,2.4rem)] font-extrabold tracking-[-0.02em] text-terre-700 transition-colors hover:text-terre-600"
        >
          {site.telephone}
        </a>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BoutonLien href="/velos" variante="sombre" taille="lg">
            Réserver un vélo
          </BoutonLien>
          <BoutonLien href="/contact" variante="contour" taille="lg" className="text-encre-900">
            Écrire à l&apos;équipe
          </BoutonLien>
        </div>
      </div>
    </Section>
  );
}
