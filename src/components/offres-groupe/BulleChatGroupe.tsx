"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { FaitsChat } from "@/lib/offres-groupe/conversation";
import {
  adresseSansChat,
  ATTRIBUT_CHAT_PRET,
  demandeDeLAdresse,
  demandeOuverture,
  EVENEMENT_CHAT_GROUPE,
  type DemandeOuverture,
} from "@/lib/offres-groupe/ouverture-chat";

/**
 * Le panneau de discussion, chargé seulement à la première ouverture : la
 * bulle est sur toutes les pages du site, le chatbot (moteur de calcul
 * compris) ne pèse sur le téléphone que de qui l'ouvre.
 */
const PanneauChatGroupe = dynamic(() => import("./PanneauChatGroupe").then((module) => module.PanneauChatGroupe), {
  ssr: false,
  loading: () => <ChargementPanneau />,
});

/** La clé de la conversation dans le stockage de session (la même que conversation.ts, sans le charger ici). */
const CLE_STOCKAGE_CHAT = "bikeland.chat-groupe";
const DUREE_CONSERVATION_MS = 12 * 60 * 60 * 1000;

/** Les pages où la bulle flottante ne se montre pas : le tunnel et le suivi d'une réservation, paiement en cours. */
const PAGES_SANS_BULLE = ["/reservation"];

/** Le chatbot était-il ouvert avant le rechargement de la page ? Lu sans charger la machine. */
function etaitOuvert(maintenant: number): boolean {
  try {
    const brut = JSON.parse(window.sessionStorage.getItem(CLE_STOCKAGE_CHAT) ?? "null") as { ouvert?: unknown; misAJourLe?: unknown } | null;
    return brut?.ouvert === true && typeof brut.misAJourLe === "number" && maintenant - brut.misAJourLe < DUREE_CONSERVATION_MS;
  } catch {
    return false;
  }
}

/**
 * La bulle « Réserver en groupe » : un bouton discret en bas à droite, sur
 * les pages du site public, qui ouvre le chatbot des offres de groupe
 * (décisions 22 et 23). Elle n'est rendue que quand le serveur a dit que
 * les offres se vendent en ligne : interrupteur ouvert, réglages lisibles
 * (`faits`, lus par le serveur).
 *
 * Elle s'ouvre aussi depuis un bouton d'une page (événement du navigateur),
 * depuis un lien qui porte l'offre dans l'adresse (le lien de l'email après
 * la vérification d'une capture), et d'elle-même après un rechargement si la
 * discussion était ouverte.
 *
 * Elle ne couvre jamais un élément marqué `data-evite-bulle` (la commande
 * du son de la vidéo d'accueil, le bandeau de l'exploitant) : elle monte
 * juste au-dessus quand il passe dessous.
 */
