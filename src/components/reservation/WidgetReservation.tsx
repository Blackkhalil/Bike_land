"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { optionsLocation } from "@/data/catalogue";
import { formatXof } from "@/lib/format";
import { calculerDevis } from "@/lib/tarification";
import type { Velo } from "@/lib/types";
import type { DateISO } from "@/lib/dates";
import { Calendrier, type PeriodeOccupee } from "./Calendrier";

/**
 * Encart de réservation de la fiche produit.
 *
 * Le devis est recalculé en direct avec `calculerDevis`, la même fonction
 * que celle utilisée par l'API : le montant affiché ici est exactement
 * celui qui sera enregistré, sans recalcul divergent.
 */
export function WidgetReservation({
  velo,
  periodesOccupees,
  datesInitiales,
}: {
  velo: Velo;
  periodesOccupees: PeriodeOccupee[];
  datesInitiales?: { debut: DateISO; fin: DateISO };
}) {
  const routeur = useRouter();
  const [debut, setDebut] = useState<DateISO | null>(datesInitiales?.debut ?? null);
  const [fin, setFin] = useState<DateISO | null>(datesInitiales?.fin ?? null);
  const [optionsChoisies, setOptionsChoisies] = useState<string[]>([]);
  const [redirection, setRedirection] = useState(false);

  const indisponible = velo.statut === "MAINTENANCE" || velo.statut === "RETIRE";

  const devis = useMemo(() => {
    if (!debut || !fin) return null;
    return calculerDevis(
      velo,
      debut,
      fin,
      optionsChoisies.map((code) => ({ code, quantite: 1 })),
    );
  }, [velo, debut, fin, optionsChoisies]);

  const basculerOption = (code: string) => {
    setOptionsChoisies((actuelles) =>
      actuelles.includes(code) ? actuelles.filter((c) => c !== code) : [...actuelles, code],
    );
  };

  const continuer = () => {
    if (!debut || !fin) return;
    setRedirection(true);
    const parametres = new URLSearchParams({ velo: velo.slug, debut, fin });
    optionsChoisies.forEach((code) => parametres.append("option", code));
    routeur.push(`/reservation?${parametres}`);
  };

  return (
    <div className="rounded-[1.5rem] bg-white p-6 shadow-[0_24px_60px_-40px_rgba(42,35,30,0.5)] sm:p-7">
      <div className="flex items-baseline justify-between gap-4 border-b border-encre-900/12 pb-5">
        <p className="font-display text-[1.6rem] font-extrabold leading-none text-terre-700">
          {formatXof(velo.prixJourXof)}
          <span className="text-[0.8rem] font-medium text-encre-500"> / jour</span>
        </p>
        <p className="text-right text-[0.75rem] leading-tight text-encre-500">
          Caution {formatXof(velo.cautionXof)}
          <br />
          libérée sous 48 h
        </p>
      </div>

      {indisponible ? (
        <div className="mt-6 rounded-2xl bg-soleil-300/30 p-5 text-[0.9rem] leading-relaxed text-terre-800">
          Ce vélo est actuellement à l&apos;atelier. Écrivez-nous pour connaître sa date de
          retour ou pour qu&apos;on vous propose un modèle équivalent.
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Calendrier
              periodesOccupees={periodesOccupees}
              debut={debut}
              fin={fin}
              nombreDeMois={1}
              onChange={(nouveauDebut, nouvelleFin) => {
                setDebut(nouveauDebut);
                setFin(nouvelleFin);
              }}
            />
          </div>

          <fieldset className="mt-7 border-t border-encre-900/12 pt-5">
            <legend className="etiquette mb-3 opacity-55">Options</legend>
            <div className="space-y-2.5">
              {optionsLocation.map((option) => (
                <label
                  key={option.code}
                  className="flex cursor-pointer items-start gap-3 text-[0.86rem] leading-snug"
                >
                  <input
                    type="checkbox"
                    checked={optionsChoisies.includes(option.code)}
                    onChange={() => basculerOption(option.code)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#b04726]"
                  />
                  <span className="flex-1">
                    {option.libelle}
                    <span className="block text-[0.78rem] text-encre-500">
                      {formatXof(option.prixXof)} {option.unite === "jour" ? "/ jour" : "forfait"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {devis && (
            <dl className="mt-6 space-y-2 border-t border-encre-900/12 pt-5 text-[0.85rem]">
              {devis.lignes.map((ligne) => (
                <div key={ligne.libelle} className="flex justify-between gap-4">
                  <dt className="text-encre-500">{ligne.libelle}</dt>
                  <dd className="shrink-0 tabular-nums">
                    {ligne.montantXof < 0 ? "− " : ""}
                    {formatXof(Math.abs(ligne.montantXof))}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-encre-900/12 pt-3 font-display text-[1.05rem] font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatXof(devis.totalXof)}</dd>
              </div>
              {devis.cautionXof > 0 && (
                <p className="pt-1 text-[0.76rem] text-encre-500">
                  + caution de {formatXof(devis.cautionXof)}, pré-autorisée puis libérée au retour.
                  L&apos;assurance sérénité la remplace.
                </p>
              )}
            </dl>
          )}

          <Bouton
            onClick={continuer}
            disabled={!debut || !fin || redirection}
            taille="lg"
            className="mt-6 w-full"
          >
            {redirection
              ? "Un instant…"
              : !debut
                ? "Choisissez une date de départ"
                : !fin
                  ? "Choisissez une date de retour"
                  : `Réserver ${devis?.jours ?? 0} jour${(devis?.jours ?? 0) > 1 ? "s" : ""}`}
          </Bouton>

          <p className="mt-3 text-center text-[0.76rem] text-encre-500">
            Aucun compte à créer. Paiement à la dernière étape.
          </p>
        </>
      )}
    </div>
  );
}
