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
    <div className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6">
      <p className="text-[0.85rem] font-medium text-gris-cadre">{libelle}</p>
      <p className="mt-2 font-display text-[2.1rem] leading-none tabular-nums text-noir-piste">
        {valeur}
      </p>

      {variation !== null ? (
        <p
          className={`mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold ${
            favorable ? "text-vert-lagune" : "text-orange-sourd"
          }`}
        >
          <span aria-hidden="true">{positif ? "▲" : "▼"}</span>
          {formatNombre(Math.abs(variation), 1)} %
          <span className="font-normal text-gris-cadre">par rapport à la période précédente</span>
        </p>
      ) : (
        aide && <p className="mt-3 text-[0.8rem] leading-relaxed text-gris-cadre">{aide}</p>
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
    <div className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6">
      <p className="text-[0.85rem] font-medium text-gris-cadre">{libelle}</p>
      <p className="mt-2 font-display text-[2.1rem] leading-none tabular-nums text-noir-piste">
        {formatNombre(pourcentage, 1)} %
      </p>
      <div
        className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-craie-ombre"
        role="meter"
        aria-valuenow={Math.round(borne)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={libelle}
      >
        <div className="h-full rounded-full bg-orange-signal" style={{ width: `${borne}%` }} />
      </div>
      <p className="mt-3 text-[0.8rem] leading-relaxed text-gris-cadre">{detail}</p>
    </div>
  );
}
