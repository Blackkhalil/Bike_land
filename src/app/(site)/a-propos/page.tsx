import type { Metadata } from "next";
import Image from "next/image";

import { BoutonLien } from "@/components/Bouton";
import { Section, TitreSection } from "@/components/ui";
import { chiffresCles } from "@/data/contenus";
import { depot } from "@/lib/db";
import { site } from "@/lib/site";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { filDAriane } from "@/lib/donnees-structurees";
import { metadonneesPage } from "@/lib/seo";

export const metadata: Metadata = metadonneesPage({
  titre: "Notre atelier de location de vélos à Cotonou",
  description:
    "Bike Land, atelier de location de vélos sur la route des Pêches à Cotonou : notre histoire, nos valeurs " +
    "et la façon dont nous préparons chaque vélo.",
  chemin: "/a-propos",
});

/** Les valeurs de l'atelier ; la première compte les vélos réellement au parc. */
const valeursDuParc = (nombreDeVelos: number) => [
  {
    titre: `${nombreDeVelos} vélos, bien suivis`,
    detail:
      `Un parc de ${nombreDeVelos} machines, pas de quatre-vingts. Chacune a son carnet d'entretien et son mécanicien référent. C'est ce qui nous permet de promettre qu'un vélo qui sort est un vélo qui roule.`,
  },
  {
    titre: "On répond, vraiment",
    detail:
      "Un numéro, une personne au bout, du lundi au samedi. Et pendant toute la durée de votre sortie, quel que soit le jour : c'est la moindre des choses quand on confie quelqu'un à une piste de latérite.",
  },
  {
    titre: "Le prix affiché est le prix payé",
    detail:
      "Pas de frais de dossier, pas de supplément découvert au comptoir. Le road trip est au forfait, la location libre à l'heure. La caution de la location libre vous est rendue au retour du vélo, le road trip n'en demande aucune.",
  },
  {
    titre: "Le Bénin d'abord",
    detail:
      "Nos itinéraires sont tracés avec des gens d'ici, un coordinateur ouvre la route sur chaque sortie encadrée, et le Mobile Money passe avant tout le reste : MTN, Moov et Celtiis.",
  },
];

export default async function PageAPropos() {
  const [points, velos] = await Promise.all([depot.listerPointsDeRetrait(), depot.listerVelos()]);
  // Le parc réel, et non un chiffre écrit une fois pour toutes.
  const valeurs = valeursDuParc(velos.length);
  const chiffres = chiffresCles.map((chiffre) =>
    chiffre.unite === "vélos" ? { ...chiffre, valeur: String(velos.length) } : chiffre,
  );

  return (
    <>
      <DonneesStructurees donnees={filDAriane([{ nom: "À propos", chemin: "/a-propos" }])} />
      <Section fond="noir" className="pb-16 pt-32 sm:pt-40">
        <TitreSection as="h1" taille="lg" className=" max-w-4xl">
          Un atelier,
          <br />
          pas une plateforme
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-craie/70">
          Bike Land est né d&apos;un constat simple : il est plus facile de louer une voiture à
          Cotonou qu&apos;un vélo en état de tenir la route des Pêches. Nous avons ouvert
          l&apos;atelier que nous aurions voulu trouver.
        </p>
      </Section>

      <Section fond="craie" className="pb-20">
        {/* La photo d'origine est en portrait : son recadrage carré montre le
            vélo entier sur téléphone ; en 16:9, le cadrage descend sur ses roues. */}
        <div className="relative aspect-square overflow-hidden sm:aspect-16/9">
          <Image
            src="/images/streetsh-vZAk_n9Plfc-unsplash-carre.jpg"
            alt="Un vélo prêt à partir"
            fill
            // Visible dès le premier écran. Next 16 déprécie `priority`.
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover object-[50%_90%]"
          />
        </div>

        <dl className="mt-12 grid gap-8 border-t border-noir-piste/12 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {chiffres.map((chiffre) => (
            <div key={chiffre.detail}>
              <dt className="font-display text-[3rem] font-extrabold leading-none text-orange-sourd">
                {chiffre.valeur}
                <span className="text-[1.2rem]">{chiffre.unite}</span>
              </dt>
              <dd className="mt-3 text-[0.9rem] leading-relaxed text-gris-cadre">{chiffre.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section fond="craie" className="py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <TitreSection>
              Quatre principes,
              <br />
              tenus
            </TitreSection>
          </div>
          <div className="lg:col-span-7">
            <ol className="border-t border-noir-piste/12">
              {valeurs.map((valeur, index) => (
                <li key={valeur.titre} className="reveal border-b border-noir-piste/12 py-7">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display text-[0.75rem] font-bold tabular-nums text-orange-sourd">
                      0{index + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-[1.15rem] font-bold uppercase leading-tight">
                        {valeur.titre}
                      </h3>
                      <p className="mt-2.5 text-[0.95rem] leading-relaxed text-gris-cadre">
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

      <Section fond="craie" className="py-20">
        <TitreSection>Notre point de départ</TitreSection>
        <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-gris-cadre">
          Un seul point pour l&apos;instant, le temps de bien connaître chaque vélo. D&apos;autres
          suivront avec l&apos;ouverture de nos road trips longue distance.
        </p>

        <div className="mt-10 grid gap-6 sm:max-w-sm">
          {points.map((point) => (
            <div key={point.id} className="rounded-[var(--radius-carte)] bg-white p-7">
              <p className="etiquette text-orange-sourd">{point.ville}</p>
              <h3 className="mt-3 font-display text-[1.3rem] font-extrabold uppercase leading-none">
                {point.nom}
              </h3>
              <p className="mt-4 text-[0.92rem] leading-relaxed text-gris-cadre">{point.adresse}</p>
              <p className="mt-3 border-t border-noir-piste/12 pt-3 text-[0.85rem] text-gris-cadre">
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
            className="lien-souligne cible-elargie font-display text-[1.2rem] font-bold text-orange-sourd"
          >
            {site.telephone}
          </a>
        </div>
      </Section>
    </>
  );
}
