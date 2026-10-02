"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Efface les paniers abandonnés depuis l'espace d'exploitation.
 *
 * Un panier abandonné est une réservation créée puis jamais payée, dont
 * le délai est passé. Elle ne retient plus aucun vélo, mais elle reste
 * en base et encombre la liste.
 *
 * Le bouton n'apparaît que s'il y a quelque chose à effacer, et il dit
 * combien. Un bouton « Nettoyer » toujours présent inviterait à cliquer
 * sans savoir ce qui part.
 */
export function NettoyerPaniers({ nombre }: { nombre: number }) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [envoi, setEnvoi] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (nombre === 0) return null;

  const effacer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/admin/paniers", { method: "POST" });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "L'effacement a échoué.");
        return;
      }
      setConfirme(false);
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {confirme ? (
        <>
          <span className="text-[0.85rem]">
            Effacer {nombre} panier{nombre > 1 ? "s" : ""} jamais payé
            {nombre > 1 ? "s" : ""} ?
          </span>
          <button
            type="button"
            onClick={effacer}
            disabled={envoi || enCours}
            className="rounded-[var(--radius-bouton)] bg-orange-signal px-5 py-2.5 text-[0.85rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {envoi ? "Effacement…" : "Oui, effacer"}
          </button>
          <button
            type="button"
            onClick={() => setConfirme(false)}
            disabled={envoi || enCours}
            className="lien-souligne text-[0.85rem]"
          >
            Annuler
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirme(true)}
          className="rounded-[var(--radius-bouton)] border border-noir-piste/25 px-5 py-2.5 text-[0.85rem] font-semibold transition-colors hover:bg-noir-piste/5"
        >
          Effacer {nombre} panier{nombre > 1 ? "s" : ""} abandonné
          {nombre > 1 ? "s" : ""}
        </button>
      )}

      {erreur && <span className="text-[0.82rem] text-orange-sourd">{erreur}</span>}
    </div>
  );
}
