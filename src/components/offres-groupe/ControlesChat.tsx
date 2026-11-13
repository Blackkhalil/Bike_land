"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { SuiviPaiementMomo } from "@/components/reservation/SuiviPaiementMomo";
import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { ajouterJours } from "@/lib/dates";
import { formatMontant, heureEnClair, NOMS_GAMMES, ORDRE_GAMMES, type Coco, type GammeVelo, type HeureMinute } from "@/lib/offres";
import { schemaChampsPreuve, TAILLE_MAX_CAPTURE_OCTETS, TYPES_CAPTURE } from "@/lib/offres-groupe/api";
import {
  botEcrit,
  champDemande,
  demandeReservationDe,
  devisConfirme,
  lienRepriseDuPaiement,
  messageWhatsApp,
  MOYENS_EN_LIGNE,
  NOMS_MOYENS,
  offreAffichee,
  stockGbashi,
  verificationDuJour,
  type ActionChat,
  type ChampCoordonnees,
  type Coordonnees,
  type EtatChat,
  type FaitsChat,
} from "@/lib/offres-groupe/conversation";
import {
  aujourdhuiAuBenin,
  budgetsProposes,
  departsProposes,
  dureesProposees,
  joursProposes,
  repartitionParDefaut,
  totalVelos,
} from "@/lib/offres-groupe/negociation";
import {
  insecables,
  jourCourt,
  LIBELLES_CHAMPS,
  majuscule,
  NOMS_OFFRES,
  ORDRE_OFFRES,
  personnesEnClair,
  personnesMinDe,
} from "@/lib/offres-groupe/textes-chat";
import { lienWhatsApp } from "@/lib/site";

import { CarteOffreChat } from "./CarteOffreChat";

/** Une action de la conversation, sans l'heure : le panneau l'ajoute au moment de l'envoyer. */
export type ActionSansHeure = ActionChat extends infer A ? (A extends ActionChat ? Omit<A, "maintenant"> : never) : never;

/** Ce que les contrôles peuvent faire : avancer la conversation, envoyer une capture, payer, fermer. */
export interface ActionsChat {
  envoyer: (action: ActionSansHeure) => void;
  envoyerPreuve: (capture: File, telephone: string, email: string) => Promise<void>;
  payer: () => Promise<void>;
  fermer: () => void;
}

interface ProprietesEtape {
  etat: EtatChat;
  faits: FaitsChat;
  maintenant: number;
  actions: ActionsChat;
}

/* ---------------------------------------------------------------- Styles */

/** Une réponse rapide : une pastille blanche bordée d'orange, 44 px de haut au moins. */
const PUCE =
  "inline-flex min-h-11 max-w-full items-center justify-center rounded-[22px] border-2 border-orange-signal bg-white px-4 py-2 text-left text-[0.9rem] font-semibold leading-tight text-noir-piste transition-colors hover:bg-orange-signal/10 active:bg-orange-signal/20 disabled:cursor-not-allowed disabled:border-noir-piste/15 disabled:text-noir-piste/45 disabled:hover:bg-white";
/** La réponse qui fait avancer (« Je réserve ») : la seule pleine, en orange. */
const PUCE_PLEINE =
  "inline-flex min-h-11 max-w-full items-center justify-center rounded-[22px] border-2 border-orange-signal bg-orange-signal px-5 py-2 text-left text-[0.92rem] font-bold leading-tight text-noir-piste transition-colors hover:border-orange-vif hover:bg-orange-vif disabled:cursor-not-allowed disabled:opacity-50";
/** Une réponse de côté (« Garder cette offre », « Plus d'horaires ») : soulignée, sans bord. */
const PUCE_DISCRETE =
  "inline-flex min-h-11 items-center rounded-[22px] px-3 text-[0.88rem] font-semibold text-noir-piste underline decoration-noir-piste/35 underline-offset-4 transition-colors hover:decoration-noir-piste";
/** Le grand bouton d'une carte (« Payer 11 616 F », « Valider les vélos »). */
const BOUTON_CARTE =
  "flex min-h-12 w-full items-center justify-center rounded-full bg-orange-signal px-5 py-2 text-center text-[1rem] font-bold text-noir-piste transition-colors hover:bg-orange-vif disabled:cursor-not-allowed disabled:opacity-50";
/** Une carte de Bike Land dans la discussion (l'offre chiffrée, le paiement…). */
const CARTE =
  "mt-3 w-full rounded-2xl rounded-bl-md bg-white p-4 text-[0.88rem] text-noir-piste shadow-[0_1px_0.5px_rgba(14,14,14,0.13)]";
const CHAMP =
  "mt-1 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3.5 py-2.5 text-[1rem] text-noir-piste transition-colors focus:border-noir-piste";
const ETIQUETTE = "block text-[0.8rem] text-gris-cadre";
const AIDE = "text-[0.8rem] leading-snug text-gris-cadre";

