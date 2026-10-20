"use client";

import { useEffect, useState } from "react";

/** Le temps de lire la ligne qui annonce WhatsApp avant d'y partir. */
const DELAI_MS = 1500;

/**
 * La réservation envoyée sur WhatsApp, à Ulrich, de l'équipe Bike Land.
 *
 * Le message est déjà écrit, avec tout ce que le client doit garder sous
 * la main (src/lib/whatsapp.ts) : il n'a qu'à appuyer sur « Envoyer », et
 * sa réservation reste dans sa discussion WhatsApp avec l'équipe.
 *
 * Juste après le paiement (`automatique`), WhatsApp s'ouvre de lui-même,
 * une seule fois par réservation : la page l'annonce, puis y part dans le
 * même onglet, une fenêtre ouverte sans clic étant bloquée par les
 * navigateurs. La marque n'est posée qu'au moment de partir : en
 * développement, React joue deux fois l'effet, et la première fois est
 * aussitôt annulée. Un rechargement ensuite ne rouvre rien ; le bouton,
 * lui, reste.
 */
export function EnvoiWhatsApp({
  lien,
  reference,
  automatique,
}: {
  /** Le lien wa.me, message compris. */
  lien: string;
  reference: string;
  /** Le client arrive du paiement : WhatsApp s'ouvre de lui-même. */
  automatique: boolean;
}) {
  const [enRoute, setEnRoute] = useState(false);

  useEffect(() => {
    if (!automatique) return;
    const cle = `bikeland.whatsapp.${reference}`;
    try {
      if (window.sessionStorage.getItem(cle) === "1") return;
    } catch {
      // Stockage indisponible (navigation privée) : on ouvre quand même.
    }
    const annonce = setTimeout(() => setEnRoute(true), 0);
    const depart = setTimeout(() => {
      try {
        window.sessionStorage.setItem(cle, "1");
      } catch {
        // Sans stockage, un rechargement rouvrirait WhatsApp : tant pis.
      }
      window.location.href = lien;
    }, DELAI_MS);
    return () => {
      clearTimeout(annonce);
      clearTimeout(depart);
    };
  }, [automatique, reference, lien]);

  return (
    <div className="mb-10 rounded-[var(--radius-carte)] bg-white px-6 py-5">
      <p className="font-display text-[1.1rem] font-bold uppercase">Votre réservation sur WhatsApp</p>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-gris-cadre">
        Un message déjà rempli, avec toutes les informations de votre réservation, part vers Ulrich, de
        l&apos;équipe Bike Land&nbsp;: il ne vous reste qu&apos;à appuyer sur «&nbsp;Envoyer&nbsp;».
      </p>
      {enRoute && (
        <p role="status" className="mt-3 text-[0.92rem] font-semibold">
          Nous ouvrons WhatsApp pour vous envoyer votre réservation…
        </p>
      )}
      <a
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-bouton)] bg-[#25d366] px-6 py-3 text-[0.9rem] font-semibold uppercase tracking-[0.06em] text-noir-piste transition-opacity hover:opacity-90 sm:w-auto"
      >
        Recevoir ma réservation sur WhatsApp
      </a>
    </div>
  );
}
