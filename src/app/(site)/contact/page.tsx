import type { Metadata } from "next";

import { Accordeon } from "@/components/Accordeon";
import { FormulaireContact } from "@/components/FormulaireContact";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { faq } from "@/data/contenus";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & FAQ",
  description:
    "Questions fréquentes sur la location, le paiement Mobile Money, la caution et l'assistance — et un formulaire pour tout le reste.",
  alternates: { canonical: "/contact" },
};

export default function PageContact() {
  // Données structurées : permet l'affichage des questions dans les
  // résultats de recherche.
  const donneesStructurees = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.flatMap((groupe) =>
      groupe.questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.reponse },
      })),
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
      />

      <Section fond="sable" className="pb-16 pt-32 sm:pt-40">
        <Etiquette numero="01">Contact</Etiquette>
        <TitreSection as="h1" taille="lg" className="mt-6 max-w-3xl">
          Une question ?
          <br />
          Quelqu&apos;un répond
        </TitreSection>
      </Section>

      <Section fond="sable" className="pb-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="space-y-8">
              <div>
                <p className="etiquette opacity-55">Par téléphone</p>
                <a
                  href={`tel:${site.telephoneLien}`}
                  className="lien-souligne mt-2 block font-display text-[1.5rem] font-extrabold text-terre-700"
                >
                  {site.telephone}
                </a>
                <p className="mt-2 text-[0.88rem] text-encre-500">{site.horaires}</p>
              </div>

              <div>
                <p className="etiquette opacity-55">Par email</p>
                <a
                  href={`mailto:${site.email}`}
                  className="lien-souligne mt-2 block font-display text-[1.15rem] font-bold"
                >
                  {site.email}
                </a>
                <p className="mt-2 text-[0.88rem] text-encre-500">Réponse sous 24 h ouvrées</p>
              </div>

              <div>
                <p className="etiquette opacity-55">À l&apos;atelier</p>
                <p className="mt-2 text-[0.95rem] leading-relaxed">
                  {site.adresse.ligne}
                  <br />
                  {site.adresse.ville}, {site.adresse.pays}
                </p>
              </div>

              <div>
                <p className="etiquette opacity-55">Sur les réseaux</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {site.reseaux.map((reseau) => (
                    <li key={reseau.nom}>
                      <a
                        href={reseau.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex rounded-full border border-encre-900/20 px-4 py-2 text-[0.85rem] transition-colors hover:border-encre-900/50"
                      >
                        {reseau.nom}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <FormulaireContact />
          </div>
        </div>
      </Section>

      <Section fond="blanc" className="py-20" id="faq">
        <Etiquette numero="02">Questions fréquentes</Etiquette>
        <TitreSection className="mt-6">Ce qu&apos;on nous demande</TitreSection>

        <div className="mt-12 space-y-14">
          {faq.map((groupe) => (
            <div key={groupe.categorie}>
              <h3 className="font-display text-[1.15rem] font-bold uppercase tracking-tight text-terre-700">
                {groupe.categorie}
              </h3>
              <Accordeon
                className="mt-5"
                idPrefixe={`faq-${groupe.categorie.toLowerCase().replace(/\s/g, "-")}`}
                ouvertParDefaut={null}
                volets={groupe.questions.map((item) => ({
                  titre: item.question,
                  contenu: item.reponse,
                }))}
              />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
