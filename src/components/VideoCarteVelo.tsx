"use client";

import { useEffect, useRef, useState } from "react";
import { afficheOptimisee } from "@/lib/affiche";
import { connexionAEpargner } from "@/lib/connexion";

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
  // Sans source tant que le navigateur n'a pas dit qu'on pouvait se la
  // permettre : sur téléphone ou réseau lent, la carte garde sa photo et
  // rien n'est téléchargé.
  const [active, setActive] = useState(false);
  // Et, même permise, la vidéo n'a de source qu'une fois sa carte venue à
  // l'écran. Posée d'emblée sur les onze cartes, elle faisait télécharger
  // les onze vidéos entières à l'ouverture du catalogue, près de 28 Mo,
  // y compris celles des vélos tout en bas que personne n'avait vus.
  const [vue, setVue] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (connexionAEpargner()) return;
    const depart = setTimeout(() => setActive(true), 0);
    return () => clearTimeout(depart);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element || !active) return;

    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (entree.isIntersecting) {
          setVue(true);
          // Un refus du navigateur laisse simplement l'affiche : c'est
          // un agrément, rien n'en dépend. Au premier passage, la source
          // vient d'être posée et c'est `autoPlay` qui lance la lecture.
          if (element.currentSrc) void element.play().catch(() => undefined);
        } else {
          element.pause();
          if (element.currentSrc) element.currentTime = 0;
        }
      },
      // Il faut qu'un bon tiers de la carte soit visible : sans ce
      // seuil, une carte qui affleure en bas d'écran lancerait sa vidéo
      // pour rien pendant qu'on défile.
      { threshold: 0.35 },
    );

    observateur.observe(element);
    return () => observateur.disconnect();
  }, [active]);

  return (
    <video
      ref={video}
      src={active && vue ? source : undefined}
      poster={afficheOptimisee(affiche, 400)}
      autoPlay={active && vue}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={`Présentation du vélo ${nom}`}
      className="h-full w-full object-cover"
    />
  );
}
