import Image from "next/image";
import Link from "next/link";

import { VeloIllustration } from "./VeloIllustration";
import { Pastille } from "./ui";
import { GAMME_LA_PLUS_PRISE } from "@/data/offres";
import type { Velo } from "@/lib/types";

/**
 * Carte du catalogue.
 *
 * Elle ne porte ni prix, ni type, ni taille. Le prix dépend de la
 * formule choisie et non du vélo ; le type et la taille ne changent rien
 * pour le client, puisque le coordinateur règle la machine à sa
 * morphologie au départ. Les afficher laisserait croire qu'il faut en
 * tenir compte.
 *
 * Restent le nom, le visuel et l'accroche, ce qui aide vraiment à
 * choisir, plus le seul état qui compte : le vélo est-il disponible. Les
 * vélos de la gamme la plus prise (le Premium) le disent : c'est le
 * repère que cherche un client qui hésite.
 *
 * Le visuel est la photo, jamais la vidéo du vélo : seule la vidéo de
 * l'accueil est gardée sur le site. Onze vidéos de deux ou trois
 * mégaoctets ralentissaient le catalogue, sur un réseau mobile surtout.
 */
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
  const lePlusPris = velo.gamme === GAMME_LA_PLUS_PRISE;
  const href = `/velos/${velo.slug}${parametresReservation ? `?${parametresReservation}` : ""}`;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-[var(--radius-carte)] bg-noir-releve ${className}`}
    >
      <Link href={href} className="flex flex-1 flex-col">
        <div className="relative grid aspect-4/3 place-items-center overflow-hidden bg-craie">
          {velo.photo ? (
            <Image
              src={velo.photo}
              alt={velo.nom}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <VeloIllustration
              categorie={velo.categorie}
              teintes={velo.teintes}
              className="w-[110%] max-w-none px-5"
            />
          )}
          {(indisponible || lePlusPris) && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {lePlusPris && <Pastille ton="sombre">Le plus pris</Pastille>}
              {indisponible && <Pastille ton="alerte">En entretien</Pastille>}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="titre-editorial text-[1.4rem] text-craie">{velo.nom}</h3>
          <p className="mt-2 flex-1 text-[0.9rem] leading-relaxed text-craie/60">{velo.accroche}</p>
        </div>
      </Link>
    </article>
  );
}
