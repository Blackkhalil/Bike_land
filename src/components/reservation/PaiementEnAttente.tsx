"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Bouton } from "@/components/Bouton";
import { formatXof } from "@/lib/format";
import { ouvrirPaiementKkiapay, type ConfigurationWidget } from "./kkiapay";

/**
 * Reprise du paiement depuis le lien de suivi.
 *
 * Le cas est fréquent : le client ferme la fenêtre KkiaPay par mégarde,
 * ou son téléphone bascule sur l'application Mobile Money et il perd
 * l'onglet. Sa réservation existe, le vélo lui est retenu, mais rien
 * n'est payé. Sans ce bouton, il n'aurait plus aucun moyen de terminer
 * et devrait tout recommencer — en risquant de trouver le vélo pris.
 *
 * Aucune réservation n'est recréée ici : on repaie celle qui existe.
 */
export function PaiementEnAttente({
  token,
  widget,
}: {
  token: string;
  widget: ConfigurationWidget;
}) {
  const routeur = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const confirmer = async (transactionId: string) => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch("/api/paiement/kkiapay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, transactionId }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setMessage(
          donnees.erreur ?? "Le paiement n'a pas pu être vérifié. Appelez-nous si vous avez été débité.",
        );
        return;
      }
      routeur.refresh();
    } catch {
      setMessage(
        "Connexion interrompue pendant la vérification. Si vous avez été débité, " +
          "votre réservation sera confirmée d'ici quelques minutes.",
      );
    } finally {
      setEnCours(false);
    }
  };

  const ouvrir = () => {
    setMessage(null);
    void ouvrirPaiementKkiapay(widget, {
      onSucces: (transactionId) => void confirmer(transactionId),
      onEchec: (raison) => setMessage(raison),
    });
  };

  return (
    <div className="mt-6 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-6 py-5">
      <p className="font-display text-[1.1rem] font-bold uppercase">Paiement à terminer</p>
      <p className="mt-2 text-[0.92rem] leading-relaxed">
        Votre vélo est retenu, mais le règlement de {formatXof(widget.montantXof)} n&apos;est pas
        encore passé. Reprenez-le ici.
      </p>

      <div className="mt-4">
        <Bouton onClick={ouvrir} disabled={enCours}>
          {enCours ? "Vérification…" : `Payer ${formatXof(widget.montantXof)}`}
        </Bouton>
      </div>

      {message && (
        <p role="alert" className="mt-3 text-[0.88rem] leading-relaxed text-orange-sourd">
          {message}
        </p>
      )}
    </div>
  );
}
