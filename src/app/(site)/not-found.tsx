import { BoutonLien } from "@/components/Bouton";
import { Section, TitreSection } from "@/components/ui";

export default function PageIntrouvable() {
  return (
    <Section fond="sable" className="pb-32 pt-40">
      <div className="mx-auto max-w-xl text-center">
        <p className="font-display text-[5rem] font-extrabold leading-none text-terre-200">404</p>
        <TitreSection as="h1" className="mt-6">
          Cette page a pris
          <br />
          une autre route
        </TitreSection>
        <p className="mt-6 text-[0.98rem] leading-relaxed text-encre-500">
          Le lien est peut-être ancien, ou l&apos;adresse comporte une coquille. Reprenons depuis
          le catalogue — c&apos;est de là que tout part.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <BoutonLien href="/velos" variante="primaire" taille="lg">
            Voir les vélos
          </BoutonLien>
          <BoutonLien href="/" variante="contour" taille="lg" className="text-encre-900">
            Retour à l&apos;accueil
          </BoutonLien>
        </div>
      </div>
    </Section>
  );
}
