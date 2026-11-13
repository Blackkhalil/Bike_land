"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  EVENEMENT_DEMANDE_EN_ATTENTE,
  lireDemande,
  oublierDemande,
  texteDemandeEnAttente,
} from "@/lib/demande-en-attente";

/** Relit la demande gardée quand elle change, et chaque minute pour sa fin de délai. */
function abonner(rappel: () => void): () => void {
  window.addEventListener(EVENEMENT_DEMANDE_EN_ATTENTE, rappel);
  window.addEventListener("storage", rappel);
  const minuteur = window.setInterval(rappel, 60_000);
  return () => {
    window.removeEventListener(EVENEMENT_DEMANDE_EN_ATTENTE, rappel);
    window.removeEventListener("storage", rappel);
    window.clearInterval(minuteur);
  };
}

const aucuneCoteServeur = () => null;

/**
 * « Reprendre ma demande » : la demande de cet onglet attend encore son
 * paiement (src/lib/demande-en-attente.ts). Le client revenu de son
 * application Mobile Money, l'onglet rechargé, retrouve la page de suivi où
 * la demande de paiement se relance, au lieu d'un formulaire vide. Rien ne
 * s'affiche sans demande gardée, ni côté serveur.
 */
export function RepriseDemande({ className = "" }: { className?: string }) {
  const brute = useSyncExternalStore(abonner, () => texteDemandeEnAttente(), aucuneCoteServeur);
  const demande = lireDemande(brute);
  if (!demande) return null;
  return (
    <div
      role="status"
      className={`rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-5 py-4 text-[0.9rem] leading-relaxed ${className}`}
    >
      <p>
        Une demande à votre nom attend encore son paiement (
        <span className="whitespace-nowrap font-mono">{demande.reference}</span>). Les vélos vous restent gardés
        quelques minutes.
      </p>
      <a
        href={`/reservation/${demande.token}`}
        className="lien-souligne cible-elargie mt-2 inline-block font-semibold text-orange-sourd"
      >
        Reprendre ma demande
      </a>
    </div>
  );
}

/** Oublie la demande gardée dans l'onglet : la page de suivi la voit payée, annulée ou expirée. */
export function OublierDemande({ reference }: { reference: string }) {
  useEffect(() => {
    oublierDemande(reference);
  }, [reference]);
  return null;
}
