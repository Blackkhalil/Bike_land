"use client";

import { useEffect, useState } from "react";

/**
 * Le prénom de qui agit dans l'administration : il signe la ligne du
 * journal (« admin (Koffi) »), puisqu'il n'y a qu'un compte. Retenu sur ce
 * téléphone, sous la même clé que « Argent reçu par » au comptoir
 * (src/components/admin/VenteEspeces.tsx) : on ne le tape qu'une fois.
 */
const CLE_PRENOM = "bikeland.encaisse-par";

/** Le prénom retenu, à modifier, et de quoi le retenir après un envoi réussi. */
export function usePrenomRetenu(): {
  prenom: string;
  setPrenom: (valeur: string) => void;
  retenir: () => void;
} {
  const [prenom, setPrenom] = useState("");

  // Lu après le premier rendu : le serveur n'en sait rien.
  useEffect(() => {
    const depart = setTimeout(() => {
      try {
        const retenu = window.localStorage.getItem(CLE_PRENOM);
        if (retenu) setPrenom((actuel) => actuel || retenu);
      } catch {
        // Stockage indisponible (navigation privée) : on le retapera.
      }
    }, 0);
    return () => clearTimeout(depart);
  }, []);

  const retenir = () => {
    try {
      if (prenom.trim()) window.localStorage.setItem(CLE_PRENOM, prenom.trim());
    } catch {
      // Sans stockage, le prénom sera simplement à retaper.
    }
  };

  return { prenom, setPrenom, retenir };
}

/** La case « Votre prénom », la même partout. */
export function ChampPrenom({
  id,
  valeur,
  onChange,
  erreur,
  aide = "Il signe le journal. Retenu sur ce téléphone.",
}: {
  id: string;
  valeur: string;
  onChange: (valeur: string) => void;
  erreur?: string;
  aide?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[0.78rem] font-semibold text-gris-cadre">Votre prénom</span>
      <input
        id={id}
        type="text"
        autoComplete="given-name"
        maxLength={40}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={`${id}-note`}
        className={`mt-1 h-10 w-full rounded-[var(--radius-bouton)] border bg-white px-3 text-[0.88rem] ${
          erreur ? "border-orange-signal" : "border-noir-piste/20"
        }`}
      />
      <span id={`${id}-note`} className={`mt-1 block text-[0.74rem] ${erreur ? "text-orange-sourd" : "text-gris-cadre"}`}>
        {erreur ?? aide}
      </span>
    </label>
  );
}
