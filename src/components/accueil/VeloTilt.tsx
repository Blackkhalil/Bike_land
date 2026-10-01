"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Le vélo en relief, qui suit la souris.
 *
 * Trois couches d'effet, et chacune a une raison :
 *
 *  - **l'inclinaison** répond au pointeur. Elle est faible, huit degrés
 *    au maximum, parce qu'au-delà l'image se déforme et qu'on voit le
 *    truc plutôt que le vélo.
 *  - **la lueur** posée sous le vélo glisse en sens inverse quand on
 *    incline, comme le ferait une ombre. C'est elle qui donne la
 *    profondeur : sans elle, l'objet tourne dans le vide.
 *  - **l'entrée** part d'un léger zoom arrière et d'une rotation, puis
 *    se pose. Elle ne joue qu'une fois.
 *
 * **Sur mobile, pas de souris** : l'inclinaison est remplacée par un
 * balancement lent et automatique. Suivre l'accéléromètre aurait demandé
 * une autorisation au visiteur, beaucoup trop cher payé pour un effet.
 *
 * L'animation respecte `prefers-reduced-motion` : quelqu'un qui a
 * demandé moins de mouvement à son système n'en reçoit aucun ici.
 */
export function VeloTilt({
  source,
  alt,
  className = "",
  classeImage = "",
  largeur = 1300,
  hauteur = 1160,
  /**
   * Fond sombre : la lueur devient claire.
   *
   * Une ombre noire sur une section noire ne se voit pas. Sur fond
   * sombre, c'est un halo clair qui détache le vélo, l'inverse exact du
   * même effet.
   */
  surFondSombre = false,
  /**
   * Angle de départ de l'animation d'entrée, en degrés.
   *
   * Le vélo arrive tourné puis se redresse. Plus l'angle est marqué,
   * plus l'entrée est franche, au-delà d'une vingtaine de degrés, la
   * photo se déforme visiblement pendant la rotation.
   */
  rotationEntree = -14,
}: {
  source: string;
  alt: string;
  className?: string;
  classeImage?: string;
  largeur?: number;
  hauteur?: number;
  surFondSombre?: boolean;
  rotationEntree?: number;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const [inclinaison, setInclinaison] = useState({ x: 0, y: 0 });
  const [entre, setEntre] = useState(false);
  const [mouvementReduit, setMouvementReduit] = useState(false);

  useEffect(() => {
    const requete = window.matchMedia("(prefers-reduced-motion: reduce)");
    const suivre = () => setMouvementReduit(requete.matches);
    requete.addEventListener("change", suivre);

    // Les deux états sont posés au tour de boucle suivant, et non dans
    // le corps de l'effet : écrire l'état de façon synchrone y enchaîne
    // des rendus, et l'entrée n'aurait de toute façon rien à interpoler.
    const depart = setTimeout(() => {
      setMouvementReduit(requete.matches);
      setEntre(true);
    }, 40);

    return () => {
      requete.removeEventListener("change", suivre);
      clearTimeout(depart);
    };
  }, []);

  const suivreSouris = (evenement: React.MouseEvent<HTMLDivElement>) => {
    if (mouvementReduit) return;
    const boite = cadre.current?.getBoundingClientRect();
    if (!boite) return;
    // Position du pointeur ramenée à l'intervalle [-1, 1] depuis le
    // centre du cadre : c'est ce qui rend l'effet indépendant de la
    // taille de l'écran.
    const x = (evenement.clientX - boite.left) / boite.width - 0.5;
    const y = (evenement.clientY - boite.top) / boite.height - 0.5;
    setInclinaison({ x: x * 2, y: y * 2 });
  };

  const relacher = () => setInclinaison({ x: 0, y: 0 });

  const ANGLE_MAX = 8;
  const transforme = entre
    ? mouvementReduit
      ? "none"
      : `perspective(1200px) rotateY(${inclinaison.x * ANGLE_MAX}deg) rotateX(${
          -inclinaison.y * ANGLE_MAX
        }deg)`
    : `perspective(1200px) rotateY(${rotationEntree}deg) rotateZ(${
        rotationEntree / 4
      }deg) scale(0.9)`;

  return (
    <div
      ref={cadre}
      onMouseMove={suivreSouris}
      onMouseLeave={relacher}
      className={`relative ${className}`}
    >
      {/* La lueur, dessinée à part : elle glisse en sens inverse du vélo,
          ce qui est exactement ce que fait une ombre réelle. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[68%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-3xl transition-transform duration-300 ease-out ${
          surFondSombre ? "bg-craie/12" : "bg-noir-piste/20"
        }`}
        style={{
          transform: `translate(-50%, -50%) translateX(${-inclinaison.x * 26}px) translateY(${
            -inclinaison.y * 12
          }px)`,
        }}
      />

      <div
        className="will-change-transform"
        style={{
          transform: transforme,
          opacity: entre ? 1 : 0,
          transitionProperty: "transform, opacity",
          transitionDuration: entre ? "300ms" : "900ms",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Image
          src={source}
          alt={alt}
          width={largeur}
          height={hauteur}
          priority
          sizes="(min-width: 1024px) 640px, 100vw"
          className={`h-auto w-full object-contain motion-safe:sm:animate-[flotter_6s_ease-in-out_infinite] ${classeImage}`}
        />
      </div>
    </div>
  );
}
