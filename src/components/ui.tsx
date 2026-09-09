import Link from "next/link";
import type { ReactNode } from "react";

import { FlecheDiagonale } from "./Bouton";

/**
 * Petites briques de mise en page partagées par toutes les sections.
 * Elles portent l'essentiel du rythme visuel : étiquette numérotée,
 * grand titre éditorial, filet horizontal fin.
 */

export function Section({
  children,
  className = "",
  fond = "sable",
  id,
}: {
  children: ReactNode;
  className?: string;
  fond?: "sable" | "blanc" | "encre" | "olive" | "transparent";
  id?: string;
}) {
  const fonds = {
    sable: "bg-sable-50 text-encre-900",
    blanc: "bg-white text-encre-900",
    encre: "bg-encre-900 text-sable-100",
    olive: "bg-olive-800 text-olive-50",
    transparent: "",
  } as const;

  return (
    <section id={id} className={`${fonds[fond]} ${className}`}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function Etiquette({
  numero,
  children,
  className = "",
}: {
  numero?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`etiquette flex items-center gap-3 opacity-55 ${className}`}>
      {numero && <span className="tabular-nums">({numero})</span>}
      <span>{children}</span>
    </p>
  );
}

export function TitreSection({
  children,
  className = "",
  taille = "md",
  as: Balise = "h2",
}: {
  children: ReactNode;
  className?: string;
  taille?: "sm" | "md" | "lg";
  as?: "h1" | "h2" | "h3";
}) {
  const tailles = {
    sm: "text-[clamp(1.6rem,3.4vw,2.4rem)]",
    md: "text-[clamp(2rem,5vw,3.9rem)]",
    lg: "text-[clamp(2.5rem,7vw,5.6rem)]",
  } as const;

  return <Balise className={`titre-editorial ${tailles[taille]} ${className}`}>{children}</Balise>;
}

export function Filet({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-current/15 ${className}`} />;
}

export function LienFleche({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {children}
      <FlecheDiagonale />
    </Link>
  );
}

/** Cadre « photo » : une bordure blanche épaisse, façon tirage papier. */
export function CadrePhoto({
  children,
  className = "",
  rotation = 0,
}: {
  children: ReactNode;
  className?: string;
  rotation?: number;
}) {
  return (
    <div
      className={`rounded-[6px] bg-white p-2.5 shadow-[0_18px_50px_-24px_rgba(42,35,30,0.45)] ${className}`}
      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
    >
      <div className="overflow-hidden rounded-[3px]">{children}</div>
    </div>
  );
}

export function Etoiles({ note, className = "" }: { note: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Note : ${note} sur 5`}>
      {[1, 2, 3, 4, 5].map((rang) => (
        <svg key={rang} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7 1.2 8.8 5h4.1L9.6 7.6l1.2 4L7 9.2l-3.8 2.4 1.2-4L1.1 5h4.1L7 1.2Z"
            fill={rang <= Math.round(note) ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            opacity={rang <= Math.round(note) ? 1 : 0.35}
          />
        </svg>
      ))}
    </span>
  );
}

export function Pastille({
  children,
  ton = "neutre",
  className = "",
}: {
  children: ReactNode;
  ton?: "neutre" | "succes" | "alerte" | "info" | "sombre";
  className?: string;
}) {
  const tons = {
    neutre: "bg-sable-200 text-encre-700",
    succes: "bg-olive-100 text-olive-700",
    alerte: "bg-soleil-300/45 text-terre-800",
    info: "bg-terre-100 text-terre-700",
    sombre: "bg-encre-900 text-sable-50",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] ${tons[ton]} ${className}`}
    >
      {children}
    </span>
  );
}
