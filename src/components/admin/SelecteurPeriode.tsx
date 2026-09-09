"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { Granularite } from "@/lib/statistiques";

/** Filtre de période du tableau de bord (§2.3), porté par l'URL. */
const choix: { valeur: Granularite; libelle: string }[] = [
  { valeur: "jour", libelle: "Jour" },
  { valeur: "semaine", libelle: "Semaine" },
  { valeur: "mois", libelle: "Mois" },
  { valeur: "annee", libelle: "Année" },
];

export function SelecteurPeriode({ actuelle }: { actuelle: Granularite }) {
  const routeur = useRouter();
  const parametres = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const changer = (valeur: Granularite) => {
    const params = new URLSearchParams(parametres.toString());
    params.set("periode", valeur);
    demarrer(() => routeur.replace(`/admin?${params}`, { scroll: false }));
  };

  return (
    <div
      role="group"
      aria-label="Période d'analyse"
      className={`inline-flex gap-1 rounded-full bg-white p-1 transition-opacity ${
        enCours ? "opacity-50" : ""
      }`}
    >
      {choix.map((option) => (
        <button
          key={option.valeur}
          type="button"
          onClick={() => changer(option.valeur)}
          aria-pressed={actuelle === option.valeur}
          className={`rounded-full px-4 py-1.5 text-[0.82rem] font-semibold transition-colors ${
            actuelle === option.valeur
              ? "bg-encre-900 text-sable-50"
              : "text-encre-500 hover:text-encre-900"
          }`}
        >
          {option.libelle}
        </button>
      ))}
    </div>
  );
}
