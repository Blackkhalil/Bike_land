"use client";

import { useId, useState } from "react";

import { formatNombre, formatPourcentage, formatXof } from "@/lib/format";
import { encreSecondaire, grille, surface } from "./palette";

/**
 * Briques communes aux graphiques : cadre, axes, infobulle.
 *
 * Tous les graphiques sont dessinés en SVG à la main plutôt qu'avec une
 * bibliothèque : les formes sont peu nombreuses, entièrement maîtrisées,
 * et cela évite d'embarquer 150 ko de JavaScript pour six graphiques.
 */

export interface Point {
  clef: string;
  etiquette: string;
  valeur: number;
}

/**
 * Format d'affichage des valeurs.
 *
 * Désigné par un nom plutôt que par une fonction : les composants de
 * graphique sont des composants client, et une fonction ne peut pas
 * franchir la frontière serveur/client.
 */
export type NomFormat = "xof" | "nombre" | "pourcentage";

export function appliquerFormat(nom: NomFormat, valeur: number): string {
  switch (nom) {
    case "xof":
      return formatXof(valeur);
    case "pourcentage":
      return formatPourcentage(valeur, 1);
    default:
      return formatNombre(valeur);
  }
}

export function CadreGraphique({
  titre,
  sousTitre,
  actions,
  children,
  className = "",
}: {
  titre: string;
  sousTitre?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={`rounded-[1.25rem] bg-white p-6 ${className}`}>
      <figcaption className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[1rem] font-bold uppercase tracking-tight">{titre}</h3>
          {sousTitre && <p className="mt-1 text-[0.8rem] text-encre-500">{sousTitre}</p>}
        </div>
        {actions}
      </figcaption>
      <div className="mt-6">{children}</div>
    </figure>
  );
}

/** Infobulle positionnée en coordonnées de pixels dans le conteneur. */
export function Infobulle({
  x,
  y,
  titre,
  lignes,
  largeurConteneur,
}: {
  x: number;
  y: number;
  titre: string;
  lignes: { libelle: string; valeur: string; couleur?: string }[];
  largeurConteneur: number;
}) {
  // On bascule l'infobulle du côté opposé quand elle sortirait du cadre.
  const versLaGauche = x > largeurConteneur - 150;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[9rem] rounded-xl bg-encre-900 px-3.5 py-2.5 text-sable-50 shadow-lg"
      style={{
        left: versLaGauche ? undefined : x + 12,
        right: versLaGauche ? largeurConteneur - x + 12 : undefined,
        top: Math.max(y - 12, 0),
      }}
    >
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] opacity-70">{titre}</p>
      <ul className="mt-1.5 space-y-1">
        {lignes.map((ligne) => (
          <li key={ligne.libelle} className="flex items-center gap-2 text-[0.82rem]">
            {ligne.couleur && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: ligne.couleur }}
              />
            )}
            <span className="opacity-70">{ligne.libelle}</span>
            <span className="ml-auto font-semibold tabular-nums">{ligne.valeur}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Repli textuel : le même contenu, lisible sans couleur ni survol. */
export function TableauDeSecours({
  colonnes,
  lignes,
  legende,
}: {
  colonnes: string[];
  lignes: (string | number)[][];
  legende: string;
}) {
  const identifiant = useId();
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="mt-5 border-t border-encre-900/10 pt-3">
      <button
        type="button"
        onClick={() => setOuvert((etat) => !etat)}
        aria-expanded={ouvert}
        aria-controls={identifiant}
        className="text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-encre-500 transition-colors hover:text-encre-900"
      >
        {ouvert ? "Masquer" : "Voir"} les valeurs
      </button>
      <div id={identifiant} hidden={!ouvert} className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.82rem]">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr className="border-b border-encre-900/15">
              {colonnes.map((colonne) => (
                <th key={colonne} scope="col" className="py-2 pr-4 font-semibold">
                  {colonne}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => (
              <tr key={String(ligne[0])} className="border-b border-encre-900/8">
                {ligne.map((cellule, index) => (
                  <td
                    key={index}
                    className={`py-2 pr-4 ${index > 0 ? "tabular-nums" : ""}`}
                  >
                    {cellule}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Graduations horizontales, arrondies à des valeurs lisibles. */
export function graduations(maximum: number, nombre = 4): number[] {
  if (maximum <= 0) return [0];
  const brut = maximum / nombre;
  const magnitude = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((facteur) => facteur * magnitude).find((valeur) => valeur >= brut) ?? magnitude * 10;
  const graduations: number[] = [];
  for (let valeur = 0; valeur <= maximum + pas * 0.001; valeur += pas) graduations.push(valeur);
  return graduations;
}

export function LignesGrille({
  valeurs,
  hauteur,
  largeur,
  maximum,
  formater,
  margeGauche,
}: {
  valeurs: number[];
  hauteur: number;
  largeur: number;
  maximum: number;
  formater: (valeur: number) => string;
  margeGauche: number;
}) {
  return (
    <g>
      {valeurs.map((valeur) => {
        const y = hauteur - (valeur / maximum) * hauteur;
        return (
          <g key={valeur}>
            <line
              x1={margeGauche}
              y1={y}
              x2={largeur}
              y2={y}
              stroke={grille}
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={margeGauche - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill={encreSecondaire}
            >
              {formater(valeur)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export const COULEUR_SURFACE = surface;
