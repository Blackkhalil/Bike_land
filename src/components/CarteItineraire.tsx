import Link from "next/link";

import { PaysageIllustration } from "./PaysageIllustration";
import { Pastille } from "./ui";
import type { Itineraire } from "@/lib/types";

const ambiances = {
  "route-des-peches": "littoral",
  "boucle-atacora": "montagne",
  "lacs-et-cites-lacustres": "lagune",
  "route-royale-abomey": "savane",
} as const;

export function ambiancePour(slug: string) {
  return ambiances[slug as keyof typeof ambiances] ?? "savane";
}

export function CarteItineraire({
  itineraire,
  className = "",
}: {
  itineraire: Itineraire;
  className?: string;
}) {
  return (
    <article className={`group ${className}`}>
      <Link href={`/itineraires/${itineraire.slug}`} className="block">
        <div className="overflow-hidden rounded-[1.25rem]">
          <PaysageIllustration
            ambiance={ambiancePour(itineraire.slug)}
            teintes={itineraire.teintes}
            className="w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
        </div>

        <div className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pastille ton="neutre">{itineraire.niveau}</Pastille>
            <Pastille ton="neutre">{itineraire.duree}</Pastille>
          </div>
          <h3 className="mt-4 font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[-0.02em]">
            {itineraire.titre}
          </h3>
          <p className="mt-2 text-[0.82rem] uppercase tracking-[0.1em] text-encre-500">
            {itineraire.region}
          </p>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-encre-500">{itineraire.resume}</p>
          <dl className="mt-5 flex gap-6 border-t border-encre-900/12 pt-4 text-[0.8rem]">
            <div>
              <dt className="text-encre-500">Distance</dt>
              <dd className="font-display font-bold tabular-nums">{itineraire.distanceKm} km</dd>
            </div>
            <div>
              <dt className="text-encre-500">Dénivelé</dt>
              <dd className="font-display font-bold tabular-nums">{itineraire.denivele} m</dd>
            </div>
          </dl>
        </div>
      </Link>
    </article>
  );
}
