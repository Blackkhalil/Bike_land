"use client";

import { useEffect, useState } from "react";

import {
  FERMETURE_RESERVATIONS_HEURE,
  OUVERTURE_RESERVATIONS_HEURE,
  reouvertureReservations,
  reservationsOuvertes,
} from "@/data/offres";
import { site } from "@/lib/site";

/**
 * La réservation en ligne est-elle ouverte, vu depuis le navigateur ?
 *
 * L'heure est lue ici, pas sur le serveur : les pages des vélos sont
 * mises en cache, et une heure figée au moment du cache serait fausse.
 * Elle est relue chaque minute, pour qu'une page ouverte à 21 h 55 se
 * ferme d'elle-même à 22 h.
 *
 * Avant le premier calcul, la valeur est `null` : le rendu serveur et le
 * premier rendu du navigateur affichent la même chose, et rien ne
 * clignote. Le serveur, lui, refuse de toute façon une réservation hors
 * des heures, quoi que dise la page.
 */
export function useReservationsOuvertes(): boolean | null {
  const [ouvertes, setOuvertes] = useState<boolean | null>(null);
  useEffect(() => {
    const relire = () => setOuvertes(reservationsOuvertes());
    relire();
    const minuterie = setInterval(relire, 60_000);
    return () => clearInterval(minuterie);
  }, []);
  return ouvertes;
}

/**
 * La note sur les heures de réservation.
 *
 * Discrète quand on peut réserver, pour que la règle soit connue avant
 * d'en avoir besoin. Bien visible quand on ne peut pas, avec l'heure de
 * réouverture et le téléphone, pour qu'un client ne remplisse pas tout le
 * formulaire avant de découvrir qu'il est fermé.
 */
export function NoteHoraires({ className = "" }: { className?: string }) {
  const ouvertes = useReservationsOuvertes();

  if (ouvertes === false) {
    return (
      <div
        role="status"
        className={`rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 ${className}`}
      >
        <p className="text-[0.9rem] font-semibold">Réservations fermées pour la nuit</p>
        <p className="mt-1 text-[0.84rem] leading-relaxed">
          On ne réserve plus en ligne après {FERMETURE_RESERVATIONS_HEURE} h. Revenez{" "}
          {reouvertureReservations()}, ou appelez-nous au{" "}
          <a href={`tel:${site.telephoneLien}`} className="font-semibold underline underline-offset-2">
            {site.telephone}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <p className={`text-[0.76rem] leading-relaxed text-gris-cadre ${className}`}>
      Réservations en ligne de {OUVERTURE_RESERVATIONS_HEURE} h à {FERMETURE_RESERVATIONS_HEURE} h,
      heure du Bénin.
    </p>
  );
}
