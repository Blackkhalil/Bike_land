"use client";

import { useState } from "react";

import { ajouterJours, aujourdhui, listerJours, versISO } from "@/lib/dates";
import { formatDateCourte } from "@/lib/format";
import type { Reservation, Velo } from "@/lib/types";

/**
 * Vue calendrier du parc (§2.2) : un vélo par ligne, un jour par colonne.
 *
 * C'est la lecture dont l'exploitant a besoin au comptoir — qui est
 * sorti, qui rentre quand, quel créneau reste libre — et c'est aussi la
 * vérification visuelle qu'aucune double réservation n'existe : deux
 * barres ne peuvent pas se superposer sur une même ligne.
 */

const LARGEUR_JOUR = 34;

export function CalendrierParc({
  velos,
  reservations,
  nombreDeJours = 30,
}: {
  velos: Velo[];
  reservations: Reservation[];
  nombreDeJours?: number;
}) {
  const [decalage, setDecalage] = useState(0);

  const debut = ajouterJours(aujourdhui(), decalage);
  const jours = listerJours(debut, ajouterJours(debut, nombreDeJours - 1));

  const actives = reservations.filter((reservation) => reservation.statut !== "ANNULEE");

  return (
    <div className="rounded-[1.25rem] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Calendrier du parc
          </h2>
          <p className="mt-1 text-[0.8rem] text-encre-500">
            {formatDateCourte(jours[0])} – {formatDateCourte(jours[jours.length - 1])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDecalage((valeur) => valeur - nombreDeJours)}
            className="rounded-full border border-encre-900/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-sable-100"
          >
            ‹ Précédent
          </button>
          <button
            type="button"
            onClick={() => setDecalage(0)}
            disabled={decalage === 0}
            className="rounded-full border border-encre-900/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-sable-100 disabled:opacity-35"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => setDecalage((valeur) => valeur + nombreDeJours)}
            className="rounded-full border border-encre-900/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-sable-100"
          >
            Suivant ›
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div style={{ minWidth: 180 + jours.length * LARGEUR_JOUR }}>
          {/* En-tête des jours */}
          <div className="flex border-b border-encre-900/12 pb-2">
            <div className="w-[180px] shrink-0" />
            {jours.map((jour) => {
              const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay();
              const weekend = jourSemaine === 0 || jourSemaine === 6;
              return (
                <div
                  key={jour}
                  style={{ width: LARGEUR_JOUR }}
                  className={`shrink-0 text-center text-[0.68rem] leading-tight ${
                    weekend ? "text-terre-600" : "text-encre-500"
                  }`}
                >
                  <span className="block">
                    {new Intl.DateTimeFormat("fr-FR", { weekday: "narrow", timeZone: "UTC" }).format(
                      new Date(`${jour}T00:00:00Z`),
                    )}
                  </span>
                  <span className="block font-semibold tabular-nums">{Number(jour.slice(8))}</span>
                </div>
              );
            })}
          </div>

          {/* Une ligne par vélo */}
          {velos.map((velo) => {
            const creneaux = actives
              .filter((reservation) => reservation.lignes.some((ligne) => ligne.veloId === velo.id))
              .map((reservation) => ({
                reservation,
                indexDebut: jours.indexOf(
                  reservation.dateDebut < jours[0] ? jours[0] : reservation.dateDebut,
                ),
                indexFin: jours.indexOf(
                  reservation.dateFin > jours[jours.length - 1]
                    ? jours[jours.length - 1]
                    : reservation.dateFin,
                ),
              }))
              .filter((creneau) => creneau.indexDebut >= 0 && creneau.indexFin >= creneau.indexDebut);

            return (
              <div key={velo.id} className="flex items-center border-b border-encre-900/8">
                <div className="w-[180px] shrink-0 py-2.5 pr-4">
                  <p className="truncate text-[0.85rem] font-semibold">{velo.nom}</p>
                  <p className="text-[0.72rem] text-encre-500">
                    {velo.taille} · {velo.statut === "MAINTENANCE" ? "en entretien" : "en service"}
                  </p>
                </div>

                <div className="relative flex" style={{ height: 44 }}>
                  {jours.map((jour) => (
                    <div
                      key={jour}
                      style={{ width: LARGEUR_JOUR }}
                      className="shrink-0 border-l border-encre-900/6"
                    />
                  ))}

                  {velo.statut === "MAINTENANCE" && (
                    <div
                      className="absolute inset-y-2 left-0 rounded-lg bg-sable-300/70 px-2 text-[0.7rem] leading-7"
                      style={{ width: jours.length * LARGEUR_JOUR - 2 }}
                    >
                      Immobilisé — atelier
                    </div>
                  )}

                  {creneaux.map((creneau) => (
                    <a
                      key={creneau.reservation.id}
                      href={`/admin/reservations?reference=${creneau.reservation.reference}`}
                      title={`${creneau.reservation.reference} — ${creneau.reservation.client.prenom} ${creneau.reservation.client.nom}`}
                      className={`absolute inset-y-2 flex items-center overflow-hidden rounded-lg px-2 text-[0.7rem] font-semibold text-sable-50 transition-opacity hover:opacity-85 ${
                        creneau.reservation.statut === "EN_COURS" ? "bg-terre-600" : "bg-encre-700"
                      }`}
                      style={{
                        left: creneau.indexDebut * LARGEUR_JOUR + 2,
                        width: (creneau.indexFin - creneau.indexDebut + 1) * LARGEUR_JOUR - 4,
                      }}
                    >
                      <span className="truncate">
                        {creneau.reservation.client.prenom} {creneau.reservation.client.nom[0]}.
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-encre-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-terre-600" /> Location en cours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-encre-700" /> Réservation à venir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-sable-300" /> Immobilisé à l&apos;atelier
        </span>
      </p>
    </div>
  );
}

export const premierJourVisible = () => versISO(new Date());
