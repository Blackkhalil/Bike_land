"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { SymboleMarque } from "@/components/Marque";
import { ROUTES_OFFRES_GROUPE } from "@/lib/offres-groupe/api";
import {
  botEcrit,
  champDemande,
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
import { lienWhatsApp } from "@/lib/site";

import { CompositeurChat } from "./CompositeurChat";
import { CarteDeLEtape, indicationInactive, modeSaisieDe, ReponsesDeLEtape, type ActionsChat } from "./ControlesChat";
import { IconeFermer, IconeRecommencer, IconeWhatsApp } from "./IconesChat";
import { BulleEcrit, FilMessages, JourDeLaDiscussion } from "./MessagesChat";

/** Le temps laissé au client pour finir de choisir avant de demander le prix au serveur. */
const ATTENTE_DEVIS_MS = 350;

/** Au-delà, la question « où en est ma capture ? » est abandonnée : le client peut réessayer. */
const DELAI_STATUT_CAPTURE_MS = 20_000;

/** Ce qui prend le focus à chaque nouvelle étape : la carte qui arrive, sinon la première réponse. */
const PREMIER_CONTROLE = "[data-focus-etape], button:not([disabled]), a[href], input:not([disabled])";

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
 * La partie visible de l'écran du téléphone quand son clavier est ouvert :
 * le panneau s'y ajuste, la barre du bas reste au-dessus du clavier et
 * l'en-tête reste en haut. `null` sans clavier (le panneau garde 100dvh) et
 * sur ordinateur.
 */
function useZoneVisible(): { hauteur: number; haut: number } | null {
  const [zone, setZone] = useState<{ hauteur: number; haut: number } | null>(null);
  useEffect(() => {
    const vue = window.visualViewport;
    if (!vue) return;
    const telephone = window.matchMedia("(max-width: 767.98px)");
    let image = 0;
    const mesurer = () => {
      image = 0;
      // Un écran agrandi aux doigts n'est pas un clavier.
      const clavier = telephone.matches && Math.abs(vue.scale - 1) < 0.01 && window.innerHeight - vue.height > 120;
      setZone((avant) => {
        if (!clavier) return null;
        const suivante = { hauteur: Math.round(vue.height), haut: Math.round(vue.offsetTop) };
        return avant && avant.hauteur === suivante.hauteur && avant.haut === suivante.haut ? avant : suivante;
      });
    };
    const demander = () => {
      if (!image) image = window.requestAnimationFrame(mesurer);
    };
    vue.addEventListener("resize", demander);
    vue.addEventListener("scroll", demander);
    telephone.addEventListener("change", demander);
    return () => {
      vue.removeEventListener("resize", demander);
      vue.removeEventListener("scroll", demander);
      telephone.removeEventListener("change", demander);
      if (image) window.cancelAnimationFrame(image);
    };
  }, []);
  return zone;
}

/**
 * Le chatbot des offres de groupe, comme une discussion sur un téléphone,
 * aux couleurs de Bike Land : en-tête noir (le logo, « en ligne »), les
 * bulles de Bike Land en blanc à gauche, celles du client en orange à
 * droite avec leur heure, les réponses en pastilles, la barre du bas pour
 * ce qui se tape. Plein écran sur téléphone (dès 320 px), petite fenêtre
 * en bas à droite sur ordinateur. Un dialogue natif ouvert avec
 * showModal() : la page derrière devient inerte (le focus reste dans le
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
  const zoneEtape = useRef<HTMLDivElement>(null);
  const zonePoints = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLInputElement>(null);
  // Les bulles déjà montrées (le défilement vise les nouvelles) et l'étape qui a déjà reçu le focus.
  const bullesVues = useRef<{ messages: readonly MessageChat[]; prochainId: number } | null>(null);
  const focusVu = useRef<string | null>(null);
  const [etat, envoyer] = useReducer(
    (actuel: EtatChat, action: ActionChat) => reduire(actuel, action, faits),
    ouvertA,
    (instant: number) => conversationRangee(instant) ?? etatInitial(undefined, faits, instant),
  );
  const zoneVisible = useZoneVisible();

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

  // Le défilement, comme sur un téléphone. Les bulles arrivées avec une
  // action se montrent depuis la première : si tout tient, la vue descend en
  // bas ; sinon la première nouvelle bulle se cale en haut, et une offre
  // chiffrée se lit depuis sa première ligne. Une discussion neuve s'ouvre en
  // haut, sur « Bonjour » ; une discussion reprise, sur la dernière réponse
  // du client. Recommencer remonte en haut.
  const ecrit = botEcrit(etat);
  const hauteurVisible = zoneVisible?.hauteur ?? null;
  const { messages, prochainId } = etat;
  useEffect(() => {
    const zone = defilement.current;
    if (!zone) return;
    const avant = bullesVues.current;
    bullesVues.current = { messages, prochainId };
    if (avant?.messages === messages) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bulles = zone.querySelectorAll<HTMLElement>("[data-bulle]");
    const aller = (rang: number, doux: boolean) => {
      // La première bulle de la discussion : tout en haut, avec la pastille du jour.
      const haut = rang <= 0 ? 0 : Math.max(0, (bulles[rang]?.offsetTop ?? 0) - 12);
      zone.scrollTo({ top: haut, behavior: doux && !reduit ? "smooth" : "auto" });
    };
    if (!avant) {
      aller(messages.findLastIndex((message) => message.de === "client"), false);
      return;
    }
    const repartie =
      prochainId < avant.prochainId || (messages[0] !== avant.messages[0] && (messages[0]?.id ?? 0) <= (avant.messages[0]?.id ?? 0));
    if (repartie) {
      aller(0, true);
      return;
    }
    let premiere = messages.findIndex((message) => message.id >= avant.prochainId);
    // Une carte figée (l'offre, le paiement) prend la place de la carte que le client
    // vient de lire : la vue vise ce qui suit, sa réponse et celle de Bike Land.
    while (premiere >= 0 && premiere < messages.length - 1 && messages[premiere].recap) premiere += 1;
    if (premiere >= 0) aller(premiere, true);
  }, [messages, prochainId]);

  // « Bike Land écrit… » : les trois petits points ne font descendre la vue
  // que si elle était déjà en bas. Personne n'est tiré de sa lecture, et
  // leur départ ne fait rien bouger.
  useEffect(() => {
    const zone = defilement.current;
    const points = zonePoints.current;
    if (!ecrit || !zone || !points) return;
    const reste = zone.scrollHeight - zone.scrollTop - zone.clientHeight;
    if (reste > points.offsetHeight + 24) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    zone.scrollTo({ top: zone.scrollHeight, behavior: reduit ? "auto" : "smooth" });
  }, [ecrit]);

  // Le clavier du téléphone s'ouvre et réduit la discussion : la question
  // posée reste juste au-dessus de la barre du bas.
  useEffect(() => {
    const zone = defilement.current;
    if (hauteurVisible === null || !zone) return;
    zone.scrollTo({ top: zone.scrollHeight });
  }, [hauteurVisible]);

  // Le focus. Chaque nouvelle étape, chaque coordonnée demandée, chaque fin
  // d'envoi : le champ du bas quand la réponse se tape, sinon la carte qui
  // arrive ou la première réponse. Et s'il s'est perdu (un bouton qui
  // disparaît ou se grise, une carte qui change), il revient au même endroit
  // au lieu de rester sur la page.
  const mode = modeSaisieDe(etat, faits, maintenant);
  const saisiePrioritaire = mode?.prioritaire === true;
  const champ = etat.etape === "coordonnees" ? champDemande(etat.client) : null;
  const cleFocus = [etat.etape, champ ?? "", saisiePrioritaire ? "saisie" : "", etat.envoi ?? "", etat.confirmerRecommencer ? "recommencer" : ""].join("|");
  useEffect(() => {
    const nouvelle = focusVu.current !== cleFocus;
    focusVu.current = cleFocus;
    const actif = document.activeElement;
    const perdu =
      !(actif instanceof HTMLElement) ||
      actif === document.body ||
      !dialogue.current?.contains(actif) ||
      (actif instanceof HTMLButtonElement && actif.disabled);
    if (!nouvelle && !perdu) return;
    const champDuBas = saisie.current && !saisie.current.disabled ? saisie.current : null;
    const cible = saisiePrioritaire
      ? champDuBas
      : (zoneEtape.current?.querySelector<HTMLElement>(PREMIER_CONTROLE) ?? champDuBas ?? zoneEtape.current);
    cible?.focus({ preventScroll: true });
  });

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
  // Sans réponse au bout de 20 secondes (réseau faible), la question est
  // abandonnée : la machine garde la capture, et le client peut réessayer.
  const preuveAVerifier = etat.choix.reduction.etat === "a-verifier" ? etat.choix.reduction.preuveId : null;
  useEffect(() => {
    if (!preuveAVerifier) return;
    const controleur = new AbortController();
    let delaiDepasse = false;
    const minuteur = window.setTimeout(() => {
      delaiDepasse = true;
      controleur.abort();
    }, DELAI_STATUT_CAPTURE_MS);
    fetch(ROUTES_OFFRES_GROUPE.preuve(preuveAVerifier), { signal: controleur.signal })
      .then(async (reponse) => {
        const corps: unknown = await reponse.json().catch(() => null);
        envoyer({ type: "preuve-recue", statut: reponse.status, corps, maintenant: Date.now() });
      })
      .catch(() => {
        if (delaiDepasse || !controleur.signal.aborted) envoyer({ type: "preuve-recue", statut: 0, corps: null, maintenant: Date.now() });
      })
      .finally(() => window.clearTimeout(minuteur));
    return () => {
      window.clearTimeout(minuteur);
      controleur.abort();
    };
  }, [preuveAVerifier]);

  // Une capture part vers le serveur : la discussion ne se ferme pas avant
  // sa réponse (sinon la capture arrive sans que le client le sache, et il
  // la renverrait).
  const envoiDeCapture = etat.envoi === "preuve";
  const fermeeParLePanneau = useRef(false);
  const fermer = () => {
    if (envoiDeCapture) return;
    ranger(etat, false);
    fermeeParLePanneau.current = true;
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

  // Un paiement en cours ne se recommence pas (règle de la machine).
  const recommencerBloque = etat.etape === "attente" || etat.envoi !== null;
  const boutonEnTete =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-craie transition-colors hover:bg-craie/10 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <dialog
      ref={dialogue}
      data-chat-groupe
      aria-labelledby="titre-chat-groupe"
      onCancel={(evenement) => {
        // Seul Échap sur la discussion elle-même la ferme. Le champ de fichier
        // envoie lui aussi un « cancel », qui remonte jusqu'ici, quand on
        // reprend la même image ou qu'on ferme la galerie sans choisir :
        // celui-là ne ferme rien.
        if (evenement.target !== evenement.currentTarget) return;
        evenement.preventDefault();
        fermer();
      }}
      onClick={(evenement) => {
        // Un clic sur le voile, hors de la fenêtre (ordinateur), la ferme.
        if (evenement.target === evenement.currentTarget) fermer();
      }}
      onClose={() => {
        // Fermée par le navigateur lui-même (le retour du téléphone touché
        // deux fois de suite ne se retient pas) : la bulle le sait, et la
        // discussion rangée reprend à la prochaine ouverture.
        if (fermeeParLePanneau.current) return;
        ranger(etat, false);
        onFermer();
      }}
      style={zoneVisible ? { height: zoneVisible.hauteur, top: zoneVisible.haut } : undefined}
      // Sur ordinateur, le fond de la fenêtre reste transparent : l'en-tête noir et la barre du
      // bas portent eux-mêmes leurs coins arrondis, sans liseré clair autour des coins.
      className="fixed inset-0 z-[70] m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden bg-craie p-0 text-noir-piste md:inset-auto md:bottom-4 md:right-4 md:h-[min(680px,calc(100dvh-32px))] md:w-[400px] md:rounded-[24px] md:bg-transparent md:shadow-[0_24px_60px_rgba(14,14,14,0.35)]"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-2.5 bg-noir-piste pb-2 pl-3 pr-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-craie md:rounded-t-[24px]">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-signal text-noir-piste">
            <SymboleMarque taille={26} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="titre-chat-groupe" className="truncate font-display text-[1.12rem] font-semibold leading-tight">
              <span className="sr-only">Réserver en groupe avec </span>
              Bike Land
            </h2>
            <p className="flex items-center gap-1.5 text-[0.76rem] leading-tight text-craie/75">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#3ddc84]" />
              en ligne
            </p>
          </div>
          <a
            href={lienWhatsApp(messageWhatsApp(etat, faits, maintenant))}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Écrire à Bike Land sur WhatsApp"
            title="Écrire à Bike Land sur WhatsApp"
            className={boutonEnTete}
          >
            <IconeWhatsApp />
          </a>
          <button
            type="button"
            // Bike Land demande d'abord « Tout recommencer ? » dès qu'il y a des réponses à perdre.
            onClick={() => actions.envoyer({ type: "proposer-recommencer" })}
            disabled={recommencerBloque}
            aria-label="Recommencer la discussion"
            title="Recommencer"
            className={boutonEnTete}
          >
            <IconeRecommencer />
          </button>
          <button
            type="button"
            onClick={fermer}
            // Pendant l'envoi d'une capture, on attend sa réponse avant de fermer.
            disabled={envoiDeCapture}
            aria-label="Fermer la discussion"
            title={envoiDeCapture ? "Fermer, après l'envoi de la capture" : "Fermer"}
            className={boutonEnTete}
          >
            <IconeFermer />
          </button>
        </header>

        {/* Sans ancrage automatique du défilement : la discussion ne bouge que quand le chat la fait
            défiler (sinon le navigateur la recale d'abord, puis le chat, en deux temps). */}
        <div ref={defilement} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-craie px-3 pb-5 pt-3 [overflow-anchor:none]">
          <JourDeLaDiscussion messages={etat.messages} maintenant={maintenant} />
          {/* Le rôle « log » sur un conteneur : la liste garde son rôle de liste. */}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="La discussion">
            <FilMessages messages={etat.messages} maintenant={maintenant} />
          </div>
          <div ref={zoneEtape} tabIndex={-1}>
            <CarteDeLEtape etat={etat} faits={faits} maintenant={maintenant} actions={actions} />
            <div ref={zonePoints} role="status">
              {ecrit && <BulleEcrit />}
            </div>
            <div role="group" aria-label="Vos réponses">
              <ReponsesDeLEtape etat={etat} faits={faits} maintenant={maintenant} actions={actions} />
            </div>
          </div>
        </div>

        <CompositeurChat mode={mode} indicationInactive={indicationInactive(etat)} champ={saisie} onEnvoyer={actions.envoyer} />
      </div>
    </dialog>
  );
}
