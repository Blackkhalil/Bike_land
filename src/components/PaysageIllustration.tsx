/**
 * Paysage vectoriel en aplats superposés, décliné par ambiance.
 *
 * Sert d'illustration aux itinéraires et aux blocs éditoriaux tant que les
 * photographies de la §4.1 ne sont pas produites. Chaque variante correspond
 * à un type de terrain réellement présent sur nos itinéraires.
 */

type Ambiance = "littoral" | "montagne" | "lagune" | "savane";

interface Props {
  ambiance: Ambiance;
  teintes: [string, string];
  className?: string;
  avecCycliste?: boolean;
}

export function PaysageIllustration({
  ambiance,
  teintes,
  className = "",
  avecCycliste = true,
}: Props) {
  const [accent, clair] = teintes;

  return (
    <svg viewBox="0 0 800 520" className={className} role="img" aria-label={`Paysage ${ambiance}`}>
      <defs>
        <linearGradient id={`ciel-${ambiance}-${accent.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={clair} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <rect width="800" height="520" fill={`url(#ciel-${ambiance}-${accent.slice(1)})`} />
      <circle cx="612" cy="132" r="58" fill={accent} opacity="0.28" />
      <circle cx="612" cy="132" r="34" fill={accent} opacity="0.55" />

      {ambiance === "montagne" && (
        <>
          <path d="M0 330 150 176l108 96 96-118 152 152 132-96 162 120v190H0Z" fill={accent} opacity="0.22" />
          <path d="M0 372 128 258l122 84 118-64 156 108 130-58 146 92v100H0Z" fill={accent} opacity="0.4" />
        </>
      )}

      {ambiance === "littoral" && (
        <>
          {/* Ligne d'horizon océane et rouleaux */}
          <rect y="300" width="800" height="70" fill={accent} opacity="0.28" />
          {[318, 340, 360].map((y, index) => (
            <path
              key={y}
              d={`M${-40 + index * 30} ${y}q60 -12 120 0t120 0 120 0 120 0 120 0 120 0`}
              stroke="#ffffff"
              strokeWidth="3"
              fill="none"
              opacity="0.45"
            />
          ))}
        </>
      )}

      {ambiance === "lagune" && (
        <>
          <ellipse cx="400" cy="352" rx="420" ry="66" fill={accent} opacity="0.26" />
          {/* Habitations sur pilotis */}
          {[180, 268, 560].map((x, index) => (
            <g key={x} opacity="0.75">
              <path
                d={`M${x - 34} ${300 - index * 6}h68l-34-30Z`}
                fill={accent}
              />
              <rect x={x - 26} y={300 - index * 6} width="52" height="30" fill={accent} opacity="0.8" />
              <line x1={x - 18} y1={330 - index * 6} x2={x - 18} y2="356" stroke={accent} strokeWidth="4" />
              <line x1={x + 18} y1={330 - index * 6} x2={x + 18} y2="356" stroke={accent} strokeWidth="4" />
            </g>
          ))}
        </>
      )}

      {ambiance === "savane" && (
        <>
          <path d="M0 356q200-46 400-4t400-14v82H0Z" fill={accent} opacity="0.24" />
          {/* Baobabs en silhouette */}
          {[130, 690].map((x) => (
            <g key={x} fill={accent} opacity="0.55">
              <path d={`M${x - 12} 356v-92q-26-14-30-34 18 8 30 12v-24h24v24q12-4 30-12-4 20-30 34v92Z`} />
            </g>
          ))}
        </>
      )}

      {/* Sol commun, au premier plan */}
      <path d="M0 380q200-30 400 0t400-18v158H0Z" fill={accent} opacity="0.62" />
      <path d="M0 438q220-24 400 6t400-10v86H0Z" fill={accent} />

      {/* Cocotiers, présents sur tous les terrains du littoral béninois */}
      {(ambiance === "littoral" || ambiance === "lagune") &&
        [72, 748].map((x, index) => (
          <g key={x} opacity="0.85">
            <path
              d={`M${x} 400q${index ? 8 : -8} -60 ${index ? -4 : 4} -104`}
              stroke="#2a231e"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
              opacity="0.55"
            />
            {[-1, 1].map((sens) =>
              [0, 1].map((rang) => (
                <path
                  key={`${sens}-${rang}`}
                  d={`M${x + (index ? -4 : 4)} 296q${sens * (34 + rang * 16)} ${-18 + rang * 22} ${sens * (56 + rang * 12)} ${6 + rang * 20}`}
                  stroke="#2a231e"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              )),
            )}
          </g>
        ))}

      {avecCycliste && <Cycliste x={392} y={432} />}
    </svg>
  );
}

/** Silhouette de cycliste, réduite à l'essentiel : roues, cadre, buste. */
function Cycliste({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="#1c1714" fill="none" strokeLinecap="round">
      <circle cx="-24" cy="0" r="17" strokeWidth="3.6" />
      <circle cx="24" cy="0" r="17" strokeWidth="3.6" />
      <path d="M-24 0 -6-24h22l14 24" strokeWidth="3.2" />
      <path d="M-6-24 0 0h24" strokeWidth="3.2" />
      <path d="M-10-30 -2-30" strokeWidth="3.6" />
      <path d="M16-24h12" strokeWidth="3.6" />
      {/* Cycliste */}
      <path d="M-6-30 4-46l16-2" strokeWidth="4.4" />
      <circle cx="26" cy="-54" r="7" strokeWidth="4" fill="#1c1714" />
      <path d="M4-46 0-24" strokeWidth="4" />
      <path d="M4-46 22-38" strokeWidth="4" />
    </g>
  );
}
