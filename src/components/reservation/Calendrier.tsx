"use client";

import { useMemo, useState } from "react";

import { ajouterJours, aujourdhui, listerJours, versISO, type DateISO } from "@/lib/dates";
import { FERMETURE_HEURE, OUVERTURE_HEURE } from "@/data/offres";

/**
 * Calendrier de sélection du jour de location.
 *
 * Il ne sert qu'à la location libre : le road trip part à l'un des deux
 * créneaux encadrés du week-end, qui se choisissent dans le tunnel.
 *
 * Depuis que la disponibilité se compte à l'heure, un jour n'est barré
 * que lorsqu'il est réellement plein. Une sortie de 8 h à 11 h laisse le
 * vélo libre l'après-midi : le barrer serait refuser une location qui
 * peut parfaitement avoir lieu.
 */

export interface PeriodeOccupee {
  debut: DateISO;
  fin: DateISO;
  heureDebut: number;
  heureFin: number;
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

  /**
   * Pour chaque jour touché par une réservation, les heures déjà prises.
   *
   * On raisonne sur une grille d'heures plutôt que sur un simple drapeau :
   * c'est ce qui permet de distinguer « il reste de la place » de « la
   * journée est pleine ».
   */
  const heuresPrises = useMemo(() => {
    const parJour = new Map<DateISO, boolean[]>();
    for (const periode of periodesOccupees) {
      for (const jour of listerJours(periode.debut, periode.fin)) {
        const grille =
          parJour.get(jour) ?? new Array(FERMETURE_HEURE - OUVERTURE_HEURE).fill(false);
        for (let h = periode.heureDebut; h < periode.heureFin; h += 1) {
          const index = h - OUVERTURE_HEURE;
          if (index >= 0 && index < grille.length) grille[index] = true;
        }
        parJour.set(jour, grille);
      }
    }
    return parJour;
  }, [periodesOccupees]);

  /** Jours dont plus aucune heure n'est libre : eux seuls sont barrés. */
  const joursPleins = useMemo(() => {
    const ensemble = new Set<DateISO>();
    for (const [jour, grille] of heuresPrises) {
      if (grille.every(Boolean)) ensemble.add(jour);
    }
    return ensemble;
  }, [heuresPrises]);

  const mois = useMemo(
    () => Array.from({ length: nombreDeMois }, (_, decalage) => decalerMois(moisAffiche, decalage)),
    [moisAffiche, nombreDeMois],
  );

  const finProvisoire = fin ?? (debut && survol && survol > debut ? survol : null);

  const clique = (jour: DateISO) => {
    if (joursPleins.has(jour) || jour < premierJour) return;
    // Une sortie tient dans la journée : il n'y a qu'un jour à poser,
    // l'heure se choisit ensuite dans le tunnel.
    onChange(jour, null);
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
        <p className="etiquette opacity-75">Choisissez votre jour</p>
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
                const plein = joursPleins.has(jour);
                // Journée entamée mais pas pleine : on la propose quand
                // même, en signalant qu'il y reste moins de choix.
                const entame = !plein && heuresPrises.has(jour);
                const estDebut = jour === debut;
                const estFin = jour === fin;
                const dansPlage =
                  debut !== null &&
                  finProvisoire !== null &&
                  jour > debut &&
                  jour < finProvisoire;

                const indisponible = passe || plein;

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
                      plein && !passe ? "line-through decoration-orange-signal/60" : "",
                      entame && !passe ? "text-orange-sourd" : "",
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
          <span className="h-3 w-3 rounded-full bg-noir-piste" /> Votre jour
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-noir-piste/25 text-orange-sourd" />{" "}
          Partiellement réservé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-noir-piste/25 line-through decoration-orange-signal" />{" "}
          Journée complète
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
