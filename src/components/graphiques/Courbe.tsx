"use client";

import { useEffect, useRef, useState } from "react";

import { formatXof, formatXofCourt } from "@/lib/format";
import { categoriel, encreSecondaire, grille, surface } from "./palette";
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
 * Courbe d'évolution, série unique.
 *
 * Une seule série : pas de légende (le titre nomme ce qui est tracé), un
 * lavis d'aire à 10 % sous le trait de 2 px, un point terminal cerclé de
 * la couleur du fond, et un curseur au survol avec infobulle.
 */

const HAUTEUR = 220;
const MARGE_GAUCHE = 52;
// La dernière étiquette est centrée sur le dernier point : il lui faut la
// moitié de sa largeur à droite, sinon « oct 26 » s'affiche « oct 2 ».
const MARGE_DROITE = 24;
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

  const zoneLargeur = largeur - MARGE_GAUCHE - MARGE_DROITE;
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
  const intervalle = intervalleEtiquettes(zoneLargeur / Math.max(dernier, 1));

  const auMouvement = (evenement: React.MouseEvent<HTMLDivElement>) => {
    const cadre = conteneur.current?.getBoundingClientRect();
    if (!cadre) return;
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
          aria-label={`${titre}, ${points.length} points, de ${points[0].etiquette} à ${points[dernier].etiquette}`}
        >
          <LignesGrille
            valeurs={echelle}
            hauteur={MARGE_HAUTE + zoneHauteur}
            largeur={largeur - MARGE_DROITE}
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

          {/* Étiquettes d'abscisse, espacées selon la place et comptées
              depuis la dernière, toujours affichée */}
          {points.map((point, index) => {
            if ((dernier - index) % intervalle !== 0) return null;
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
        <p className="mt-3 text-[0.76rem] text-gris-cadre">
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
