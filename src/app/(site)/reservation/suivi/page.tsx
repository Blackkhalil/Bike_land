import type { Metadata } from "next";

import { FormulaireSuivi } from "@/components/reservation/FormulaireSuivi";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Suivre ma réservation",
  description:
    "Retrouvez votre réservation Bike Land avec le lien reçu par email, ou demandez son renvoi.",
  alternates: { canonical: "/reservation/suivi" },
};

export default function PageSuivi() {
  return (
    <Section fond="sable" className="pb-24 pt-32 sm:pt-40">
      <div className="max-w-2xl">
        <Etiquette>Suivi</Etiquette>
        <TitreSection as="h1" className="mt-6">
          Retrouver ma réservation
        </TitreSection>
        <p className="mt-6 text-[1rem] leading-relaxed text-encre-500">
          Il n&apos;y a pas de compte à Bike Land, donc pas de mot de passe à retrouver. Votre
          réservation est accessible par le lien personnel envoyé dans l&apos;email de
          confirmation. Collez-le ci-dessous, ou demandez-nous de vous le renvoyer.
        </p>

        <div className="mt-10">
          <FormulaireSuivi />
        </div>

        <div className="mt-12 border-t border-encre-900/12 pt-8">
          <p className="etiquette opacity-55">Vous ne retrouvez pas l&apos;email ?</p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-encre-500">
            Vérifiez vos courriers indésirables, puis appelez-nous au{" "}
            <a href={`tel:${site.telephoneLien}`} className="lien-souligne font-semibold text-terre-700">
              {site.telephone}
            </a>{" "}
            ou écrivez à{" "}
            <a href={`mailto:${site.email}`} className="lien-souligne font-semibold text-terre-700">
              {site.email}
            </a>
            . Munissez-vous de votre référence, au format BL-XXXXXX.
          </p>
        </div>
      </div>
    </Section>
  );
}
