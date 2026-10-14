"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Bouton, BoutonLien } from "@/components/Bouton";
import { Pastille } from "@/components/ui";
import {
  octobreRoseEnCours,
  rendezVousOctobreRose,
  signatureOctobreRose,
  tarifOctobreRose,
} from "@/data/produits";
import { aujourdhui } from "@/lib/dates";

/** Ce que le navigateur retient de l'annonce fermée (voir `signatureOctobreRose`). */
const CLE = "bikeland.octobre-rose";

/** Le temps laissé à la page pour s'afficher avant l'annonce. */
const DELAI_MS = 1500;

/**
 * Les pages où l'annonce ne s'ouvre jamais.
 *
 * La réservation et le paiement d'abord : une fenêtre par-dessus
 * bloquerait la validation Mobile Money. Les conditions de vente et la
 * protection des données s'ouvrent d'ailleurs depuis l'étape de paiement.
 * Les fiches vélo portent l'encart de réservation, et la page Nos produits
 * montre déjà Octobre rose en tête.
 */
const EXCLUES = ["/reservation", "/cgv", "/donnees-personnelles", "/mentions-legales", "/produits"];

function exclue(chemin: string): boolean {
  if (EXCLUES.some((page) => chemin === page || chemin.startsWith(`${page}/`))) return true;
  return chemin.startsWith("/velos/");
}

/** Le ruban d'Octobre rose, dessiné d'un trait. */
function Ruban({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 64" fill="none" aria-hidden="true" className={className}>
      <path
        d="M15 58 33 26C38 17 34 6 24 6S10 17 15 26l18 32"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * L'annonce d'Octobre rose, sur tout le site public, en octobre seulement.
 *
 * Tout se décide dans le navigateur, après l'affichage : les pages sont
 * en cache ou statiques, et un mois lu sur le serveur resterait figé
 * jusqu'au déploiement suivant. Le serveur ne rend donc rien, et l'annonce
 * s'éteint d'elle-même le 1er novembre, heure du Bénin.
 *
 * Elle s'ouvre une fois : fermée, elle ne revient pas, sauf l'octobre
 * suivant, ou quand la date de la sortie est enfin fixée (voir
 * `signatureOctobreRose`). Sans stockage (navigation privée), elle
 * s'ouvre une fois par visite.
 *
 * C'est un <dialog> natif ouvert avec showModal() : il passe au-dessus de
 * tout, rend le reste de la page inerte, se ferme avec Échap et rend le
 * focus à l'élément d'avant.
 */
export function AnnonceOctobreRose() {
  const chemin = usePathname() ?? "/";
  const [ouverte, setOuverte] = useState(false);
  const dialogue = useRef<HTMLDialogElement>(null);
  const dejaMontree = useRef(false);

  // L'annonce s'annonce après coup, sur une page qui l'accepte.
  useEffect(() => {
    if (exclue(chemin) || dejaMontree.current) return;
    const minuterie = setTimeout(() => {
      if (typeof HTMLDialogElement !== "function") return;
      if (!octobreRoseEnCours(new Date())) return;
      const jour = aujourdhui();
      try {
        if (window.localStorage.getItem(CLE) === signatureOctobreRose(jour)) return;
      } catch {
        // Stockage indisponible (navigation privée) : une fois par visite.
      }
      dejaMontree.current = true;
      setOuverte(true);
    }, DELAI_MS);
    return () => clearTimeout(minuterie);
  }, [chemin]);

  // Sur une page exclue, rejointe par le bouton Précédent, elle s'efface.
  const visible = ouverte && !exclue(chemin);

  useEffect(() => {
    const element = dialogue.current;
    if (visible && element && !element.open) element.showModal();
  }, [visible]);

  const fermer = () => {
    try {
      window.localStorage.setItem(CLE, signatureOctobreRose(aujourdhui()));
    } catch {
      // Stockage indisponible : elle ne reviendra pas de la visite.
    }
    dialogue.current?.close();
    setOuverte(false);
  };

  if (!visible) return null;

  const rendezVous = rendezVousOctobreRose();
  const texte = rendezVous
    ? `${rendezVous.charAt(0).toUpperCase()}${rendezVous.slice(1)}\u00a0: une sortie à vélo aux couleurs d'Octobre rose, le mois de sensibilisation au cancer du sein.`
    : "Une sortie à vélo aux couleurs d'Octobre rose, le mois de sensibilisation au cancer du sein, se prépare. Date et programme très bientôt.";
  const tarif = tarifOctobreRose();
  const prix = tarif ? ` ${tarif}.` : "";

  return (
    <dialog
      ref={dialogue}
      data-annonce=""
      aria-labelledby="annonce-octobre-rose-titre"
      aria-describedby="annonce-octobre-rose-texte"
      onCancel={(evenement) => {
        evenement.preventDefault();
        fermer();
      }}
      onClick={(evenement) => {
        // Un clic sur le voile, hors de la carte, ferme l'annonce.
        if (evenement.target === evenement.currentTarget) fermer();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[28rem] overflow-y-auto rounded-[var(--radius-bloc)] bg-noir-piste p-0 text-craie"
    >
      <div className="relative bg-rose-octobre px-6 pb-7 pt-6">
        <button
          type="button"
          onClick={fermer}
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] transition-colors hover:bg-noir-piste/10"
        >
          <span className="sr-only">Fermer</span>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M3 3 15 15M15 3 3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <Ruban className="h-16 w-12 text-craie" />
        <Pastille ton="sombre" className="mt-5">
          Octobre rose
        </Pastille>
        <h2 id="annonce-octobre-rose-titre" className="titre-editorial mt-4 text-[2.2rem]">
          Roulez en rose
          <br />
          avec Bike Land
        </h2>
      </div>
      <div className="px-6 pb-6 pt-5">
        <p id="annonce-octobre-rose-texte" className="text-[0.95rem] leading-relaxed text-craie/85">
          {texte}
          {prix}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <BoutonLien href="/produits#octobre-rose" onClick={fermer}>
            Découvrir la sortie
          </BoutonLien>
          <Bouton type="button" variante="contour" onClick={fermer} className="text-craie">
            Plus tard
          </Bouton>
        </div>
      </div>
    </dialog>
  );
}
