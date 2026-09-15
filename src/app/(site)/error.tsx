"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Écran d'erreur : on ne montre jamais le détail technique au visiteur,
 * mais on le journalise et on affiche un identifiant qu'il peut nous
 * communiquer par téléphone.
 */
export default function ErreurGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erreur]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-5 pb-32 pt-40 text-center">
      <p className="etiquette opacity-75">Erreur</p>
      <h1 className="titre-editorial mt-6 text-[2rem]">Quelque chose a déraillé</h1>
      <p className="mt-6 text-[0.98rem] leading-relaxed text-gris-cadre">
        L&apos;incident a été enregistré. Vous pouvez réessayer : si le problème persiste,
        appelez-nous, nous prendrons la réservation à la main.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-[0.78rem] text-gris-cadre">Référence : {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-orange-signal px-8 py-4 text-[0.95rem] font-semibold text-craie transition-colors hover:bg-orange-sourd"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-noir-piste/25 px-8 py-4 text-[0.95rem] font-semibold transition-colors hover:bg-noir-piste/5"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
