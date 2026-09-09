"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Marque } from "@/components/Marque";

/**
 * Barre latérale de l'espace exploitant.
 *
 * Elle affiche en permanence la source de données active : en mode
 * démonstration, les écritures ne sont pas persistées, et l'exploitant
 * doit le savoir avant de saisir quoi que ce soit.
 */

const liens = [
  { href: "/admin", libelle: "Tableau de bord", exact: true },
  { href: "/admin/reservations", libelle: "Réservations" },
  { href: "/admin/velos", libelle: "Parc de vélos" },
  { href: "/admin/clients", libelle: "Clients" },
  { href: "/admin/tarifs", libelle: "Tarifs" },
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
      <div className="flex items-center justify-between border-b border-encre-900/10 bg-white px-5 py-3 lg:hidden">
        <Link href="/admin">
          <Marque taille={26} />
        </Link>
        <button
          type="button"
          onClick={() => setOuvert((etat) => !etat)}
          className="rounded-full border border-encre-900/20 px-4 py-1.5 text-[0.8rem] font-semibold"
          aria-expanded={ouvert}
        >
          {ouvert ? "Fermer" : "Menu"}
        </button>
      </div>

      <nav
        aria-label="Navigation de l'administration"
        className={`${
          ouvert ? "block" : "hidden"
        } border-b border-encre-900/10 bg-white px-5 py-5 lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64 lg:border-b-0 lg:border-r lg:px-6 lg:py-7`}
      >
        <Link href="/admin" className="hidden lg:block">
          <Marque taille={28} />
        </Link>

        <p className="etiquette mt-8 hidden opacity-45 lg:block">Exploitation</p>
        <ul className="mt-3 space-y-1">
          {liens.map((lien) => {
            const actif = lien.exact ? chemin === lien.href : chemin.startsWith(lien.href);
            return (
              <li key={lien.href}>
                <Link
                  href={lien.href}
                  onClick={() => setOuvert(false)}
                  aria-current={actif ? "page" : undefined}
                  className={`block rounded-xl px-3.5 py-2.5 text-[0.9rem] font-medium transition-colors ${
                    actif ? "bg-encre-900 text-sable-50" : "text-encre-700 hover:bg-sable-100"
                  }`}
                >
                  {lien.libelle}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 space-y-3 border-t border-encre-900/10 pt-5">
          <p
            className={`rounded-xl px-3.5 py-2.5 text-[0.76rem] leading-relaxed ${
              modeDonnees === "demo"
                ? "bg-soleil-300/30 text-terre-800"
                : "bg-olive-100 text-olive-700"
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

          <Link
            href="/"
            className="block rounded-xl px-3.5 py-2 text-[0.85rem] text-encre-500 transition-colors hover:text-encre-900"
          >
            ← Retour au site
          </Link>

          {protege && (
            <button
              type="button"
              onClick={deconnecter}
              className="block w-full rounded-xl px-3.5 py-2 text-left text-[0.85rem] text-encre-500 transition-colors hover:text-encre-900"
            >
              Se déconnecter
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
