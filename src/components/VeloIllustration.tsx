import type { CategorieVelo } from "@/lib/types";

/**
 * Illustration vectorielle d'un vélo, déclinée par catégorie.
 *
 * Le cahier des charges prévoit des photographies authentiques (§4.1), qui
 * seront servies par Cloudinary une fois la séance photo réalisée. En
 * attendant, cette illustration tient le rôle : elle est nette à toutes les
 * tailles, ne coûte aucune requête réseau et se recolore avec la charte.
 *
 * Géométrie commune : roue arrière en (170, 300), roue avant en (550, 300),
 * boîtier de pédalier en (330, 300).
 */

interface Props {
  categorie: CategorieVelo;
  teintes: [string, string];
  className?: string;
  /** Ombre portée douce sous le vélo, utilisée sur les grands visuels. */
  avecOmbre?: boolean;
  /**
   * Position et taille lorsqu'on imbrique l'illustration dans un autre SVG
   * — c'est ainsi que le schéma annoté partage son repère avec le vélo.
   */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function VeloIllustration({
  categorie,
  teintes,
  className = "",
  avecOmbre = true,
  x,
  y,
  width,
  height,
}: Props) {
  const [accent, clair] = teintes;
  const cadre = accent;
  const trait = "#2a231e";

  const cintreDrop = categorie === "GRAVEL" || categorie === "RANDONNEUR";
  const cadreOuvert = categorie === "VTC" || categorie === "VAE";
  const electrique = categorie === "VAE";
  const tandem = categorie === "TANDEM";
  const sacoches = categorie === "RANDONNEUR" || tandem;

  const arriereX = tandem ? 140 : 170;
  const avantX = tandem ? 596 : 550;
  const pedalierX = tandem ? 300 : 330;

  return (
    <svg
      viewBox="0 0 720 420"
      className={className || undefined}
      x={x}
      y={y}
      width={width}
      height={height}
      role={x === undefined ? "img" : undefined}
      aria-hidden={x === undefined ? undefined : true}
      aria-label={x === undefined ? `Illustration d'un vélo de type ${categorie.toLowerCase()}` : undefined}
      fill="none"
    >
      {avecOmbre && (
        <ellipse cx="360" cy="392" rx="248" ry="15" fill={trait} opacity="0.09" />
      )}

      {/* --- Sacoches et porte-bagages, dessinés derrière le cadre --- */}
      {sacoches && (
        <>
          {/* Porte-bagages : plateau horizontal et ses deux haubans */}
          <path
            d={
              `M${arriereX - 70} 208h122` +
              `M${arriereX - 62} 208l14 34` +
              `M${arriereX + 44} 208l-10 34`
            }
            stroke={trait}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
          <rect x={arriereX - 66} y="212" width="112" height="76" rx="9" fill={accent} />
          <rect
            x={arriereX - 66}
            y="212"
            width="112"
            height="76"
            rx="9"
            stroke={trait}
            strokeWidth="5"
            fill="none"
          />
          {/* Rabat et sangle de fermeture */}
          <path
            d={`M${arriereX - 66} 240h112`}
            stroke={trait}
            strokeWidth="4"
            opacity="0.55"
          />
          <rect x={arriereX - 16} y="228" width="16" height="26" rx="4" fill={trait} opacity="0.7" />
        </>
      )}

      {/* --- Roues --- */}
      <Roue cx={arriereX} cy={300} accent={clair} trait={trait} />
      <Roue cx={avantX} cy={300} accent={clair} trait={trait} />

      {/* --- Transmission --- */}
      <circle
        cx={pedalierX}
        cy="300"
        r={electrique ? 42 : 30}
        fill={electrique ? trait : "none"}
        stroke={trait}
        strokeWidth="6"
      />
      {electrique && (
        <>
          <circle cx={pedalierX} cy="300" r="20" fill={accent} />
          <circle cx={pedalierX} cy="300" r="8" fill={trait} />
        </>
      )}
      <circle cx={arriereX} cy="300" r="16" fill="none" stroke={trait} strokeWidth="5" />
      <circle cx={arriereX} cy="300" r="7" fill={trait} />
      {/* Chaîne : brin supérieur tendu, brin inférieur détendu */}
      <path
        d={`M${arriereX} 285h${pedalierX - arriereX}`}
        stroke={trait}
        strokeWidth="4"
        strokeDasharray="7 5"
      />
      <path
        d={`M${arriereX} 315q${(pedalierX - arriereX) / 2} 16 ${pedalierX - arriereX} 0`}
        stroke={trait}
        strokeWidth="4"
        strokeDasharray="7 5"
      />
      {/* Manivelle et pédale */}
      <path d={`M${pedalierX} 300l30 34`} stroke={trait} strokeWidth="7" strokeLinecap="round" />
      <path d={`M${pedalierX + 20} 338h26`} stroke={trait} strokeWidth="8" strokeLinecap="round" />

      {tandem && (
        <>
          <circle cx="430" cy="300" r="30" fill={clair} stroke={trait} strokeWidth="6" />
          <path d="M430 300l-30 34" stroke={trait} strokeWidth="7" strokeLinecap="round" />
          <path d="M384 338h26" stroke={trait} strokeWidth="8" strokeLinecap="round" />
        </>
      )}

      {/* --- Cadre --- */}
      <g stroke={cadre} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
        {/* Bases et haubans */}
        <path d={`M${arriereX} 300H${pedalierX}`} />
        <path d={`M${arriereX} 300L${tandem ? 262 : 288} 152`} />
        {/* Tube de selle */}
        <path d={`M${pedalierX} 300L${tandem ? 262 : 288} 152`} />

        {tandem ? (
          <>
            <path d="M262 152h130" />
            <path d="M392 152L430 300" />
            <path d="M392 152h96" />
            <path d="M430 300L494 176" />
          </>
        ) : cadreOuvert ? (
          // Cadre ouvert : un seul tube plongeant, enjambement facile
          <path d={`M494 176Q420 268 ${pedalierX} 300`} />
        ) : (
          <>
            <path d="M288 152h198" />
            <path d={`M${pedalierX} 300L494 176`} />
          </>
        )}

        {/* Tube de direction et fourche */}
        <path d="M488 148L502 202" />
        <path d={`M502 202L${avantX} 300`} />
      </g>

      {/* --- Batterie et console, seulement sur les vélos à assistance --- */}
      {electrique && (
        <>
          <rect
            x="352"
            y="196"
            width="140"
            height="34"
            rx="12"
            fill={trait}
            transform="rotate(-33 352 196)"
          />
          <rect
            x="362"
            y="206"
            width="112"
            height="8"
            rx="4"
            fill={accent}
            transform="rotate(-33 352 196)"
          />
          {/* Console couleur sur le cintre */}
          <rect x="440" y="96" width="52" height="34" rx="8" fill={trait} />
          <rect x="447" y="103" width="38" height="20" rx="4" fill={clair} />
          <line x1="453" y1="118" x2="479" y2="118" stroke={trait} strokeWidth="3" opacity="0.5" />
          <line x1="453" y1="110" x2="470" y2="110" stroke={accent} strokeWidth="4" />
        </>
      )}

      {/* --- Selle(s) --- */}
      <Selle x={tandem ? 262 : 288} y={148} trait={trait} accent={trait} />
      {tandem && <Selle x={392} y={148} trait={trait} accent={trait} />}

      {/* --- Cintre --- */}
      {cintreDrop ? (
        <path
          d="M488 148q-34-16-40 6t22 30q22 8 22-16"
          stroke={trait}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <>
          <path d="M488 148q-6-28 4-34" stroke={trait} strokeWidth="11" strokeLinecap="round" />
          <path d="M462 112h64" stroke={trait} strokeWidth="12" strokeLinecap="round" />
        </>
      )}

      {/* Phare avant, sur sa patte de fixation au tube de direction */}
      <path d="M498 186h16" stroke={trait} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M514 176h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-10Z"
        fill={trait}
      />
      <path d="M529 181v10" stroke={clair} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Roue({ cx, cy, accent, trait }: { cx: number; cy: number; accent: string; trait: string }) {
  const rayons = Array.from({ length: 12 }, (_, index) => (index * 360) / 12);
  return (
    <g>
      <circle cx={cx} cy={cy} r="98" stroke={trait} strokeWidth="15" />
      <circle cx={cx} cy={cy} r="82" stroke={accent} strokeWidth="6" />
      {rayons.map((angle) => (
        <line
          key={angle}
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - 82}
          stroke={trait}
          strokeWidth="2.4"
          opacity="0.42"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r="11" fill={trait} />
    </g>
  );
}

function Selle({ x, y, trait }: { x: number; y: number; trait: string; accent: string }) {
  return (
    <path
      d={`M${x - 34} ${y}q16-12 40-9 22 3 30 9-14 10-36 10t-34-10Z`}
      fill={trait}
    />
  );
}
