"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Bouton } from "@/components/Bouton";

/**
 * Annulation depuis le lien de suivi.
 *
 * Deux clics sont nécessaires : l'action est irréversible et le premier
 * bouton n'est pas une confirmation.
 */
export function AnnulerReservation({
  reference,
  token,
  gratuite,
  dateLimite,
}: {
  reference: string;
  token: string;
  gratuite: boolean;
  dateLimite: string;
}) {
  const routeur = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const annuler = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch(`/api/reservations/${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "L'annulation n'a pas pu être enregistrée.");
        return;
      }
      routeur.refresh();
    } catch {
      setErreur("Connexion interrompue. Réessayez.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-carte)] border border-noir-piste/12 p-6">
      <p className="etiquette opacity-75">Annulation</p>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-gris-cadre">
        {gratuite ? (
          <>
            L&apos;annulation de la réservation {reference} est gratuite jusqu&apos;au{" "}
            <strong className="text-noir-piste">{dateLimite}</strong> inclus. Au-delà, 50 % du
            montant reste dû.
          </>
        ) : (
          <>
            Le délai d&apos;annulation gratuite est dépassé depuis le {dateLimite} : 50 % du
            montant sera retenu. Appelez-nous si votre situation est particulière.
          </>
        )}
      </p>

      {erreur && (
        <p role="alert" className="mt-4 text-[0.85rem] text-orange-sourd">
          {erreur}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!confirmation ? (
          <Bouton variante="contour" className="text-noir-piste" onClick={() => setConfirmation(true)}>
            Annuler ma réservation
          </Bouton>
        ) : (
          <>
            <Bouton variante="primaire" onClick={annuler} disabled={enCours}>
              {enCours ? "Annulation…" : "Oui, annuler définitivement"}
            </Bouton>
            <Bouton variante="contour" className="text-noir-piste" onClick={() => setConfirmation(false)}>
              Finalement, non
            </Bouton>
          </>
        )}
      </div>
    </div>
  );
}
