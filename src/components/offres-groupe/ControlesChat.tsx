"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Bouton, classesBouton } from "@/components/Bouton";
import { SuiviPaiementMomo } from "@/components/reservation/SuiviPaiementMomo";
import { ajouterJours, type DateISO } from "@/lib/dates";
import { formatMontant, heureEnClair, NOMS_GAMMES, ORDRE_GAMMES, type Coco, type CodeOffreGroupe, type GammeVelo } from "@/lib/offres";
import { schemaChampsPreuve, TAILLE_MAX_CAPTURE_OCTETS, TYPES_CAPTURE } from "@/lib/offres-groupe/api";
import {
  coordonneesValides,
  demandeReservationDe,
  devisConfirme,
  lienRepriseDuPaiement,
  messageWhatsApp,
  MOYENS_EN_LIGNE,
  NOMS_MOYENS,
  offreAffichee,
  stockGbashi,
  type ActionChat,
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
  jourCourt,
  ligneDeLOffre,
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

/* ---------------------------------------------------------------- Styles */

const PUCE =
  "min-h-11 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 py-2 text-left text-[0.88rem] font-semibold leading-tight text-noir-piste transition-colors hover:border-noir-piste/50 disabled:opacity-40";
const PUCE_CENTREE = `${PUCE} text-center`;
const CHAMP =
  "mt-1 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3.5 py-2.5 text-[1rem] text-noir-piste outline-none transition-colors focus:border-noir-piste aria-[invalid=true]:border-orange-signal";
const ETIQUETTE = "block text-[0.8rem] text-gris-cadre";
const AIDE = "mt-1.5 text-[0.78rem] leading-snug text-gris-cadre";

/** « 30 min », « 1 h », « 1 h 15 » : une durée, sur une puce. */
function dureeCourte(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const reste = minutes % 60;
  return `${Math.floor(minutes / 60)} h${reste ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}

/** Une colonne de grands boutons de réponse. */
function Reponses({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

/* ---------------------------------------------------------- Les contrôles */

/**
 * Les réponses possibles à l'étape en cours : des boutons et des puces, des
 * compteurs pour les nombres, un champ seulement là où il le faut (un
 * montant, les coordonnées). Tout ce qui est proposé vient de la machine et
 * du moteur ; rien n'est calculé ici.
 */
export function ControlesChat({
  etat,
  faits,
  maintenant,
  actions,
}: {
  etat: EtatChat;
  faits: FaitsChat;
  maintenant: number;
  actions: ActionsChat;
}) {
  const { choix, etape } = etat;
  const { envoyer } = actions;
  const reglages = faits.reglages;
  const whatsApp = lienWhatsApp(messageWhatsApp(etat, faits, maintenant));
  const autreDate = () =>
    envoyer({ type: "appliquer", alternative: { cle: "autre-date", libelle: "Choisir une autre date", changement: { date: null } } });

  switch (etape) {
    case "offre":
      return <ChoixOffre faits={faits} onChoisir={(offre) => envoyer({ type: "choisir-offre", offre })} />;

    case "personnes": {
      if (!choix.offre) return null;
      const minimum = personnesMinDe(choix.offre, reglages);
      if (faits.velosEnEtat < minimum) return <LienWhatsApp href={whatsApp} />;
      return (
        <ChoixPersonnes
          minimum={minimum}
          maximum={faits.velosEnEtat}
          initial={choix.personnes ?? minimum}
          onValider={(personnes) => envoyer({ type: "choisir-personnes", personnes })}
        />
      );
    }

    case "date":
      return choix.offre ? (
        <ChoixDate offre={choix.offre} faits={faits} maintenant={maintenant} onChoisir={(date) => envoyer({ type: "choisir-date", date })} />
      ) : null;

    case "heure":
      return choix.date ? (
        <ChoixHeure
          date={choix.date}
          faits={faits}
          maintenant={maintenant}
          onChoisir={(depart) => envoyer({ type: "choisir-heure", depart })}
          onAutreDate={autreDate}
        />
      ) : null;

    case "mode":
      return (
        <Reponses>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-mode", mode: "budget" })}>
            Oui, j&apos;ai un budget
            <span className="block text-[0.78rem] font-normal text-gris-cadre">Je calcule votre temps de vélo et le coco qu&apos;il permet.</span>
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-mode", mode: "duree" })}>
            Non, je choisis la durée
            <span className="block text-[0.78rem] font-normal text-gris-cadre">Vous dites combien de temps, je vous donne le prix.</span>
          </button>
        </Reponses>
      );

    case "budget":
      return (
        <ChoixBudget
          budgets={budgetsProposes(choix, faits, maintenant)}
          onChoisir={(budgetXof) => envoyer({ type: "choisir-budget", budgetXof })}
        />
      );

    case "duree":
      return <ChoixDuree durees={dureesProposees(choix, faits, maintenant)} onChoisir={(minutes) => envoyer({ type: "choisir-duree", minutes })} />;

    case "coco": {
      const options: { coco: Coco; libelle: string }[] = [
        { coco: "aucun", libelle: "Sans coco" },
        { coco: "petit", libelle: `Petit coco, ${formatMontant(reglages.consommables.cocoPetitXof)} par personne` },
        { coco: "grand", libelle: `Grand coco, ${formatMontant(reglages.consommables.cocoGrandXof)} par personne` },
      ];
      return (
        <Reponses>
          {options.map((option) => (
            <button key={option.coco} type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-coco", coco: option.coco })}>
              {option.libelle}
            </button>
          ))}
        </Reponses>
      );
    }

    case "gateaux":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((nombre) => (
            <button key={nombre} type="button" className={PUCE_CENTREE} onClick={() => envoyer({ type: "choisir-gateaux", gateauxParPersonne: nombre })}>
              {nombre === 0 ? "Sans gâteau" : `${nombre} par personne`}
            </button>
          ))}
        </div>
      );

    case "accompagnateur":
      return (
        <Reponses>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-accompagnateur", accompagnateur: true })}>
            Oui, avec un accompagnateur
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "choisir-accompagnateur", accompagnateur: false })}>
            Non merci, nous connaissons la route
          </button>
        </Reponses>
      );

    case "reduction":
      return (
        <Reponses>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "repondre-reduction", veut: true })}>
            Oui, j&apos;envoie une capture d&apos;écran
          </button>
          <button type="button" className={PUCE} onClick={() => envoyer({ type: "repondre-reduction", veut: false })}>
            Non merci
          </button>
        </Reponses>
      );

    case "preuve":
      return (
        <EnvoiPreuve
          client={etat.client}
          envoi={etat.envoi === "preuve"}
          onEnvoyer={actions.envoyerPreuve}
          onSans={() => envoyer({ type: "reduction-sans" })}
        />
      );

    case "preuve-statut": {
      const reduction = choix.reduction;
      if (reduction.etat === "a-verifier") {
        return (
          <p role="status" className="flex items-center gap-3 text-[0.88rem] text-gris-cadre">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-noir-piste/25 border-t-noir-piste" />
            Je vérifie…
          </p>
        );
      }
      return (
        <Reponses>
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
        </Reponses>
      );
    }

    case "velos": {
      if (choix.personnes === null) return null;
      const { stock, confirme } = stockGbashi(etat, faits);
      return (
        <ChoixVelos
          // Une nouvelle mesure du serveur repart d'une répartition qui tient dans le stock.
          key={confirme ? "confirme" : "provisoire"}
          personnes={choix.personnes}
          minimum={reglages.gbashi.personnesMin}
          stock={stock}
          stockConfirme={confirme}
          prix={reglages.gbashi.prixXof}
          initiale={choix.velos ?? repartitionParDefaut(choix.personnes, stock, faits)}
          onValider={(velos) => envoyer({ type: "choisir-velos", velos })}
        />
      );
    }

    case "proposition":
      return <Proposition etat={etat} faits={faits} maintenant={maintenant} actions={actions} />;

    case "negociation":
    case "refus":
      return (
        <Reponses>
          {etat.alternatives.map((alternative) => (
            <button key={alternative.cle} type="button" className={PUCE} onClick={() => envoyer({ type: "appliquer", alternative })}>
              {alternative.libelle}
            </button>
          ))}
          {etape === "negociation" ? (
            <button type="button" className={`${PUCE} border-transparent bg-transparent underline`} onClick={() => envoyer({ type: "garder-offre" })}>
              Garder cette offre
            </button>
          ) : (
            etat.alternatives.length === 0 && (
              <button type="button" className={PUCE} onClick={() => envoyer({ type: "recommencer" })}>
                Recommencer
              </button>
            )
          )}
        </Reponses>
      );

    case "coordonnees":
      return <FormulaireCoordonnees client={etat.client} onValider={(client) => envoyer({ type: "saisir-coordonnees", client })} />;

    case "moyen":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          {MOYENS_EN_LIGNE.map((moyen) => (
            <button key={moyen} type="button" className={PUCE_CENTREE} onClick={() => envoyer({ type: "choisir-moyen", moyen })}>
              {NOMS_MOYENS[moyen]}
            </button>
          ))}
        </div>
      );

    case "payer":
      return <Paiement etat={etat} faits={faits} maintenant={maintenant} actions={actions} />;

    case "attente": {
      const reservation = etat.reservation;
      if (!reservation?.suivi || !reservation.token) return null;
      return (
        <SuiviPaiementMomo
          token={reservation.token}
          paiementId={reservation.suivi.paiementId}
          moyen={reservation.suivi.moyen}
          telephone={reservation.suivi.telephone}
          montantXof={reservation.montantADebiterXof}
          urlCheckout={reservation.suivi.urlCheckout}
          expiration="La demande de paiement a expiré et les vélos ne sont plus gardés. Votre lien de suivi, reçu par email, permet de la relancer."
          onConfirme={() => envoyer({ type: "paiement-confirme" })}
          onEchec={(message) => envoyer({ type: "paiement-echoue", message })}
        />
      );
    }

    case "confirmee":
      return etat.reservation ? (
        <Reponses>
          <a href={etat.reservation.lienSuivi} onClick={actions.fermer} className={classesBouton("primaire", "lg", "w-full")}>
            Suivre ma réservation
          </a>
          <button type="button" className={PUCE_CENTREE} onClick={actions.fermer}>
            Fermer
          </button>
        </Reponses>
      ) : null;

    case "echec":
      return (
        <Reponses>
          {etat.reservation && (
            <a href={lienRepriseDuPaiement(etat.reservation)} onClick={actions.fermer} className={classesBouton("primaire", "lg", "w-full")}>
              Reprendre le paiement
            </a>
          )}
          <LienWhatsApp href={whatsApp} />
        </Reponses>
      );

    case "ferme":
      return <LienWhatsApp href={whatsApp} />;
  }
}

function LienWhatsApp({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={classesBouton("sombre", "lg", "w-full")}>
      Écrire à Bike Land sur WhatsApp
    </a>
  );
}

/* ------------------------------------------------------------- L'offre */

function ChoixOffre({ faits, onChoisir }: { faits: FaitsChat; onChoisir: (offre: CodeOffreGroupe) => void }) {
  return (
    <Reponses>
      {ORDRE_OFFRES.map((offre) => (
        <button key={offre} type="button" className={`${PUCE} py-3`} onClick={() => onChoisir(offre)}>
          <span className="block font-display text-[1.08rem]">{NOMS_OFFRES[offre]}</span>
          <span className="mt-1 block text-[0.8rem] font-normal leading-snug text-gris-cadre">{ligneDeLOffre(offre, faits.reglages)}</span>
        </button>
      ))}
    </Reponses>
  );
}

/* ------------------------------------------------------------- Le groupe */

function ChoixPersonnes({
  minimum,
  maximum,
  initial,
  onValider,
}: {
  minimum: number;
  maximum: number;
  initial: number;
  onValider: (personnes: number) => void;
}) {
  const borne = (valeur: number) => Math.min(maximum, Math.max(minimum, Math.round(valeur)));
  const [saisie, setSaisie] = useState(String(borne(initial)));
  const nombre = Number(saisie);
  const valable = Number.isInteger(nombre) && nombre >= minimum && nombre <= maximum;
  const valeur = valable ? nombre : borne(Number.isFinite(nombre) ? nombre : minimum);
  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (valable) onValider(nombre);
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Une personne de moins"
          disabled={valeur <= minimum}
          onClick={() => setSaisie(String(borne(valeur - 1)))}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 bg-white text-[1.3rem] font-semibold disabled:opacity-35"
        >
          −
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nombre de personnes</span>
          <input
            type="number"
            inputMode="numeric"
            min={minimum}
            max={maximum}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            onBlur={() => setSaisie(String(valeur))}
            aria-invalid={!valable}
            className="h-12 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-center font-display text-[1.3rem] font-bold tabular-nums outline-none focus:border-noir-piste aria-[invalid=true]:border-orange-signal"
          />
        </label>
        <button
          type="button"
          aria-label="Une personne de plus"
          disabled={valeur >= maximum}
          onClick={() => setSaisie(String(borne(valeur + 1)))}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 bg-white text-[1.3rem] font-semibold disabled:opacity-35"
        >
          +
        </button>
      </div>
      <p className={AIDE} aria-live="polite">
        {personnesEnClair(valeur)}. De {minimum} à {maximum} : nous avons {maximum} vélos en état, un par personne.
      </p>
      <Bouton type="submit" taille="md" className="mt-3 w-full" disabled={!valable}>
        C&apos;est bon
      </Bouton>
    </form>
  );
}

/* --------------------------------------------------------------- Le jour */

function ChoixDate({
  offre,
  faits,
  maintenant,
  onChoisir,
}: {
  offre: CodeOffreGroupe;
  faits: FaitsChat;
  maintenant: number;
  onChoisir: (date: DateISO) => void;
}) {
  const aujourdhui = aujourdhuiAuBenin(maintenant);
  const demain = ajouterJours(aujourdhui, 1);
  const jours = joursProposes(offre, faits, maintenant, 6);
  const [autre, setAutre] = useState("");
  return (
    <div>
      {jours.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {jours.map((jour) => (
            <button key={jour} type="button" className={PUCE_CENTREE} onClick={() => onChoisir(jour)}>
              {jour === aujourdhui ? "Aujourd'hui" : jour === demain ? "Demain" : majuscule(jourCourt(jour))}
            </button>
          ))}
        </div>
      ) : (
        <p className={AIDE}>Aucun départ ne se réserve en ligne dans les semaines qui viennent.</p>
      )}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (/^\d{4}-\d{2}-\d{2}$/.test(autre)) onChoisir(autre);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className={ETIQUETTE}>Une autre date</span>
          <input
            type="date"
            min={aujourdhui}
            max={ajouterJours(aujourdhui, 90)}
            value={autre}
            onChange={(evenement) => setAutre(evenement.target.value)}
            className={CHAMP}
          />
        </label>
        <button type="submit" disabled={!autre} className={`${PUCE_CENTREE} shrink-0`}>
          Choisir
        </button>
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- L'heure */

function ChoixHeure({
  date,
  faits,
  maintenant,
  onChoisir,
  onAutreDate,
}: {
  date: DateISO;
  faits: FaitsChat;
  maintenant: number;
  onChoisir: (depart: string) => void;
  onAutreDate: () => void;
}) {
  const departs = departsProposes(date, faits, maintenant);
  const periodes = [
    { cle: "matin", titre: "Le matin", departs: departs.filter((depart) => depart < "12:00") },
    { cle: "apres-midi", titre: "L'après-midi", departs: departs.filter((depart) => depart >= "12:00" && depart < "18:00") },
    { cle: "soir", titre: "Le soir", departs: departs.filter((depart) => depart >= "18:00") },
  ].filter((periode) => periode.departs.length > 0);
  const [choisie, setChoisie] = useState<string | null>(null);
  const periode = periodes.find((candidate) => candidate.cle === choisie) ?? periodes[0];
  if (!periode) {
    return (
      <Reponses>
        <p className={AIDE}>Il n&apos;y a plus de départ possible ce jour-là.</p>
        <button type="button" className={PUCE} onClick={onAutreDate}>
          Choisir une autre date
        </button>
      </Reponses>
    );
  }
  return (
    <div>
      <div role="group" aria-label="Moment de la journée" className="flex flex-wrap gap-2">
        {periodes.map((candidate) => (
          <button
            key={candidate.cle}
            type="button"
            aria-pressed={candidate.cle === periode.cle}
            onClick={() => setChoisie(candidate.cle)}
            className={`min-h-11 rounded-full border px-4 text-[0.84rem] font-semibold transition-colors ${
              candidate.cle === periode.cle ? "border-noir-piste bg-noir-piste text-craie" : "border-noir-piste/20 bg-white"
            }`}
          >
            {candidate.titre}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {periode.departs.map((depart) => (
          <button
            key={depart}
            type="button"
            onClick={() => onChoisir(depart)}
            className="min-h-11 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-1 text-center text-[0.84rem] font-semibold tabular-nums transition-colors hover:border-noir-piste/50"
          >
            {heureEnClair(depart)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Budget et durée */

function ChoixBudget({
  budgets,
  onChoisir,
}: {
  budgets: { budgetXof: number; minutes: number; coco: Coco }[];
  onChoisir: (budgetXof: number) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const montant = Number(saisie.replace(/\D/g, ""));
  const valable = Number.isSafeInteger(montant) && montant > 0 && montant <= 10_000_000;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {budgets.map((budget) => (
          <button key={budget.budgetXof} type="button" className={PUCE} onClick={() => onChoisir(budget.budgetXof)}>
            <span className="block tabular-nums">{formatMontant(budget.budgetXof)}</span>
            <span className="mt-0.5 block text-[0.76rem] font-normal text-gris-cadre">
              {dureeCourte(budget.minutes)} de vélo{budget.coco !== "aucun" ? `, ${budget.coco} coco` : ""}
            </span>
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (valable) onChoisir(montant);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className={ETIQUETTE}>Un autre montant, en francs</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            placeholder="Par exemple 12 000"
            className={CHAMP}
          />
        </label>
        <button type="submit" disabled={!valable} className={`${PUCE_CENTREE} shrink-0`}>
          Choisir
        </button>
      </form>
    </div>
  );
}

/** Les durées visibles d'emblée ; les plus longues, sur demande. */
const DUREES_VISIBLES = 9;

function ChoixDuree({ durees, onChoisir }: { durees: number[]; onChoisir: (minutes: number) => void }) {
  const [toutes, setToutes] = useState(false);
  const visibles = toutes ? durees : durees.slice(0, DUREES_VISIBLES);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {visibles.map((minutes) => (
          <button key={minutes} type="button" className={PUCE_CENTREE} onClick={() => onChoisir(minutes)}>
            {dureeCourte(minutes)}
          </button>
        ))}
      </div>
      {durees.length > DUREES_VISIBLES && (
        <button type="button" onClick={() => setToutes(!toutes)} className="lien-souligne cible-elargie mt-3 text-[0.84rem] font-semibold">
          {toutes ? "Moins de durées" : "Plus long"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------- Les vélos de Gbashi */

function ChoixVelos({
  personnes,
  minimum,
  stock,
  stockConfirme,
  prix,
  initiale,
  onValider,
}: {
  personnes: number;
  minimum: number;
  stock: Record<GammeVelo, number>;
  stockConfirme: boolean;
  prix: Record<GammeVelo, number>;
  initiale: Partial<Record<GammeVelo, number>>;
  onValider: (velos: Record<GammeVelo, number>) => void;
}) {
  const [velos, setVelos] = useState<Record<GammeVelo, number>>(() => ({
    CLASSIQUE: Math.min(initiale.CLASSIQUE ?? 0, stock.CLASSIQUE),
    PREMIUM: Math.min(initiale.PREMIUM ?? 0, stock.PREMIUM),
    PRESTIGE: Math.min(initiale.PRESTIGE ?? 0, stock.PRESTIGE),
  }));
  const total = totalVelos(velos);
  const changer = (gamme: GammeVelo, ecart: number) =>
    setVelos((avant) => ({ ...avant, [gamme]: Math.max(0, Math.min(stock[gamme], avant[gamme] + ecart)) }));
  return (
    <div>
      <ul className="space-y-2">
        {ORDRE_GAMMES.map((gamme) => (
          <li key={gamme} className="flex items-center justify-between gap-2 rounded-[var(--radius-bouton)] border border-noir-piste/15 bg-white px-3 py-2">
            <span className="min-w-0">
              <span className="block font-semibold">{NOMS_GAMMES[gamme]}</span>
              <span className="block text-[0.76rem] text-gris-cadre">
                {formatMontant(prix[gamme])} par personne · {stock[gamme] > 0 ? `il en reste ${stock[gamme]}` : "plus de vélo libre"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-label={`Un vélo ${NOMS_GAMMES[gamme]} de moins`}
                disabled={velos[gamme] <= 0}
                onClick={() => changer(gamme, -1)}
                className="grid h-10 w-10 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                −
              </button>
              <output aria-live="polite" className="w-7 text-center font-display text-[1.1rem] font-bold tabular-nums">
                {velos[gamme]}
              </output>
              <button
                type="button"
                aria-label={`Un vélo ${NOMS_GAMMES[gamme]} de plus`}
                disabled={velos[gamme] >= stock[gamme]}
                onClick={() => changer(gamme, 1)}
                className="grid h-10 w-10 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className={AIDE} aria-live="polite">
        {total === personnes
          ? `${total} vélos pour ${personnesEnClair(personnes)}.`
          : `${total} vélo${total > 1 ? "s" : ""} choisi${total > 1 ? "s" : ""} pour ${personnesEnClair(personnes)} : le groupe comptera ${personnesEnClair(total)}.`}
        {stockConfirme ? "" : " Je vérifie ce qu'il reste ce jour-là…"}
      </p>
      <Bouton type="button" className="mt-3 w-full" disabled={total < minimum} onClick={() => onValider(velos)}>
        {total < minimum ? `Au moins ${minimum} vélos` : "Valider les vélos"}
      </Bouton>
    </div>
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

  const envoyer = (evenement: FormEvent) => {
    evenement.preventDefault();
    if (!capture) return setErreur("Choisissez la capture d'écran à envoyer.");
    if (!(TYPES_CAPTURE as readonly string[]).includes(capture.type)) return setErreur("Envoyez une image JPG, PNG ou WebP.");
    if (capture.size > TAILLE_MAX_CAPTURE_OCTETS) return setErreur("Cette image dépasse 5 Mo : envoyez une capture plus légère.");
    if (!schemaChampsPreuve.safeParse({ telephone, email }).success) return setErreur("Vérifiez votre téléphone et votre email.");
    setErreur(null);
    void onEnvoyer(capture, telephone, email);
  };

  return (
    <form onSubmit={envoyer} noValidate className="space-y-3">
      <label className="block">
        <span className={ETIQUETTE}>Votre capture d&apos;écran (JPG, PNG ou WebP, 5 Mo au plus)</span>
        <input
          type="file"
          accept={TYPES_CAPTURE.join(",")}
          onChange={(evenement) => setCapture(evenement.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-[0.84rem] file:mr-3 file:rounded-[var(--radius-bouton)] file:border-0 file:bg-noir-piste file:px-3 file:py-2 file:text-[0.84rem] file:font-semibold file:text-craie"
        />
      </label>
      <label className="block">
        <span className={ETIQUETTE}>Votre téléphone</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
          placeholder="+229 97 00 00 00"
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
          {erreur}
        </p>
      )}
      <Bouton type="submit" className="w-full" disabled={envoi}>
        {envoi ? "Envoi de la capture…" : "Envoyer ma capture"}
      </Bouton>
      <button type="button" onClick={onSans} disabled={envoi} className="lien-souligne cible-elargie text-[0.84rem] font-semibold disabled:opacity-40">
        Continuer sans la réduction
      </button>
    </form>
  );
}

/* --------------------------------------------------------- L'offre chiffrée */

function Proposition({
  etat,
  faits,
  maintenant,
  actions,
}: {
  etat: EtatChat;
  faits: FaitsChat;
  maintenant: number;
  actions: ActionsChat;
}) {
  const offre = offreAffichee(etat, faits, maintenant);
  if (!offre) return null;
  const confirme = devisConfirme(etat);
  const enEchec = etat.devisEnEchec !== null && !confirme;
  return (
    <div>
      <CarteOffreChat {...offre} reglages={faits.reglages} />
      <div className="mt-3 flex flex-col gap-2">
        <Bouton type="button" taille="lg" className="w-full" disabled={!confirme} onClick={() => actions.envoyer({ type: "reserver" })}>
          {confirme ? "Je réserve" : enEchec ? "Prix à confirmer" : "Je vérifie le prix…"}
        </Bouton>
        {enEchec && (
          <button type="button" className={PUCE_CENTREE} onClick={() => actions.envoyer({ type: "relancer-devis" })}>
            Réessayer
          </button>
        )}
        <button type="button" className={PUCE_CENTREE} onClick={() => actions.envoyer({ type: "trop-cher" })}>
          C&apos;est un peu cher pour nous
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Les coordonnées */

function FormulaireCoordonnees({ client, onValider }: { client: Coordonnees; onValider: (client: Coordonnees) => void }) {
  const [champs, setChamps] = useState<Coordonnees>(client);
  const [essai, setEssai] = useState(false);
  const erreurs: Partial<Record<keyof Coordonnees, string>> = {
    ...(champs.prenom.trim() ? {} : { prenom: "Votre prénom, s'il vous plaît." }),
    ...(champs.nom.trim() ? {} : { nom: "Votre nom, s'il vous plaît." }),
    ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(champs.email.trim()) ? {} : { email: "Une adresse email valide : la facture et le lien de suivi y partent." }),
    ...(/^[+0-9 ().-]{8,20}$/.test(champs.telephone.trim()) ? {} : { telephone: "Un numéro de téléphone, par exemple +229 97 00 00 00." }),
  };
  const champ = (cle: keyof Coordonnees, libelle: string, options: { type?: string; autoComplete: string; inputMode?: "tel" | "email" | "text" }) => (
    <label className="block">
      <span className={ETIQUETTE}>{libelle}</span>
      <input
        type={options.type ?? "text"}
        inputMode={options.inputMode}
        autoComplete={options.autoComplete}
        value={champs[cle]}
        onChange={(evenement) => setChamps((avant) => ({ ...avant, [cle]: evenement.target.value }))}
        aria-invalid={essai && Boolean(erreurs[cle])}
        aria-describedby={essai && erreurs[cle] ? `chat-${cle}-erreur` : undefined}
        className={CHAMP}
      />
      {essai && erreurs[cle] && (
        <span id={`chat-${cle}-erreur`} className="mt-1 block text-[0.78rem] text-orange-sourd">
          {erreurs[cle]}
        </span>
      )}
    </label>
  );
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        setEssai(true);
        if (coordonneesValides(champs)) onValider(champs);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {champ("prenom", "Prénom", { autoComplete: "given-name" })}
        {champ("nom", "Nom", { autoComplete: "family-name" })}
      </div>
      {champ("email", "Email", { type: "email", autoComplete: "email", inputMode: "email" })}
      {champ("telephone", "Téléphone Mobile Money", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
      <p className={AIDE}>La demande de paiement part sur ce numéro.</p>
      <Bouton type="submit" className="w-full">
        Continuer
      </Bouton>
    </form>
  );
}

/* --------------------------------------------------------------- Le paiement */

function Paiement({
  etat,
  faits,
  maintenant,
  actions,
}: {
  etat: EtatChat;
  faits: FaitsChat;
  maintenant: number;
  actions: ActionsChat;
}) {
  const offre = offreAffichee(etat, faits, maintenant);
  const pret = demandeReservationDe(etat) !== null;
  const confirme = devisConfirme(etat);
  const montant = confirme ? offre?.montantADebiterXof : undefined;
  return (
    <div className="space-y-3">
      {offre && (
        <dl className="space-y-1.5 rounded-[var(--radius-carte)] border border-noir-piste/10 bg-white p-3.5 text-[0.86rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt>Prix de l&apos;offre</dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatMontant(offre.resultat.totalXof)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>Frais de l&apos;opérateur Mobile Money</dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">
              {confirme && typeof offre.commissionXof === "number" ? `+ ${formatMontant(offre.commissionXof)}` : "en calcul…"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-noir-piste/10 pt-1.5 font-semibold">
            <dt>
              Débité sur le {etat.client.telephone}
              {etat.moyen ? ` (${NOMS_MOYENS[etat.moyen]})` : ""}
            </dt>
            <dd className="shrink-0 whitespace-nowrap font-display text-[1.15rem] tabular-nums">
              {typeof montant === "number" ? formatMontant(montant) : "…"}
            </dd>
          </div>
        </dl>
      )}
      <label className="flex cursor-pointer items-start gap-3 text-[0.88rem] leading-relaxed">
        <input
          type="checkbox"
          checked={etat.cgv}
          onChange={(evenement) => actions.envoyer({ type: "accepter-cgv", acceptees: evenement.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 accent-[#f25c05]"
        />
        <span>
          J&apos;accepte les{" "}
          <a href="/cgv" target="_blank" className="lien-souligne font-semibold">
            conditions générales de vente
          </a>{" "}
          et la{" "}
          <a href="/donnees-personnelles" target="_blank" className="lien-souligne font-semibold">
            politique de protection des données
          </a>
          .
        </span>
      </label>
      <Bouton type="button" taille="lg" className="w-full" disabled={!pret || etat.envoi !== null} onClick={() => void actions.payer()}>
        {etat.envoi === "reservation"
          ? "Envoi de la demande…"
          : typeof montant === "number"
            ? `Payer ${formatMontant(montant)}`
            : confirme
              ? "Payer"
              : "Je vérifie le prix…"}
      </Bouton>
      {!etat.cgv && <p className={AIDE}>Cochez les conditions générales pour payer.</p>}
    </div>
  );
}
