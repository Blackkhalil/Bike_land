"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { Section, TitreSection } from "@/components/ui";

/**
 * Les photos de Bike Land, qui défilent en bas de l'accueil.
 *
 * Elles avancent **toutes seules**, en boucle, toutes les trois secondes
 * et demie. Le défilement s'arrête au survol et au toucher, puis
 * reprend : quelqu'un qui s'attarde sur une photo ne doit pas la voir
 * lui échapper.
 *
 * **Aucune bibliothèque.** Le défilement natif du navigateur fait tout :
 * `overflow-x-auto` pour glisser au doigt, `scroll-snap` pour que chaque
 * photo s'aligne, et `scrollTo` pour l'avance automatique. Une
 * bibliothèque pèserait trente kilooctets et casserait le glissement
 * tactile que tout le monde connaît déjà.
 *
 * L'animation respecte `prefers-reduced-motion` : un visiteur qui a
 * demandé moins de mouvement garde la main, rien ne bouge sans lui.
 */
export interface PhotoCarrousel {
  /** Chemin servi, par exemple `/carrousel/sortie-samedi.jpg`. */
  source: string;
  /** Description pour les lecteurs d'écran, déduite du nom du fichier. */
  description: string;
}

/** Temps d'affichage d'une photo avant de passer à la suivante. */
const INTERVALLE_MS = 3_500;

export function CarrouselPhotos({ photos }: { photos: PhotoCarrousel[] }) {
  const piste = useRef<HTMLDivElement>(null);
  const [actif, setActif] = useState(0);
  const [enPause, setEnPause] = useState(false);
  const [automatique, setAutomatique] = useState(false);

  /** Fait glisser jusqu'à la photo demandée, en bouclant aux extrémités. */
  const allerA = useCallback((index: number) => {
    const element = piste.current;
    if (!element) return;
    const carte = element.children[index] as HTMLElement | undefined;
    if (!carte) return;
    element.scrollTo({ left: carte.offsetLeft - element.offsetLeft, behavior: "smooth" });
  }, []);

  const pousser = (sens: 1 | -1) => {
    const suivant = (actif + sens + photos.length) % photos.length;
    setActif(suivant);
    allerA(suivant);
  };

  // Le mouvement automatique n'est armé qu'après vérification du réglage
  // système : personne ne doit recevoir d'animation qu'il a refusée.
  useEffect(() => {
    const requete = window.matchMedia("(prefers-reduced-motion: reduce)");
    const suivre = () => setAutomatique(!requete.matches);
    requete.addEventListener("change", suivre);
    const depart = setTimeout(() => setAutomatique(!requete.matches), 0);
    return () => {
      requete.removeEventListener("change", suivre);
      clearTimeout(depart);
    };
  }, []);

  useEffect(() => {
    if (!automatique || enPause || photos.length < 2) return;
    const minuteur = setInterval(() => {
      setActif((courant) => {
        const suivant = (courant + 1) % photos.length;
        allerA(suivant);
        return suivant;
      });
    }, INTERVALLE_MS);
    return () => clearInterval(minuteur);
  }, [automatique, enPause, photos.length, allerA]);

  /**
   * Garde le point actif en accord avec ce qu'on voit.
   *
   * Sans cela, faire glisser au doigt décalerait les indicateurs : le
   * visiteur serait sur la cinquième photo et le point indiquerait la
   * deuxième.
   */
  const surDefilement = () => {
    const element = piste.current;
    if (!element) return;
    const enfants = Array.from(element.children) as HTMLElement[];
    const centre = element.scrollLeft + element.clientWidth / 2;
    let proche = 0;
    let ecartMin = Infinity;
    enfants.forEach((enfant, index) => {
      const ecart = Math.abs(enfant.offsetLeft - element.offsetLeft + enfant.offsetWidth / 2 - centre);
      if (ecart < ecartMin) {
        ecartMin = ecart;
        proche = index;
      }
    });
    setActif(proche);
  };

  // Aucune photo déposée : la section disparaît plutôt que d'afficher un
  // cadre vide. Mieux vaut une page plus courte qu'une page qui attend.
  if (photos.length === 0) return null;

  return (
    <Section fond="craie" className="py-20 sm:py-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <TitreSection className="max-w-xl">Sur la route des Pêches</TitreSection>

        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => pousser(-1)}
            aria-label="Photo précédente"
            className="grid h-10 w-10 place-items-center rounded-full border border-noir-piste/20 transition-colors hover:bg-noir-piste/5"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={() => pousser(1)}
            aria-label="Photo suivante"
            className="grid h-10 w-10 place-items-center rounded-full border border-noir-piste/20 transition-colors hover:bg-noir-piste/5"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div
        ref={piste}
        onScroll={surDefilement}
        onMouseEnter={() => setEnPause(true)}
        onMouseLeave={() => setEnPause(false)}
        onTouchStart={() => setEnPause(true)}
        // La reprise est différée : relancer à l'instant où le doigt se
        // lève arracherait la photo que le visiteur vient d'amener.
        onTouchEnd={() => setTimeout(() => setEnPause(false), 4000)}
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, index) => (
          <figure
            key={photo.source}
            className="relative aspect-4/3 w-[80vw] shrink-0 snap-start overflow-hidden rounded-[var(--radius-bloc)] bg-craie-ombre sm:w-[24rem]"
          >
            <Image
              src={photo.source}
              alt={photo.description}
              fill
              sizes="(min-width: 640px) 24rem, 80vw"
              // Toutes différées, sans exception. Les trois premières
              // étaient chargées d'emblée pour qu'elles soient là quand
              // le visiteur arrive en bas. Mesuré sur une connexion
              // béninoise, cela coûtait 151 Ko servis avant même que la
              // page devienne cliquable, pour des photos situées sous
              // sept sections. Le navigateur les charge de lui-même à
              // l'approche, ce qui est bien assez tôt.
              loading="lazy"
              className="object-cover"
            />
          </figure>
        ))}
      </div>

      {/* Les points : ils situent, et ils permettent d'aller directement
          à une photo. Ils passent à la ligne quand il y en a beaucoup
          plutôt que de déborder. */}
      {photos.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center">
          {photos.map((photo, index) => (
            // Le point se voit à 8 px, mais on le touche sur 24. Mesuré
            // sur téléphone, le bouton faisait 8 px de côté : bien trop
            // petit pour un doigt, qui tombait à côté ou sur le voisin.
            // La zone tactile est le bouton, le point n'en est que le
            // dessin. Les boutons se touchent bord à bord, sans espace
            // perdu entre eux, ce qui les fait tenir sur une ligne même
            // sur un écran de 360 px.
            <button
              key={photo.source}
              type="button"
              onClick={() => {
                setActif(index);
                allerA(index);
              }}
              aria-label={`Aller à la photo ${index + 1} sur ${photos.length}`}
              aria-current={index === actif}
              className="group inline-flex h-6 min-w-6 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all ${
                  index === actif
                    ? "w-5 bg-noir-piste"
                    : "w-2 bg-noir-piste/25 group-hover:bg-noir-piste/50"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}
