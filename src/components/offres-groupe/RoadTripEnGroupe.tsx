"use client";

import { BoutonChatGroupe } from "./BoutonChatGroupe";

/**
 * Le mot qui remplace le road trip par gamme quand l'interrupteur « Offres
 * de groupe » est ouvert (décision 1 du responsable) : dans l'encart de
 * réservation d'une gamme et dans le tunnel. Le bouton ouvre le chatbot sur
 * le road trip en groupe. Interrupteur coupé, il n'est jamais rendu.
 */
export function RoadTripEnGroupe({ className = "" }: { className?: string }) {
  return (
    <div className={`mt-3 rounded-[var(--radius-carte)] border border-noir-piste/15 bg-craie px-4 py-3 text-noir-piste ${className}`}>
      <p className="text-[0.9rem] font-semibold">Le road trip se réserve maintenant en groupe</p>
      <p className="mt-1 text-[0.82rem] leading-relaxed text-gris-cadre">
        Sur toute notre gamme de vélos, un par personne&nbsp;: notre assistant calcule le prix de votre groupe et
        réserve avec vous, paiement Mobile Money compris.
      </p>
      <BoutonChatGroupe offre="road-trip-groupe" variante="sombre" taille="sm" className="mt-3">
        Road trip en groupe
      </BoutonChatGroupe>
    </div>
  );
}
