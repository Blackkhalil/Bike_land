"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

const REPOS = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";

/**
 * Enveloppe qui incline son contenu en 3D selon la position du curseur —
 * pensée pour la photo produit détourée sur fond noir (hero), afin de
 * suggérer un objet réel plutôt qu'une image plate.
 *
 * Ne réagit qu'à la souris (le tactile n'a pas de survol) et respecte
 * `prefers-reduced-motion`, comme le reste du site (cf. globals.css).
 */
export function PhotoInclinee({
  children,
  className = "",
  intensite = 14,
}: {
  children: ReactNode;
  className?: string;
  /** Amplitude maximale de l'inclinaison, en degrés. */
  intensite?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(REPOS);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cadre = ref.current?.getBoundingClientRect();
    if (!cadre) return;

    const px = (event.clientX - cadre.left) / cadre.width - 0.5;
    const py = (event.clientY - cadre.top) / cadre.height - 0.5;

    setTransform(
      `perspective(1200px) rotateX(${(-py * intensite).toFixed(2)}deg) rotateY(${(px * intensite).toFixed(2)}deg) scale3d(1.02,1.02,1.02)`,
    );
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTransform(REPOS)}
      className={`[transform-style:preserve-3d] will-change-transform transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}
      style={{ transform }}
    >
      {children}
    </div>
  );
}
