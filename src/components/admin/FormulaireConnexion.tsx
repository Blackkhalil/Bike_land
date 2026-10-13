"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * `codeDemande` : la double authentification est active, le code à six
 * chiffres de l'application est demandé en plus du mot de passe.
 */
export function FormulaireConnexion({ codeDemande = false }: { codeDemande?: boolean }) {
  const routeur = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
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
        body: JSON.stringify({ email, motDePasse, code: codeDemande ? code : undefined }),
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
      <label htmlFor="email-admin" className="etiquette opacity-75">
        Adresse email
      </label>
      <input
        id="email-admin"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        aria-invalid={erreur ? true : undefined}
        className="mb-6 mt-2 w-full rounded-full border border-craie/25 bg-craie/10 px-5 py-3 text-[0.95rem] text-craie outline-none transition-colors focus:border-craie/60"
      />

      <label htmlFor="mot-de-passe" className="etiquette opacity-75">
        Mot de passe
      </label>
      <input
        id="mot-de-passe"
        type="password"
        autoComplete="current-password"
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        aria-invalid={erreur ? true : undefined}
        className="mt-2 w-full rounded-full border border-craie/25 bg-craie/10 px-5 py-3 text-[0.95rem] text-craie outline-none transition-colors focus:border-craie/60"
      />
      {codeDemande && (
        <>
          <label htmlFor="code-admin" className="etiquette mt-6 block opacity-75">
            Code de l&apos;application (6 chiffres)
          </label>
          <input
            id="code-admin"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            onChange={(evenement) => setCode(evenement.target.value)}
            aria-invalid={erreur ? true : undefined}
            className="mt-2 w-full rounded-full border border-craie/25 bg-craie/10 px-5 py-3 text-[0.95rem] tracking-[0.3em] text-craie outline-none transition-colors focus:border-craie/60"
          />
        </>
      )}
      {erreur && (
        <p role="alert" className="mt-3 text-[0.85rem] text-orange-signal/55">
          {erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={
          enCours ||
          email.trim().length === 0 ||
          motDePasse.length === 0 ||
          (codeDemande && code.replace(/\s/g, "").length !== 6)
        }
        className="mt-6 w-full rounded-full bg-craie px-6 py-3.5 font-semibold text-noir-piste transition-colors hover:bg-white disabled:opacity-40"
      >
        {enCours ? "Vérification…" : "Entrer"}
      </button>
    </form>
  );
}
