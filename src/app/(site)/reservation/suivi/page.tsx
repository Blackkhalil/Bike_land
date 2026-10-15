import type { Metadata } from "next";

import { FormulaireSuivi } from "@/components/reservation/FormulaireSuivi";
import { Section, TitreSection } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Suivre ma réservation",
  description:
    "Retrouvez votre réservation Bike Land avec le lien reçu par email, ou demandez son renvoi.",
  alternates: { canonical: "/reservation/suivi" },
};

export default function PageSuivi() {
  return (
    <Section fond="noir" className="pb-24 pt-32 sm:pt-40">
      <div className="max-w-2xl">
        <TitreSection as="h1">
          Retrouver ma réservation
        </TitreSection>
        <p className="mt-6 text-[1rem] leading-relaxed text-craie/70">
          Il n&apos;y a pas de compte à Bike Land, donc pas de mot de passe à retrouver. Votre
          réservation est accessible par le lien personnel envoyé dans l&apos;email de
          confirmation. Collez-le ci-dessous, ou demandez-nous de vous le renvoyer.
        </p>

        <div className="mt-10">
          <FormulaireSuivi />
        </div>

        <div className="mt-12 border-t border-craie/15 pt-8">
          <p className="etiquette opacity-75">Vous ne retrouvez pas l&apos;email ?</p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-craie/70">
            Vérifiez vos courriers indésirables, puis appelez-nous au{" "}
            <a href={`tel:${site.telephoneLien}`} className="lien-souligne whitespace-nowrap font-semibold text-orange-sourd">
              {site.telephone}
            </a>{" "}
            ou écrivez à{" "}
            <a href={`mailto:${site.email}`} className="lien-souligne font-semibold text-orange-sourd">
              {site.email}
            </a>
            . Munissez-vous de votre référence, au format BL-XXXXXX.
          </p>
        </div>
      </div>
    </Section>
  );
}
