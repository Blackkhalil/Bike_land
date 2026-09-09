import type { Metadata } from "next";

import { BoutonLien } from "@/components/Bouton";
import { PaysageIllustration } from "@/components/PaysageIllustration";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { chiffresCles } from "@/data/contenus";
import { depot } from "@/lib/db";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Bike Land, atelier de location de vélos pour road trips au Bénin : notre histoire, nos valeurs, nos trois points de retrait à Cotonou, Ouidah et Natitingou.",
  alternates: { canonical: "/a-propos" },
};

const valeurs = [
  {
    titre: "Peu de vélos, bien suivis",
    detail:
      "Neuf machines, pas quatre-vingts. Chacune a son carnet d'entretien et son mécanicien référent. C'est ce qui nous permet de promettre qu'un vélo qui sort est un vélo qui roule.",
  },
  {
    titre: "Le prix affiché est le prix payé",
    detail:
      "Pas de frais de dossier, pas de supplément découvert au comptoir. Les remises de durée s'appliquent d'elles-mêmes, et la caution est annoncée avant le paiement.",
  },
  {
    titre: "On répond, vraiment",
    detail:
      "Un numéro, une personne au bout. Pendant toute la location, sept jours sur sept. C'est la moindre des choses quand on confie quelqu'un à une piste de latérite.",
  },
  {
    titre: "Le Bénin d'abord",
    detail:
      "Nos itinéraires sont conçus avec des gens d'ici, nos hébergements partenaires sont tenus par des familles, et le Mobile Money passe avant la carte bancaire.",
  },
];

export default async function PageAPropos() {
  const points = await depot.listerPointsDeRetrait();

  return (
    <>
      <Section fond="sable" className="pb-16 pt-32 sm:pt-40">
        <Etiquette numero="01">Qui nous sommes</Etiquette>
        <TitreSection as="h1" taille="lg" className="mt-6 max-w-4xl">
          Un atelier,
          <br />
          pas une plateforme
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-encre-500">
          Bike Land est né d&apos;un constat simple : il est plus facile de louer une voiture à
          Cotonou qu&apos;un vélo capable de tenir quatre jours de piste. Nous avons ouvert
          l&apos;atelier que nous aurions voulu trouver.
        </p>
      </Section>

      <Section fond="sable" className="pb-20">
        <div className="overflow-hidden rounded-[1.75rem]">
          <PaysageIllustration ambiance="savane" teintes={["#c07813", "#f8f2e9"]} className="w-full" />
        </div>

        <dl className="mt-12 grid gap-8 border-t border-encre-900/12 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {chiffresCles.map((chiffre) => (
            <div key={chiffre.detail}>
              <dt className="font-display text-[3rem] font-extrabold leading-none text-terre-600">
                {chiffre.valeur}
                <span className="text-[1.2rem]">{chiffre.unite}</span>
              </dt>
              <dd className="mt-3 text-[0.9rem] leading-relaxed text-encre-500">{chiffre.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section fond="blanc" className="py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Etiquette numero="02">Notre façon de faire</Etiquette>
            <TitreSection className="mt-6">
              Quatre principes,
              <br />
              tenus
            </TitreSection>
          </div>
          <div className="lg:col-span-7">
            <ol className="border-t border-encre-900/12">
              {valeurs.map((valeur, index) => (
                <li key={valeur.titre} className="reveal border-b border-encre-900/12 py-7">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display text-[0.75rem] font-bold tabular-nums text-terre-600">
                      0{index + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-[1.15rem] font-bold uppercase leading-tight">
                        {valeur.titre}
                      </h3>
                      <p className="mt-2.5 text-[0.95rem] leading-relaxed text-encre-500">
                        {valeur.detail}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section fond="sable" className="py-20">
        <Etiquette numero="03">Où nous trouver</Etiquette>
        <TitreSection className="mt-6">Trois points de retrait</TitreSection>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {points.map((point) => (
            <div key={point.id} className="rounded-[1.25rem] bg-white p-7">
              <p className="etiquette text-terre-600">{point.ville}</p>
              <h3 className="mt-3 font-display text-[1.3rem] font-extrabold uppercase leading-none">
                {point.nom}
              </h3>
              <p className="mt-4 text-[0.92rem] leading-relaxed text-encre-500">{point.adresse}</p>
              <p className="mt-3 border-t border-encre-900/12 pt-3 text-[0.85rem] text-encre-500">
                {point.horaires}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <BoutonLien href="/contact" variante="sombre" taille="lg">
            Nous écrire
          </BoutonLien>
          <a
            href={`tel:${site.telephoneLien}`}
            className="lien-souligne font-display text-[1.2rem] font-bold text-terre-700"
          >
            {site.telephone}
          </a>
        </div>
      </Section>
    </>
  );
}
