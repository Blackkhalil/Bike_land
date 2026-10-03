"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatDate } from "@/lib/format";
import type { FormuleFermee, JourFerme } from "@/lib/types";

export interface CreneauPilote {
  code: string;
  libelle: string;
  horaire: string;
  actif: boolean;
  /** Le prochain départ proposé aux clients, quand le créneau est ouvert. */
  prochainDepart?: string;
}

const LIBELLES_FORMULE: Record<FormuleFermee, string> = {
  "road-trip": "Road trip",
  "location-libre": "Location libre",
  toutes: "Les deux formules",
};

/**
 * Ouvrir et fermer la réservation, sans passer par le code.
 *
 * Deux usages. Un créneau de road trip se ferme pour toutes les semaines :
 * le dimanche quand il est complet parce que des places ont été vendues
 * en espèces, et il se rouvre d'un clic. Un jour précis se ferme quand il
 * est complet, pour le road trip, la location libre ou les deux.
 *
 * Fermer n'annule rien : les réservations déjà prises restent valables,
 * seules les nouvelles sont refusées. Le panneau le dit, pour que
 * personne n'hésite à fermer de peur de perdre un client.
 */
export function PilotageOuverture({
  creneaux,
  joursFermes,
  aujourdhui,
}: {
  creneaux: CreneauPilote[];
  joursFermes: JourFerme[];
  /** Aujourd'hui à Cotonou, pour borner le choix de date. */
  aujourdhui: string;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [formule, setFormule] = useState<FormuleFermee>("road-trip");
  const [motif, setMotif] = useState("");

  const envoyer = async (cle: string, corps: object) => {
    setEnvoi(cle);
    setErreur(null);
    try {
      const reponse = await fetch("/api/admin/ouverture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le réglage n'a pas pu être enregistré.");
        return false;
      }
      demarrerTransition(() => routeur.refresh());
      return true;
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
      return false;
    } finally {
      setEnvoi(null);
    }
  };

  const fermerJour = async () => {
    const ok = await envoyer("fermer", { action: "fermer", date, formule, motif: motif || undefined });
    if (ok) {
      setDate("");
      setMotif("");
    }
  };

  const occupe = (cle: string) => envoi === cle || enCours;

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {/* ------------------------------------------- Créneaux du road trip */}
      <div className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6">
        <h3 className="text-[0.95rem] font-semibold">Départs du road trip</h3>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-gris-cadre">
          Un départ fermé n&apos;est plus proposé, toutes les semaines, jusqu&apos;à ce que vous le
          rouvriez.
        </p>
        <ul className="mt-4 divide-y divide-noir-piste/10">
          {creneaux.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">
                  {c.libelle}, {c.horaire}
                </p>
                <p className="text-[0.8rem] text-gris-cadre">
                  {c.actif
                    ? c.prochainDepart
                      ? `Ouvert. Prochain départ proposé : ${formatDate(c.prochainDepart)}.`
                      : "Ouvert, mais toutes les dates proches sont fermées."
                    : "Fermé à la réservation en ligne."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                    c.actif ? "bg-vert-lagune/15 text-vert-lagune" : "bg-craie-ombre text-noir-piste"
                  }`}
                >
                  {c.actif ? "Ouvert" : "Fermé"}
                </span>
                <button
                  type="button"
                  onClick={() => envoyer(c.code, { action: "creneau", code: c.code, actif: !c.actif })}
                  disabled={occupe(c.code)}
                  className={`rounded-[var(--radius-bouton)] px-4 py-2 text-[0.82rem] font-semibold transition-opacity disabled:opacity-40 ${
                    c.actif
                      ? "border border-noir-piste/25 hover:bg-noir-piste/5"
                      : "bg-orange-signal text-noir-piste hover:opacity-85"
                  }`}
                >
                  {envoi === c.code ? "…" : c.actif ? "Fermer" : "Ouvrir"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ---------------------------------------------------- Jours fermés */}
      <div className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6">
        <h3 className="text-[0.95rem] font-semibold">Fermer un jour complet</h3>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-gris-cadre">
          Pour un jour déjà rempli autrement, par exemple avec des réservations prises en espèces.
          Les réservations déjà faites ce jour-là restent valables.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Jour</span>
            <input
              type="date"
              min={aujourdhui}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 px-3 text-[0.88rem]"
            />
          </label>
          <label className="block">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Ce qui est fermé</span>
            <select
              value={formule}
              onChange={(e) => setFormule(e.target.value as FormuleFermee)}
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 text-[0.88rem]"
            >
              {(Object.keys(LIBELLES_FORMULE) as FormuleFermee[]).map((f) => (
                <option key={f} value={f}>
                  {LIBELLES_FORMULE[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Motif, facultatif</span>
            <input
              type="text"
              value={motif}
              maxLength={120}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Complet, réservations en espèces"
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 px-3 text-[0.88rem]"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={fermerJour}
          disabled={!date || occupe("fermer")}
          className="mt-4 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {envoi === "fermer" ? "Enregistrement…" : "Fermer ce jour"}
        </button>

        {joursFermes.length > 0 && (
          <ul className="mt-5 divide-y divide-noir-piste/10 border-t border-noir-piste/10">
            {joursFermes.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{formatDate(j.date)}</p>
                  <p className="text-[0.8rem] text-gris-cadre">
                    {LIBELLES_FORMULE[j.formule]} fermé{j.motif ? ` · ${j.motif}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => envoyer(j.id, { action: "rouvrir", id: j.id })}
                  disabled={occupe(j.id)}
                  className="lien-souligne cible-elargie text-[0.82rem] font-semibold text-orange-sourd disabled:opacity-40"
                >
                  {envoi === j.id ? "…" : "Rouvrir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erreur && (
        <p
          role="alert"
          className="rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] lg:col-span-2"
        >
          {erreur}
        </p>
      )}
    </div>
  );
}
