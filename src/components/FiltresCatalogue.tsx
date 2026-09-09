"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import { libellesCategorie } from "@/data/catalogue";
import { aujourdhui, ajouterJours } from "@/lib/dates";
import type { CategorieVelo, PointDeRetrait, TailleVelo } from "@/lib/types";

/**
 * Filtres du catalogue.
 *
 * L'état vit dans l'URL, pas dans le composant : un filtrage est
 * partageable par lien, revient correctement avec le bouton « précédent »
 * et se recalcule côté serveur — la disponibilité par dates ne peut de
 * toute façon être vérifiée que là.
 */

const categories: CategorieVelo[] = ["RANDONNEUR", "GRAVEL", "VAE", "VTC", "TANDEM"];
const tailles: TailleVelo[] = ["S", "M", "L", "XL"];

export function FiltresCatalogue({
  points,
  nombreResultats,
}: {
  points: PointDeRetrait[];
  nombreResultats: number;
}) {
  const routeur = useRouter();
  const parametres = useSearchParams();
  const [enCours, demarrerTransition] = useTransition();

  const actuels = useMemo(
    () => ({
      categorie: parametres.getAll("categorie"),
      taille: parametres.getAll("taille"),
      point: parametres.get("point") ?? "",
      debut: parametres.get("debut") ?? "",
      fin: parametres.get("fin") ?? "",
    }),
    [parametres],
  );

  const auFiltre = (modifier: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(parametres.toString());
    modifier(params);
    demarrerTransition(() => {
      routeur.replace(`/velos${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  };

  const basculerValeur = (cle: string, valeur: string) => {
    auFiltre((params) => {
      const existantes = params.getAll(cle);
      params.delete(cle);
      const nouvelles = existantes.includes(valeur)
        ? existantes.filter((v) => v !== valeur)
        : [...existantes, valeur];
      nouvelles.forEach((v) => params.append(cle, v));
    });
  };

  const definir = (cle: string, valeur: string) => {
    auFiltre((params) => {
      if (valeur) params.set(cle, valeur);
      else params.delete(cle);
      // Une date de fin antérieure au début n'a pas de sens : on la recale.
      if (cle === "debut") {
        const fin = params.get("fin");
        if (fin && fin < valeur) params.set("fin", ajouterJours(valeur, 2));
      }
    });
  };

  const aDesFiltres =
    actuels.categorie.length > 0 || actuels.taille.length > 0 || actuels.point || actuels.debut;

  const minimum = aujourdhui();

  return (
    <div className="border-y border-encre-900/12 py-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
        <Groupe titre="Type de vélo">
          <div className="flex flex-wrap gap-2">
            {categories.map((categorie) => (
              <Puce
                key={categorie}
                actif={actuels.categorie.includes(categorie)}
                onClick={() => basculerValeur("categorie", categorie)}
              >
                {libellesCategorie[categorie]}
              </Puce>
            ))}
          </div>
        </Groupe>

        <Groupe titre="Taille">
          <div className="flex flex-wrap gap-2">
            {tailles.map((taille) => (
              <Puce
                key={taille}
                actif={actuels.taille.includes(taille)}
                onClick={() => basculerValeur("taille", taille)}
              >
                {taille}
              </Puce>
            ))}
          </div>
        </Groupe>

        <Groupe titre="Point de retrait">
          <select
            value={actuels.point}
            onChange={(evenement) => definir("point", evenement.target.value)}
            className="h-9 rounded-full border border-encre-900/20 bg-white px-4 text-[0.85rem] font-medium"
          >
            <option value="">Tous les points</option>
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.ville} — {point.nom}
              </option>
            ))}
          </select>
        </Groupe>

        <Groupe titre="Dates de location">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Date de départ"
              min={minimum}
              value={actuels.debut}
              onChange={(evenement) => definir("debut", evenement.target.value)}
              className="h-9 rounded-full border border-encre-900/20 bg-white px-4 text-[0.85rem]"
            />
            <span className="text-encre-500" aria-hidden="true">
              →
            </span>
            <input
              type="date"
              aria-label="Date de retour"
              min={actuels.debut || minimum}
              value={actuels.fin}
              onChange={(evenement) => definir("fin", evenement.target.value)}
              className="h-9 rounded-full border border-encre-900/20 bg-white px-4 text-[0.85rem]"
            />
          </div>
        </Groupe>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[0.85rem]">
        <p aria-live="polite" className={enCours ? "opacity-45" : "text-encre-500"}>
          <strong className="font-semibold text-encre-900 tabular-nums">{nombreResultats}</strong>{" "}
          {nombreResultats > 1 ? "vélos correspondent" : "vélo correspond"}
          {actuels.debut && actuels.fin ? " et sont libres sur ces dates" : ""}
        </p>
        {aDesFiltres && (
          <button
            type="button"
            onClick={() => demarrerTransition(() => routeur.replace("/velos", { scroll: false }))}
            className="lien-souligne font-semibold text-terre-700"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>
    </div>
  );
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="etiquette mb-2.5 opacity-55">{titre}</p>
      {children}
    </div>
  );
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`h-9 rounded-full border px-4 text-[0.85rem] font-medium transition-colors duration-200 ${
        actif
          ? "border-encre-900 bg-encre-900 text-sable-50"
          : "border-encre-900/20 bg-white hover:border-encre-900/45"
      }`}
    >
      {children}
    </button>
  );
}
