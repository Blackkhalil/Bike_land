"use client";

import { useState, type FormEvent, type RefObject } from "react";

import type { ActionSansHeure, ModeSaisie } from "./ControlesChat";
import { IconeEnvoyer } from "./IconesChat";

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
 */
export function CompositeurChat({
  mode,
  indicationInactive,
  champ,
  onEnvoyer,
}: {
  mode: ModeSaisie | null;
  /** Ce que dit le champ grisé. */
  indicationInactive: string;
  champ: RefObject<HTMLInputElement | null>;
  onEnvoyer: (action: ActionSansHeure) => void;
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
      className="shrink-0 border-t border-noir-piste/10 bg-white px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5"
    >
      {mode?.legende && (
        <label htmlFor="chat-saisie" className="mb-1.5 block px-1 text-[0.8rem] font-semibold text-noir-piste">
          {mode.legende}
        </label>
      )}
      <div className="flex items-center gap-2">
        <div
          className={`flex min-h-11 min-w-0 flex-1 items-center rounded-full border px-4 transition-colors ${
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
            className="saisie-chat h-11 w-full min-w-0 text-ellipsis bg-transparent text-[1rem] text-noir-piste placeholder:text-[0.875rem] placeholder:text-gris-cadre disabled:cursor-not-allowed"
          />
        </div>
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
      </div>
    </form>
  );
}
