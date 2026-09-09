import Link from "next/link";

import { Marque } from "./Marque";
import { navigationLegale, navigationPrincipale, navigationSecondaire, site } from "@/lib/site";

export function PiedDePage() {
  const annee = new Date().getFullYear();

  return (
    <footer className="grain relative overflow-hidden bg-encre-900 text-sable-100">
      <div className="mx-auto max-w-[1400px] px-5 pb-10 pt-20 sm:px-8">
        {/* Le nom de la marque en très grand corps, comme signature de bas de page */}
        <p className="titre-editorial select-none text-[clamp(3.5rem,15vw,13rem)] leading-[0.8] text-sable-100/10">
          Bike Land
        </p>

        <div className="mt-14 grid gap-12 border-t border-sable-100/15 pt-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Marque className="text-sable-50" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sable-100/65">
              {site.baseline}. Vélos préparés, réglés à votre taille et suivis un par un,
              au départ de trois villes du Bénin.
            </p>
          </div>

          <nav aria-label="Explorer">
            <p className="etiquette text-sable-100/45">Explorer</p>
            <ul className="mt-5 space-y-3">
              {navigationPrincipale.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className="lien-souligne text-[0.95rem] text-sable-100/85">
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Informations">
            <p className="etiquette text-sable-100/45">Informations</p>
            <ul className="mt-5 space-y-3">
              {navigationSecondaire.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className="lien-souligne text-[0.95rem] text-sable-100/85">
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="etiquette text-sable-100/45">Nous joindre</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-sable-100/85">
              <li>
                <a href={`tel:${site.telephoneLien}`} className="lien-souligne">
                  {site.telephone}
                </a>
              </li>
              <li>
                <a href={`mailto:${site.email}`} className="lien-souligne">
                  {site.email}
                </a>
              </li>
              <li className="text-sable-100/60">
                {site.adresse.ligne}, {site.adresse.ville}, {site.adresse.pays}
              </li>
              <li className="text-sable-100/60">{site.horaires}</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              {site.reseaux.map((reseau) => (
                <a
                  key={reseau.nom}
                  href={reseau.url}
                  rel="noreferrer noopener"
                  target="_blank"
                  className="rounded-full border border-sable-100/25 px-4 py-1.5 text-[0.8rem] transition-colors hover:border-sable-100/60 hover:bg-sable-100/5"
                >
                  {reseau.nom}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-sable-100/15 pt-7 text-[0.8rem] text-sable-100/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {annee} {site.nom}. Tous droits réservés.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {navigationLegale.map((lien) => (
              <li key={lien.href}>
                <Link href={lien.href} className="lien-souligne">
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
