import Link from "next/link";

import { Marque } from "./Marque";
import { navigationLegale, navigationPrincipale, navigationSecondaire, site } from "@/lib/site";

/**
 * Pied de page, fond noir.
 *
 * La signature en très grand corps est conservée, c'est un élément
 * graphique, pas un titre, et elle joue le rôle de bloc plein que le
 * brief §2 recherche. Elle passe simplement en casse phrase et perd son
 * grain décoratif.
 */
export function PiedDePage() {
  const annee = new Date().getFullYear();

  return (
    <footer className="bg-noir-piste text-craie">
      <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-20 sm:px-8">
        <p
          aria-hidden="true"
          className="titre-editorial select-none text-[clamp(3.5rem,15vw,12rem)] leading-[0.82] text-craie/10"
        >
          Bike Land
        </p>

        <div className="mt-14 grid gap-12 border-t border-craie/15 pt-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Marque />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-craie/65">
              Location de vélos et sorties encadrées sur la route des Pêches, à Cotonou. Vélos
              préparés, réglés à votre taille, suivis un par un.
            </p>
          </div>

          <nav aria-label="Explorer">
            <p className="etiquette text-craie/70">Explorer</p>
            <ul className="mt-5 space-y-3">
              {navigationPrincipale.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className="lien-souligne cible-elargie text-[0.95rem] text-craie/85">
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Informations">
            <p className="etiquette text-craie/70">Informations</p>
            <ul className="mt-5 space-y-3">
              {navigationSecondaire.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className="lien-souligne cible-elargie text-[0.95rem] text-craie/85">
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="etiquette text-craie/70">Nous joindre</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-craie/85">
              <li>
                <a href={`tel:${site.telephoneLien}`} className="lien-souligne cible-elargie">
                  {site.telephone}
                </a>
              </li>
              <li>
                <a href={`mailto:${site.email}`} className="lien-souligne cible-elargie">
                  {site.email}
                </a>
              </li>
              <li className="text-craie/60">
                Route des Pêches, {site.adresse.ville}, {site.adresse.pays}
              </li>
              <li className="text-craie/60">{site.horaires}</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              {site.reseaux.map((reseau) => (
                <a
                  key={reseau.nom}
                  href={reseau.url}
                  rel="noreferrer noopener"
                  target="_blank"
                  className="inline-flex min-h-11 items-center rounded-full border border-craie/25 px-4 text-[0.8rem] transition-colors hover:border-orange-signal hover:text-orange-signal"
                >
                  {reseau.nom}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-craie/15 pt-7 text-[0.8rem] text-craie/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {annee} {site.nom}. Tous droits réservés. Textes, photos et vidéos protégés : toute
            reproduction ou copie est interdite sans notre autorisation écrite.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-5">
            {navigationLegale.map((lien) => (
              <li key={lien.href}>
                <Link href={lien.href} className="lien-souligne cible-elargie">
                  {lien.libelle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
