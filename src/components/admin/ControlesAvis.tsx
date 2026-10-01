"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Relecture d'un avis client.
 *
 * Publier ou retirer, rien d'autre : le texte n'est pas modifiable ici.
 * Le corriger reviendrait à faire dire au client ce qu'il n'a pas écrit,
 * et un avis retouché ne vaudrait plus rien pour celui qui le lit.
 *
 * Le retrait est aussi réversible que la publication, un avis retiré
 * n'est pas effacé, il cesse simplement de paraître sur le site.
 */
export function ControlesAvis({ id, publie }: { id: string; publie: boolean }) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = async (nouvelEtat: boolean) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/avis/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publie: nouvelEtat }),
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "La modification a échoué.");
        return;
      }
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {publie ? (
        <button
          type="button"
          onClick={() => basculer(false)}
          disabled={envoi || enCours}
          className="rounded-[var(--radius-bouton)] border border-noir-piste/25 px-5 py-2.5 text-[0.85rem] font-semibold transition-colors hover:bg-noir-piste/5 disabled:opacity-50"
        >
          Retirer du site
        </button>
      ) : (
        <button
          type="button"
          onClick={() => basculer(true)}
          disabled={envoi || enCours}
          className="rounded-[var(--radius-bouton)] bg-orange-signal px-5 py-2.5 text-[0.85rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          Publier sur la fiche du vélo
        </button>
      )}

      {erreur && <span className="text-[0.82rem] text-orange-sourd">{erreur}</span>}
    </div>
  );
}
