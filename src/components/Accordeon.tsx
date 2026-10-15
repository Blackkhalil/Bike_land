"use client";

import { useState } from "react";

/**
 * Accordéon accessible, un seul volet ouvert à la fois.
 *
 * Utilisé pour l'entretien sur la page d'accueil et pour la FAQ. Les
 * volets restent dans le DOM et sont masqués par `hidden`, ce qui laisse
 * la recherche du navigateur et l'indexation fonctionner.
 */

export interface VoletAccordeon {
  titre: string;
  contenu: string;
}

/**
 * Espaces insécables avant « ? ! : ; » et dans les guillemets : un signe
 * ne part plus seul à la ligne.
 */
function insecables(texte: string) {
  return texte.replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ");
}

export function Accordeon({
  volets,
  ouvertParDefaut = 0,
  className = "",
  idPrefixe = "accordeon",
}: {
  volets: VoletAccordeon[];
  ouvertParDefaut?: number | null;
  className?: string;
  idPrefixe?: string;
}) {
  const [ouvert, setOuvert] = useState<number | null>(ouvertParDefaut);

  return (
    <div className={`divide-y divide-current/12 border-y border-current/12 ${className}`}>
      {volets.map((volet, index) => {
        const estOuvert = ouvert === index;
        const idBouton = `${idPrefixe}-bouton-${index}`;
        const idPanneau = `${idPrefixe}-panneau-${index}`;

        return (
          <div key={volet.titre}>
            <h3>
              <button
                type="button"
                id={idBouton}
                aria-expanded={estOuvert}
                aria-controls={idPanneau}
                onClick={() => setOuvert(estOuvert ? null : index)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left"
              >
                <span className="text-[0.95rem] font-semibold uppercase tracking-[0.06em]">
                  {insecables(volet.titre)}
                </span>
                <span
                  aria-hidden="true"
                  className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border border-current/25"
                >
                  <span className="absolute h-[1.5px] w-3 bg-current" />
                  <span
                    className={`absolute h-3 w-[1.5px] bg-current transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      estOuvert ? "scale-y-0" : "scale-y-100"
                    }`}
                  />
                </span>
              </button>
            </h3>
            <div
              id={idPanneau}
              role="region"
              aria-labelledby={idBouton}
              hidden={!estOuvert}
              className="pb-6 pr-10"
            >
              <p className="max-w-2xl text-[0.95rem] leading-relaxed opacity-70">{insecables(volet.contenu)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
