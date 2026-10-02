"use client";

import { useEffect, useRef } from "react";
import { afficheOptimisee } from "@/lib/affiche";

/**
 * La présentation filmée d'un vélo, sur sa carte du catalogue.
 *
 * Elle démarre **quand la carte entre à l'écran**, et s'arrête quand
 * elle en sort. Pas besoin de survoler : le visiteur voit tourner les
 * vélos en faisant défiler, sur ordinateur comme sur téléphone, où il
 * n'y a de toute façon pas de pointeur.
 *
 * Le catalogue affiche onze cartes. Les lancer toutes ensemble ferait
 * télécharger vingt mégaoctets d'un coup, ce qui est intenable sur un
 * réseau mobile. L'observateur d'intersection règle exactement ce
 * problème : seule la poignée de vidéos réellement visibles se charge et
 * s'anime, les autres restent sur leur affiche.
 *
 * L'affiche est le premier plan de la vidéo elle-même : la carte montre
 * donc le bon vélo dès l'affichage, sans attendre quoi que ce soit.
 *
 * `prefers-reduced-motion` est respecté : la vidéo reste alors figée sur
 * son affiche, et rien ne bouge.
 */
export function VideoCarteVelo({
  source,
  affiche,
  nom,
}: {
  source: string;
  affiche?: string;
  nom: string;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (entree.isIntersecting) {
          // Un refus du navigateur laisse simplement l'affiche : c'est
          // un agrément, rien n'en dépend.
          void element.play().catch(() => undefined);
        } else {
          element.pause();
          element.currentTime = 0;
        }
      },
      // Il faut qu'un bon tiers de la carte soit visible : sans ce
      // seuil, une carte qui affleure en bas d'écran lancerait sa vidéo
      // pour rien pendant qu'on défile.
      { threshold: 0.35 },
    );

    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <video
      ref={video}
      src={source}
      poster={afficheOptimisee(affiche, 400)}
      muted
      loop
      playsInline
      // Les métadonnées seules : de quoi démarrer vite quand la carte
      // arrive, sans télécharger la vidéo entière d'avance.
      preload="metadata"
      aria-label={`Présentation du vélo ${nom}`}
      className="h-full w-full object-cover"
    />
  );
}