export function BulleChatGroupe({ faits }: { faits: FaitsChat }) {
  const chemin = usePathname() ?? "/";
  const bouton = useRef<HTMLButtonElement>(null);
  const [ouvert, setOuvert] = useState(false);
  // La demande en cours (offre, preuve) et l'instant de l'ouverture, qui
  // sert d'horloge de départ au panneau.
  const [ouverture, setOuverture] = useState<{ demande: DemandeOuverture | null; jeton: number; instant: number } | null>(null);
  const [decalage, setDecalage] = useState(0);

  const masquee = PAGES_SANS_BULLE.some((page) => chemin === page || chemin.startsWith(`${page}/`));

  // Les boutons des pages savent que la bulle écoute ; la discussion se
  // rouvre après un rechargement ; un lien peut porter l'offre.
  useEffect(() => {
    const racine = document.documentElement;
    racine.setAttribute(ATTRIBUT_CHAT_PRET, "pret");

    const ouvrirSur = (demande: DemandeOuverture | null) => {
      const instant = Date.now();
      setOuverture((avant) => ({ demande, jeton: (avant?.jeton ?? 0) + 1, instant }));
      setOuvert(true);
    };
    const ecouter = (evenement: Event) => ouvrirSur(demandeOuverture((evenement as CustomEvent<unknown>).detail));
    window.addEventListener(EVENEMENT_CHAT_GROUPE, ecouter);

    const depart = setTimeout(() => {
      const demande = demandeDeLAdresse(window.location.search);
      if (demande) {
        ouvrirSur(demande);
        const { pathname, search, hash } = window.location;
        window.history.replaceState(window.history.state, "", adresseSansChat(pathname, search, hash));
      } else if (etaitOuvert(Date.now())) {
        ouvrirSur(null);
      }
    }, 0);

    return () => {
      racine.removeAttribute(ATTRIBUT_CHAT_PRET);
      window.removeEventListener(EVENEMENT_CHAT_GROUPE, ecouter);
      clearTimeout(depart);
    };
  }, []);

  // La bulle monte au-dessus de ce qu'elle ne doit pas couvrir. Elle reste
  // rendue pendant la discussion (sous le panneau, la page est inerte) : le
  // panneau fermé, le focus lui revient tout seul.
  const visible = !masquee;
  useEffect(() => {
    if (!visible || ouvert) return;
    let image = 0;
    const mesurer = () => {
      image = 0;
      const element = bouton.current;
      if (!element) return;
      const marge = 16;
      const bas = window.innerHeight - marge;
      const haut = bas - element.offsetHeight;
      const droite = window.innerWidth - marge;
      const gauche = droite - element.offsetWidth;
      let levee = 0;
      for (const protege of document.querySelectorAll("[data-evite-bulle]")) {
        const zone = protege.getBoundingClientRect();
        if (zone.width === 0 || zone.height === 0) continue;
        const croise = zone.left < droite && zone.right > gauche && zone.top < bas && zone.bottom > haut;
        if (croise) levee = Math.max(levee, bas - zone.top + 8);
      }
      setDecalage(levee);
    };
    const demander = () => {
      if (!image) image = window.requestAnimationFrame(mesurer);
    };
    demander();
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);
    const relecture = window.setInterval(demander, 1500);
    return () => {
      window.removeEventListener("scroll", demander);
      window.removeEventListener("resize", demander);
      window.clearInterval(relecture);
      if (image) window.cancelAnimationFrame(image);
    };
  }, [visible, ouvert]);

  // Le panneau rend lui-même le focus à ce qui l'a ouvert (dialogue natif).
  const fermer = () => setOuvert(false);

  return (
    <>
      {visible && (
        <button
          ref={bouton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={ouvert}
          onClick={() => {
            setOuverture((avant) => ({ demande: null, jeton: (avant?.jeton ?? 0) + 1, instant: Date.now() }));
            setOuvert(true);
          }}
          style={{ transform: decalage ? `translateY(-${decalage}px)` : undefined }}
          className="fixed bottom-4 right-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex h-12 items-center gap-2 rounded-full border border-craie/30 bg-noir-piste pl-3 pr-4 text-[0.86rem] font-semibold text-craie transition-[transform,background-color] duration-200 hover:bg-noir-releve"
        >
          <IconeDiscussion />
          Réserver en groupe
        </button>
      )}
      {ouvert && ouverture && (
        <PanneauChatGroupe
          faits={faits}
          demande={ouverture.demande}
          jeton={ouverture.jeton}
          ouvertA={ouverture.instant}
          onFermer={fermer}
        />
      )}
    </>
  );
}

/** Deux bulles de discussion, l'une orange : le signe du chatbot. */
function IconeDiscussion() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h8A2.5 2.5 0 0 1 17 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5z"
        fill="#f25c05"
      />
      <path
        d="M19 8.5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2v2.5L16 16.5h-3.5a2 2 0 0 1-2-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Le temps que le panneau arrive, la première fois : un cadre à sa place, qui dit qu'il arrive. */
function ChargementPanneau() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-[70] grid place-items-center bg-craie text-noir-piste md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:border-l md:border-noir-piste/10"
    >
      <p className="flex items-center gap-3 text-[0.92rem]">
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-noir-piste/25 border-t-noir-piste" />
        Un instant, j&apos;arrive…
      </p>
    </div>
  );
}
