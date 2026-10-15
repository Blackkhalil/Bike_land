"use client";

import { useEffect, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

import { Pastille } from "@/components/ui";
import type { GammeVelo } from "@/data/offres";

/** Une gamme telle que la page la présente, ses vélos déjà rendus par le serveur. */
export interface GammeAuChoix {
  code: GammeVelo;
  nom: string;
  pourQui: string;
  description: string;
  /** « 1 125 FCFA » : le prix d'entrée, l'heure de location libre. */
  prixHeure: string;
  /** Le road trip, par personne. */
  prixRoadTrip: string;
  nombre: number;
  lePlusPris: boolean;
  /** La grille des vélos de la gamme. */
  velos: ReactNode;
}

/** La gamme choisie vit dans l'adresse : « /velos#gamme-premium ». */
const PREFIXE = "#gamme-";
const CHANGEMENT = "bikeland:gamme";

function abonnement(rappel: () => void) {
  window.addEventListener("hashchange", rappel);
  window.addEventListener("popstate", rappel);
  window.addEventListener(CHANGEMENT, rappel);
  return () => {
    window.removeEventListener("hashchange", rappel);
    window.removeEventListener("popstate", rappel);
    window.removeEventListener(CHANGEMENT, rappel);
  };
}

const lireAdresse = () => window.location.hash.toLowerCase();
const ancre = (code: GammeVelo) => `${PREFIXE}${code.toLowerCase()}`;
const sansAnimation = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Le choix de la gamme, sur la page où mène « Réserver ».
 *
 * Le client voit d'abord les trois gammes, en cadres, et rien d'autre : un
 * cadre touché, ce sont les vélos de cette gamme, et d'elle seule, qui
 * s'affichent dessous. La gamme choisie s'écrit dans l'adresse : le bouton
 * Précédent revient au choix, un lien de l'accueil (« Voir les vélos Premium »)
 * ouvre la page sur sa gamme, et le retour depuis une fiche vélo retrouve
 * la gamme qu'on regardait.
 *
 * Les vélos de toutes les gammes sont dans la page, cachés tant qu'on ne
 * les a pas choisis : les moteurs de recherche voient le parc entier.
 */
export function ChoixDeGamme({ gammes }: { gammes: GammeAuChoix[] }) {
  const adresse = useSyncExternalStore(abonnement, lireAdresse, () => "");
  const choisie = gammes.find((gamme) => ancre(gamme.code) === adresse) ?? null;
  const zone = useRef<HTMLDivElement>(null);

  // Arrivée sur la page avec une gamme dans l'adresse (depuis l'accueil, ou
  // en revenant d'une fiche vélo) : l'adresse est relue un tour plus tard,
  // quand la navigation l'a posée, et la page descend jusqu'aux vélos.
  useEffect(() => {
    const minuteur = setTimeout(() => {
      window.dispatchEvent(new Event(CHANGEMENT));
      if (window.location.hash.toLowerCase().startsWith(PREFIXE)) {
        zone.current?.scrollIntoView({ block: "start" });
      }
    }, 0);
    return () => clearTimeout(minuteur);
  }, []);

  const choisir = (evenement: MouseEvent<HTMLAnchorElement>, code: GammeVelo) => {
    evenement.preventDefault();
    const cible = ancre(code);
    if (window.location.hash.toLowerCase() !== cible) window.history.pushState(null, "", cible);
    window.dispatchEvent(new Event(CHANGEMENT));
    // Une fois les vélos affichés : la page y descend, et le lecteur d'écran
    // est porté sur leur titre.
    setTimeout(() => {
      zone.current?.scrollIntoView({ behavior: sansAnimation() ? "auto" : "smooth", block: "start" });
      document.getElementById(`velos-${code.toLowerCase()}-titre`)?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <>
      <nav id="gammes" aria-label="Nos gammes de vélos" className="mt-12 scroll-mt-[88px]">
        {/* Trois cadres de front seulement dès 1024 px : à 768 px, chacun
            n'avait plus que 172 px utiles, la pastille débordait du cadre
            et les prix se cassaient. Dessous, ils s'empilent. */}
        <ul className="grid gap-4 lg:grid-cols-3">
          {gammes.map((gamme) => {
            const active = choisie?.code === gamme.code;
            return (
              <li key={gamme.code}>
                <a
                  href={ancre(gamme.code)}
                  onClick={(evenement) => choisir(evenement, gamme.code)}
                  aria-controls={`velos-${gamme.code.toLowerCase()}`}
                  aria-expanded={active}
                  className={`group flex h-full flex-col rounded-[var(--radius-bloc)] border-2 p-6 transition-colors ${
                    active
                      ? "border-orange-signal bg-noir-releve"
                      : gamme.lePlusPris
                        ? "border-orange-signal/60 bg-noir-releve hover:border-orange-signal"
                        : "border-craie/15 bg-noir-releve/60 hover:border-craie/40"
                  }`}
                >
                  <span className="flex min-h-9 items-center justify-between gap-3">
                    <span className="titre-editorial text-[1.7rem] text-craie">{gamme.nom}</span>
                    {gamme.lePlusPris && (
                      <span className="shrink-0 rounded-full bg-orange-signal px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-noir-piste">
                        Le plus pris
                      </span>
                    )}
                  </span>
                  <span className="mt-2 text-[0.88rem] leading-relaxed text-craie/70">{gamme.pourQui}</span>
                  <span className="mb-5 mt-5 block">
                    <span className="font-display text-[1.9rem] font-extrabold leading-none tabular-nums text-orange-signal">
                      {gamme.prixHeure}
                    </span>
                    <span className="mt-1 block text-[0.8rem] text-craie/60">
                      l&apos;heure · <span className="whitespace-nowrap">road trip {gamme.prixRoadTrip} / pers.</span>
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-craie/15 pt-4 text-[0.85rem]">
                    <span className="text-craie/70">
                      {gamme.nombre === 1 ? "1 vélo, exemplaire unique" : `${gamme.nombre} vélos`}
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-craie underline-offset-4 group-hover:underline">
                      {active ? "Vélos affichés" : gamme.nombre === 1 ? "Voir le vélo" : "Voir les vélos"}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1.5v9M2 6.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div ref={zone} className="scroll-mt-[88px]">
        {!choisie && (
          <p className="mt-10 rounded-[var(--radius-carte)] border border-dashed border-craie/20 px-5 py-6 text-center text-[0.95rem] leading-relaxed text-craie/70">
            Touchez une gamme&nbsp;: ses vélos s&apos;affichent ici.
          </p>
        )}
        {gammes.map((gamme) => {
          const code = gamme.code.toLowerCase();
          return (
            <section
              key={gamme.code}
              id={`velos-${code}`}
              aria-labelledby={`velos-${code}-titre`}
              hidden={choisie?.code !== gamme.code}
              className={`mt-10 rounded-[var(--radius-bloc)] border-2 p-5 sm:p-8 ${
                gamme.lePlusPris ? "border-orange-signal/70" : "border-craie/12"
              }`}
            >
              <div className="flex flex-col gap-3 border-b border-craie/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2
                      id={`velos-${code}-titre`}
                      tabIndex={-1}
                      className="titre-editorial text-[1.7rem] text-craie outline-none"
                    >
                      Les vélos {gamme.nom}
                    </h2>
                    {gamme.lePlusPris && <Pastille ton="neutre">Le plus pris</Pastille>}
                  </div>
                  <p className="mt-1.5 max-w-lg text-[0.88rem] leading-relaxed text-craie/70">{gamme.description}</p>
                </div>
                <p className="shrink-0 text-[0.9rem] text-craie/70">
                  dès{" "}
                  <strong className="font-display text-[1.2rem] font-bold text-orange-signal">{gamme.prixHeure}</strong>{" "}
                  l&apos;heure · <span className="whitespace-nowrap">road trip {gamme.prixRoadTrip}</span>
                </p>
              </div>
              <div className="mt-8">{gamme.velos}</div>
              <p className="mt-8 text-center">
                <a href="#gammes" className="lien-souligne cible-elargie text-[0.88rem] font-semibold text-craie">
                  Voir une autre gamme
                </a>
              </p>
            </section>
          );
        })}
      </div>
    </>
  );
}
