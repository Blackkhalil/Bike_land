"use client";

import { useMemo, useState } from "react";

import {
  ajouterJours,
  aujourdhui,
  listerJours,
  periodesSeChevauchent,
  versISO,
  type DateISO,
} from "@/lib/dates";

/**
 * Calendrier de sélection d'une période de location.
 *
 * Les jours déjà pris pour ce vélo précis sont désactivés : c'est la
 * traduction visible de la disponibilité temps réel du §2.1. Une période
 * qui enjamberait un jour occupé est refusée au moment du second clic.
 */

export interface PeriodeOccupee {
  debut: DateISO;
  fin: DateISO;
}

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

export function Calendrier({
  periodesOccupees,
  debut,
  fin,
  onChange,
  nombreDeMois = 2,
}: {
  periodesOccupees: PeriodeOccupee[];
  debut: DateISO | null;
  fin: DateISO | null;
  onChange: (debut: DateISO | null, fin: DateISO | null) => void;
  nombreDeMois?: number;
}) {
  const premierJour = aujourdhui();
  const [moisAffiche, setMoisAffiche] = useState(() => premierJour.slice(0, 7));
  const [survol, setSurvol] = useState<DateISO | null>(null);

  const joursOccupes = useMemo(() => {
    const ensemble = new Set<DateISO>();
    for (const periode of periodesOccupees) {
      for (const jour of listerJours(periode.debut, periode.fin)) ensemble.add(jour);
    }
    return ensemble;
  }, [periodesOccupees]);

  const mois = useMemo(
    () => Array.from({ length: nombreDeMois }, (_, decalage) => decalerMois(moisAffiche, decalage)),
    [moisAffiche, nombreDeMois],
  );

  const finProvisoire = fin ?? (debut && survol && survol > debut ? survol : null);

  const clique = (jour: DateISO) => {
    if (joursOccupes.has(jour) || jour < premierJour) return;

    // Premier clic, ou redémarrage d'une sélection : on pose le départ.
    if (!debut || fin || jour < debut) {
      onChange(jour, null);
      return;
    }

    // Second clic : refus si un jour occupé se trouve dans l'intervalle.
    const conflit = periodesOccupees.some((periode) =>
      periodesSeChevauchent(debut, jour, periode.debut, periode.fin),
    );
    if (conflit) {
      onChange(jour, null);
      return;
    }
    onChange(debut, jour);
  };

  const peutReculer = moisAffiche > premierJour.slice(0, 7);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMoisAffiche(decalerMois(moisAffiche, -1))}
          disabled={!peutReculer}
          className="grid h-8 w-8 place-items-center rounded-full border border-noir-piste/20 transition-colors hover:bg-noir-piste/5 disabled:opacity-25"
          aria-label="Mois précédent"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <p className="etiquette opacity-75">Choisissez vos dates</p>
        <button
          type="button"
          onClick={() => setMoisAffiche(decalerMois(moisAffiche, 1))}
          className="grid h-8 w-8 place-items-center rounded-full border border-noir-piste/20 transition-colors hover:bg-noir-piste/5"
          aria-label="Mois suivant"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className={`grid gap-6 ${nombreDeMois > 1 ? "sm:grid-cols-2" : ""}`}>
        {mois.map((clefMois) => (
          <div key={clefMois}>
            <p className="mb-3 text-center text-[0.82rem] font-semibold capitalize">
              {nomDuMois(clefMois)}
            </p>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {JOURS.map((jour, index) => (
                <abbr
                  key={`${jour}-${index}`}
                  className="pb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gris-cadre no-underline"
                >
                  {jour}
                </abbr>
              ))}

              {cellulesDuMois(clefMois).map((jour, index) => {
                if (!jour) return <span key={`vide-${index}`} />;

                const passe = jour < premierJour;
                const occupe = joursOccupes.has(jour);
                const estDebut = jour === debut;
                const estFin = jour === fin;
                const dansPlage =
                  debut !== null &&
                  finProvisoire !== null &&
                  jour > debut &&
                  jour < finProvisoire;

                const indisponible = passe || occupe;

                return (
                  <button
                    key={jour}
                    type="button"
                    disabled={indisponible}
                    onClick={() => clique(jour)}
                    onMouseEnter={() => setSurvol(jour)}
                    onMouseLeave={() => setSurvol(null)}
                    aria-label={jour}
                    aria-pressed={estDebut || estFin}
                    className={[
                      "relative mx-auto grid h-8 w-8 place-items-center rounded-full text-[0.8rem] tabular-nums transition-colors duration-150",
                      indisponible
                        ? "cursor-not-allowed text-noir-piste/25"
                        : "hover:bg-orange-signal/20",
                      occupe && !passe ? "line-through decoration-orange-signal/60" : "",
                      estDebut || estFin ? "bg-noir-piste font-semibold text-craie hover:bg-noir-piste" : "",
                      dansPlage ? "bg-orange-signal/20 text-orange-sourd" : "",
                    ].join(" ")}
                  >
                    {Number(jour.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.72rem] text-gris-cadre">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-noir-piste" /> Vos dates
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-orange-signal/20" /> Période retenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-noir-piste/25 line-through decoration-orange-signal" />{" "}
          Déjà loué
        </span>
      </p>
    </div>
  );
}

function decalerMois(clef: string, decalage: number): string {
  const [annee, mois] = clef.split("-").map(Number);
  const date = new Date(Date.UTC(annee, mois - 1 + decalage, 1));
  return versISO(date).slice(0, 7);
}

function nomDuMois(clef: string): string {
  const [annee, mois] = clef.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(annee, mois - 1, 1)),
  );
}

/** Cellules du mois, précédées des vides nécessaires pour démarrer un lundi. */
function cellulesDuMois(clef: string): (DateISO | null)[] {
  const [annee, mois] = clef.split("-").map(Number);
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  const nombreDeJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();

  // getUTCDay() renvoie 0 pour dimanche : on ramène la semaine au lundi.
  const decalage = (premier.getUTCDay() + 6) % 7;

  const cellules: (DateISO | null)[] = Array.from({ length: decalage }, () => null);
  const premierJourISO = versISO(premier);
  for (let index = 0; index < nombreDeJours; index += 1) {
    cellules.push(ajouterJours(premierJourISO, index));
  }
  return cellules;
}
