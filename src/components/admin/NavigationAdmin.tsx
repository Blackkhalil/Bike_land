"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Marque } from "@/components/Marque";
import { site } from "@/lib/site";

/**
 * Barre latérale de l'espace exploitant.
 *
 * Elle affiche en permanence la source de données active : en mode
 * démonstration, les écritures ne sont pas persistées, et l'exploitant
 * doit le savoir avant de saisir quoi que ce soit.
 */

const liens = [
  { href: "/admin/aujourdhui", libelle: "La sortie du jour" },
  { href: "/admin/especes", libelle: "Ventes en espèces" },
  { href: "/admin", libelle: "Tableau de bord", exact: true },
  { href: "/admin/bilan", libelle: "Bilan des semaines" },
  { href: "/admin/reservations", libelle: "Réservations" },
  { href: "/admin/velos", libelle: "Parc de vélos" },
  { href: "/admin/clients", libelle: "Clients" },
  { href: "/admin/avis", libelle: "Avis clients" },
  { href: "/admin/messages", libelle: "Messages reçus" },
  { href: "/admin/parrainage", libelle: "Parrainage" },
];

export function NavigationAdmin({
  protege,
  modeDonnees,
}: {
  protege: boolean;
  modeDonnees: "postgres" | "demo";
}) {
  const chemin = usePathname();
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);

  const deconnecter = async () => {
    await fetch("/api/admin/connexion", { method: "DELETE" });
    routeur.push("/admin/connexion");
    routeur.refresh();
  };

  return (
    <>
      {/* Barre mobile */}
      <div className="flex items-center justify-between border-b border-craie/15 bg-noir-piste px-5 py-3 text-craie lg:hidden">
        <Link href="/admin" className="cible-elargie">
          <Marque taille={26} />
        </Link>
        <button
          type="button"
          onClick={() => setOuvert((etat) => !etat)}
          className="min-h-11 rounded-full border border-craie/30 px-5 py-2 text-[0.85rem] font-semibold"
          aria-expanded={ouvert}
        >
          {ouvert ? "Fermer" : "Menu"}
        </button>
      </div>

      <nav
        aria-label="Navigation de l'administration"
        className={`${
          ouvert ? "block" : "hidden"
        } border-b border-craie/15 bg-noir-piste px-5 py-5 text-craie lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-craie/15 lg:px-6 lg:py-5`}
      >
        <Link href="/admin" className="hidden lg:block">
          <Marque taille={28} />
        </Link>

        <p className="mt-5 hidden text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-craie/40 lg:block">Exploitation</p>
        <ul className="mt-3 space-y-1">
          {liens.map((lien) => {
            const actif = lien.exact ? chemin === lien.href : chemin.startsWith(lien.href);
            return (
              <li key={lien.href}>
                <Link
                  href={lien.href}
                  onClick={() => setOuvert(false)}
                  aria-current={actif ? "page" : undefined}
                  className={`block rounded-[var(--radius-bouton)] px-3.5 py-2.5 text-[0.9rem] font-medium transition-colors lg:py-2 ${
                    actif ? "bg-orange-signal text-noir-piste" : "text-craie/75 hover:bg-craie/10 hover:text-craie"
                  }`}
                >
                  {lien.libelle}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Resserré sur grand écran : sur 800 px de haut, la barre fixe
            cachait « Sécurité du compte » et « Se déconnecter ». */}
        <div className="mt-8 space-y-3 border-t border-craie/15 pt-5 lg:mt-5 lg:space-y-1 lg:pt-4">
          <p
            className={`rounded-[var(--radius-bouton)] px-3.5 py-2.5 text-[0.76rem] leading-relaxed ${
              modeDonnees === "demo"
                ? "bg-orange-signal/15 text-orange-signal"
                : "bg-vert-lagune/20 text-vert-lagune-vif"
            }`}
          >
            {modeDonnees === "demo" ? (
              <>
                <strong>Mode démonstration.</strong> Les données sont fictives et les
                modifications ne sont pas conservées. Renseignez <code>DATABASE_URL</code> pour
                passer sur PostgreSQL.
              </>
            ) : (
              <>
                <strong>Base PostgreSQL.</strong> Les données affichées sont celles de
                l&apos;exploitation.
              </>
            )}
          </p>

          {/* Lien complet et non relatif : l'administration peut avoir
              sa propre adresse, où « / » ne mènerait pas au site. */}
          <a
            href={site.url}
            className="block rounded-[var(--radius-bouton)] px-3.5 py-2 text-[0.85rem] text-craie/60 transition-colors hover:text-craie"
          >
            ← Voir le site public
          </a>
          <Link
            href="/admin/securite"
            onClick={() => setOuvert(false)}
            className="block rounded-[var(--radius-bouton)] px-3.5 py-2 text-[0.85rem] text-craie/60 transition-colors hover:text-craie"
          >
            Sécurité du compte
          </Link>

          {protege && (
            <button
              type="button"
              onClick={deconnecter}
              className="block w-full rounded-[var(--radius-bouton)] px-3.5 py-2 text-left text-[0.85rem] text-craie/60 transition-colors hover:text-craie"
            >
              Se déconnecter
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
