"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { StatutVelo, Velo } from "@/lib/types";

/**
 * Contrôle d'exploitation d'un vélo : sa disponibilité.
 *
 * Le prix n'est PAS modifiable ici, et c'est volontaire : il ne dépend
 * plus du vélo mais de la formule choisie par le client — forfait pour
 * le road trip, grille horaire pour la location libre. Un champ de prix
 * par vélo laisserait croire le contraire. Les tarifs se changent dans
 * `src/data/offres.ts`.
 *
 * Le changement de statut est immédiat et se répercute sur le site
 * public : un vélo en entretien disparaît des dates réservables.
 */

const OPTIONS: { valeur: StatutVelo; libelle: string; consequence: string }[] = [
  {
    valeur: "DISPONIBLE",
    libelle: "En service",
    consequence: "Réservable sur le site.",
  },
  {
    valeur: "MAINTENANCE",
    libelle: "À l'atelier",
    consequence: "Visible sur le site mais non réservable.",
  },
  {
    valeur: "RETIRE",
    libelle: "Retiré du parc",
    consequence: "N'apparaît plus du tout sur le site.",
  },
];

export function ControlesVelo({ velo }: { velo: Velo }) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (champs: { statut: StatutVelo }) => {
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/velos/${velo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(champs),
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "La modification a échoué.");
        return false;
      }
      demarrerTransition(() => routeur.refresh());
      return true;
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
      return false;
    }
  };

  return (
    <div className={`mt-4 border-t border-noir-piste/10 pt-4 ${enCours ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {OPTIONS.map((option) => {
          const actif = velo.statut === option.valeur;
          return (
            <button
              key={option.valeur}
              type="button"
              onClick={() => !actif && envoyer({ statut: option.valeur })}
              aria-pressed={actif}
              title={option.consequence}
              className={`min-h-[40px] rounded-[var(--radius-bouton)] border px-3.5 text-[0.82rem] font-semibold transition-colors ${
                actif
                  ? "border-orange-signal bg-orange-signal text-noir-piste"
                  : "border-noir-piste/20 text-gris-cadre hover:border-noir-piste/50 hover:text-noir-piste"
              }`}
            >
              {option.libelle}
            </button>
          );
        })}

      </div>

      <p className="mt-2 text-[0.78rem] text-gris-cadre">
        {OPTIONS.find((option) => option.valeur === velo.statut)?.consequence ??
          "Statut déduit des réservations en cours."}
      </p>

      {erreur && (
        <p role="alert" className="mt-2 text-[0.82rem] font-medium text-orange-sourd">
          {erreur}
        </p>
      )}
    </div>
  );
}
