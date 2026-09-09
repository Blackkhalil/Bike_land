import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variante = "primaire" | "sombre" | "clair" | "contour";
type Taille = "sm" | "md" | "lg";

const variantes: Record<Variante, string> = {
  primaire: "bg-terre-600 text-sable-50 hover:bg-terre-700",
  sombre: "bg-encre-900 text-sable-50 hover:bg-encre-800",
  clair: "bg-sable-50 text-encre-900 hover:bg-white",
  contour: "border border-current/25 text-current hover:bg-current/[0.06]",
};

const tailles: Record<Taille, string> = {
  sm: "px-4 py-2 text-[0.8rem]",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-[0.95rem]",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight " +
  "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:opacity-45";

export function Bouton({
  variante = "primaire",
  taille = "md",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variante?: Variante; taille?: Taille }) {
  return (
    <button className={`${base} ${variantes[variante]} ${tailles[taille]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function BoutonLien({
  href,
  variante = "primaire",
  taille = "md",
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; taille?: Taille; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`${base} ${variantes[variante]} ${tailles[taille]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}

/** Flèche des liens « en savoir plus », inclinée comme sur les maquettes. */
export function FlecheDiagonale({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${className}`}
    >
      <path
        d="M3.5 10.5 10.5 3.5M10.5 3.5H4.9M10.5 3.5v5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
