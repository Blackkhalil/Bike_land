"use client";

import { categoriel } from "./palette";
import {
  CadreGraphique,
  TableauDeSecours,
  appliquerFormat,
  type NomFormat,
  type Point,
} from "./primitives";

/**
 * Part-à-tout sur une barre empilée horizontale.
 *
 * Deux emplacements catégoriels au maximum ici : c'est ce que la palette
 * tient lorsque n'importe quelle paire peut se retrouver côte à côte. Un
 * intervalle de 2 px de la couleur du fond sépare les segments — c'est le
 * vide qui les distingue, pas un contour.
 */
export function BarreEmpilee({
  titre,
  sousTitre,
  segments,
  format,
}: {
  titre: string;
  sousTitre?: string;
  segments: Point[];
  format: NomFormat;
}) {
  const formater = (valeur: number) => appliquerFormat(format, valeur);
  const total = segments.reduce((somme, segment) => somme + segment.valeur, 0);

  return (
    <CadreGraphique titre={titre} sousTitre={sousTitre}>
      {total === 0 ? (
        <p className="py-8 text-center text-[0.9rem] text-encre-500">Aucune donnée sur la période.</p>
      ) : (
        <>
          <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
            {segments.map((segment, index) => (
              <div
                key={segment.clef}
                style={{
                  width: `${(segment.valeur / total) * 100}%`,
                  background: categoriel[index % categoriel.length],
                }}
                className="first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>

          {/* Légende toujours présente dès deux séries, et étiquetage direct */}
          <ul className="mt-5 space-y-2.5">
            {segments.map((segment, index) => (
              <li key={segment.clef} className="flex items-center gap-2.5 text-[0.85rem]">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: categoriel[index % categoriel.length] }}
                />
                <span>{segment.etiquette}</span>
                <span className="ml-auto font-semibold tabular-nums">{formater(segment.valeur)}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-encre-500">
                  {Math.round((segment.valeur / total) * 100)} %
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <TableauDeSecours
        legende={titre}
        colonnes={["Segment", "Valeur", "Part"]}
        lignes={segments.map((segment) => [
          segment.etiquette,
          formater(segment.valeur),
          total > 0 ? `${Math.round((segment.valeur / total) * 100)} %` : "—",
        ])}
      />
    </CadreGraphique>
  );
}
