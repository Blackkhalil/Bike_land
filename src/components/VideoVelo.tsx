"use client";

import { useRef, useState } from "react";

/**
 * Présentation filmée d'un vélo, sur sa fiche.
 *
 * Douze secondes de tour complet, avec la fiche technique incrustée :
 * cela montre ce qu'aucune photo ne montre, l'état des jantes, le type
 * de fourche, la position du dérailleur. C'est exactement ce qu'un
 * client cherche à savoir d'une machine qu'il va louer.
 *
 * Elle joue seule, en boucle et sans son. Trois précautions, et aucune
 * n'est décorative :
 *
 *  - `muted` est **obligatoire** pour que la lecture automatique parte :
 *    tous les navigateurs bloquent une vidéo qui démarre avec du son.
 *  - `playsInline` empêche iOS de basculer en plein écran, ce qui
 *    arracherait le visiteur à la page.
 *  - l'**affiche** est le premier plan de la vidéo : la fiche montre le
 *    bon vélo immédiatement, avant même que la vidéo soit prête. Sur un
 *    réseau béninois, c'est la différence entre une page qui s'affiche
 *    et un rectangle vide qui attend.
 */
export function VideoVelo({
  source,
  affiche,
  nom,
}: {
  source: string;
  /** Image fixe montrée avant la lecture. */
  affiche?: string;
  nom: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [enPause, setEnPause] = useState(false);

  const basculer = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      void element.play();
      setEnPause(false);
    } else {
      element.pause();
      setEnPause(true);
    }
  };

  return (
    <div className="relative mx-auto mt-4 aspect-16/9 w-full max-w-4xl overflow-hidden rounded-[var(--radius-bloc)] bg-craie">
      <video
        ref={video}
        src={source}
        poster={affiche}
        autoPlay
        muted
        loop
        playsInline
        // « metadata » et non « none » : la lecture automatique est
        // demandée juste au-dessus, les deux se contrediraient et le
        // démarrage en pâtirait. L'affiche couvre l'attente.
        preload="metadata"
        aria-label={`Présentation du vélo ${nom}`}
        className="h-full w-full object-cover"
      />

      {/* Le bouton sert surtout à arrêter le mouvement : une boucle de
          douze secondes finit par gêner la lecture de la fiche, et
          certains visiteurs y sont franchement sensibles. */}
      <button
        type="button"
        onClick={basculer}
        aria-label={enPause ? "Relancer la présentation" : "Mettre la présentation en pause"}
        className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-noir-piste/70 text-craie backdrop-blur transition-opacity hover:opacity-85"
      >
        {enPause ? (
          <svg width="14" height="14" viewBox="0 0 12 14" aria-hidden="true" fill="currentColor">
            <path d="M0 0l12 7-12 7z" />
          </svg>
        ) : (
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true" fill="currentColor">
            <rect x="0" y="0" width="4" height="14" />
            <rect x="8" y="0" width="4" height="14" />
          </svg>
        )}
      </button>
    </div>
  );
}
