"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Bouton } from "@/components/Bouton";

/**
 * Accès au suivi à partir du lien reçu par email.
 *
 * On accepte aussi bien l'URL complète que le seul token, parce que c'est
 * ce que les gens collent réellement.
 */
export function FormulaireSuivi() {
  const routeur = useRouter();
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const ouvrir = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setErreur(null);

    const token = extraireToken(saisie);
    if (!token) {
      setErreur("Ce lien ne ressemble pas à un lien de suivi Bike Land.");
      return;
    }

    setEnCours(true);
    try {
      const reponse = await fetch(`/api/reservations/${encodeURIComponent(token)}`);
      if (!reponse.ok) {
        setErreur(
          "Aucune réservation ne correspond à ce lien. Vérifiez qu'il a été copié en entier.",
        );
        return;
      }
      routeur.push(`/reservation/${encodeURIComponent(token)}`);
    } catch {
      setErreur("Connexion interrompue. Réessayez.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={ouvrir} className="rounded-[1.5rem] bg-white p-6 sm:p-7">
      <label htmlFor="lien-suivi" className="etiquette opacity-55">
        Lien de suivi reçu par email
      </label>
      <input
        id="lien-suivi"
        value={saisie}
        onChange={(evenement) => setSaisie(evenement.target.value)}
        placeholder="https://bikeland.bj/reservation/BL-XXXXXX…"
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? "erreur-suivi" : undefined}
        className={`mt-2 w-full rounded-full border bg-sable-50 px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-terre-500 ${
          erreur ? "border-terre-500" : "border-encre-900/15"
        }`}
      />
      {erreur && (
        <p id="erreur-suivi" role="alert" className="mt-2 text-[0.85rem] text-terre-700">
          {erreur}
        </p>
      )}
      <Bouton type="submit" disabled={enCours || saisie.trim().length === 0} className="mt-5">
        {enCours ? "Recherche…" : "Ouvrir ma réservation"}
      </Bouton>
    </form>
  );
}

/** Récupère le token, que l'utilisateur ait collé l'URL entière ou le token seul. */
function extraireToken(saisie: string): string | null {
  const valeur = saisie.trim();
  if (!valeur) return null;

  const depuisUrl = valeur.match(/\/reservation\/([^/?#\s]+)/);
  const candidat = depuisUrl ? decodeURIComponent(depuisUrl[1]) : valeur;

  // Un token a la forme REFERENCE.aléatoire.signature.
  return candidat.split(".").length === 3 ? candidat : null;
}
