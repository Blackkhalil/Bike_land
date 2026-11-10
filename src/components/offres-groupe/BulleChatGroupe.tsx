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

import { IconeDiscussion, IconeFermer } from "./IconesChat";

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

/** Le petit message « Réserver en groupe ? » a été montré dans cette session du navigateur. */
const CLE_INVITATION = "bikeland.chat-groupe.invitation";
/** Il arrive peu après la page, reste quelques secondes, puis s'efface. */
const DELAI_INVITATION_MS = 1500;
const DUREE_INVITATION_MS = 6000;
const SORTIE_INVITATION_MS = 320;

/** Les pages où la bulle flottante ne se montre pas : le tunnel et le suivi d'une réservation, paiement en cours. */
const PAGES_SANS_BULLE = ["/reservation"];

/**
 * Les pages où une discussion restée ouverte ne se rouvre pas d'elle-même :
 * celles que le chatbot ouvre dans un nouvel onglet (les conditions et la
 * protection des données, qu'on veut lire tranquillement : l'onglet hérite
 * du stockage de session) et le tunnel. Un bouton ou un lien l'ouvre quand
 * même.
 */
const PAGES_SANS_REOUVERTURE = ["/reservation", "/cgv", "/donnees-personnelles", "/mentions-legales"];

const correspond = (chemin: string, pages: string[]) => pages.some((page) => chemin === page || chemin.startsWith(`${page}/`));

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
 * L'invitation est-elle déjà passée dans cette session : montrée, ou le
 * chatbot déjà ouvert (sa conversation est rangée) ? Sans stockage lisible
 * (navigation privée stricte), on ne la montre pas : elle reviendrait à
 * chaque page.
 */
function invitationDejaPassee(): boolean {
  try {
    return window.sessionStorage.getItem(CLE_INVITATION) !== null || window.sessionStorage.getItem(CLE_STOCKAGE_CHAT) !== null;
  } catch {
    return true;
  }
}

/** Le petit message : en attente, à l'écran, en train de s'effacer, fini pour cette page. */
type PhaseInvitation = "attente" | "visible" | "sortie" | "finie";

/**
 * La bulle « Réserver en groupe » : un rond orange en bas à droite, sur les
 * pages du site public, qui ouvre le chatbot des offres de groupe
 * (décisions 22 et 23). Peu après l'arrivée sur le site, un petit message
 * « Réserver en groupe ? » apparaît à côté quelques secondes, une seule fois
 * par session du navigateur. Elle n'est rendue que quand le serveur a dit
 * que les offres se vendent en ligne : interrupteur ouvert, réglages
 * lisibles (`faits`, lus par le serveur).
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
  const [invitation, setInvitation] = useState<PhaseInvitation>("attente");
  // Survolée ou au clavier, l'invitation reste le temps qu'on la lise.
  const [invitationTenue, setInvitationTenue] = useState(false);

  const masquee = correspond(chemin, PAGES_SANS_BULLE);

  // Les boutons des pages savent que la bulle écoute ; la discussion se
  // rouvre après un rechargement ; un lien peut porter l'offre.
  useEffect(() => {
    const racine = document.documentElement;
    racine.setAttribute(ATTRIBUT_CHAT_PRET, "pret");

    const ouvrirSur = (demande: DemandeOuverture | null) => {
      const instant = Date.now();
      setOuverture((avant) => ({ demande, jeton: (avant?.jeton ?? 0) + 1, instant }));
      setOuvert(true);
      setInvitation("finie");
    };
    const ecouter = (evenement: Event) => ouvrirSur(demandeOuverture((evenement as CustomEvent<unknown>).detail));
    window.addEventListener(EVENEMENT_CHAT_GROUPE, ecouter);

    const depart = setTimeout(() => {
      const demande = demandeDeLAdresse(window.location.search);
      if (demande) {
        ouvrirSur(demande);
        const { pathname, search, hash } = window.location;
        window.history.replaceState(window.history.state, "", adresseSansChat(pathname, search, hash));
      } else if (!correspond(window.location.pathname, PAGES_SANS_REOUVERTURE) && etaitOuvert(Date.now())) {
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
  const invitationAffichee = visible && !ouvert && (invitation === "visible" || invitation === "sortie");

  // L'invitation : une fois par session, jamais si le chatbot s'est déjà
  // ouvert. Une ouverture entre-temps (bouton, lien, rechargement) la
  // passe à « finie » : elle n'arrive plus. Le délai ne court que sur une
  // page qui montre la bulle (pas sur le suivi d'une réservation) : arrivé
  // par le lien de suivi, le client la verra sur la page suivante.
  useEffect(() => {
    if (!visible || invitationDejaPassee()) return;
    const arrivee = window.setTimeout(() => setInvitation((avant) => (avant === "attente" ? "visible" : avant)), DELAI_INVITATION_MS);
    return () => window.clearTimeout(arrivee);
  }, [visible]);
  // Comptée comme vue seulement une fois vraiment à l'écran.
  useEffect(() => {
    if (!invitationAffichee) return;
    try {
      window.sessionStorage.setItem(CLE_INVITATION, "vue");
    } catch {
      // Sans stockage, elle ne reviendra pas sur cette page de toute façon.
    }
  }, [invitationAffichee]);
  useEffect(() => {
    if (invitation !== "visible" || invitationTenue) return;
    const depart = window.setTimeout(() => setInvitation("sortie"), DUREE_INVITATION_MS);
    return () => window.clearTimeout(depart);
  }, [invitation, invitationTenue]);
  useEffect(() => {
    if (invitation !== "sortie") return;
    const fin = window.setTimeout(() => setInvitation("finie"), SORTIE_INVITATION_MS);
    return () => window.clearTimeout(fin);
  }, [invitation]);

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

  const ouvrir = () => {
    setOuverture((avant) => ({ demande: null, jeton: (avant?.jeton ?? 0) + 1, instant: Date.now() }));
    setOuvert(true);
    setInvitation("finie");
  };
  // Le panneau rend lui-même le focus à ce qui l'a ouvert (dialogue natif).
  const fermer = () => setOuvert(false);

  return (
    <>
      {visible && (
        <div
          style={{ transform: decalage ? `translateY(-${decalage}px)` : undefined }}
          className="fixed bottom-4 right-4 z-40 mb-[env(safe-area-inset-bottom)] flex items-center gap-3 transition-transform duration-200"
        >
          {invitationAffichee && (
            <Invitation
              sortie={invitation === "sortie"}
              onOuvrir={() => {
                // Le message disparaît à l'ouverture : la bulle prend le focus d'abord, pour le
                // retrouver quand la discussion se ferme (le dialogue le rend à ce qui l'avait).
                bouton.current?.focus();
                ouvrir();
              }}
              onMasquer={() => {
                setInvitation("sortie");
                // La croix disparaît avec le message : le focus passe à la bulle.
                bouton.current?.focus();
              }}
              onTenir={setInvitationTenue}
            />
          )}
          <button
            ref={bouton}
            type="button"
            aria-label="Réserver en groupe"
            title="Réserver en groupe"
            aria-haspopup="dialog"
            aria-expanded={ouvert}
            onClick={ouvrir}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange-signal text-white shadow-[0_6px_18px_rgba(14,14,14,0.3)] transition-[transform,background-color] duration-200 hover:bg-orange-vif active:scale-95"
          >
            <IconeDiscussion taille={28} />
          </button>
        </div>
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

/**
 * « Réserver en groupe ? » : une petite carte blanche, sa pointe vers la
 * bulle. Un clic ouvre le chatbot, la croix la masque. Sans animation si
 * le système demande moins de mouvement (règle commune de globals.css).
 */
