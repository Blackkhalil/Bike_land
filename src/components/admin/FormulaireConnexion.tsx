"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FormulaireConnexion() {
  const routeur = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setEnCours(true);
    setErreur(null);

    try {
      const reponse = await fetch("/api/admin/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse }),
      });

      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "Connexion refusée.");
        return;
      }
      routeur.push("/admin");
      routeur.refresh();
    } catch {
      setErreur("Connexion interrompue.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <label htmlFor="mot-de-passe" className="etiquette opacity-60">
        Mot de passe
      </label>
      <input
        id="mot-de-passe"
        type="password"
        autoComplete="current-password"
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        aria-invalid={erreur ? true : undefined}
        className="mt-2 w-full rounded-full border border-sable-100/25 bg-sable-100/10 px-5 py-3 text-[0.95rem] text-sable-50 outline-none transition-colors focus:border-sable-100/60"
      />
      {erreur && (
        <p role="alert" className="mt-3 text-[0.85rem] text-soleil-300">
          {erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours || motDePasse.length === 0}
        className="mt-6 w-full rounded-full bg-sable-50 px-6 py-3.5 font-semibold text-encre-900 transition-colors hover:bg-white disabled:opacity-40"
      >
        {enCours ? "Vérification…" : "Entrer"}
      </button>
    </form>
  );
}
