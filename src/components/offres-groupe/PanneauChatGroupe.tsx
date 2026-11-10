"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { ROUTES_OFFRES_GROUPE } from "@/lib/offres-groupe/api";
import {
  CLE_STOCKAGE_CHAT,
  demandeDevisAttendue,
  demandeReservationDe,
  etatInitial,
  messageWhatsApp,
  reduire,
  relireSauvegarde,
  sauvegarder,
  signatureDe,
  type ActionChat,
  type EtatChat,
  type FaitsChat,
  type MessageChat,
} from "@/lib/offres-groupe/conversation";
import type { DemandeOuverture } from "@/lib/offres-groupe/ouverture-chat";
import { insecables } from "@/lib/offres-groupe/textes-chat";
import { lienWhatsApp } from "@/lib/site";

import { ControlesChat, type ActionsChat } from "./ControlesChat";

/** Le temps laissé au client pour finir de choisir avant de demander le prix au serveur. */
const ATTENTE_DEVIS_MS = 350;

/** La conversation rangée dans le navigateur, si elle s'y lit encore. */
function conversationRangee(maintenant: number): EtatChat | null {
  try {
    return relireSauvegarde(window.sessionStorage.getItem(CLE_STOCKAGE_CHAT), maintenant)?.etat ?? null;
  } catch {
    return null;
  }
}

/** Range la conversation, sans jamais faire échouer la discussion (navigation privée, stockage plein). */
function ranger(etat: EtatChat, ouvert: boolean) {
  try {
    window.sessionStorage.setItem(CLE_STOCKAGE_CHAT, sauvegarder(etat, ouvert, Date.now()));
  } catch {
    // Sans stockage, la discussion vaut pour cette page seulement.
  }
}

/**
 * Le panneau du chatbot des offres de groupe : plein écran sur téléphone
 * (dès 320 px), panneau sur le côté sur ordinateur. Un dialogue natif ouvert
 * avec showModal() : la page derrière devient inerte (le focus reste dans le
 * panneau), Échap le ferme, et le focus revient à ce qui l'a ouvert.
 *
 * La conversation est la machine pure de src/lib/offres-groupe/conversation.ts ;
 * ce composant l'affiche et porte les échanges avec le serveur, aux routes et
 * aux formes du contrat commun (ROUTES_OFFRES_GROUPE) :
 *
 *  - le devis, demandé dès que le prix est à confirmer, après un court temps
 *    d'attente, et abandonné si le client change d'avis entre-temps ;
 *  - la capture de la réduction (multipart « capture », téléphone, email),
 *    et l'état d'une capture déjà envoyée ;
 *  - la réservation, puis l'attente du paiement Mobile Money, comme Padel
 *    bike (SuiviPaiementMomo).
 *
 * La conversation est rangée dans le stockage de session à chaque étape :
 * elle survit à un rechargement. Chaque accès au stockage est protégé.
 */
