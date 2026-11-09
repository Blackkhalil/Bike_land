"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChampPrenom, usePrenomRetenu } from "@/components/admin/ChampPrenom";
import { montantF } from "@/data/libelles-reglages-offres";
import type { Remboursement } from "@/lib/types";

/** Un remboursement à faire, avec son échéance déjà mise en mots par le serveur. */
export interface RemboursementAFaire extends Remboursement {
  /** « avant le mercredi 11 novembre, 16 h 05 ». */
  echeance: string;
  /** Les 48 heures sont passées. */
  enRetard: boolean;
}

/**
 * L'argent à rendre, le plus ancien d'abord : à qui, combien, pourquoi,
 * avant quand. Le responsable rembourse sur SasPay ou en Mobile Money, puis
 * le note ici, avec son prénom (décisions du responsable n° 6 et 7). La
 * note se confirme : c'est de l'argent.
 */
export function RemboursementsAFaire({ remboursements }: { remboursements: RemboursementAFaire[] }) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const { prenom, setPrenom, retenir } = usePrenomRetenu();
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurPrenom, setErreurPrenom] = useState<string | undefined>(undefined);
  const [succes, setSucces] = useState<string | null>(null);

  const noterFait = async (remboursement: RemboursementAFaire) => {
    const client = `${remboursement.client.prenom} ${remboursement.client.nom}`;
    if (!window.confirm(`Vous confirmez avoir rendu ${montantF(remboursement.montantXof)} à ${client} ?`)) return;
    setEnvoi(remboursement.id);
    setErreur(null);
    setErreurPrenom(undefined);
    setSucces(null);
    try {
      const reponse = await fetch("/api/admin/remboursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fait", id: remboursement.id, prenom }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "L'enregistrement n'a pas pu se faire.");
        setErreurPrenom(donnees.champs?.prenom);
        return;
      }
      retenir();
      setSucces(`Noté : ${montantF(remboursement.montantXof)} rendus à ${client}.`);
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(null);
    }
  };

  return (
    <div>
      <div className="max-w-xs">
        <ChampPrenom
          id="remboursement-prenom"
          valeur={prenom}
          onChange={setPrenom}
          erreur={erreurPrenom}
          aide="Qui a rendu l'argent. Retenu sur ce téléphone."
        />
      </div>

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

      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {remboursements.map((remboursement) => (
          <li
            key={remboursement.id}
            className={`rounded-[var(--radius-carte)] bg-white p-4 text-[0.86rem] ${
              remboursement.enRetard ? "border-l-4 border-orange-signal" : "border border-noir-piste/10"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-[1.3rem] font-bold tabular-nums">{montantF(remboursement.montantXof)}</p>
              <Link
                href={`/admin/reservations?detail=${encodeURIComponent(remboursement.reference)}`}
                className="lien-souligne font-mono text-[0.78rem]"
              >
                {remboursement.reference}
              </Link>
            </div>
            <p className="mt-1 font-semibold">
              {remboursement.client.prenom} {remboursement.client.nom}
            </p>
            {remboursement.client.telephone && (
              <a
                href={`tel:${remboursement.client.telephone.replace(/\s/g, "")}`}
                className="lien-souligne cible-elargie whitespace-nowrap text-[0.84rem] font-semibold"
              >
                {remboursement.client.telephone}
              </a>
            )}
            <p className="break-all text-[0.78rem] text-gris-cadre">{remboursement.client.email}</p>
            <p className="mt-2 leading-relaxed">{remboursement.motif}</p>
            <p className={`mt-1 text-[0.8rem] ${remboursement.enRetard ? "font-semibold text-orange-sourd" : "text-gris-cadre"}`}>
              {remboursement.enRetard ? `En retard : à rendre ${remboursement.echeance}.` : `À rendre ${remboursement.echeance}.`}
            </p>
            <button
              type="button"
              onClick={() => void noterFait(remboursement)}
              disabled={envoi === remboursement.id || enCours}
              className="mt-3 min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {envoi === remboursement.id ? "Enregistrement…" : "C'est remboursé"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
