import { VeloIllustration } from "./VeloIllustration";
import type { Velo } from "@/lib/types";

/**
 * Schéma technique annoté.
 *
 * Le vélo et les annotations vivent dans **un seul SVG** : l'illustration
 * est imbriquée à une position connue du repère parent, donc chaque
 * amorce de légende tombe exactement sur la pièce désignée, quelle que
 * soit la largeur d'écran.
 *
 * Sous `lg`, les légendes deviendraient illisibles : on bascule alors sur
 * une simple grille sous le visuel.
 */

interface Annotation {
  titre: string;
  valeur: string;
  /** Point désigné, dans le repère local du vélo (0 0 720 420). */
  cible: [number, number];
  cote: "gauche" | "droite";
  /** Ordonnée de la légende, dans le repère du schéma. */
  ligne: number;
}

// Le vélo occupe 720 × 420 au centre ; les 320 unités laissées de chaque
// côté sont la gouttière dans laquelle les légendes doivent tenir.
const DECALAGE_X = 320;
const DECALAGE_Y = 70;
const FIN_TRAIT_GAUCHE = 284;
const FIN_TRAIT_DROITE = 1076;
const TEXTE_GAUCHE = 272;
const TEXTE_DROITE = 1088;

export function annotationsPour(velo: Velo): Annotation[] {
  const communes: Annotation[] = [
    {
      titre: "Position de conduite",
      valeur: `Taille ${velo.taille} · réglée à votre morphologie`,
      cible: [288, 145],
      cote: "gauche",
      ligne: 150,
    },
    {
      titre: "Transmission",
      valeur: `${velo.vitesses} vitesses · revue avant départ`,
      cible: [330, 300],
      cote: "gauche",
      ligne: 470,
    },
    {
      titre: "Freinage",
      valeur: "Disques hydrauliques, tout temps",
      cible: [502, 202],
      cote: "droite",
      ligne: 270,
    },
    {
      titre: "Roues et charge",
      valeur: `${velo.chargeMaxKg} kg admissibles, bagages inclus`,
      cible: [550, 300],
      cote: "droite",
      ligne: 440,
    },
  ];

  // Le parc est entièrement musculaire : aucune mention de moteur ni de
  // batterie n'a de sens ici.
  communes.splice(2, 0, {
    titre: "Autonomie conseillée",
    valeur: `${velo.autonomieConseilleeKm} km par jour, sans forcer`,
    cible: [466, 118],
    cote: "droite",
    ligne: 110,
  });

  return communes;
}

export function SpecificationsAnnotees({
  velo,
  className = "",
  couleurTrait = "#0e0e0e",
}: {
  velo: Velo;
  className?: string;
  couleurTrait?: string;
}) {
  const annotations = annotationsPour(velo);

  return (
    <div className={className}>
      {/* Schéma annoté, écrans larges */}
      <svg viewBox="0 0 1360 560" className="hidden w-full lg:block" aria-hidden="true">
        <VeloIllustration
          categorie={velo.categorie}
          teintes={velo.teintes}
          x={DECALAGE_X}
          y={DECALAGE_Y}
          width={720}
          height={420}
        />

        <g stroke={couleurTrait} fill={couleurTrait}>
          {annotations.map((annotation) => {
            const cibleX = annotation.cible[0] + DECALAGE_X;
            const cibleY = annotation.cible[1] + DECALAGE_Y;
            const gauche = annotation.cote === "gauche";
            const finX = gauche ? FIN_TRAIT_GAUCHE : FIN_TRAIT_DROITE;
            const coudeX = gauche ? cibleX - 46 : cibleX + 46;

            return (
              <g key={annotation.titre}>
                {/* Amorce : segment oblique depuis la pièce, puis palier horizontal */}
                <path
                  d={`M${cibleX} ${cibleY}L${coudeX} ${annotation.ligne}H${finX}`}
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                  fill="none"
                  opacity="0.5"
                />
                <circle cx={cibleX} cy={cibleY} r="5" fill="none" strokeWidth="1.6" opacity="0.75" />
                <circle cx={cibleX} cy={cibleY} r="2" strokeWidth="0" />

                <text
                  x={gauche ? TEXTE_GAUCHE : TEXTE_DROITE}
                  y={annotation.ligne - 6}
                  textAnchor={gauche ? "end" : "start"}
                  strokeWidth="0"
                  className="font-display"
                  fontSize="17"
                  fontWeight="700"
                  letterSpacing="-0.2"
                >
                  {annotation.titre}
                </text>
                <text
                  x={gauche ? TEXTE_GAUCHE : TEXTE_DROITE}
                  y={annotation.ligne + 16}
                  textAnchor={gauche ? "end" : "start"}
                  strokeWidth="0"
                  fontSize="14"
                  opacity="0.62"
                >
                  {annotation.valeur}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Repli sans annotations, écrans étroits */}
      <div className="lg:hidden">
        <VeloIllustration categorie={velo.categorie} teintes={velo.teintes} className="w-full" />
        <dl className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {annotations.map((annotation) => (
            <div key={annotation.titre} className="border-t border-current/15 pt-3">
              <dt className="font-display text-[0.95rem] font-bold uppercase tracking-tight">
                {annotation.titre}
              </dt>
              <dd className="mt-1 text-[0.85rem] leading-relaxed opacity-65">{annotation.valeur}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
