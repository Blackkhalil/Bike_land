"use client";

import { useState } from "react";

import { teinteUnique } from "./palette";
import {
  CadreGraphique,
  TableauDeSecours,
  appliquerFormat,
  type NomFormat,
  type Point,
} from "./primitives";

/**
 * Barres horizontales pour catégories nominales aux noms longs
 * (moyens de paiement, vélos, points de départ).
 *
 * Une seule teinte, la valeur écrite au bout de la barre : la longueur
 * porte la magnitude, le libellé porte l'identité. Aucun besoin de
 * légende ni de couleur supplémentaire.
 */
export function BarresHorizontales({
  titre,
  sousTitre,
  points,
  format,
  uniteInfobulle,
  actions,
  limite,
}: {
  titre: string;
  sousTitre?: string;
  points: Point[];
  format: NomFormat;
  uniteInfobulle: string;
  actions?: React.ReactNode;
  limite?: number;
}) {
  const formater = (valeur: number) => appliquerFormat(format, valeur);
  const [survol, setSurvol] = useState<string | null>(null);
  const affiches = limite ? points.slice(0, limite) : points;
  const maximum = Math.max(...affiches.map((point) => point.valeur), 1);

  return (
    <CadreGraphique titre={titre} sousTitre={sousTitre} actions={actions}>
      {affiches.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-gris-cadre">Aucune donnée sur la période.</p>
      ) : (
        <ul className="space-y-3.5">
          {affiches.map((point) => {
            const proportion = (point.valeur / maximum) * 100;
            return (
              <li
                key={point.clef}
                onMouseEnter={() => setSurvol(point.clef)}
                onMouseLeave={() => setSurvol(null)}
              >
                <div className="flex items-baseline justify-between gap-4 text-[0.85rem]">
                  <span className="min-w-0 break-words">{point.etiquette}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formater(point.valeur)}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full rounded-full bg-craie-ombre">
                  <div
                    className="h-2.5 rounded-full transition-opacity duration-150"
                    style={{
                      width: `${Math.max(proportion, point.valeur > 0 ? 2 : 0)}%`,
                      background: teinteUnique,
                      opacity: survol === null || survol === point.clef ? 1 : 0.5,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TableauDeSecours
        legende={titre}
        colonnes={["Libellé", uniteInfobulle]}
        lignes={affiches.map((point) => [point.etiquette, formater(point.valeur)])}
      />
    </CadreGraphique>
  );
}
