"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BoutonLien } from "./Bouton";
import { Marque } from "./Marque";
import { navigationPrincipale, navigationSecondaire } from "@/lib/site";

/**
 * En-tête collant.
 *
 * Logo à gauche, navigation centrée, actions à droite, la composition
 * des références fournies. Transparent au-dessus du héros, il bascule en
 * noir opaque après 80px de défilement (brief §2).
 *
 * Sur mobile, le logo et le bouton « Réserver » restent visibles en
 * permanence : c'est le CTA principal du site, il ne se cache pas dans
 * un menu. Le reste de la navigation passe dans le panneau plein écran.
 */
export function EnTete() {
  const chemin = usePathname();
  const [defile, setDefile] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);

  const surAccueil = chemin === "/";
  const opaque = defile || !surAccueil || menuOuvert;

  useEffect(() => {
    const auDefilement = () => setDefile(window.scrollY > 80);
    auDefilement();
    window.addEventListener("scroll", auDefilement, { passive: true });
    return () => window.removeEventListener("scroll", auDefilement);
  }, []);

  // Empêche le défilement de la page derrière le menu plein écran.
  useEffect(() => {
    document.body.style.overflow = menuOuvert ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOuvert]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 text-craie transition-colors duration-300 ${
        opaque ? "bg-noir-piste" : "bg-transparent"
      }`}
    >
      {/* Sous 1024 px, la navigation centrale disparaît : en grille, les
          actions tombaient alors dans la colonne du milieu, collées à
          gauche, et le bouton menu sortait de l'écran à 320 px. Elles
          vont donc à droite (flex), avec des marges plus serrées sous
          360 px ; la grille à trois colonnes revient avec la navigation. */}
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-2 px-4 min-[360px]:gap-3 min-[360px]:px-5 sm:px-8 lg:grid lg:grid-cols-[auto_1fr_auto] lg:gap-6">
        <Link href="/" aria-label="Bike Land, retour à l'accueil" className="shrink-0">
          <Marque />
        </Link>

        <nav aria-label="Navigation principale" className="hidden justify-center gap-9 lg:flex">
          {navigationPrincipale.map((lien) => {
            const actif = chemin?.startsWith(lien.href);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? "page" : undefined}
                className={`text-[0.9rem] font-medium transition-colors ${
                  actif ? "text-orange-signal" : "text-craie hover:text-orange-signal"
                }`}
              >
                {lien.libelle}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 min-[360px]:gap-3">
          <Link
            href="/reservation/suivi"
            className="hidden text-[0.9rem] font-medium text-craie/70 transition-colors hover:text-craie md:block"
          >
            Ma réservation
          </Link>

          {/* Au-dessus du héros, l'en-tête est transparent et l'aplat
              orange passe derrière ce bouton : un bouton orange y
              deviendrait invisible. Il passe donc en craie tant que
              l'en-tête n'est pas opaque. */}
          <BoutonLien href="/velos" variante={opaque ? "primaire" : "clair"} taille="sm" className="max-[359px]:px-3">
            Réserver
          </BoutonLien>

          <button
            type="button"
            onClick={() => setMenuOuvert((ouvert) => !ouvert)}
            aria-expanded={menuOuvert}
            aria-controls="menu-mobile"
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-craie/25 lg:hidden"
          >
            <span className="sr-only">{menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}</span>
            <span className="relative block h-3.5 w-5">
              <span
                className={`absolute left-0 h-[2px] w-full bg-current transition-all duration-200 ${
                  menuOuvert ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 top-1.5 h-[2px] w-full bg-current transition-opacity duration-150 ${
                  menuOuvert ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 h-[2px] w-full bg-current transition-all duration-200 ${
                  menuOuvert ? "top-1.5 -rotate-45" : "top-3"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {menuOuvert && (
        // Le panneau défile en lui-même : la page derrière est bloquée, et
        // sur un téléphone tenu à l'horizontale ses derniers liens
        // tomberaient sous l'écran, hors d'atteinte. Il couvre tout l'écran
        // sous l'en-tête : à la hauteur de ses seuls liens, il laissait voir
        // la page dessous, immobile mais encore cliquable.
        <div
          id="menu-mobile"
          className="h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain border-t border-craie/15 bg-noir-piste px-5 pb-10 pt-6 lg:hidden"
        >
          <nav aria-label="Navigation mobile" className="flex flex-col">
            {[...navigationPrincipale, ...navigationSecondaire].map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                // La fermeture se fait au clic : un effet sur le chemin
                // déclencherait un rendu en cascade à chaque navigation.
                onClick={() => setMenuOuvert(false)}
                className="titre-editorial border-b border-craie/12 py-4 text-[1.75rem] text-craie"
              >
                {lien.libelle}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
