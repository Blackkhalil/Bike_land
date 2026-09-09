import { formatNombre } from "@/lib/format";
import type { IndicateurCompare } from "@/lib/statistiques";

/**
 * Tuile d'indicateur : un libellé, une valeur, et la variation par
 * rapport à la période précédente.
 *
 * La variation n'est jamais portée par la seule couleur : une flèche et
 * le mot « par rapport à » l'accompagnent toujours.
 */
export function TuileStat({
  libelle,
  valeur,
  indicateur,
  aide,
  /** Une baisse est-elle une bonne nouvelle ? Vrai pour le taux d'annulation. */
  baisseSouhaitable = false,
}: {
  libelle: string;
  valeur: string;
  indicateur?: IndicateurCompare;
  aide?: string;
  baisseSouhaitable?: boolean;
}) {
  const variation = indicateur?.variation ?? null;
  const positif = variation !== null && variation >= 0;
  const favorable = variation === null ? null : baisseSouhaitable ? !positif : positif;

  return (
    <div className="rounded-[1.25rem] bg-white p-6">
      <p className="etiquette opacity-55">{libelle}</p>
      <p className="mt-3 font-display text-[2rem] font-extrabold leading-none tabular-nums">
        {valeur}
      </p>

      {variation !== null ? (
        <p
          className={`mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold ${
            favorable ? "text-olive-600" : "text-terre-700"
          }`}
        >
          <span aria-hidden="true">{positif ? "▲" : "▼"}</span>
          {formatNombre(Math.abs(variation), 1)} %
          <span className="font-normal text-encre-500">par rapport à la période précédente</span>
        </p>
      ) : (
        aide && <p className="mt-3 text-[0.8rem] text-encre-500">{aide}</p>
      )}
    </div>
  );
}

/**
 * Jauge d'un ratio contre une limite : la piste et le remplissage sont
 * deux pas de la même rampe, et la valeur est écrite en toutes lettres.
 */
export function Jauge({
  libelle,
  pourcentage,
  detail,
}: {
  libelle: string;
  pourcentage: number;
  detail: string;
}) {
  const borne = Math.min(Math.max(pourcentage, 0), 100);

  return (
    <div className="rounded-[1.25rem] bg-white p-6">
      <p className="etiquette opacity-55">{libelle}</p>
      <p className="mt-3 font-display text-[2rem] font-extrabold leading-none tabular-nums">
        {formatNombre(pourcentage, 1)} %
      </p>
      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-terre-100"
        role="meter"
        aria-valuenow={Math.round(borne)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={libelle}
      >
        <div className="h-full rounded-full bg-terre-600" style={{ width: `${borne}%` }} />
      </div>
      <p className="mt-3 text-[0.8rem] text-encre-500">{detail}</p>
    </div>
  );
}
