"use client";

import Image from "next/image";
import { useRef } from "react";

export interface Affiche {
  src: string;
  /** Ce que montre l'affiche, et le texte qu'elle porte : il fait partie de l'image. */
  alt: string;
}

/**
 * Les affiches d'un produit, qui défilent sous le doigt.
 *
 * Le défilement natif fait tout : on glisse au doigt, chaque affiche
 * s'aligne (scroll-snap), et l'affiche suivante dépasse un peu, ce qui dit
 * qu'il y en a d'autres. Rien ne défile tout seul : une affiche se lit,
 * et la faire partir sous les yeux du lecteur l'en empêcherait. Les deux
 * boutons servent à la souris et au clavier.
 */
export function GalerieAffiches({
  affiches,
  titre,
  nom = { singulier: "affiche", pluriel: "affiches" },
}: {
  affiches: Affiche[];
  titre: string;
  /** Ce que la galerie montre, au féminin : des affiches, ou des images (Padel bike). */
  nom?: { singulier: string; pluriel: string };
}) {
  const Nom = nom.singulier.charAt(0).toUpperCase() + nom.singulier.slice(1);
  const piste = useRef<HTMLUListElement>(null);

  const defiler = (sens: 1 | -1) => {
    const element = piste.current;
    if (!element) return;
    const premiere = element.firstElementChild as HTMLElement | null;
    const pas = premiere ? premiere.offsetWidth + 16 : element.clientWidth * 0.8;
    const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: sens * pas, behavior: doux ? "smooth" : "auto" });
  };

  return (
    <div>
      <ul
        ref={piste}
        aria-label={titre}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]"
      >
        {affiches.map((affiche, index) => (
          <li
            key={affiche.src}
            className="relative aspect-[3/4] w-[82%] shrink-0 snap-start overflow-hidden rounded-[var(--radius-carte)] bg-noir-releve sm:w-[60%] lg:w-[78%]"
          >
            <Image
              src={affiche.src}
              alt={affiche.alt}
              fill
              sizes="(min-width: 1280px) 470px, (min-width: 1024px) 39vw, (min-width: 640px) 60vw, 82vw"
              loading={index === 0 ? "eager" : "lazy"}
              className="object-cover"
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-[0.8rem] opacity-80">
          {affiches.length} {nom.pluriel} : glissez pour les voir
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => defiler(-1)}
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-current/40 transition-colors hover:bg-current/10"
          >
            <span className="sr-only">{Nom} précédente</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => defiler(1)}
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-current/40 transition-colors hover:bg-current/10"
          >
            <span className="sr-only">{Nom} suivante</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
