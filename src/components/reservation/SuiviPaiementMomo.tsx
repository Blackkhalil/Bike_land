"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { formatXof } from "@/lib/format";
import type { MoyenPaiement } from "@/lib/types";

/**
 * Attente de la validation Mobile Money.
 *
 * SasPay a poussé une demande sur le téléphone du client : il y a une
 * notification à ouvrir et un code à saisir. Personne ici ne sait quand
 * il le fera, d'où cette attente active, qui demande à notre serveur où
 * en est le paiement jusqu'à ce que SasPay tranche.
 *
 * Le navigateur ne décide de rien : il pose une question, et c'est SasPay
 * qui répond par l'intermédiaire de `/api/paiement/saspay`.
 *
 * Trois précautions qui comptent dans un contexte de réseau irrégulier :
 *
 *  - une **erreur réseau n'interrompt pas l'attente**. Une coupure de
 *    quelques secondes est banale ; abandonner à la première ferait
 *    croire à un échec alors que le paiement est peut-être passé.
 *  - l'attente **s'arrête d'elle-même** au bout du délai du panier : au
 *    delà, la réservation ne retient plus le vélo, continuer à interroger
 *    n'apprendrait plus rien d'utile.
 *  - le minuteur est nettoyé au démontage, sinon il continuerait à
 *    appeler le serveur après que le client a quitté la page.
 */

const INTERVALLE_MS = 4_000;

/** Libellés des opérateurs, pour rappeler au client où regarder. */
const OPERATEURS: Record<string, string> = {
  MTN_MONEY: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS_CASH: "Celtiis Cash",
  ESPECES: "espèces",
};

export function SuiviPaiementMomo({
  token,
  paiementId,
  moyen,
  telephone,
  montantXof,
  urlCheckout,
  onConfirme,
  onEchec,
  expiration = "La demande de paiement a expiré et le vélo n'est plus retenu. Rechargez cette page pour en relancer une.",
}: {
  token: string;
  paiementId: string;
  moyen: MoyenPaiement;
  telephone: string;
  montantXof: number;
  /** Page hébergée à ouvrir quand le réseau en exige une (carte). */
  urlCheckout?: string;
  /** Appelé une fois la réservation confirmée. */
  onConfirme: () => void;
  /** Appelé quand SasPay a tranché négativement. */
  onEchec: (message: string) => void;
  /** Ce que dit l'encart quand la demande a expiré. */
  expiration?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [expire, setExpire] = useState(false);

  // Dans des refs, et non dans l'état : ces valeurs ne doivent pas
  // relancer l'effet, sans quoi chaque réponse redémarrerait l'attente.
  const termine = useRef(false);
  const debut = useRef(0);

  // Les rappels arrivent en props sous forme de fonctions fléchées : ils
  // changent à chaque rendu du parent. Les mettre en dépendance de
  // l'effet le relancerait sans cesse, remettant le compteur d'expiration
  // à zéro et empilant les minuteurs. On les lit donc par une ref.
  const rappels = useRef({ onConfirme, onEchec });
  useEffect(() => {
    rappels.current = { onConfirme, onEchec };
  }, [onConfirme, onEchec]);

  const interroger = useCallback(async () => {
    if (termine.current) return;

    try {
      const reponse = await fetch("/api/paiement/saspay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, paiementId }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (donnees.etat === "confirmee") {
        termine.current = true;
        rappels.current.onConfirme();
        return;
      }

      if (donnees.etat === "en-attente") {
        setMessage(null);
        return;
      }

      // 502 : nous n'avons pas pu joindre SasPay. L'état reste inconnu,
      // donc on continue d'interroger plutôt que d'annoncer un échec.
      if (reponse.status === 502) {
        setMessage(donnees.erreur ?? null);
        return;
      }

      if (!reponse.ok) {
        termine.current = true;
        rappels.current.onEchec(donnees.erreur ?? "Le paiement n'a pas abouti.");
      }
    } catch {
      // Coupure réseau : on ne conclut rien, on retentera au tour suivant.
      setMessage("Connexion instable. Nous continuons de vérifier votre paiement.");
    }
  }, [token, paiementId]);

  useEffect(() => {
    debut.current = Date.now();
    termine.current = false;

    const minuteur = setInterval(() => {
      // Au-delà du délai du panier, la réservation ne retient plus le
      // vélo : inutile de continuer à interroger.
      if (Date.now() - debut.current > EXPIRATION_PANIER_MINUTES * 60_000) {
        termine.current = true;
        setExpire(true);
        clearInterval(minuteur);
        return;
      }
      void interroger();
    }, INTERVALLE_MS);

    // Premier appel différé d'un tour de boucle : le client peut avoir
    // validé très vite, mais appeler `setState` de façon synchrone dans un
    // effet enchaînerait des rendus pour rien.
    const premier = setTimeout(() => void interroger(), 0);

    return () => {
      clearTimeout(premier);
      clearInterval(minuteur);
    };
  }, [interroger]);

  const operateur = OPERATEURS[moyen] ?? "Mobile Money";

  return (
    <div className="mt-6 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-5 py-5">
      <div className="flex items-start gap-4">
        {!expire && (
          <span
            aria-hidden="true"
            className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-noir-piste/25 border-t-noir-piste"
          />
        )}
        <div>
          <p className="font-display text-[1.05rem] font-bold uppercase leading-tight">
            {expire ? "Demande expirée" : "Validez sur votre téléphone"}
          </p>

          {expire ? (
            <p className="mt-2 text-[0.9rem] leading-relaxed">{expiration}</p>
          ) : (
            <>
              <p className="mt-2 text-[0.9rem] leading-relaxed">
                Une demande de <strong className="font-semibold">{formatXof(montantXof)}</strong>{" "}
                vient de partir sur le <strong className="font-semibold">{telephone}</strong> via{" "}
                {operateur}. Ouvrez la notification et saisissez votre code secret.
              </p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-gris-cadre">
                Cette page se met à jour toute seule dès que le paiement est validé. Ne la fermez
                pas. Si vous ne voyez rien arriver, composez le code de votre opérateur pour
                retrouver la demande en attente.
              </p>
            </>
          )}

          {/* Certains réseaux (carte) imposent une page hébergée. Nous ne
              les proposons pas, mais autant ne pas laisser le client
              bloqué si SasPay en renvoie une un jour. */}
          {urlCheckout && !expire && (
            <a
              href={urlCheckout}
              target="_blank"
              rel="noreferrer"
              className="lien-souligne mt-3 inline-block text-[0.88rem] font-semibold text-orange-sourd"
            >
              Ouvrir la page de paiement sécurisée
            </a>
          )}

          {message && (
            <p role="status" className="mt-3 text-[0.85rem] leading-relaxed text-orange-sourd">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
