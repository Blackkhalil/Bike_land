"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { afficheOptimisee } from "@/lib/affiche";
import { economieDeDonnees } from "@/lib/connexion";

export interface Affiche {
  /** L'image ; pour une vidéo, son affiche, montrée avant la lecture. */
  src: string;
  /** Ce que montre l'affiche, et le texte qu'elle porte : il fait partie de l'image. */
  alt: string;
  /** Une vidéo muette à sa place, servie depuis `public` (le terrain de Padel bike). */
  video?: string;
}

/**
 * Une vidéo de la galerie : muette et en boucle, comme une image qui
 * bouge. Elle ne part d'elle-même que si le visiteur n'a demandé ni moins
 * d'animations ni d'économiser ses données ; sinon son affiche reste, et
 * le bouton la lance. Le même bouton la met en pause : rien ne bouge sous
 * les yeux du visiteur sans qu'il puisse l'arrêter.
 */
function VideoDeGalerie({ affiche, video }: { affiche: Affiche; video: string }) {
  const reference = useRef<HTMLVideoElement>(null);
  // Sans source tant que la lecture n'est pas décidée : le fichier ne
  // part pas pour qui ne la verra pas.
  const [source, setSource] = useState<string | undefined>(undefined);
  const [enLecture, setEnLecture] = useState(false);

  useEffect(() => {
    const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calme || economieDeDonnees()) return;
    const depart = setTimeout(() => setSource(video), 0);
    return () => clearTimeout(depart);
  }, [video]);

  const basculer = () => {
    const element = reference.current;
    if (!element) return;
    // Pas encore de source : la donner suffit, `autoPlay` lance la lecture.
    if (!source) setSource(video);
    else if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };

  return (
    <>
      <video
        ref={reference}
        src={source}
        poster={afficheOptimisee(affiche.src, 470)}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={affiche.alt}
        onPlay={() => setEnLecture(true)}
        onPause={() => setEnLecture(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={basculer}
        className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-noir-piste/60 text-craie backdrop-blur-sm transition-colors hover:bg-noir-piste/80"
      >
        <span className="sr-only">{enLecture ? "Mettre la vidéo en pause" : "Lire la vidéo"}</span>
        {enLecture ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
          </svg>
        )}
      </button>
    </>
  );
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
  // « 5 affiches », ou « 1 vidéo et 4 images » quand une vidéo en fait partie.
  const videos = affiches.filter((affiche) => affiche.video).length;
  const images = affiches.length - videos;
  const compte =
    videos > 0
      ? `${videos} vidéo${videos > 1 ? "s" : ""} et ${images} ${images > 1 ? nom.pluriel : nom.singulier}`
      : `${affiches.length} ${nom.pluriel}`;

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
            {affiche.video ? (
              <VideoDeGalerie affiche={affiche} video={affiche.video} />
            ) : (
              <Image
                src={affiche.src}
                alt={affiche.alt}
                fill
                sizes="(min-width: 1280px) 470px, (min-width: 1024px) 39vw, (min-width: 640px) 60vw, 82vw"
                loading={index === 0 ? "eager" : "lazy"}
                className="object-cover"
              />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-[0.8rem] opacity-80">{compte} : glissez pour les voir</p>
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
