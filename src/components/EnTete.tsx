"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Marque } from "./Marque";
import { navigationPrincipale, navigationSecondaire } from "@/lib/site";

/**
 * En-tête flottant.
 *
 * Sur la page d'accueil il démarre transparent, posé sur le visuel du hero,
 * puis prend un fond opaque dès que la page défile. Ailleurs il est opaque
 * dès le chargement, sans quoi les titres passeraient dessous.
 */
export function EnTete() {
  const chemin = usePathname();
  const [defile, setDefile] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);

  const surAccueil = chemin === "/";
  const opaque = defile || !surAccueil || menuOuvert;

  useEffect(() => {
    const auDefilement = () => setDefile(window.scrollY > 24);
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
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        opaque ? "bg-sable-50/92 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div
        className={`mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-6 px-5 transition-colors duration-500 sm:px-8 ${
          opaque ? "text-encre-900" : "text-sable-50"
        }`}
      >
        <Link href="/" aria-label="Bike Land, retour à l'accueil" className="shrink-0">
          <Marque />
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 lg:flex">
          {navigationPrincipale.map((lien) => (
            <Link
              key={lien.href}
              href={lien.href}
              className={`lien-souligne text-[0.9rem] font-medium transition-opacity hover:opacity-100 ${
                chemin?.startsWith(lien.href) ? "opacity-100" : "opacity-70"
              }`}
            >
              {lien.libelle}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/reservation/suivi"
            className="hidden text-[0.9rem] font-medium opacity-70 transition-opacity hover:opacity-100 md:block"
          >
            Ma réservation
          </Link>
          <Link
            href="/velos"
            className={`hidden rounded-full px-6 py-2.5 text-[0.875rem] font-semibold transition-colors duration-300 sm:inline-flex ${
              opaque
                ? "bg-encre-900 text-sable-50 hover:bg-terre-600"
                : "bg-sable-50 text-encre-900 hover:bg-white"
            }`}
          >
            Réserver un vélo
          </Link>

          <button
            type="button"
            onClick={() => setMenuOuvert((ouvert) => !ouvert)}
            aria-expanded={menuOuvert}
            aria-controls="menu-mobile"
            className="grid h-10 w-10 place-items-center rounded-full border border-current/20 lg:hidden"
          >
            <span className="sr-only">{menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}</span>
            <span className="relative block h-3.5 w-5">
              <span
                className={`absolute left-0 h-[2px] w-full bg-current transition-all duration-300 ${
                  menuOuvert ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 top-1.5 h-[2px] w-full bg-current transition-opacity duration-200 ${
                  menuOuvert ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 h-[2px] w-full bg-current transition-all duration-300 ${
                  menuOuvert ? "top-1.5 -rotate-45" : "top-3"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {menuOuvert && (
        <div
          id="menu-mobile"
          className="border-t border-encre-900/10 bg-sable-50 px-5 pb-10 pt-6 text-encre-900 lg:hidden"
        >
          <nav aria-label="Navigation mobile" className="flex flex-col">
            {[...navigationPrincipale, ...navigationSecondaire].map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                // La fermeture se fait au clic : un effet sur le chemin
                // déclencherait un rendu en cascade à chaque navigation.
                onClick={() => setMenuOuvert(false)}
                className="titre-editorial border-b border-encre-900/10 py-4 text-[1.6rem]"
              >
                {lien.libelle}
              </Link>
            ))}
          </nav>
          <Link
            href="/velos"
            onClick={() => setMenuOuvert(false)}
            className="mt-7 flex items-center justify-center rounded-full bg-terre-600 px-6 py-4 font-semibold text-sable-50"
          >
            Réserver un vélo
          </Link>
        </div>
      )}
    </header>
  );
}
