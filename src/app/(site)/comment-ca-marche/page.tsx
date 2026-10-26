import type { Metadata } from "next";

import { BoutonLien } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Section, TitreSection } from "@/components/ui";
import { etapesLocation } from "@/data/contenus";
import { moyensDisponibles } from "@/lib/paiement";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { filDAriane } from "@/lib/donnees-structurees";
import { metadonneesPage } from "@/lib/seo";

export const metadata: Metadata = metadonneesPage({
  titre: "Louer un vélo à Cotonou en cinq étapes",
  description:
    "Louer un vélo à Cotonou en cinq étapes : choisir son vélo, réserver en ligne, payer en Mobile Money, " +
    "le récupérer et le rendre. Sans compte, sans paperasse.",
  chemin: "/comment-ca-marche",
});

export default function PageCommentCaMarche() {
  return (
    <>
      <DonneesStructurees donnees={filDAriane([{ nom: "Comment ça marche", chemin: "/comment-ca-marche" }])} />
      <Section fond="noir" className="pb-16 pt-32 sm:pt-40">
        <TitreSection as="h1" taille="lg" className=" max-w-4xl">
          De l&apos;envie
          <br />
          au départ, <span className="whitespace-nowrap">en cinq étapes</span>
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-craie/70">
          Nous avons retiré tout ce qui pouvait l&apos;être : pas de compte à créer, pas de
          dossier à constituer, pas de photocopie de passeport. Il reste le vélo et la route.
        </p>
      </Section>

      <Section fond="craie" className="py-20">
        <ol className="border-t border-noir-piste/12">
          {etapesLocation.map((etape) => (
            <li
              key={etape.numero}
              className="reveal grid gap-4 border-b border-noir-piste/12 py-9 sm:grid-cols-12 sm:gap-8"
            >
              <p className="font-display text-[2.2rem] font-extrabold leading-none tabular-nums text-orange-sourd/70 sm:col-span-2">
                {etape.numero}
              </p>
              <h2 className="font-display text-[1.25rem] font-bold uppercase leading-tight tracking-[-0.01em] sm:col-span-4">
                {etape.titre}
              </h2>
              <p className="text-[0.98rem] leading-relaxed text-gris-cadre sm:col-span-6">
                {etape.detail}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section fond="craie" className="py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <TitreSection>
              Mobile Money
              <br />
              d&apos;abord
            </TitreSection>
            <p className="mt-6 max-w-md text-[0.98rem] leading-relaxed text-gris-cadre">
              Au Bénin, le Mobile Money est le moyen de paiement du quotidien. C&apos;est donc le
              seul que nous acceptons : MTN Money ou Moov Money, depuis votre téléphone, sans
              carte ni compte à créer.
            </p>
            <ul className="mt-8 space-y-0">
              {moyensDisponibles.map((moyen) => (
                <li
                  key={moyen.code}
                  className="flex items-baseline justify-between gap-4 border-b border-noir-piste/12 py-4 first:border-t"
                >
                  <span className="font-semibold">{moyen.libelle}</span>
                  <span className="text-[0.85rem] text-gris-cadre">{moyen.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[0.88rem] leading-relaxed text-gris-cadre">
              Les transactions passent par un agrégateur béninois agréé. Bike Land ne voit ni ne
              conserve vos coordonnées bancaires.
            </p>
          </div>

          <div
            className="grid place-items-center overflow-hidden rounded-[var(--radius-bloc)] px-8 py-16"
            style={{ background: "#e0dcd3" }}
          >
            <VeloIllustration
              categorie="RANDONNEUR"
              teintes={["#c44a04", "#f2efe9"]}
              className="w-full max-w-lg"
            />
          </div>
        </div>
      </Section>

      <Section fond="craie" className="py-20">
        <div className="grid gap-12 lg:grid-cols-3">
          {[
            {
              titre: "Ce qui est compris",
              points: [
                "Un coordinateur qui encadre toute la sortie",
                "Le vélo réglé à votre taille",
                "Casque, antivol, kit de réparation et pompe",
                "Éclairage avant et arrière",
                "Une eau de coco au départ",
                "Un point technique complet avant de rouler",
              ],
            },
            {
              titre: "Ce qui est en option",
              points: [
                "Sacoches supplémentaires",
                "Compteur GPS avec nos traces",
              ],
            },
            {
              titre: "Ce qui reste à votre charge",
              points: [
                "Les hébergements et les repas",
                "Le transport jusqu'au point de départ",
                "Les réparations dues à une négligence",
                "Le rapatriement au-delà de 60 km",
              ],
            },
          ].map((bloc) => (
            <div key={bloc.titre} className="reveal">
              <h2 className="font-display text-[1.15rem] font-bold uppercase tracking-tight">
                {bloc.titre}
              </h2>
              <ul className="mt-5">
                {bloc.points.map((point) => (
                  <li
                    key={point}
                    className="border-b border-noir-piste/12 py-3 text-[0.92rem] leading-relaxed text-gris-cadre first:border-t"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap gap-3">
          <BoutonLien href="/velos" variante="primaire" taille="lg">
            Choisir mon vélo
          </BoutonLien>
          <BoutonLien href="/contact" variante="contour" taille="lg" className="text-noir-piste">
            Poser une question
          </BoutonLien>
        </div>
      </Section>
    </>
  );
}
