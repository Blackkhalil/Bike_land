import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonLien } from "@/components/Bouton";
import { CarteVelo } from "@/components/CarteVelo";
import Image from "next/image";
import { PaysageIllustration } from "@/components/PaysageIllustration";
import { ambiancePour } from "@/components/CarteItineraire";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";
import { depot } from "@/lib/db";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return itineraires.map((itineraire) => ({ slug: itineraire.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const itineraire = itineraires.find((item) => item.slug === slug);
  if (!itineraire) return { title: "Itinéraire introuvable" };

  return {
    title: itineraire.titre,
    description: `${itineraire.resume} ${itineraire.distanceKm} km, ${itineraire.duree}, niveau ${itineraire.niveau.toLowerCase()}.`,
    alternates: { canonical: `/itineraires/${itineraire.slug}` },
  };
}

export default async function PageItineraire({ params }: { params: Params }) {
  const { slug } = await params;
  const itineraire = itineraires.find((item) => item.slug === slug);
  if (!itineraire) notFound();

  // Tout le parc convient : les circuits sont courts et roulés en groupe,
  // et le coordinateur règle le vélo au départ. On montre donc simplement
  // les machines disponibles, sans présélection par type.
  const velos = await depot.listerVelos();

  const chiffres = [
    { libelle: "Distance", valeur: `${itineraire.distanceKm} km` },
    { libelle: "Durée", valeur: itineraire.duree },
    { libelle: "Dénivelé", valeur: `${itineraire.denivele} m` },
    { libelle: "Niveau", valeur: itineraire.niveau },
  ];

  return (
    <>
      <Section fond="noir" className="pb-12 pt-32 sm:pt-40">
        <nav aria-label="Fil d'ariane" className="etiquette flex items-center gap-2 opacity-75">
          <Link href="/itineraires" className="lien-souligne">
            Itinéraires
          </Link>
          <span aria-hidden="true">/</span>
          <span>{itineraire.titre}</span>
        </nav>

        <div className="mt-8 flex flex-wrap gap-2">
          <Pastille ton="sombre">{itineraire.region}</Pastille>
          <Pastille ton="neutre">{itineraire.niveau}</Pastille>
        </div>

        <TitreSection as="h1" taille="lg" className=" max-w-4xl">
          {itineraire.titre}
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-craie/70">
          {itineraire.resume}
        </p>

        <div className="relative mt-10 aspect-16/9 overflow-hidden">
          {itineraire.photo ? (
            <Image
              src={itineraire.photo}
              alt={`${itineraire.titre} — ${itineraire.region}`}
              fill
              priority
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="object-cover"
            />
          ) : (
            <PaysageIllustration
              ambiance={ambiancePour(itineraire.slug)}
              teintes={itineraire.teintes}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <dl className="mt-10 grid gap-6 border-t border-craie/15 pt-8 sm:grid-cols-4">
          {chiffres.map((chiffre) => (
            <div key={chiffre.libelle}>
              <dt className="etiquette opacity-75">{chiffre.libelle}</dt>
              <dd className="mt-2 font-display text-[1.6rem] font-extrabold leading-none">
                {chiffre.valeur}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section fond="craie" className="py-20">
        <TitreSection>Étape par étape</TitreSection>

        <ol className="mt-12 border-t border-noir-piste/12">
          {itineraire.etapes.map((etape) => (
            <li
              key={etape.jour}
              className="grid gap-4 border-b border-noir-piste/12 py-8 sm:grid-cols-12 sm:gap-8"
            >
              <p className="etiquette text-orange-sourd sm:col-span-2">{etape.jour}</p>
              <h3 className="font-display text-[1.15rem] font-bold uppercase leading-tight sm:col-span-4">
                {etape.titre}
              </h3>
              <p className="text-[0.95rem] leading-relaxed text-gris-cadre sm:col-span-6">
                {etape.detail}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section fond="craie" className="py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <TitreSection>Les vélos de ce circuit</TitreSection>
          </div>
          <BoutonLien href="/velos" variante="sombre">
            Tout le catalogue
          </BoutonLien>
        </div>

        <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {velos.slice(0, 3).map((velo) => (
            <CarteVelo key={velo.id} velo={velo} />
          ))}
        </div>
      </Section>
    </>
  );
}
