"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChampPrenom, usePrenomRetenu } from "@/components/admin/ChampPrenom";

/** Une capture à vérifier, déjà mise en mots par le serveur. */
export interface PreuveAVerifier {
  id: string;
  /** « reçue le mardi 17 novembre, 16 h 05 ». */
  recue: string;
  email?: string;
  telephone?: string;
  /** Le fichier est encore là (il part dès la décision, 30 jours au plus tard). */
  avecImage: boolean;
}

/**
 * Les captures envoyées pour la réduction du road trip en groupe, la plus
 * ancienne d'abord (décision 21 : sans agent IA, chaque capture se vérifie à
 * la main). « Valider » ou « Refuser », signé du prénom (journal) : le client
 * reçoit la réponse par email, et la capture est effacée aussitôt. Chaque
 * décision se confirme : une réduction, c'est de l'argent.
 */
export function PreuvesAVerifier({ preuves, comptes }: { preuves: PreuveAVerifier[]; comptes: string }) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const { prenom, setPrenom, retenir } = usePrenomRetenu();
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurPrenom, setErreurPrenom] = useState<string | undefined>(undefined);
  const [succes, setSucces] = useState<string | null>(null);

  const decider = async (preuve: PreuveAVerifier, action: "valider" | "refuser") => {
    const question =
      action === "valider"
        ? `Vous validez la réduction ? La capture doit montrer ${comptes}. Le client recevra un email.`
        : "Vous refusez cette capture ? Le client recevra un email poli, et pourra en envoyer une autre.";
    if (!window.confirm(question)) return;
    setEnvoi(preuve.id);
    setErreur(null);
    setErreurPrenom(undefined);
    setSucces(null);
    try {
      const motif = motifs[preuve.id]?.trim();
      const reponse = await fetch("/api/admin/preuves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: preuve.id, prenom, ...(motif ? { motif } : {}) }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "La décision n'a pas pu être enregistrée.");
        setErreurPrenom(donnees.champs?.prenom);
        return;
      }
      retenir();
      const email = donnees.emailEnvoye ? "Le client est prévenu par email." : "L'email au client n'est pas parti : prévenez-le par WhatsApp.";
      setSucces(`${action === "valider" ? "Réduction validée" : "Capture refusée"}. ${email}`);
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
          id="preuve-prenom"
          valeur={prenom}
          onChange={setPrenom}
          erreur={erreurPrenom}
          aide="Qui décide. Retenu sur ce téléphone."
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

      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {preuves.map((preuve) => (
          <li key={preuve.id} className="rounded-[var(--radius-carte)] border border-noir-piste/10 bg-white p-4 text-[0.86rem]">
            {preuve.avecImage ? (
              <a href={`/api/admin/preuves/${encodeURIComponent(preuve.id)}/image`} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- capture privée, servie par une route d'administration, jamais optimisée ni gardée en cache */}
                <img
                  src={`/api/admin/preuves/${encodeURIComponent(preuve.id)}/image`}
                  alt="Capture envoyée par le client"
                  loading="lazy"
                  className="max-h-[28rem] w-full rounded-[var(--radius-bouton)] border border-noir-piste/10 bg-craie object-contain"
                />
              </a>
            ) : (
              <p className="rounded-[var(--radius-bouton)] bg-craie px-4 py-8 text-center text-gris-cadre">
                La capture n&apos;est plus disponible.
              </p>
            )}
            <p className="mt-3 text-[0.8rem] text-gris-cadre">Reçue {preuve.recue}</p>
            {preuve.telephone && (
              <a href={`tel:${preuve.telephone.replace(/\s/g, "")}`} className="lien-souligne cible-elargie whitespace-nowrap font-semibold">
                {preuve.telephone}
              </a>
            )}
            {preuve.email && <p className="break-all text-[0.78rem] text-gris-cadre">{preuve.email}</p>}
            <label className="mt-3 block text-[0.8rem]" htmlFor={`motif-${preuve.id}`}>
              Ce que vous voyez (facultatif, envoyé au client s&apos;il est refusé)
              <input
                id={`motif-${preuve.id}`}
                type="text"
                maxLength={300}
                value={motifs[preuve.id] ?? ""}
                onChange={(evenement) => setMotifs((actuels) => ({ ...actuels, [preuve.id]: evenement.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 px-3 py-2 text-[0.86rem]"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void decider(preuve, "valider")}
                disabled={envoi === preuve.id || enCours}
                className="min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {envoi === preuve.id ? "Enregistrement…" : "Valider"}
              </button>
              <button
                type="button"
                onClick={() => void decider(preuve, "refuser")}
                disabled={envoi === preuve.id || enCours}
                className="min-h-11 rounded-[var(--radius-bouton)] border border-noir-piste/30 px-5 py-2.5 text-[0.85rem] font-semibold transition-colors hover:bg-noir-piste/5 disabled:opacity-40"
              >
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
