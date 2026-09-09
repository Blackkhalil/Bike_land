import Link from "next/link";

import { VeloIllustration } from "./VeloIllustration";
import { Etoiles, Pastille } from "./ui";
import { libellesCategorie } from "@/data/catalogue";
import { formatXof } from "@/lib/format";
import type { Velo } from "@/lib/types";

/** Carte du catalogue : visuel, catégorie, taille, prix journalier. */
export function CarteVelo({
  velo,
  parametresReservation,
  className = "",
}: {
  velo: Velo;
  /** Dates déjà choisies, propagées vers la fiche pour ne pas les ressaisir. */
  parametresReservation?: string;
  className?: string;
}) {
  const indisponible = velo.statut === "MAINTENANCE" || velo.statut === "RETIRE";
  const href = `/velos/${velo.slug}${parametresReservation ? `?${parametresReservation}` : ""}`;

  return (
    <article className={`group relative flex flex-col ${className}`}>
      <Link href={href} className="flex flex-1 flex-col">
        <div
          className="relative grid aspect-5/4 place-items-center overflow-hidden rounded-[1.25rem] px-5"
          style={{ background: `linear-gradient(155deg, ${velo.teintes[1]} 0%, #ffffff 100%)` }}
        >
          <VeloIllustration
            categorie={velo.categorie}
            teintes={velo.teintes}
            className="w-[112%] max-w-none transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1.5 group-hover:scale-[1.03]"
          />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <Pastille ton="sombre">{libellesCategorie[velo.categorie]}</Pastille>
            {indisponible && <Pastille ton="alerte">En entretien</Pastille>}
          </div>
          <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-[0.72rem] font-bold">
            {velo.taille}
          </span>
        </div>

        <div className="flex flex-1 flex-col pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-display text-[1.3rem] font-extrabold uppercase leading-none tracking-[-0.02em]">
              {velo.nom}
            </h3>
            <p className="shrink-0 font-display text-[1.05rem] font-bold text-terre-700">
              {formatXof(velo.prixJourXof)}
              <span className="text-[0.72rem] font-medium text-encre-500"> / jour</span>
            </p>
          </div>

          <p className="mt-2 flex-1 text-[0.9rem] leading-relaxed text-encre-500">{velo.accroche}</p>

          <div className="mt-4 flex items-center gap-3 border-t border-encre-900/12 pt-4 text-[0.78rem] text-encre-500">
            <Etoiles note={velo.noteMoyenne} className="text-soleil-500" />
            <span className="tabular-nums">
              {velo.noteMoyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}
            </span>
            <span aria-hidden="true">·</span>
            <span>{velo.nombreAvis} avis</span>
            <span aria-hidden="true">·</span>
            <span>{velo.autonomieConseilleeKm} km / jour</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