/** Les réponses rapides d'une étape, en pastilles qui passent à la ligne. */
function Puces({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

/** « 30 min », « 1 h », « 1 h 15 » : une durée, sur une pastille. */
function dureeCourte(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const reste = minutes % 60;
  return `${Math.floor(minutes / 60)} h${reste ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}

/** Les tailles de groupe proposées : le minimum, quelques tailles courantes, sans dépasser les vélos en état. */
function taillesProposees(minimum: number, maximum: number): number[] {
  const tailles = [minimum, minimum + 2, minimum + 5, minimum + 10, minimum + 20].filter((taille) => taille <= maximum);
  if (maximum < minimum + 20 && !tailles.includes(maximum)) tailles.push(maximum);
  return tailles;
}

/** Les chiffres d'un nombre tapé (« 12 000 » vaut 12000), ou `null`. */
function entierTape(texte: string): number | null {
  const chiffres = texte.replace(/\D/g, "");
  return chiffres && chiffres.length <= 9 ? Number(chiffres) : null;
}

/* ------------------------------------------------------- La barre du bas */

/** Ce que la barre du bas attend quand l'étape veut une réponse tapée. */
export interface ModeSaisie {
  /** Change à chaque question : le champ repart vide. */
  cle: string;
  /** Le nom du champ, lu par les lecteurs d'écran. */
  etiquette: string;
  indication: string;
  /** Une légende visible au-dessus du champ (une date ne montre pas d'indication). */
  legende?: string;
  type: "text" | "email" | "tel" | "date";
  inputMode?: "text" | "numeric" | "email" | "tel";
  autoComplete: string;
  autoCapitalize?: "none" | "words";
  min?: string;
  max?: string;
  /** La réponse ne se donne qu'en tapant (les coordonnées) : le champ prend le focus. */
  prioritaire: boolean;
  /** L'action que vaut le texte tapé, ou `null` tant qu'il ne vaut rien. */
  lire: (texte: string) => ActionSansHeure | null;
}

const CHAMPS_SAISIE: Record<ChampCoordonnees, Pick<ModeSaisie, "etiquette" | "indication" | "type" | "inputMode" | "autoComplete" | "autoCapitalize">> = {
  prenom: { etiquette: "Votre prénom", indication: "Votre prénom", type: "text", inputMode: "text", autoComplete: "given-name", autoCapitalize: "words" },
  nom: { etiquette: "Votre nom", indication: "Votre nom", type: "text", inputMode: "text", autoComplete: "family-name", autoCapitalize: "words" },
  email: { etiquette: "Votre email", indication: "Votre email", type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none" },
  telephone: {
    etiquette: "Votre numéro Mobile Money",
    indication: "Votre numéro Mobile Money",
    type: "tel",
    inputMode: "tel",
    autoComplete: "tel",
    autoCapitalize: "none",
  },
};

/**
 * La barre du bas de l'étape : le nombre de personnes, une autre date, un
 * autre montant, ou la coordonnée demandée ; `null` quand on répond en
 * touchant une réponse.
 */
export function modeSaisieDe(etat: EtatChat, faits: FaitsChat, maintenant: number): ModeSaisie | null {
  const { etape, choix } = etat;
  // Un envoi en cours, « Tout recommencer ? » qui attend sa réponse, ou les
  // vélos libres du jour pas encore comptés : rien à taper.
  if (etat.envoi || etat.confirmerRecommencer || verificationDuJour(etat)) return null;
  switch (etape) {
    case "personnes": {
      if (!choix.offre || faits.velosEnEtat < personnesMinDe(choix.offre, faits.reglages)) return null;
      return {
        cle: "personnes",
        etiquette: "Nombre de personnes",
        indication: "Ou tapez un nombre",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        prioritaire: false,
        lire: (texte) => {
          const personnes = entierTape(texte);
          return personnes !== null && personnes >= 1 && personnes <= 500 ? { type: "choisir-personnes", personnes } : null;
        },
      };
    }
    case "date": {
      const aujourdhui = aujourdhuiAuBenin(maintenant);
      return {
        cle: "date",
        etiquette: "Une autre date",
        indication: "Une autre date",
        legende: insecables("Ou choisissez une autre date :"),
        type: "date",
        autoComplete: "off",
        min: aujourdhui,
        max: ajouterJours(aujourdhui, 90),
        prioritaire: false,
        lire: (texte) => (/^\d{4}-\d{2}-\d{2}$/.test(texte) ? { type: "choisir-date", date: texte } : null),
      };
    }
    case "budget":
      return {
        cle: "budget",
        etiquette: "Un autre montant, en francs",
        indication: "Un autre montant",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        prioritaire: false,
        lire: (texte) => {
          const budgetXof = entierTape(texte);
          return budgetXof !== null && budgetXof > 0 && budgetXof <= 10_000_000 ? { type: "choisir-budget", budgetXof } : null;
        },
      };
    case "coordonnees": {
      const champ = champDemande(etat.client);
      if (!champ) return null;
      return {
        cle: `champ-${champ}`,
        ...CHAMPS_SAISIE[champ],
        prioritaire: true,
        lire: (texte) => (texte.trim() ? { type: "saisir-champ", champ, valeur: texte } : null),
      };
    }
    default:
      return null;
  }
}

/**
 * Ce que dit la barre du bas quand on répond en touchant une réponse.
 * `reponsesPlusBas` : la discussion n'est pas descendue jusqu'aux réponses
 * (elle s'ouvre en haut, sur « Bonjour ») ; la barre dit de faire défiler.
 * À la carte de la capture, il n'y a rien à choisir plus bas : la barre dit
 * de remplir la carte.
 */
export function indicationInactive(etat: EtatChat, reponsesPlusBas = false): string {
  if (etat.etape === "attente") return "Validez sur votre téléphone";
  if (botEcrit(etat)) return "Bike Land écrit…";
  if (etat.etape === "preuve" && !etat.confirmerRecommencer) return "Remplissez la carte ci-dessus";
  if (reponsesPlusBas) return "Faites défiler pour choisir";
  return "Touchez une réponse ci-dessus";
}

/* ------------------------------------------------------ Les réponses rapides */

/**
 * Les réponses rapides de l'étape, sous la dernière bulle de Bike Land :
 * chaque choix est une pastille, et la réponse touchée devient une bulle
 * du client (la machine l'écrit). Tout ce qui est proposé vient de la
 * machine et du moteur ; rien n'est calculé ici.
 */
export function ReponsesDeLEtape({ etat, faits, maintenant, actions }: ProprietesEtape) {
  const { choix, etape } = etat;
  const { envoyer } = actions;
  const reglages = faits.reglages;
  const whatsApp = lienWhatsApp(messageWhatsApp(etat, faits, maintenant));
  const autreDate = () =>
    envoyer({ type: "appliquer", alternative: { cle: "autre-date", libelle: "Choisir une autre date", changement: { date: null } } });

  // « Tout recommencer ? » : ses deux réponses, à la place de celles de l'étape.
  if (etat.confirmerRecommencer) {
    return (
      <Puces>
        <button type="button" className={PUCE} onClick={() => envoyer({ type: "recommencer" })}>
          Oui, recommencer
        </button>
        <button type="button" className={PUCE} onClick={() => envoyer({ type: "annuler-recommencer" })}>
          Non, je continue
        </button>
      </Puces>
    );
  }

  // Les vélos libres du jour se comptent : les réponses viennent avec la question.
  if (verificationDuJour(etat)) return null;

  switch (etape) {
    case "offre":
      return (
        <Puces>
          {ORDRE_OFFRES.map((offre) => (
            <button key={offre} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-offre", offre })}>
              {NOMS_OFFRES[offre]}
            </button>
          ))}
        </Puces>
      );

    case "personnes": {
      if (!choix.offre) return null;
      const minimum = personnesMinDe(choix.offre, reglages);
      if (faits.velosEnEtat < minimum) {
        return (
          <Puces>
            <LienWhatsApp href={whatsApp} />
          </Puces>
        );
      }
      return (
        <Puces>
          {taillesProposees(minimum, faits.velosEnEtat).map((personnes) => (
            <button
              key={personnes}
              type="button"
              aria-label={personnesEnClair(personnes)}
              className={`${PUCE} min-w-14 tabular-nums`}
              onClick={() => envoyer({ type: "choisir-personnes", personnes })}
            >
              {personnes}
            </button>
          ))}
        </Puces>
      );
    }

    case "date": {
      if (!choix.offre) return null;
      const aujourdhui = aujourdhuiAuBenin(maintenant);
      const demain = ajouterJours(aujourdhui, 1);
      const jours = joursProposes(choix.offre, faits, maintenant, 6);
      if (jours.length === 0) {
        return <p className={`mt-3 ${AIDE}`}>Aucun départ ne se réserve en ligne dans les semaines qui viennent. Choisissez une autre date en bas.</p>;
      }
      return (
        <Puces>
          {jours.map((jour) => (
            <button key={jour} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-date", date: jour })}>
              {jour === aujourdhui ? "Aujourd'hui" : jour === demain ? "Demain" : majuscule(jourCourt(jour))}
            </button>
          ))}
        </Puces>
      );
    }

    case "heure":
      return choix.date ? (
        <ChoixHeure
          departs={departsProposes(choix.date, faits, maintenant)}
          onChoisir={(depart) => envoyer({ type: "choisir-heure", depart })}
          onAutreDate={autreDate}
        />
      ) : null;

    case "mode":
      return (
        <Puces>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-mode", mode: "budget" })}>
            Oui, j&apos;ai un budget
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-mode", mode: "duree" })}>
            Non, je choisis la durée
          </button>
        </Puces>
      );

    case "budget":
      return (
        <Puces>
          {budgetsProposes(choix, faits, maintenant).map((budget) => (
            <button key={budget.budgetXof} type="button" className={`${PUCE} tabular-nums`} onClick={() => envoyer({ type: "choisir-budget", budgetXof: budget.budgetXof })}>
              {formatMontant(budget.budgetXof)}
              {/* Ce que le budget achète : le temps de vélo, et le coco quand il en comprend un. */}
              <span className="font-normal">
                , {dureeCourte(budget.minutes)}
                {budget.coco !== "aucun" && `, ${budget.coco} coco`}
              </span>
            </button>
          ))}
        </Puces>
      );

    case "duree":
      return <ChoixDuree durees={dureesProposees(choix, faits, maintenant)} onChoisir={(minutes) => envoyer({ type: "choisir-duree", minutes })} />;

    case "coco": {
      const options: { coco: Coco; libelle: string }[] = [
        { coco: "aucun", libelle: "Sans coco" },
        { coco: "petit", libelle: `Petit coco, ${formatMontant(reglages.consommables.cocoPetitXof)}` },
        { coco: "grand", libelle: `Grand coco, ${formatMontant(reglages.consommables.cocoGrandXof)}` },
      ];
      return (
        <Puces>
          {options.map((option) => (
            <button key={option.coco} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-coco", coco: option.coco })}>
              {option.libelle}
            </button>
          ))}
        </Puces>
      );
    }

    case "gateaux":
      return (
        <Puces>
          {[0, 1, 2, 3].map((nombre) => (
            <button key={nombre} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-gateaux", gateauxParPersonne: nombre })}>
              {nombre === 0 ? "Sans gâteau" : `${nombre} par personne`}
            </button>
          ))}
        </Puces>
      );

    case "accompagnateur":
      return (
        <Puces>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-accompagnateur", accompagnateur: true })}>
            Oui, avec un accompagnateur
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-accompagnateur", accompagnateur: false })}>
            Non merci, nous connaissons la route
          </button>
        </Puces>
      );

    case "reduction":
      return (
        <Puces>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "repondre-reduction", veut: true })}>
            Oui, j&apos;envoie une capture d&apos;écran
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "repondre-reduction", veut: false })}>
            Non merci
          </button>
        </Puces>
      );

    case "preuve-statut": {
      const reduction = choix.reduction;
      // La vérification en cours : « Bike Land écrit… » le dit.
      if (reduction.etat === "a-verifier") return null;
      return (
        <Puces>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "reduction-sans" })}>
            Réserver maintenant, sans la réduction
          </button>
          {reduction.etat === "en_attente" && (
            <button type="button" className={PUCE} onClick={() => envoyer({ type: "verifier-preuve" })}>
              Est-ce que c&apos;est validé ?
            </button>
          )}
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "renvoyer-preuve" })}>
            Envoyer une autre capture
          </button>
        </Puces>
      );
    }

    case "proposition": {
      if (!offreAffichee(etat, faits, maintenant)) return null;
      const confirme = devisConfirme(etat);
      const enEchec = etat.devisEnEchec !== null && !confirme;
      return (
        <Puces>
          <button type="button" className={PUCE_PLEINE} disabled={!confirme} onClick={() => envoyer({ type: "reserver" })}>
            {confirme ? "Je réserve" : enEchec ? "Prix à confirmer" : "Je vérifie le prix…"}
          </button>
          {enEchec && (
            <button type="button" className={PUCE} onClick={() => envoyer({ type: "relancer-devis" })}>
              Réessayer
            </button>
          )}
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "trop-cher" })}>
            C&apos;est un peu cher pour nous
          </button>
        </Puces>
      );
    }

    case "negociation":
    case "refus":
      return (
        <Puces>
          {etat.alternatives.map((alternative) => (
            <button key={alternative.cle} type="button" className={PUCE} onClick={() => envoyer({ type: "appliquer", alternative })}>
              {insecables(alternative.libelle)}
            </button>
          ))}
          {etape === "negociation" ? (
            <button type="button" className={PUCE_DISCRETE} onClick={() => envoyer({ type: "garder-offre" })}>
              Garder cette offre
            </button>
          ) : (
            etat.alternatives.length === 0 && (
              <button type="button" className={PUCE} onClick={() => envoyer({ type: "recommencer" })}>
                Recommencer
              </button>
            )
          )}
        </Puces>
      );

    case "modifier":
      return (
        <Puces>
          {(Object.keys(LIBELLES_CHAMPS) as ChampCoordonnees[]).map((champ) => (
            <button key={champ} type="button" className={PUCE} onClick={() => envoyer({ type: "modifier-champ", champ })}>
              {LIBELLES_CHAMPS[champ]}
            </button>
          ))}
          <button type="button" className={PUCE_DISCRETE} onClick={() => envoyer({ type: "garder-coordonnees" })}>
            Rien, je continue
          </button>
        </Puces>
      );

    case "moyen":
      return (
        <Puces>
          {MOYENS_EN_LIGNE.map((moyen) => (
            <button key={moyen} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-moyen", moyen })}>
              {NOMS_MOYENS[moyen]}
            </button>
          ))}
          <button type="button" className={PUCE_DISCRETE} onClick={() => envoyer({ type: "modifier-coordonnees" })}>
            Modifier mes coordonnées
          </button>
        </Puces>
      );

    case "payer": {
      const reessayer = !devisConfirme(etat) && etat.devisEnEchec !== null;
      if (etat.envoi) return null;
      return (
        <Puces>
          {/* Le prix n'a pas pu être vérifié (réseau, panne) : on peut le redemander ici. */}
          {reessayer && (
            <button type="button" className={PUCE} onClick={() => envoyer({ type: "relancer-devis" })}>
              Réessayer
            </button>
          )}
          <button type="button" className={PUCE_DISCRETE} onClick={() => envoyer({ type: "modifier-coordonnees" })}>
            Modifier mes coordonnées
          </button>
        </Puces>
      );
    }

    case "confirmee":
      return etat.reservation ? (
        <Puces>
          <a href={etat.reservation.lienSuivi} onClick={actions.fermer} className={PUCE_PLEINE}>
            Suivre ma réservation
          </a>
          <button type="button" className={PUCE} onClick={actions.fermer}>
            Fermer
          </button>
        </Puces>
      ) : null;

    case "echec":
      return (
        <Puces>
          {etat.reservation && (
            <a href={lienRepriseDuPaiement(etat.reservation)} onClick={actions.fermer} className={PUCE_PLEINE}>
              Reprendre le paiement
            </a>
          )}
          <LienWhatsApp href={whatsApp} />
        </Puces>
      );

    case "ferme":
      return (
        <Puces>
          <LienWhatsApp href={whatsApp} />
        </Puces>
      );

    default:
      return null;
  }
}

function LienWhatsApp({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={PUCE}>
      Écrire à Bike Land sur WhatsApp
    </a>
  );
}

/* ----------------------------------------------------------- Les cartes */

/**
 * La carte de l'étape, dans la discussion, comme un message de Bike Land :
 * l'offre chiffrée, les vélos par gamme, la capture de la réduction, le
 * paiement, l'attente de la validation Mobile Money. Elle porte
 * `data-focus-etape` : le focus la rejoint à son arrivée, pour la lire
 * depuis le début.
 */
export function CarteDeLEtape({ etat, faits, maintenant, actions }: ProprietesEtape) {
  const { choix } = etat;
  const reglages = faits.reglages;
  // « Tout recommencer ? » attend sa réponse : la carte revient avec « Non, je
  // continue ». Les vélos libres du jour se comptent : la carte vient avec la question.
  if (etat.confirmerRecommencer || verificationDuJour(etat)) return null;
  switch (etat.etape) {
    case "preuve":
      return (
        <EnvoiPreuve
          client={etat.client}
          envoi={etat.envoi === "preuve"}
          onEnvoyer={actions.envoyerPreuve}
          onSans={() => actions.envoyer({ type: "reduction-sans" })}
        />
      );

    case "velos": {
      if (choix.personnes === null) return null;
      const { stock, confirme } = stockGbashi(etat, faits);
      return (
        <ChoixVelos
          // La même carte quand le stock du serveur arrive : le focus y reste, rien ne saute.
          personnes={choix.personnes}
          minimum={reglages.gbashi.personnesMin}
          stock={stock}
          stockConfirme={confirme}
          verificationEnEchec={etat.devisEnEchec !== null}
          onRelancer={() => actions.envoyer({ type: "relancer-devis" })}
          prix={reglages.gbashi.prixXof}
          initiale={choix.velos ?? repartitionParDefaut(choix.personnes, stock, faits)}
          onValider={(velos) => actions.envoyer({ type: "choisir-velos", velos })}
        />
      );
    }

    case "proposition": {
      const offre = offreAffichee(etat, faits, maintenant);
      return offre ? (
        <div data-focus-etape tabIndex={-1} className="mt-3">
          <CarteOffreChat {...offre} reglages={reglages} />
        </div>
      ) : null;
    }

    case "payer":
      // « Payer » touché : la carte est figée dans la discussion, suivie de « Je paie… ». Elle revient si l'envoi échoue.
      if (etat.envoi === "reservation") return null;
      return <Paiement etat={etat} faits={faits} maintenant={maintenant} actions={actions} />;

    case "attente": {
      const reservation = etat.reservation;
      if (!reservation?.suivi || !reservation.token) return null;
      return (
        <section data-focus-etape tabIndex={-1} aria-label="Votre paiement Mobile Money" className={CARTE}>
          {typeof reservation.demandeLe === "number" && (
            <MinuteurExpiration demandeLe={reservation.demandeLe} onExpire={() => actions.envoyer({ type: "paiement-expire" })} />
          )}
          {/* La bulle juste au-dessus dit le montant et le numéro : la carte dit quoi faire. */}
          <SuiviPaiementMomo
            variante="chat"
            token={reservation.token}
            paiementId={reservation.suivi.paiementId}
            moyen={reservation.suivi.moyen}
            telephone={reservation.suivi.telephone}
            montantXof={reservation.montantADebiterXof}
            urlCheckout={reservation.suivi.urlCheckout}
            expiration="La demande de paiement a expiré et les vélos ne sont plus gardés. Votre page de suivi, juste en dessous, vous dit quoi faire."
            onConfirme={() => actions.envoyer({ type: "paiement-confirme" })}
            onEchec={(message) => actions.envoyer({ type: "paiement-echoue", message })}
          />
        </section>
      );
    }

    default:
      return null;
  }
}

/** Rien à l'écran : prévient la machine quand l'attente du paiement dépasse la garde des vélos. */
function MinuteurExpiration({ demandeLe, onExpire }: { demandeLe: number; onExpire: () => void }) {
  useEffect(() => {
    const reste = demandeLe + EXPIRATION_PANIER_MINUTES * 60_000 - Date.now();
    const minuteur = setTimeout(onExpire, Math.max(0, reste));
    return () => clearTimeout(minuteur);
  }, [demandeLe, onExpire]);
  return null;
}

/* --------------------------------------------------------------- L'heure */

/** Les heures pleines d'abord ; le quart d'heure sur demande. */
function ChoixHeure({
  departs,
  onChoisir,
  onAutreDate,
}: {
  departs: HeureMinute[];
  onChoisir: (depart: HeureMinute) => void;
  onAutreDate: () => void;
}) {
  const periodes = [
    { cle: "matin", titre: "Le matin", departs: departs.filter((depart) => depart < "12:00") },
    { cle: "apres-midi", titre: "L'après-midi", departs: departs.filter((depart) => depart >= "12:00" && depart < "18:00") },
    { cle: "soir", titre: "Le soir", departs: departs.filter((depart) => depart >= "18:00") },
  ].filter((periode) => periode.departs.length > 0);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [toutes, setToutes] = useState(false);
  const periode = periodes.find((candidate) => candidate.cle === choisie) ?? periodes[0];
  if (!periode) {
    return (
      <>
        <p className={`mt-3 ${AIDE}`}>Il n&apos;y a plus de départ possible ce jour-là.</p>
        <Puces>
          <button type="button" className={PUCE} onClick={onAutreDate}>
            Choisir une autre date
          </button>
        </Puces>
      </>
    );
  }
  // Les heures pleines, et le premier départ de la période s'il tombe au quart d'heure.
  const pleines = periode.departs.filter((depart, rang) => rang === 0 || depart.endsWith(":00"));
  const visibles = toutes ? periode.departs : pleines;
  return (
    <>
      {periodes.length > 1 && (
        <div role="group" aria-label="Moment de la journée" className="mt-3 flex flex-wrap gap-1.5">
          {periodes.map((candidate) => (
            <button
              key={candidate.cle}
              type="button"
              aria-pressed={candidate.cle === periode.cle}
              onClick={() => setChoisie(candidate.cle)}
              className={`min-h-11 rounded-full border px-4 text-[0.84rem] font-semibold transition-colors ${
                candidate.cle === periode.cle ? "border-noir-piste bg-noir-piste text-craie" : "border-noir-piste/20 bg-white text-noir-piste hover:border-noir-piste/50"
              }`}
            >
              {candidate.titre}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label={`Les départs, ${periode.titre.toLowerCase()}`} className="mt-2.5 flex flex-wrap gap-2">
        {visibles.map((depart) => (
          <button key={depart} type="button" className={`${PUCE} min-w-[4.5rem] tabular-nums`} onClick={() => onChoisir(depart)}>
            {heureEnClair(depart)}
          </button>
        ))}
        {pleines.length < periode.departs.length && (
          <button type="button" aria-expanded={toutes} className={PUCE_DISCRETE} onClick={() => setToutes(!toutes)}>
            {toutes ? "Moins d'horaires" : "Plus d'horaires"}
          </button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- La durée */

/** Les durées visibles d'emblée ; les plus longues, sur demande. */
const DUREES_VISIBLES = 9;

function ChoixDuree({ durees, onChoisir }: { durees: number[]; onChoisir: (minutes: number) => void }) {
  const [toutes, setToutes] = useState(false);
  const visibles = toutes ? durees : durees.slice(0, DUREES_VISIBLES);
  return (
    <Puces>
      {visibles.map((minutes) => (
        <button key={minutes} type="button" className={`${PUCE} min-w-[4.5rem] tabular-nums`} onClick={() => onChoisir(minutes)}>
          {dureeCourte(minutes)}
        </button>
      ))}
      {durees.length > DUREES_VISIBLES && (
        <button type="button" aria-expanded={toutes} onClick={() => setToutes(!toutes)} className={PUCE_DISCRETE}>
          {toutes ? "Moins de durées" : "Plus long"}
        </button>
      )}
    </Puces>
  );
}

/* ------------------------------------------------- Les vélos de Gbashi */

function ChoixVelos({
  personnes,
  minimum,
  stock,
  stockConfirme,
  verificationEnEchec,
  onRelancer,
  prix,
  initiale,
  onValider,
}: {
  personnes: number;
  minimum: number;
  stock: Record<GammeVelo, number>;
  stockConfirme: boolean;
  /** Le serveur n'a pas pu dire ce qu'il reste : le prix et le stock seront confirmés avant de payer. */
  verificationEnEchec: boolean;
  onRelancer: () => void;
  prix: Record<GammeVelo, number>;
  initiale: Partial<Record<GammeVelo, number>>;
  onValider: (velos: Record<GammeVelo, number>) => void;
}) {
  // Les vélos touchés par le client ; tant qu'il n'a rien touché, la répartition proposée.
  // Toujours ramenés dans le stock : quand celui du serveur arrive, la même carte s'ajuste.
  const [saisis, setSaisis] = useState<Record<GammeVelo, number> | null>(null);
  const dansLeStock = (base: Partial<Record<GammeVelo, number>>): Record<GammeVelo, number> => ({
    CLASSIQUE: Math.max(0, Math.min(base.CLASSIQUE ?? 0, stock.CLASSIQUE)),
    PREMIUM: Math.max(0, Math.min(base.PREMIUM ?? 0, stock.PREMIUM)),
    PRESTIGE: Math.max(0, Math.min(base.PRESTIGE ?? 0, stock.PRESTIGE)),
  });
  const velos = dansLeStock(saisis ?? initiale);
  const total = totalVelos(velos);
  const changer = (gamme: GammeVelo, ecart: number) => setSaisis(dansLeStock({ ...velos, [gamme]: velos[gamme] + ecart }));
  const compteur =
    "grid h-11 w-11 place-items-center rounded-full border-2 border-orange-signal bg-white text-[1.25rem] font-semibold leading-none text-noir-piste transition-colors hover:bg-orange-signal/10 disabled:border-noir-piste/15 disabled:text-noir-piste/35 disabled:hover:bg-white";
  // La vérification du stock du jour, à une place réservée de deux lignes : son texte change sur place.
  const verification = stockConfirme
    ? "C'est vérifié : voici ce qu'il reste ce jour-là."
    : verificationEnEchec
      ? "Je n'ai pas pu vérifier ce qu'il reste ce jour-là : ce sera fait avant le paiement."
      : "Je vérifie ce qu'il reste ce jour-là…";
  return (
    <section data-focus-etape tabIndex={-1} aria-label="Vos vélos" className={CARTE}>
      <ul className="divide-y divide-noir-piste/10">
        {ORDRE_GAMMES.map((gamme) => (
          <li key={gamme} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
            <span className="min-w-0">
              <span className="block font-semibold">{NOMS_GAMMES[gamme]}</span>
              <span className="block text-[0.76rem] leading-snug text-gris-cadre">
                {formatMontant(prix[gamme])} par personne,{" "}
                {/* Le nombre restant ne part jamais seul à la ligne (espace insécable). */}
                {stock[gamme] > 0 ? <>il en reste&nbsp;{stock[gamme]}</> : "plus de vélo libre"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Un vélo ${NOMS_GAMMES[gamme]} de moins`}
                disabled={velos[gamme] <= 0}
                onClick={() => changer(gamme, -1)}
                className={compteur}
              >
                −
              </button>
              <output aria-live="polite" className="w-7 text-center font-display text-[1.15rem] font-bold tabular-nums">
                {velos[gamme]}
              </output>
              <button
                type="button"
                aria-label={`Un vélo ${NOMS_GAMMES[gamme]} de plus`}
                disabled={velos[gamme] >= stock[gamme]}
                onClick={() => changer(gamme, 1)}
                className={compteur}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 ${AIDE}`} aria-live="polite">
        {total === personnes
          ? `${total} vélos pour ${personnesEnClair(personnes)}.`
          : insecables(
              `${total} vélo${total > 1 ? "s" : ""} choisi${total > 1 ? "s" : ""} pour ${personnesEnClair(personnes)} : le groupe comptera ${personnesEnClair(total)}.`,
            )}
      </p>
      <p role="status" className={`mt-1 min-h-[2.75em] ${AIDE}`}>
        {insecables(verification)}
      </p>
      {!stockConfirme && verificationEnEchec && (
        <button type="button" onClick={onRelancer} className={`${PUCE_DISCRETE} -ml-3`}>
          Vérifier de nouveau
        </button>
      )}
      <button type="button" className={`${BOUTON_CARTE} mt-2`} disabled={total < minimum} onClick={() => onValider(velos)}>
        {total < minimum ? `Au moins ${minimum} vélos` : "Valider les vélos"}
      </button>
    </section>
  );
}

/* ------------------------------------------------- La capture de réduction */

function EnvoiPreuve({
  client,
  envoi,
  onEnvoyer,
  onSans,
}: {
  client: Coordonnees;
  envoi: boolean;
  onEnvoyer: (capture: File, telephone: string, email: string) => Promise<void>;
  onSans: () => void;
}) {
  const [capture, setCapture] = useState<File | null>(null);
  const [telephone, setTelephone] = useState(client.telephone);
  const [email, setEmail] = useState(client.email);
  const [erreur, setErreur] = useState<string | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  // Reprendre la même image, ou fermer la galerie sans choisir : le champ de
  // fichier envoie un « cancel » qui remonterait jusqu'à la discussion. Il
  // s'arrête ici (la discussion, de son côté, ne ferme que sur le sien).
  useEffect(() => {
    const champ = champFichier.current;
    if (!champ) return;
    const retenir = (evenement: Event) => evenement.stopPropagation();
    champ.addEventListener("cancel", retenir);
    return () => champ.removeEventListener("cancel", retenir);
  }, []);

  const envoyer = (evenement: FormEvent) => {
    evenement.preventDefault();
    if (!capture) return setErreur("Choisissez la capture d'écran à envoyer.");
    if (!(TYPES_CAPTURE as readonly string[]).includes(capture.type)) return setErreur("Envoyez une image JPG, PNG ou WebP.");
    if (capture.size > TAILLE_MAX_CAPTURE_OCTETS) return setErreur("Cette image dépasse 4 Mo : envoyez une capture plus légère.");
    if (!schemaChampsPreuve.shape.telephone.safeParse(telephone).success) {
      return setErreur("Ce numéro ne passe pas. Écrivez-le en chiffres, par exemple 01 97 00 00 00.");
    }
    if (!schemaChampsPreuve.shape.email.safeParse(email).success) {
      return setErreur("Il manque quelque chose dans cette adresse, je crois. Elle s'écrit comme nom@exemple.com.");
    }
    setErreur(null);
    void onEnvoyer(capture, telephone, email);
  };

  return (
    <form data-focus-etape tabIndex={-1} onSubmit={envoyer} noValidate aria-label="Votre capture d'écran" className={`${CARTE} space-y-3`}>
      {/* Le champ de fichier du navigateur coupe son texte à 320 px : un bouton à nous, et le nom de l'image sur sa ligne. */}
      <div>
        <span id="etiquette-capture" className={ETIQUETTE}>
          Votre capture d&apos;écran (JPG, PNG ou WebP, 4 Mo au plus)
        </span>
        <label className="mt-1.5 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-noir-piste px-4 text-[0.88rem] font-semibold text-craie transition-colors hover:bg-noir-releve has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-noir-piste">
          <input
            ref={champFichier}
            type="file"
            accept={TYPES_CAPTURE.join(",")}
            aria-labelledby="etiquette-capture"
            aria-describedby="nom-capture"
            onChange={(evenement) => {
              // Une image choisie (même la même) : l'erreur « choisissez la capture » n'a plus lieu d'être.
              setCapture(evenement.target.files?.[0] ?? null);
              setErreur(null);
            }}
            className="sr-only"
          />
          <span aria-hidden="true">{capture ? "Changer d'image" : "Choisir une image"}</span>
        </label>
        <p id="nom-capture" className={`mt-1 truncate ${AIDE}`}>
          {capture ? capture.name : "Aucune image choisie"}
        </p>
      </div>
      <label className="block">
        {/* C'est aussi le numéro qui recevra la demande de paiement : le client le sait dès ici. */}
        <span className={ETIQUETTE}>Votre numéro Mobile Money</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
          placeholder="01 97 00 00 00"
          className={CHAMP}
        />
      </label>
      <label className="block">
        <span className={ETIQUETTE}>Votre email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          className={CHAMP}
        />
      </label>
      {erreur && (
        <p role="alert" className="text-[0.82rem] text-orange-sourd">
          {insecables(erreur)}
        </p>
      )}
      <button type="submit" className={BOUTON_CARTE} disabled={envoi}>
        {envoi ? "Envoi de la capture…" : "Envoyer ma capture"}
      </button>
      <button type="button" onClick={onSans} disabled={envoi} className={`${PUCE_DISCRETE} -ml-3 disabled:opacity-40`}>
        Continuer sans la réduction
      </button>
    </form>
  );
}

/* --------------------------------------------------------------- Le paiement */

function Paiement({ etat, faits, maintenant, actions }: ProprietesEtape) {
  const offre = offreAffichee(etat, faits, maintenant);
  const pret = demandeReservationDe(etat) !== null;
  const confirme = devisConfirme(etat);
  const montant = confirme ? offre?.montantADebiterXof : undefined;
  return (
    <section data-focus-etape tabIndex={-1} aria-label="Votre paiement" className={CARTE}>
      <p className="font-display text-[1.15rem] font-semibold leading-tight">Votre paiement</p>
      {offre && (
        <dl className="mt-3 space-y-1.5 text-[0.86rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt>Prix de l&apos;offre</dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatMontant(offre.resultat.totalXof)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>Frais Mobile Money (opérateur de paiement)</dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">
              {confirme && typeof offre.commissionXof === "number" ? `+ ${formatMontant(offre.commissionXof)}` : "en calcul…"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-noir-piste/10 pt-1.5 font-semibold">
            <dt>
              Débité sur le <span className="whitespace-nowrap">{etat.client.telephone}</span>
              {etat.moyen && (
                <>
                  {" "}
                  <span className="whitespace-nowrap">({NOMS_MOYENS[etat.moyen]})</span>
                </>
              )}
            </dt>
            <dd className="shrink-0 whitespace-nowrap font-display text-[1.15rem] tabular-nums">
              {typeof montant === "number" ? formatMontant(montant) : "…"}
            </dd>
          </div>
        </dl>
      )}
      <p className={`mt-2 ${AIDE}`}>Dès le paiement validé, le récapitulatif et la facture partent sur {etat.client.email}.</p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-[0.88rem] leading-relaxed">
        <input
          type="checkbox"
          checked={etat.cgv}
          onChange={(evenement) => actions.envoyer({ type: "accepter-cgv", acceptees: evenement.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#f25c05]"
        />
        <span>
          J&apos;accepte les{" "}
          <a href="/cgv" target="_blank" className="font-semibold underline decoration-noir-piste/40 underline-offset-2">
            conditions générales de vente
          </a>{" "}
          et la{" "}
          <a href="/donnees-personnelles" target="_blank" className="font-semibold underline decoration-noir-piste/40 underline-offset-2">
            politique de protection des données
          </a>
          .
        </span>
      </label>
      <button type="button" className={`${BOUTON_CARTE} mt-4`} disabled={!pret || etat.envoi !== null} onClick={() => void actions.payer()}>
        {etat.envoi === "reservation"
          ? "Envoi de la demande…"
          : typeof montant === "number"
            ? `Payer ${formatMontant(montant)}`
            : confirme
              ? "Payer"
              : etat.devisEnEchec !== null
                ? "Prix à confirmer"
                : "Je vérifie le prix…"}
      </button>
      {!etat.cgv && <p className={`mt-2 ${AIDE}`}>Cochez les conditions générales pour payer.</p>}
    </section>
  );
}
