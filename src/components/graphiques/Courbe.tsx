"use client";

import { useRef, useState } from "react";

import { formatXof, formatXofCourt } from "@/lib/format";
import { categoriel, encreSecondaire, grille, surface } from "./palette";
import {
  CadreGraphique,
  Infobulle,
  LignesGrille,
  TableauDeSecours,
  graduations,
  type Point,
} from "./primitives";

/**
 * Courbe d'évolution, série unique.
 *
 * Une seule série : pas de légende (le titre nomme ce qui est tracé), un
 * lavis d'aire à 10 % sous le trait de 2 px, un point terminal cerclé de
 * la couleur du fond, et un curseur au survol avec infobulle.
 */

const HAUTEUR = 220;
const MARGE_GAUCHE = 52;
const MARGE_HAUTE = 12;
const MARGE_BASSE = 26;

export function Courbe({
  titre,
  sousTitre,
  points,
  actions,
  dernierPointPartiel = false,
}: {
  titre: string;
  sousTitre?: string;
  points: Point[];
  actions?: React.ReactNode;
  /** Le dernier point couvre-t-il une période encore en cours ? */
  dernierPointPartiel?: boolean;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<number | null>(null);
  const [largeur, setLargeur] = useState(720);

  if (points.length === 0) {
    return (
      <CadreGraphique titre={titre} sousTitre={sousTitre} actions={actions}>
        <p className="py-12 text-center text-[0.9rem] text-encre-500">Aucune donnée sur la période.</p>
      </CadreGraphique>
    );
  }

  const maximum = Math.max(...points.map((point) => point.valeur), 1);
  const echelle = graduations(maximum);
  const plafond = Math.max(...echelle, maximum);

  const zoneLargeur = largeur - MARGE_GAUCHE - 12;
  const zoneHauteur = HAUTEUR - MARGE_HAUTE - MARGE_BASSE;

  const abscisse = (index: number) =>
    MARGE_GAUCHE + (points.length === 1 ? zoneLargeur / 2 : (index / (points.length - 1)) * zoneLargeur);
  const ordonnee = (valeur: number) => MARGE_HAUTE + zoneHauteur - (valeur / plafond) * zoneHauteur;

  // Le dernier segment est tracé à part, en pointillé, lorsqu'il rejoint un
  // mois encore en cours : sans cela, une période incomplète se lit comme
  // une chute d'activité.
  const pointsPleins = dernierPointPartiel && points.length > 1 ? points.slice(0, -1) : points;
  const trace = pointsPleins
    .map((point, index) => `${index === 0 ? "M" : "L"}${abscisse(index)} ${ordonnee(point.valeur)}`)
    .join(" ");
  const tracePartiel =
    dernierPointPartiel && points.length > 1
      ? `M${abscisse(points.length - 2)} ${ordonnee(points[points.length - 2].valeur)}L${abscisse(
          points.length - 1,
        )} ${ordonnee(points[points.length - 1].valeur)}`
      : null;
  const aire = `${trace} L${abscisse(pointsPleins.length - 1)} ${
    MARGE_HAUTE + zoneHauteur
  } L${abscisse(0)} ${MARGE_HAUTE + zoneHauteur} Z`;

  const dernier = points.length - 1;
  const actif = survol ?? dernier;

  const auMouvement = (evenement: React.MouseEvent<HTMLDivElement>) => {
    const cadre = conteneur.current?.getBoundingClientRect();
    if (!cadre) return;
    setLargeur(cadre.width);
    const position = evenement.clientX - cadre.left;
    const ratio = (position - MARGE_GAUCHE) / Math.max(zoneLargeur, 1);
    const index = Math.round(ratio * (points.length - 1));
    setSurvol(Math.min(Math.max(index, 0), points.length - 1));
  };

  return (
    <CadreGraphique titre={titre} sousTitre={sousTitre} actions={actions}>
      <div
        ref={conteneur}
        className="relative"
        onMouseMove={auMouvement}
        onMouseLeave={() => setSurvol(null)}
      >
        <svg
          viewBox={`0 0 ${largeur} ${HAUTEUR}`}
          className="w-full"
          role="img"
          aria-label={`${titre} — ${points.length} points, de ${points[0].etiquette} à ${points[dernier].etiquette}`}
        >
          <LignesGrille
            valeurs={echelle}
            hauteur={MARGE_HAUTE + zoneHauteur}
            largeur={largeur - 12}
            maximum={plafond}
            margeGauche={MARGE_GAUCHE}
            formater={(valeur) => formatXofCourt(valeur)}
          />

          <path d={aire} fill={categoriel[0]} opacity="0.1" />
          <path
            d={trace}
            fill="none"
            stroke={categoriel[0]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {tracePartiel && (
            <path
              d={tracePartiel}
              fill="none"
              stroke={categoriel[0]}
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}

          {/* Curseur de survol */}
          {survol !== null && (
            <line
              x1={abscisse(survol)}
              y1={MARGE_HAUTE}
              x2={abscisse(survol)}
              y2={MARGE_HAUTE + zoneHauteur}
              stroke={grille}
              strokeWidth="1"
            />
          )}

          {/* Marqueur : anneau de la couleur du fond pour rester lisible */}
          <circle
            cx={abscisse(actif)}
            cy={ordonnee(points[actif].valeur)}
            r="5"
            fill={dernierPointPartiel && actif === dernier ? surface : categoriel[0]}
            stroke={dernierPointPartiel && actif === dernier ? categoriel[0] : surface}
            strokeWidth="2"
          />

          {/* Étiquettes d'abscisse, une sur deux si l'espace manque */}
          {points.map((point, index) => {
            const intervalle = points.length > 8 ? 2 : 1;
            if (index % intervalle !== 0 && index !== dernier) return null;
            return (
              <text
                key={point.clef}
                x={abscisse(index)}
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
            x={abscisse(survol)}
            y={ordonnee(points[survol].valeur)}
            titre={points[survol].etiquette}
            lignes={[
              { libelle: "Chiffre d'affaires", valeur: formatXof(points[survol].valeur), couleur: categoriel[0] },
            ]}
            largeurConteneur={largeur}
          />
        )}
      </div>

      {dernierPointPartiel && (
        <p className="mt-3 text-[0.76rem] text-encre-500">
          Le dernier mois est en cours : son segment est tracé en pointillé, et le total qu&apos;il
          affiche est encore partiel.
        </p>
      )}

      <TableauDeSecours
        legende={titre}
        colonnes={["Mois", "Chiffre d'affaires"]}
        lignes={points.map((point, index) => [
          index === points.length - 1 && dernierPointPartiel
            ? `${point.etiquette} (en cours)`
            : point.etiquette,
          formatXof(point.valeur),
        ])}
      />
    </CadreGraphique>
  );
}
