"use client";

import { useState } from "react";

import { ajouterJours, aujourdhui, listerJours, versISO } from "@/lib/dates";
import { seulementPayees } from "@/lib/reservations";
import { formatDateCourte, formatPlageReservation } from "@/lib/format";
import { FERMETURE_COMPTOIR_HEURE } from "@/data/offres";

/**
 * Le début de la journée dessinée. Le comptoir accepte toute heure, mais
 * une location avant 6 h reste rare : la dessiner à partir de minuit
 * écraserait toutes les autres barres. Elle s'affiche alors depuis 6 h.
 */
const DEBUT_JOURNEE = 6;
import type { Reservation, Velo } from "@/lib/types";

/**
 * Vue calendrier du parc (§2.2) : un vélo par ligne, un jour par colonne.
 *
 * C'est la lecture dont l'exploitant a besoin au comptoir, qui est
 * sorti, qui rentre quand, quel créneau reste libre, et c'est aussi la
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

  // Le calendrier du parc montre ce qui est réellement engagé. Un
  // panier non payé n'immobilise rien au-delà de quelques minutes.
  const actives = seulementPayees(reservations);

  return (
    <div className="rounded-[var(--radius-carte)] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Calendrier du parc
          </h2>
          <p className="mt-1 text-[0.8rem] text-gris-cadre">
            {formatDateCourte(jours[0])} - {formatDateCourte(jours[jours.length - 1])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDecalage((valeur) => valeur - nombreDeJours)}
            className="rounded-full border border-noir-piste/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-craie"
          >
            ‹ Précédent
          </button>
          <button
            type="button"
            onClick={() => setDecalage(0)}
            disabled={decalage === 0}
            className="rounded-full border border-noir-piste/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-craie disabled:opacity-35"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => setDecalage((valeur) => valeur + nombreDeJours)}
            className="rounded-full border border-noir-piste/20 px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:bg-craie"
          >
            Suivant ›
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div style={{ minWidth: 180 + jours.length * LARGEUR_JOUR }}>
          {/* En-tête des jours */}
          <div className="flex border-b border-noir-piste/12 pb-2">
            <div className="w-[180px] shrink-0" />
            {jours.map((jour) => {
              const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay();
              const weekend = jourSemaine === 0 || jourSemaine === 6;
              return (
                <div
                  key={jour}
                  style={{ width: LARGEUR_JOUR }}
                  className={`shrink-0 text-center text-[0.68rem] leading-tight ${
                    weekend ? "text-orange-signal" : "text-gris-cadre"
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
              <div key={velo.id} className="flex items-center border-b border-noir-piste/8">
                <div className="w-[180px] shrink-0 py-2.5 pr-4">
                  <p className="truncate text-[0.85rem] font-semibold">{velo.nom}</p>
                  <p className="text-[0.72rem] text-gris-cadre">
                    {velo.statut === "MAINTENANCE" ? "en entretien" : "en service"}
                  </p>
                </div>

                <div className="relative flex" style={{ height: 44 }}>
                  {jours.map((jour) => (
                    <div
                      key={jour}
                      style={{ width: LARGEUR_JOUR }}
                      className="shrink-0 border-l border-noir-piste/6"
                    />
                  ))}

                  {velo.statut === "MAINTENANCE" && (
                    <div
                      className="absolute inset-y-2 left-0 rounded-[var(--radius-bouton)] bg-craie-ombre/70 px-2 text-[0.7rem] leading-7"
                      style={{ width: jours.length * LARGEUR_JOUR - 2 }}
                    >
                      Immobilisé à l&apos;atelier
                    </div>
                  )}

                  {creneaux.map((creneau) => (
                    <a
                      key={creneau.reservation.id}
                      href={`/admin/reservations?reference=${creneau.reservation.reference}`}
                      title={`${creneau.reservation.reference} : ${creneau.reservation.client.prenom} ${creneau.reservation.client.nom} · ${formatPlageReservation(creneau.reservation)}`}
                      className={`absolute inset-y-2 flex items-center overflow-hidden rounded-[var(--radius-bouton)] px-2 text-[0.7rem] font-semibold text-craie transition-opacity hover:opacity-85 ${
                        creneau.reservation.statut === "EN_COURS" ? "bg-orange-signal" : "bg-noir-releve"
                      }`}
                      style={positionBarre(creneau)}
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

      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-gris-cadre">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-orange-signal" /> Location en cours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-noir-releve" /> Réservation à venir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-craie-ombre" /> Immobilisé à l&apos;atelier
        </span>
      </p>
    </div>
  );
}

export const premierJourVisible = () => versISO(new Date());

/**
 * Place une barre de réservation dans la grille.
 *
 * Une journée n'appartient plus à une seule location : la barre occupe
 * donc la fraction du jour correspondant à ses heures, ce qui fait
 * apparaître côte à côte deux sorties du même vélo le même jour. Sans
 * cela, elles se superposeraient et la seconde serait invisible.
 *
 * La journée va de 6 h à 22 h : une location du soir saisie en espèces
 * s'y voit comme les autres.
 */
function positionBarre(creneau: {
  indexDebut: number;
  indexFin: number;
  reservation: { heureDebut: number; heureFin: number };
}): { left: number; width: number } {
  const amplitude = FERMETURE_COMPTOIR_HEURE - DEBUT_JOURNEE;
  const debutRelatif = Math.max(0, creneau.reservation.heureDebut - DEBUT_JOURNEE) / amplitude;
  const finRelative = Math.min(amplitude, Math.max(1, creneau.reservation.heureFin - DEBUT_JOURNEE)) / amplitude;

  const gauche = (creneau.indexDebut + debutRelatif) * LARGEUR_JOUR;
  const droite = (creneau.indexFin + finRelative) * LARGEUR_JOUR;

  // Deux pixels de marge, et une largeur minimale pour qu'une location
  // d'une heure reste cliquable.
  return { left: gauche + 1, width: Math.max(14, droite - gauche - 2) };
}
