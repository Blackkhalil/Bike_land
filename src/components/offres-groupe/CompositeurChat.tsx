"use client";

import { useState, type FormEvent, type RefObject } from "react";

import type { ActionSansHeure, ModeSaisie } from "./ControlesChat";
import { IconeEnvoyer, IconeVersLeBas } from "./IconesChat";

/**
 * La barre du bas, comme sur un téléphone : un champ arrondi et le rond
 * orange « Envoyer ». Quand l'étape attend une réponse tapée (un autre
 * montant, une autre date, le nombre de personnes, les coordonnées), le
 * champ EST cette réponse, avec le bon clavier et le remplissage
 * automatique du téléphone. Sinon il est grisé : on répond en touchant une
 * réponse au-dessus.
 *
 * Ce qui part est l'action de la machine que rend `mode.lire` ; tant
 * qu'elle est nulle (rien de valable tapé), le bouton reste grisé.
 *
 * Quand la discussion n'est pas descendue jusqu'en bas et que rien ne se
 * tape (`onVoirLaSuite`), le rond blanc « Voir la suite » prend la place du
 * bouton d'envoi : il descend jusqu'aux dernières bulles et aux réponses,
 * sans jamais rien cacher de la discussion.
 */
export function CompositeurChat({
  mode,
  indicationInactive,
  champ,
  onEnvoyer,
  onVoirLaSuite = null,
}: {
  mode: ModeSaisie | null;
  /** Ce que dit le champ grisé. */
  indicationInactive: string;
  champ: RefObject<HTMLInputElement | null>;
  onEnvoyer: (action: ActionSansHeure) => void;
  /** La suite est plus bas : le rond « Voir la suite » y mène ; `null` quand la discussion est en bas. */
  onVoirLaSuite?: (() => void) | null;
}) {
  // Le texte tapé vaut pour une question : une autre question repart d'un champ vide.
  const [saisie, setSaisie] = useState({ cle: "", texte: "" });
  const texte = mode && saisie.cle === mode.cle ? saisie.texte : "";
  const action = mode ? mode.lire(texte) : null;

  const envoyer = (evenement: FormEvent) => {
    evenement.preventDefault();
    if (!mode || !action) return;
    onEnvoyer(action);
    setSaisie({ cle: mode.cle, texte: "" });
  };

  return (
    <form
      onSubmit={envoyer}
      // La machine vérifie chaque réponse et répond par une bulle (un email incomplet, par
      // exemple) : le navigateur ne la bloque pas avant. Seule la date garde ses bornes.
      noValidate={mode?.type !== "date"}
      className="shrink-0 border-t border-noir-piste/10 bg-white px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 md:rounded-b-[24px]"
    >
      {mode?.legende && (
        <label htmlFor="chat-saisie" className="mb-1.5 block px-1 text-[0.8rem] font-semibold text-noir-piste">
          {mode.legende}
        </label>
      )}
      <div className="flex items-center gap-2">
        <div
          className={`flex min-h-11 min-w-0 flex-1 items-center rounded-full border px-3.5 transition-colors ${
            mode
              ? "border-noir-piste/25 bg-white focus-within:border-noir-piste focus-within:ring-1 focus-within:ring-noir-piste"
              : "border-transparent bg-craie"
          }`}
        >
          {!mode?.legende && (
            <label htmlFor="chat-saisie" className="sr-only">
              {mode ? mode.etiquette : "Votre réponse"}
            </label>
          )}
          <input
            id="chat-saisie"
            ref={champ}
            type={mode?.type ?? "text"}
            inputMode={mode?.inputMode}
            autoComplete={mode?.autoComplete ?? "off"}
            autoCapitalize={mode?.autoCapitalize ?? "off"}
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            min={mode?.min}
            max={mode?.max}
            maxLength={mode && mode.type !== "date" ? 120 : undefined}
            disabled={!mode}
            placeholder={mode ? mode.indication : indicationInactive}
            value={texte}
            onChange={(evenement) => {
              if (mode) setSaisie({ cle: mode.cle, texte: evenement.target.value });
            }}
            // 16 px pour le texte tapé (sinon l'iPhone agrandit la page) ; l'indication, plus petite, tient dès 320 px.
            className="saisie-chat h-11 w-full min-w-0 text-ellipsis bg-transparent text-[1rem] text-noir-piste placeholder:text-[0.8125rem] placeholder:text-gris-cadre disabled:cursor-not-allowed min-[360px]:placeholder:text-[0.875rem]"
          />
        </div>
        {!mode && onVoirLaSuite ? (
          <button
            type="button"
            onClick={onVoirLaSuite}
            aria-label="Voir la suite"
            title="Voir la suite"
            className="rond-suite grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-noir-piste shadow-[0_2px_10px_rgba(14,14,14,0.18)] ring-1 ring-noir-piste/15 transition-colors hover:bg-craie"
          >
            <IconeVersLeBas />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Envoyer"
            disabled={!action}
            // Toucher « Envoyer » ne retire pas le focus du champ : le clavier du téléphone reste ouvert.
            onMouseDown={(evenement) => evenement.preventDefault()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-orange-signal text-white transition-colors hover:bg-orange-vif disabled:cursor-not-allowed disabled:bg-noir-piste/15"
          >
            <IconeEnvoyer />
          </button>
        )}
      </div>
    </form>
  );
}