export function PanneauChatGroupe({
  faits,
  demande,
  jeton,
  ouvertA,
  onFermer,
}: {
  faits: FaitsChat;
  /** L'offre (et la preuve) demandées par un bouton ou par l'adresse. */
  demande: DemandeOuverture | null;
  /** Change à chaque nouvelle demande d'ouverture. */
  jeton: number;
  /** L'instant de l'ouverture : l'horloge du panneau part de là. */
  ouvertA: number;
  onFermer: () => void;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const defilement = useRef<HTMLDivElement>(null);
  const zoneReponses = useRef<HTMLDivElement>(null);
  const [etat, envoyer] = useReducer(
    (actuel: EtatChat, action: ActionChat) => reduire(actuel, action, faits),
    ouvertA,
    (instant: number) => conversationRangee(instant) ?? etatInitial(),
  );

  // L'horloge du panneau : les jours et les départs proposés suivent l'heure.
  const [maintenant, setMaintenant] = useState(ouvertA);
  useEffect(() => {
    const minuteur = window.setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => window.clearInterval(minuteur);
  }, []);

  // Ouvert en dialogue modal dès l'arrivée.
  useEffect(() => {
    const element = dialogue.current;
    if (element && !element.open) {
      try {
        element.showModal();
      } catch {
        element.setAttribute("open", "");
      }
    }
    zoneReponses.current?.focus();
  }, []);

  // Une demande d'ouverture (bouton d'une page, lien de l'email) : sur cette
  // offre. Chaque nouvelle demande porte un nouveau jeton ; la même offre que
  // la discussion en cours ne la recommence pas (la machine le sait).
  useEffect(() => {
    if (!demande?.offre && !demande?.preuveId) return;
    const depart = window.setTimeout(() => envoyer({ type: "demarrer", ...demande, maintenant: Date.now() }), 0);
    return () => window.clearTimeout(depart);
  }, [jeton, demande]);

  // La conversation rangée à chaque étape.
  useEffect(() => {
    ranger(etat, true);
  }, [etat]);

  // Chaque nouvelle bulle se montre, son début en haut de l'écran : une
  // offre chiffrée se lit depuis sa première ligne. Chaque nouvelle étape
  // prend le focus.
  const nombreMessages = etat.messages.length;
  useEffect(() => {
    const zone = defilement.current;
    const derniere = zone?.querySelector<HTMLElement>("[data-bulle]:last-of-type");
    if (!zone || !derniere) return;
    zone.scrollTop = Math.max(0, derniere.offsetTop - 12);
  }, [nombreMessages, etat.etape]);
  useEffect(() => {
    zoneReponses.current?.focus({ preventScroll: true });
  }, [etat.etape]);

  // Le devis : demandé au serveur dès que le prix est à confirmer.
  const demandeDevis = demandeDevisAttendue(etat);
  const signature = demandeDevis ? signatureDe(demandeDevis) : null;
  useEffect(() => {
    if (!signature) return;
    const controleur = new AbortController();
    const minuteur = window.setTimeout(() => {
      fetch(ROUTES_OFFRES_GROUPE.devis, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: signature,
        signal: controleur.signal,
      })
        .then(async (reponse) => {
          const corps: unknown = await reponse.json().catch(() => null);
          envoyer({ type: "devis-recu", signature, statut: reponse.status, corps, maintenant: Date.now() });
        })
        .catch(() => {
          if (!controleur.signal.aborted) envoyer({ type: "devis-echec", signature, maintenant: Date.now() });
        });
    }, ATTENTE_DEVIS_MS);
    return () => {
      window.clearTimeout(minuteur);
      controleur.abort();
    };
  }, [signature]);

  // L'état d'une capture déjà envoyée (lien de l'email, ou « Est-ce validé ? »).
  const preuveAVerifier = etat.choix.reduction.etat === "a-verifier" ? etat.choix.reduction.preuveId : null;
  useEffect(() => {
    if (!preuveAVerifier) return;
    const controleur = new AbortController();
    fetch(ROUTES_OFFRES_GROUPE.preuve(preuveAVerifier), { signal: controleur.signal })
      .then(async (reponse) => {
        const corps: unknown = await reponse.json().catch(() => null);
        envoyer({ type: "preuve-recue", statut: reponse.status, corps, maintenant: Date.now() });
      })
      .catch(() => {
        if (!controleur.signal.aborted) envoyer({ type: "preuve-recue", statut: 0, corps: null, maintenant: Date.now() });
      });
    return () => controleur.abort();
  }, [preuveAVerifier]);

  const fermer = () => {
    ranger(etat, false);
    // Fermer le dialogue natif rend le focus à ce qui l'avait ouvert.
    if (dialogue.current?.open) dialogue.current.close();
    onFermer();
  };

  const actions: ActionsChat = {
    envoyer: (action) => envoyer({ ...action, maintenant: Date.now() } as ActionChat),
    envoyerPreuve: async (capture, telephone, email) => {
      envoyer({ type: "preuve-envoi", telephone, email, maintenant: Date.now() });
      const formulaire = new FormData();
      formulaire.set("capture", capture);
      formulaire.set("telephone", telephone.trim());
      formulaire.set("email", email.trim());
      try {
        const reponse = await fetch(ROUTES_OFFRES_GROUPE.preuves, { method: "POST", body: formulaire });
        const corps: unknown = await reponse.json().catch(() => null);
        envoyer({ type: "preuve-recue", statut: reponse.status, corps, maintenant: Date.now() });
      } catch {
        envoyer({ type: "preuve-recue", statut: 0, corps: null, maintenant: Date.now() });
      }
    },
    payer: async () => {
      const demandeReservation = demandeReservationDe(etat);
      if (!demandeReservation || etat.envoi) return;
      envoyer({ type: "reservation-envoi", maintenant: Date.now() });
      try {
        const reponse = await fetch(ROUTES_OFFRES_GROUPE.reservations, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(demandeReservation),
        });
        const corps: unknown = await reponse.json().catch(() => null);
        envoyer({ type: "reservation-recue", statut: reponse.status, corps, maintenant: Date.now() });
      } catch {
        envoyer({ type: "reservation-echec", maintenant: Date.now() });
      }
    },
    fermer,
  };

  return (
    <dialog
      ref={dialogue}
      data-chat-groupe
      aria-labelledby="titre-chat-groupe"
      onCancel={(evenement) => {
        evenement.preventDefault();
        fermer();
      }}
      onClick={(evenement) => {
        // Un clic sur le voile, hors du panneau (ordinateur), le ferme.
        if (evenement.target === evenement.currentTarget) fermer();
      }}
      className="fixed inset-0 z-[70] m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden bg-craie p-0 text-noir-piste md:left-auto md:right-0 md:w-[440px] md:border-l md:border-noir-piste/10"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 bg-noir-piste px-4 py-3 text-craie">
          <div className="min-w-0">
            <h2 id="titre-chat-groupe" className="font-display text-[1.25rem] font-semibold leading-tight">
              Réserver en groupe
            </h2>
            <p className="truncate text-[0.78rem] text-craie/70">Bike for All, Road trip en groupe, Gbashi Bike</p>
          </div>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer la discussion"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-craie/25 text-[1.4rem] leading-none transition-colors hover:bg-craie/10"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div ref={defilement} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
          {/* Le rôle « log » sur un conteneur : la liste garde son rôle de liste. */}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="La discussion">
            <ol className="space-y-2.5">
              {etat.messages.map((message) => (
                <Bulle key={message.id} message={message} />
              ))}
            </ol>
          </div>
          <div ref={zoneReponses} tabIndex={-1} role="group" aria-label="Vos réponses" className="mt-4 outline-none">
            <ControlesChat etat={etat} faits={faits} maintenant={maintenant} actions={actions} />
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-noir-piste/10 bg-white px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[0.84rem]">
          <button
            type="button"
            onClick={() => actions.envoyer({ type: "recommencer" })}
            disabled={etat.etape === "attente" || etat.envoi !== null}
            className="lien-souligne cible-elargie font-semibold disabled:opacity-40"
          >
            Recommencer
          </button>
          <a
            href={lienWhatsApp(messageWhatsApp(etat, faits, maintenant))}
            target="_blank"
            rel="noreferrer noopener"
            className="lien-souligne cible-elargie font-semibold text-vert-lagune"
          >
            Parler à Bike Land sur WhatsApp
          </a>
        </footer>
      </div>
    </dialog>
  );
}

/** Une bulle de la discussion : le chatbot à gauche, le client à droite. */
function Bulle({ message }: { message: MessageChat }) {
  if (message.de === "client") {
    return (
      <li data-bulle className="flex justify-end">
        <p className="max-w-[85%] rounded-[var(--radius-carte)] rounded-br-[4px] bg-noir-piste px-3.5 py-2 text-[0.9rem] leading-snug text-craie">
          <span className="sr-only">Vous : </span>
          {insecables(message.texte)}
        </p>
      </li>
    );
  }
  const ton =
    message.ton === "alerte"
      ? "border-l-4 border-orange-signal"
      : message.ton === "succes"
        ? "border-l-4 border-vert-lagune"
        : "";
  return (
    <li data-bulle className="flex justify-start">
      <p
        className={`max-w-[92%] whitespace-pre-line rounded-[var(--radius-carte)] rounded-bl-[4px] bg-white px-3.5 py-2.5 text-[0.9rem] leading-relaxed text-noir-piste ${ton}`}
      >
        <span className="sr-only">Bike Land : </span>
        {insecables(message.texte)}
      </p>
    </li>
  );
}
