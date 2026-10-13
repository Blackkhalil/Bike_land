"use client";

import { useEffect, useRef, useState } from "react";
import { afficheOptimisee } from "@/lib/affiche";
import { economieDeDonnees } from "@/lib/connexion";

/**
 * Vidéo de fond du héros, avec commande de son.
 *
 * Deux contraintes de navigateur commandent toute la conception :
 *
 *  1. **Aucun navigateur ne laisse une vidéo démarrer seule avec le
 *     son.** C'est bloqué depuis des années contre les publicités
 *     sonores. La seule lecture automatique tolérée est muette, d'où le
 *     bouton, qui rend la main au visiteur.
 *
 *  2. **`playsInline` est obligatoire sur iPhone.** Sans lui, iOS ouvre
 *     la vidéo en plein écran par-dessus la page, ce qui détruirait la
 *     mise en page au premier chargement.
 *
 * L'affiche s'affiche pendant le téléchargement et reste visible si la
 * lecture échoue : la page ne montre jamais un rectangle noir.
 *
 * La vidéo est décorative, elle ne porte aucune information que le
 * texte ne donne déjà. Elle est donc masquée aux lecteurs d'écran, et
 * la commande de son reste le seul élément annoncé.
 */
export function VideoFond({
  source,
  affiche,
}: {
  source: string;
  affiche: string;
}) {
  const reference = useRef<HTMLVideoElement>(null);
  const [muet, setMuet] = useState(true);
  // La vidéo joue partout, téléphone compris, sauf pour qui a demandé
  // d'économiser ses données : l'affiche suffit alors.
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (economieDeDonnees()) return;
    const depart = setTimeout(() => setActive(true), 0);
    return () => clearTimeout(depart);
  }, []);

  const basculerSon = () => {
    const video = reference.current;
    if (!video) return;

    const prochainEtat = !muet;
    video.muted = prochainEtat;
    setMuet(prochainEtat);

    // Activer le son sur une vidéo que le navigateur a mise en pause
    // ne servirait à rien : on relance la lecture au besoin.
    if (!prochainEtat && video.paused) void video.play().catch(() => undefined);
  };

  return (
    <>
      <video
        ref={reference}
        src={active ? source : undefined}
        poster={afficheOptimisee(affiche, 600)}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />

      {/* Voile sombre : sans lui, le titre en craie devient illisible dès
          qu'une image claire passe dans la vidéo. Le dégradé est plus
          dense en bas, là où se trouvent les boutons. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-noir-piste/70 via-noir-piste/60 to-noir-piste/85"
      />

      {active && (
      <button
        type="button"
        onClick={basculerSon}
        aria-pressed={!muet}
        className="absolute bottom-5 right-5 z-20 inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border border-craie/30 bg-noir-piste/60 px-4 text-[0.82rem] font-semibold text-craie backdrop-blur-sm transition-colors hover:border-craie/60 hover:bg-noir-piste/80"
      >
        <span aria-hidden="true">{muet ? "🔇" : "🔊"}</span>
        {muet ? "Activer le son" : "Couper le son"}
      </button>
      )}
    </>
  );
}
