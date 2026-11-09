"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChampPrenom, usePrenomRetenu } from "@/components/admin/ChampPrenom";
import { montantF } from "@/data/libelles-reglages-offres";
import { prenomDeAuteur } from "@/lib/journal";
import { penaliteRetardXof } from "@/lib/offres/retard";
import type { RetardReservation } from "@/lib/types";

/**
 * Le champ « minutes de retard » d'une offre de groupe (cahier des charges,
 * étape 9) : Bike Land note le retard au retour des vélos, la pénalité
 * s'affiche aussitôt, calculée avec la règle du moment, et se paie en
 * espèces. Le serveur la recalcule et la range ; une nouvelle saisie
 * corrige la précédente, zéro l'efface.
 */
export function SaisieRetard({
  reference,
  retard,
  regle,
}: {
  reference: string;
  retard?: RetardReservation;
  /** La règle du moment ; `null` quand les réglages des offres ne se lisent plus. */
  regle: { toleranceMinutes: number; penaliteParMinuteXof: number } | null;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [minutes, setMinutes] = useState(retard ? String(retard.minutes) : "");
  const [actuel, setActuel] = useState(retard);
  const { prenom, setPrenom, retenir } = usePrenomRetenu();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState(false);

  const tapees = minutes.trim() === "" ? Number.NaN : Number(minutes.replace(",", "."));
  const lisibles = Number.isInteger(tapees) && tapees >= 0;
  const apercu = regle && lisibles ? penaliteRetardXof(tapees, { retard: regle }) : null;

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setSucces(false);
    try {
      const reponse = await fetch(`/api/admin/reservations/${encodeURIComponent(reference)}/retard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: tapees, prenom }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le retard n'a pas pu être enregistré.");
        setErreurs(donnees.champs ?? {});
        return;
      }
      retenir();
      setActuel(donnees.retard as RetardReservation);
      setSucces(true);
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form
      className="rounded-[var(--radius-bouton)] border border-noir-piste/10 p-4"
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (!envoi && minutes.trim() !== "") void enregistrer();
      }}
    >
      <p className="text-[0.95rem] font-semibold">Minutes de retard</p>
      <p className="mt-1 text-[0.8rem] leading-relaxed text-gris-cadre">
        {regle
          ? `Au retour des vélos : ${regle.toleranceMinutes} minutes de tolérance, puis ${montantF(regle.penaliteParMinuteXof)} par minute pour tout le groupe, payés en espèces.`
          : "Les réglages des offres ne se lisent plus : corrigez-les dans Réglages des produits avant de noter un retard."}
      </p>
      <p className="mt-2 text-[0.85rem]">
        {actuel
          ? actuel.penaliteXof > 0
            ? `Noté : ${actuel.minutes} min de retard, ${montantF(actuel.penaliteXof)} à encaisser en espèces${actuel.saisiPar ? `, par ${prenomDeAuteur(actuel.saisiPar)}` : ""}.`
            : `Noté : ${actuel.minutes} min de retard, aucune pénalité${actuel.saisiPar ? `, par ${prenomDeAuteur(actuel.saisiPar)}` : ""}.`
          : "Aucun retard noté."}
      </p>

      <fieldset disabled={envoi || !regle} className="m-0 mt-3 min-w-0 border-0 p-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block" htmlFor={`retard-${reference}`}>
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Minutes de retard</span>
            <input
              id={`retard-${reference}`}
              type="text"
              inputMode="numeric"
              value={minutes}
              onChange={(evenement) => {
                setMinutes(evenement.target.value);
                setSucces(false);
              }}
              aria-invalid={erreurs.minutes ? true : undefined}
              aria-describedby={`retard-${reference}-note`}
              className={`mt-1 h-10 w-full rounded-[var(--radius-bouton)] border bg-white px-3 text-[0.88rem] tabular-nums ${
                erreurs.minutes ? "border-orange-signal" : "border-noir-piste/20"
              }`}
            />
            <span
              id={`retard-${reference}-note`}
              className={`mt-1 block text-[0.74rem] ${erreurs.minutes ? "text-orange-sourd" : "text-gris-cadre"}`}
            >
              {erreurs.minutes ??
                (apercu === null
                  ? "En minutes entières. Zéro efface la pénalité."
                  : apercu > 0
                    ? `Pénalité : ${montantF(apercu)}.`
                    : "Dans la tolérance : aucune pénalité.")}
            </span>
          </label>
          <ChampPrenom id={`retard-${reference}-prenom`} valeur={prenom} onChange={setPrenom} erreur={erreurs.prenom} />
        </div>
        <button
          type="submit"
          disabled={envoi || enCours || minutes.trim() === ""}
          className="mt-3 min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {envoi ? "Enregistrement…" : "Enregistrer le retard"}
        </button>
      </fieldset>

      {erreur && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]"
        >
          {erreur}
        </p>
      )}
      {succes && (
        <p role="status" className="mt-3 rounded-[var(--radius-carte)] bg-vert-lagune/12 px-4 py-3 text-[0.86rem] text-vert-lagune">
          Enregistré et noté au journal.
        </p>
      )}
    </form>
  );
}
