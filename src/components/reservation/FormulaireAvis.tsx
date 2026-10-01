"use client";

import { useState } from "react";

/**
 * Avis du client sur son expérience avec Bike Land.
 *
 * Il porte sur l'expérience entière, l'accueil au départ, le vélo, le
 * parcours, la restitution, et non sur la machine seule : c'est ce que
 * le client a vécu, et c'est ce qu'un futur client veut savoir. Un avis
 * par vélo ferait raconter sept histoires différentes du même service.
 *
 * Il n'apparaît qu'une fois le vélo rendu, noter une sortie qu'on n'a
 * pas encore faite n'aurait pas de sens, et seul le porteur du lien de
 * suivi peut s'en servir : c'est ce qui garantit que chaque avis du site
 * correspond à une location réellement faite.
 *
 * Seule la note est obligatoire. Exiger un commentaire ferait taire ceux
 * qui n'ont rien de particulier à dire, et ce sont souvent les sorties
 * qui se sont bien passées.
 */
export function FormulaireAvis({
  token,
  noteExistante,
  titreExistant,
  commentaireExistant,
  dejaPublie,
}: {
  token: string;
  noteExistante?: number;
  titreExistant?: string;
  commentaireExistant?: string;
  dejaPublie?: boolean;
}) {
  const [note, setNote] = useState(noteExistante ?? 0);
  const [survol, setSurvol] = useState(0);
  const [titre, setTitre] = useState(titreExistant ?? "");
  const [commentaire, setCommentaire] = useState(commentaireExistant ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  const envoyer = async () => {
    if (note < 1) {
      setErreur("Choisissez une note, de une à cinq étoiles.");
      return;
    }
    setEnvoi(true);
    setErreur(null);

    try {
      const reponse = await fetch(`/api/reservations/${encodeURIComponent(token)}/avis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, titre, commentaire }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Votre avis n'a pas pu être enregistré.");
        return;
      }
      setEnvoye(true);
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  if (envoye) {
    return (
      <div className="mt-8 rounded-[var(--radius-bloc)] border border-vert-lagune/40 bg-white p-6 sm:p-7">
        <p className="titre-editorial text-[1.25rem]">Merci, c&apos;est noté</p>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">
          Nous relisons les avis avant de les publier. Le vôtre paraîtra sur le site sous votre
          prénom et l&apos;initiale de votre nom.
        </p>
      </div>
    );
  }

  const noteAffichee = survol || note;

  return (
    <div className="mt-8 rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6 sm:p-7">
      <h2 className="titre-editorial text-[1.25rem]">
        {noteExistante ? "Modifier votre avis" : "Comment s'est passée votre sortie avec nous ?"}
      </h2>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-gris-cadre">
        {noteExistante
          ? dejaPublie
            ? "Votre avis est publié. Le modifier le repasse en relecture."
            : "Votre avis est en cours de relecture. Vous pouvez encore le modifier."
          : "L'accueil, le vélo, le parcours, la restitution : dites ce que vous avez vécu. Seule la note est obligatoire."}
      </p>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem]"
        >
          {erreur}
        </p>
      )}

      {/* Les étoiles sont de vrais boutons radio pour rester utilisables
          au clavier et annonçables par un lecteur d'écran. */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">Votre note</legend>
        <div className="mt-3 flex items-center gap-1" onMouseLeave={() => setSurvol(0)}>
          {[1, 2, 3, 4, 5].map((valeur) => (
            <button
              key={valeur}
              type="button"
              onClick={() => setNote(valeur)}
              onMouseEnter={() => setSurvol(valeur)}
              onFocus={() => setSurvol(valeur)}
              onBlur={() => setSurvol(0)}
              aria-label={`${valeur} étoile${valeur > 1 ? "s" : ""} sur 5`}
              aria-pressed={note === valeur}
              className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-orange-signal/15"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={valeur <= noteAffichee ? "text-orange-signal" : "text-noir-piste/20"}
              >
                <path
                  d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ))}
          {noteAffichee > 0 && (
            <span className="ml-3 font-display text-[1.1rem] font-bold tabular-nums">
              {noteAffichee} / 5
            </span>
          )}
        </div>
      </fieldset>

      <label className="mt-6 block">
        <span className="etiquette opacity-75">Un titre (facultatif)</span>
        <input
          type="text"
          value={titre}
          maxLength={80}
          onChange={(evenement) => setTitre(evenement.target.value)}
          placeholder="Une matinée parfaite sur la route des Pêches"
          className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal"
        />
      </label>

      <label className="mt-5 block">
        <span className="etiquette opacity-75">Votre commentaire (facultatif)</span>
        <textarea
          value={commentaire}
          rows={4}
          maxLength={800}
          onChange={(evenement) => setCommentaire(evenement.target.value)}
          placeholder="L'accueil au départ, l'état du vélo, le parcours, la restitution"
          className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal"
        />
      </label>

      <button
        type="button"
        onClick={envoyer}
        disabled={envoi}
        className="mt-6 rounded-[var(--radius-bouton)] bg-orange-signal px-6 py-3 text-[0.9rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {envoi ? "Envoi…" : noteExistante ? "Modifier mon avis" : "Envoyer mon avis"}
      </button>
    </div>
  );
}
