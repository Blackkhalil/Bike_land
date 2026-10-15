"use client";

import { useEffect, useRef, useState } from "react";

import { formatNombre } from "@/lib/format";
import { encreSecondaire, teinteUnique } from "./palette";
import {
  CadreGraphique,
  Infobulle,
  LignesGrille,
  TableauDeSecours,
  graduations,
  intervalleEtiquettes,
  type Point,
} from "./primitives";

/**
 * Colonnes, série unique et catégories nominales : toutes les barres
 * portent la même teinte. Colorer chaque barre selon sa valeur
 * re-encoderait en couleur ce que la hauteur dit déjà.
 */

const HAUTEUR = 200;
const MARGE_GAUCHE = 34;
const MARGE_HAUTE = 12;
const MARGE_BASSE = 26;
const EPAISSEUR_MAX = 24;

export function Colonnes({
  titre,
  sousTitre,
  points,
  uniteInfobulle,
  actions,
}: {
  titre: string;
  sousTitre?: string;
  points: Point[];
  uniteInfobulle: string;
  actions?: React.ReactNode;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<number | null>(null);
  const [largeur, setLargeur] = useState(720);
  const vide = points.length === 0;

  // Le dessin suit la largeur réelle du cadre, mesurée dès l'affichage puis
  // à chaque redimensionnement : un viewBox fixe de 720, réduit à la largeur
  // d'un téléphone, ramenait les étiquettes de 11 px à 4 px.
  useEffect(() => {
    const element = conteneur.current;
    if (!element) return;
    const observateur = new ResizeObserver(([entree]) => {
      const mesure = Math.round(entree.contentRect.width);
      if (mesure > 0) setLargeur(mesure);
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [vide]);

  if (vide) {
    return (
      <CadreGraphique titre={titre} sousTitre={sousTitre} actions={actions}>
        <p className="py-12 text-center text-[0.9rem] text-gris-cadre">Aucune donnée sur la période.</p>
      </CadreGraphique>
    );
  }

  const maximum = Math.max(...points.map((point) => point.valeur), 1);
  const echelle = graduations(maximum);
  const plafond = Math.max(...echelle, maximum);

  const zoneLargeur = largeur - MARGE_GAUCHE - 12;
  const zoneHauteur = HAUTEUR - MARGE_HAUTE - MARGE_BASSE;
  const pas = zoneLargeur / points.length;
  const epaisseur = Math.min(pas - 8, EPAISSEUR_MAX);
  const intervalle = intervalleEtiquettes(pas);

  return (
    <CadreGraphique titre={titre} sousTitre={sousTitre} actions={actions}>
      <div ref={conteneur} className="relative" onMouseLeave={() => setSurvol(null)}>
        <svg
          viewBox={`0 0 ${largeur} ${HAUTEUR}`}
          className="w-full"
          role="img"
          aria-label={`${titre}, ${points.length} périodes`}
        >
          <LignesGrille
            valeurs={echelle}
            hauteur={MARGE_HAUTE + zoneHauteur}
            largeur={largeur - 12}
            maximum={plafond}
            margeGauche={MARGE_GAUCHE}
            formater={(valeur) => formatNombre(valeur)}
          />

          {points.map((point, index) => {
            const hauteurBarre = (point.valeur / plafond) * zoneHauteur;
            const x = MARGE_GAUCHE + index * pas + (pas - epaisseur) / 2;
            const y = MARGE_HAUTE + zoneHauteur - hauteurBarre;
            const rayon = Math.min(4, hauteurBarre / 2);

            return (
              <g key={point.clef}>
                {/* Zone de survol plus large que la barre elle-même */}
                <rect
                  x={MARGE_GAUCHE + index * pas}
                  y={MARGE_HAUTE}
                  width={pas}
                  height={zoneHauteur}
                  fill="transparent"
                  onMouseEnter={() => setSurvol(index)}
                />
                <path
                  d={
                    hauteurBarre <= 0
                      ? ""
                      : `M${x} ${y + hauteurBarre}V${y + rayon}a${rayon} ${rayon} 0 0 1 ${rayon} -${rayon}h${
                          epaisseur - rayon * 2
                        }a${rayon} ${rayon} 0 0 1 ${rayon} ${rayon}V${y + hauteurBarre}Z`
                  }
                  fill={teinteUnique}
                  opacity={survol === null || survol === index ? 1 : 0.45}
                  className="transition-opacity duration-150"
                  pointerEvents="none"
                />
              </g>
            );
          })}

          {points.map((point, index) => {
            if ((points.length - 1 - index) % intervalle !== 0) return null;
            return (
              <text
                key={point.clef}
                x={MARGE_GAUCHE + index * pas + pas / 2}
                y={HAUTEUR - 6}
                textAnchor="middle"
                fontSize="11"
                fill={encreSecondaire}
              >
                {point.etiquette}
              </text>
            );
          })}
        </svg>

        {survol !== null && (
          <Infobulle
            x={MARGE_GAUCHE + survol * pas + pas / 2}
            y={MARGE_HAUTE + zoneHauteur - (points[survol].valeur / plafond) * zoneHauteur}
            titre={points[survol].etiquette}
            lignes={[
              {
                libelle: uniteInfobulle,
                valeur: formatNombre(points[survol].valeur),
                couleur: teinteUnique,
              },
            ]}
            largeurConteneur={largeur}
          />
        )}
      </div>

      <TableauDeSecours
        legende={titre}
        colonnes={["Période", uniteInfobulle]}
        lignes={points.map((point) => [point.etiquette, formatNombre(point.valeur)])}
      />
    </CadreGraphique>
  );
}
