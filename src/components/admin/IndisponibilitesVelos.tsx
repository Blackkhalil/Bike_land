"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChampPrenom, usePrenomRetenu } from "@/components/admin/ChampPrenom";
import { GAMMES, type GammeVelo } from "@/data/offres";
import { ajouterJours } from "@/lib/dates";
import { formatDateAvecJour, formatPlageReservation } from "@/lib/format";
import { prenomDeAuteur } from "@/lib/journal";
import type { IndisponibiliteVelo, ReservationTouchee, StatutVelo } from "@/lib/types";

export interface VeloDeclarable {
  id: string;
  nom: string;
  gamme: GammeVelo;
  statut: StatutVelo;
}

/** « Mardi 17 novembre » en tête de liste. */
function jourAvecMajuscule(date: string): string {
  const texte = formatDateAvecJour(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Les vélos indisponibles un jour précis (cahier des charges, étape 1) :
 * deux vélos en réparation samedi, un vélo prêté pour la journée. Le vélo
 * sort du parc ce jour-là seulement, son statut ne change pas. Les
 * réservations déjà payées sur ce vélo ce jour-là restent valables : la
 * réponse les liste, et le tableau de bord aussi, pour appeler les clients.
 */
export function IndisponibilitesVelos({
  velos,
  indisponibilites,
  aujourdhui,
}: {
  velos: VeloDeclarable[];
  /** Les déclarations d'aujourd'hui et des jours à venir. */
  indisponibilites: IndisponibiliteVelo[];
  aujourdhui: string;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [veloId, setVeloId] = useState("");
  const [date, setDate] = useState("");
  const [motif, setMotif] = useState("");
  const { prenom, setPrenom, retenir } = usePrenomRetenu();
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);
  const [aAppeler, setAAppeler] = useState<ReservationTouchee[]>([]);

  const envoyer = async (cle: string, corps: object) => {
    setEnvoi(cle);
    setErreur(null);
    setErreurs({});
    setSucces(null);
    setAAppeler([]);
    try {
      const reponse = await fetch("/api/admin/indisponibilites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "L'enregistrement n'a pas pu se faire.");
        setErreurs(donnees.champs ?? {});
        return null;
      }
      retenir();
      demarrerTransition(() => routeur.refresh());
      return donnees;
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
      return null;
    } finally {
      setEnvoi(null);
    }
  };

  const declarer = async () => {
    const velo = velos.find((v) => v.id === veloId);
    const donnees = await envoyer("ajouter", { action: "ajouter", veloId, date, motif: motif || undefined, prenom });
    if (!donnees) return;
    setSucces(`${velo?.nom ?? "Le vélo"} est indisponible le ${formatDateAvecJour(date)}.`);
    setAAppeler((donnees.touchees as ReservationTouchee[] | undefined) ?? []);
    setVeloId("");
    setMotif("");
  };

  // Regroupées par jour : « samedi : 3 vélos indisponibles ».
  const parJour = new Map<string, IndisponibiliteVelo[]>();
  for (const ligne of indisponibilites) parJour.set(ligne.date, [...(parJour.get(ligne.date) ?? []), ligne]);
  const occupe = (cle: string) => envoi === cle || enCours;
  const enService = velos.filter((v) => v.statut !== "RETIRE");

  return (
    <section
      aria-labelledby="titre-indisponibles"
      className="mt-8 rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-4 sm:p-6"
    >
      <h2 id="titre-indisponibles" className="font-display text-[1rem] font-bold uppercase tracking-tight">
        Vélos indisponibles par date
      </h2>
      <p className="mt-1 max-w-2xl text-[0.82rem] leading-relaxed text-gris-cadre">
        Un vélo en réparation ou prêté un jour précis sort du parc ce jour-là seulement : les
        offres de groupe comptent un vélo de moins. Pour un vélo à l&apos;atelier pour de bon,
        changez plutôt son statut sur sa fiche.
      </p>

      <form
        className="mt-4"
        noValidate
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (veloId && date && !occupe("ajouter")) void declarer();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block" htmlFor="indispo-velo">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Vélo</span>
            <select
              id="indispo-velo"
              value={veloId}
              onChange={(evenement) => setVeloId(evenement.target.value)}
              aria-invalid={erreurs.veloId ? true : undefined}
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 text-[0.88rem]"
            >
              <option value="">Choisir un vélo</option>
              {GAMMES.map((gamme) => {
                const deLaGamme = enService.filter((v) => v.gamme === gamme.code);
                if (deLaGamme.length === 0) return null;
                return (
                  <optgroup key={gamme.code} label={gamme.nom}>
                    {deLaGamme.map((velo) => (
                      <option key={velo.id} value={velo.id}>
                        {velo.nom}
                        {velo.statut === "MAINTENANCE" ? " (à l'atelier)" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {erreurs.veloId && <span className="mt-1 block text-[0.74rem] text-orange-sourd">{erreurs.veloId}</span>}
          </label>
          <label className="block" htmlFor="indispo-date">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Jour</span>
            <input
              id="indispo-date"
              type="date"
              min={aujourdhui}
              max={ajouterJours(aujourdhui, 365)}
              value={date}
              onChange={(evenement) => setDate(evenement.target.value)}
              aria-invalid={erreurs.date ? true : undefined}
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 text-[0.88rem]"
            />
            {erreurs.date && <span className="mt-1 block text-[0.74rem] text-orange-sourd">{erreurs.date}</span>}
          </label>
          <label className="block" htmlFor="indispo-motif">
            <span className="text-[0.78rem] font-semibold text-gris-cadre">Motif, facultatif</span>
            <input
              id="indispo-motif"
              type="text"
              maxLength={120}
              value={motif}
              onChange={(evenement) => setMotif(evenement.target.value)}
              placeholder="En réparation"
              className="mt-1 h-10 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 text-[0.88rem]"
            />
          </label>
          <ChampPrenom id="indispo-prenom" valeur={prenom} onChange={setPrenom} erreur={erreurs.prenom} />
        </div>
        <button
          type="submit"
          disabled={!veloId || !date || occupe("ajouter")}
          className="mt-3 min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {envoi === "ajouter" ? "Enregistrement…" : "Déclarer indisponible"}
        </button>
      </form>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]"
        >
          {erreur}
        </p>
      )}
      {succes && (
        <p role="status" className="mt-4 rounded-[var(--radius-carte)] bg-vert-lagune/12 px-4 py-3 text-[0.86rem] text-vert-lagune">
          {succes}
        </p>
      )}
      {aAppeler.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed"
        >
          <p className="font-semibold">Ce vélo est déjà réservé et payé ce jour-là. Appelez le client :</p>
          <ul className="mt-2 space-y-1.5">
            {aAppeler.map((r) => (
              <li key={r.reference}>
                {r.client.prenom} {r.client.nom}
                {r.client.telephone && (
                  <>
                    ,{" "}
                    <a href={`tel:${r.client.telephone.replace(/\s/g, "")}`} className="lien-souligne whitespace-nowrap font-semibold">
                      {r.client.telephone}
                    </a>
                  </>
                )}
                , {formatPlageReservation(r)}{" "}
                <span className="font-mono text-[0.78rem] text-gris-cadre">({r.reference})</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.8rem]">La réservation reste valable : proposez un autre vélo, ou un autre créneau.</p>
        </div>
      )}

      {parJour.size === 0 ? (
        <p className="mt-5 text-[0.85rem] text-gris-cadre">Aucun vélo déclaré indisponible pour les jours à venir.</p>
      ) : (
        <ul className="mt-5 space-y-4 border-t border-noir-piste/10 pt-4">
          {[...parJour.entries()].map(([jour, lignes]) => (
            <li key={jour}>
              <p className="font-semibold">
                {jourAvecMajuscule(jour)}
                <span className="ml-2 text-[0.8rem] font-normal text-gris-cadre">
                  {lignes.length} vélo{lignes.length > 1 ? "s" : ""} en moins
                </span>
              </p>
              <ul className="mt-2 divide-y divide-noir-piste/10">
                {lignes.map((ligne) => (
                  <li key={ligne.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-[0.88rem] font-semibold">{ligne.veloNom}</p>
                      <p className="text-[0.78rem] text-gris-cadre">
                        {ligne.motif ? `${ligne.motif} · ` : ""}déclaré par {prenomDeAuteur(ligne.creePar)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void envoyer(ligne.id, { action: "retirer", id: ligne.id, prenom })}
                      disabled={occupe(ligne.id)}
                      className="lien-souligne cible-elargie min-h-11 text-[0.82rem] font-semibold text-orange-sourd disabled:opacity-40"
                    >
                      {envoi === ligne.id ? "…" : "Rendre au parc"}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
