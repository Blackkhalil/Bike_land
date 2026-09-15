import Image from "next/image";
import Link from "next/link";

import { PaysageIllustration } from "./PaysageIllustration";
import { Pastille } from "./ui";
import type { Itineraire } from "@/lib/types";

const ambiances = {
  "route-des-peches-togbin": "littoral",
  "route-des-peches-amazone": "lagune",
} as const;

export function ambiancePour(slug: string) {
  return ambiances[slug as keyof typeof ambiances] ?? "littoral";
}

export function CarteItineraire({
  itineraire,
  className = "",
}: {
  itineraire: Itineraire;
  className?: string;
}) {
  return (
    <article className={`overflow-hidden rounded-[var(--radius-carte)] bg-craie text-noir-piste ${className}`}>
      <Link href={`/itineraires/${itineraire.slug}`} className="block">
        <div className="relative aspect-16/10 overflow-hidden">
          {itineraire.photo ? (
            <Image
              src={itineraire.photo}
              alt={`${itineraire.titre} — ${itineraire.region}`}
              fill
              sizes="(min-width: 768px) 400px, 100vw"
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

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pastille ton="neutre">{itineraire.niveau}</Pastille>
            <Pastille ton="neutre">{itineraire.duree}</Pastille>
          </div>
          <h3 className="titre-editorial mt-4 text-[1.4rem]">{itineraire.titre}</h3>
          <p className="mt-1.5 text-[0.85rem] text-gris-cadre">{itineraire.region}</p>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">{itineraire.resume}</p>
          <dl className="mt-5 flex gap-6 border-t border-noir-piste/15 pt-4 text-[0.8rem]">
            <div>
              <dt className="text-gris-cadre">Distance</dt>
              <dd className="font-display text-[1.1rem] tabular-nums">{itineraire.distanceKm} km</dd>
            </div>
            <div>
              <dt className="text-gris-cadre">Dénivelé</dt>
              <dd className="font-display text-[1.1rem] tabular-nums">{itineraire.denivele} m</dd>
            </div>
          </dl>
        </div>
      </Link>
    </article>
  );
}