function Invitation({
  sortie,
  onOuvrir,
  onMasquer,
  onTenir,
}: {
  sortie: boolean;
  onOuvrir: () => void;
  onMasquer: () => void;
  onTenir: (tenue: boolean) => void;
}) {
  return (
    <div
      onPointerEnter={() => onTenir(true)}
      onPointerLeave={() => onTenir(false)}
      onFocus={() => onTenir(true)}
      onBlur={() => onTenir(false)}
      className={`relative flex items-center rounded-2xl bg-white text-noir-piste shadow-[0_6px_20px_rgba(14,14,14,0.22)] ${
        sortie ? "invitation-sortie" : "invitation-entree"
      }`}
    >
      <button type="button" onClick={onOuvrir} className="min-h-11 rounded-l-2xl py-2 pl-4 pr-1 text-left text-[0.9rem] font-semibold leading-tight">
        {/* Espace insécable : le « ? » ne part jamais seul à la ligne. */}
        Réserver en groupe{" "}?
      </button>
      <button
        type="button"
        onClick={onMasquer}
        aria-label="Masquer ce message"
        className="grid h-11 w-10 shrink-0 place-items-center rounded-r-2xl text-gris-cadre transition-colors hover:text-noir-piste"
      >
        <IconeFermer taille={16} />
      </button>
      {/* La pointe, vers la bulle. */}
      <svg aria-hidden="true" width="8" height="14" viewBox="0 0 8 14" className="absolute -right-[7px] top-1/2 -translate-y-1/2 fill-white">
        <path d="M0 0c1.5 3 4.5 5.6 8 7-3.5 1.4-6.5 4-8 7Z" />
      </svg>
    </div>
  );
}

/**
 * Le temps que le panneau arrive, la première fois : un cadre à sa place
 * (plein écran sur téléphone, fenêtre en bas à droite sur ordinateur), qui
 * dit qu'il arrive.
 */
function ChargementPanneau() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-craie text-noir-piste md:inset-auto md:bottom-4 md:right-4 md:h-[min(680px,calc(100dvh-32px))] md:w-[400px] md:rounded-[24px] md:bg-transparent md:shadow-[0_24px_60px_rgba(14,14,14,0.35)]"
    >
      <div aria-hidden="true" className="h-16 shrink-0 bg-noir-piste md:rounded-t-[24px]" />
      <div className="flex flex-1 bg-craie md:rounded-b-[24px]">
        <p className="m-auto flex items-center gap-3 text-[0.92rem]">
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-noir-piste/25 border-t-noir-piste" />
          Un instant, j&apos;arrive…
        </p>
      </div>
    </div>
  );
}
