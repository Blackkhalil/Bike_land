import Image from "next/image";

import { BoutonLien } from "@/components/Bouton";

/**
 * Héros de la page d'accueil.
 *
 * Composition reprise des références : fond noir, aplat orange vertical
 * décentré à droite, vélo détouré posé dessus qui déborde du bloc des
 * deux côtés. À gauche, un seul message — titre sur deux lignes, une
 * phrase, deux boutons. Pas de carrousel.
 *
 * C'est le seul endroit du site qui porte une animation d'entrée : le
 * vélo arrive depuis la droite pendant que l'aplat se déploie (brief §2).
 */
export function Hero({ nombreVelos }: { nombreVelos: number }) {
  return (
    <section className="relative isolate overflow-hidden bg-noir-piste text-craie">
      {/* Aplat orange. Sur grand écran, bande verticale décentrée à
          droite. Sur mobile, elle passerait en travers du titre et des
          boutons : elle bascule donc en bandeau bas, derrière le vélo. */}
      <div
        aria-hidden="true"
        className="heros-aplat absolute inset-x-0 bottom-0 -z-10 h-[38%] bg-orange-signal sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[30%] lg:w-[26%]"
      />

      <div className="mx-auto grid min-h-[max(620px,88svh)] max-w-[1280px] grid-cols-1 items-center gap-8 px-5 pb-16 pt-[104px] sm:px-8 lg:grid-cols-2 lg:gap-4 lg:pb-24 lg:pt-[120px]">
        <div className="relative z-10 max-w-xl">
          <h1 className="titre-editorial text-[clamp(2.75rem,7.5vw,5.25rem)]">
            Louez le vélo,
            <br />
            gardez la route
          </h1>

          <p className="mt-6 max-w-md text-[1.02rem] leading-relaxed text-craie/75">
            {nombreVelos} vélos préparés pour la route des Pêches, à Cotonou. Une sortie encadrée par un
            coordinateur, sans caution et sans compte à créer.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BoutonLien href="/velos" variante="primaire" taille="lg">
              Réserver un vélo
            </BoutonLien>
            <BoutonLien href="/itineraires" variante="contour" taille="lg" className="text-craie">
              Voir les tours
            </BoutonLien>
          </div>
        </div>

        {/* Le vélo déborde de l'aplat : il sort de la grille à droite et
            mord sur la colonne de texte à gauche. C'est l'objet le
            héros, pas le texte.

            La photo a un fond noir et non transparent : elle est donc
            posée sur la partie noire du cadre, où ce fond disparaît, et
            ne chevauche l'aplat orange que par sa moitié droite. Le
            masque adoucit la lisière. Avec un PNG détouré, tout ce
            bricolage tomberait — cf. la demande de visuels en fin de
            lot. */}
        <div className="heros-objet relative z-0 -mx-5 lg:mx-0 lg:-ml-28 lg:w-[calc(100%+9rem)]">
          <Image
            src="/images/micke-lindstrom-Vz4O-jhHvfk-unsplash.jpg"
            alt="Vélo de route vu de profil"
            width={3640}
            height={4200}
            priority
            sizes="(min-width: 1024px) 640px, 100vw"
            className="h-auto w-full object-contain [mask-image:radial-gradient(closest-side,black_70%,transparent_97%)]"
          />
        </div>
      </div>
    </section>
  );
}
