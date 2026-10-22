"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { GAMMES, GRILLE_HORAIRE, PRIX_GBASHI_BIKE_XOF, PRIX_ROAD_TRIP_XOF, type GammeVelo } from "@/data/offres";
import { formatXof } from "@/lib/format";
import type { StatutVelo, Velo } from "@/lib/types";

/**
 * Contrôles d'exploitation d'un vélo : sa disponibilité et sa gamme.
 *
 * Ce sont les deux seules choses qui bougent une fois la machine au
 * parc. Le reste de la fiche (géométrie, équipement, photo) relève du
 * catalogue et ne se retouche pas entre deux sorties.
 *
 * La gamme commande le tarif. La changer ici change ce que paieront les
 * prochains clients, rien de plus : les réservations déjà prises gardent
 * le montant inscrit dessus, qui a été payé. C'est pourquoi le bouton
 * annonce le nouveau prix avant qu'on clique.
 *
 * Le changement est immédiat et se répercute sur le site public : un
 * vélo passé à l'atelier disparaît des dates réservables dans la minute.
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

  const envoyer = async (champs: { statut?: StatutVelo; gamme?: GammeVelo }) => {
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
      {/* ------------------------------------------------ Disponibilité */}
      <p className="etiquette opacity-70">Disponibilité</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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

      {/* -------------------------------------------------------- Gamme */}
      <p className="etiquette mt-5 opacity-70">Gamme et tarif</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {GAMMES.map((gamme) => {
          const actif = velo.gamme === gamme.code;
          const prixHeure = GRILLE_HORAIRE[gamme.code][0].prixXof;
          return (
            <button
              key={gamme.code}
              type="button"
              onClick={() => !actif && envoyer({ gamme: gamme.code })}
              aria-pressed={actif}
              title={`${formatXof(prixHeure)} l'heure, road trip ${formatXof(
                PRIX_ROAD_TRIP_XOF[gamme.code],
              )} et Gbashi bike ${formatXof(PRIX_GBASHI_BIKE_XOF[gamme.code])} par personne`}
              className={`min-h-[40px] rounded-[var(--radius-bouton)] border px-3.5 text-[0.82rem] font-semibold transition-colors ${
                actif
                  ? "border-orange-signal bg-orange-signal text-noir-piste"
                  : "border-noir-piste/20 text-gris-cadre hover:border-noir-piste/50 hover:text-noir-piste"
              }`}
            >
              {gamme.nom}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[0.78rem] text-gris-cadre">
        {formatXof(GRILLE_HORAIRE[velo.gamme][0].prixXof)} l&apos;heure, road trip{" "}
        {formatXof(PRIX_ROAD_TRIP_XOF[velo.gamme])} le samedi, Gbashi bike{" "}
        {formatXof(PRIX_GBASHI_BIKE_XOF[velo.gamme])} le dimanche, par personne. Les réservations déjà prises
        gardent leur montant.
      </p>

      {erreur && (
        <p role="alert" className="mt-2 text-[0.82rem] font-medium text-orange-sourd">
          {erreur}
        </p>
      )}
    </div>
  );
}
