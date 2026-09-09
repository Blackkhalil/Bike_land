import type { ReactNode } from "react";

import { Etiquette, Section, TitreSection } from "@/components/ui";

/**
 * Gabarit commun aux pages réglementaires : une colonne étroite, une
 * hiérarchie de titres claire, la date de dernière mise à jour visible.
 */
export function PageLegale({
  titre,
  sousTitre,
  miseAJour,
  children,
}: {
  titre: string;
  sousTitre?: string;
  miseAJour: string;
  children: ReactNode;
}) {
  return (
    <Section fond="sable" className="pb-24 pt-32 sm:pt-40">
      <div className="max-w-3xl">
        <Etiquette>Informations légales</Etiquette>
        <TitreSection as="h1" className="mt-6">
          {titre}
        </TitreSection>
        {sousTitre && (
          <p className="mt-5 text-[1rem] leading-relaxed text-encre-500">{sousTitre}</p>
        )}
        <p className="mt-4 text-[0.82rem] text-encre-500">Dernière mise à jour : {miseAJour}</p>

        <div className="mt-12 space-y-10">{children}</div>
      </div>
    </Section>
  );
}

export function ArticleLegal({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="border-t border-encre-900/12 pt-7">
      <h2 className="font-display text-[1.1rem] font-bold uppercase tracking-tight">{titre}</h2>
      <div className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-encre-700">{children}</div>
    </section>
  );
}
