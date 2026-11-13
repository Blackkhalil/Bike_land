"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Bouton, BoutonLien } from "@/components/Bouton";
import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import {
  delaiPadelEnClair,
  horairePadel,
  joursPadelReservables,
  jourOuverturePadel,
  padelBikeOuvert,
  prochainChangementPadel,
} from "@/data/padel-bike";
import { MESSAGES_WHATSAPP } from "@/data/produits";
import {
  blocPadel,
  formatDureeHeures,
  formatHeureMinute,
  REGLAGES_PAR_DEFAUT,
  type ReglagesPadel,
} from "@/data/reglages";
import type { DateISO } from "@/lib/dates";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { lienWhatsApp } from "@/lib/site";
import { calculerDevis } from "@/lib/tarification";
import { fraisEncaissement, moyensDisponibles, TAUX_ENCAISSEMENT } from "@/lib/tarifs-paiement";
import type { MoyenPaiement } from "@/lib/types";
import { oublierDemande, retenirDemande } from "@/lib/demande-en-attente";
import { RepriseDemande } from "./RepriseDemande";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";

/** Les jours proposés d'emblée ; les suivants, sur demande. */
const JOURS_VISIBLES = 12;

/** « ven. 21 nov. » : un jour de départ, sur une pastille. */
const formatteurPastille = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * L'horloge de la page, pour des réglages donnés : elle bascule d'elle-même
 * à l'ouverture, à minuit heure du Bénin, puis à la clôture de chaque jour
 * proposé. Le minuteur suivant se pose quand le précédent sonne.
 */
function abonnementHorloge(reglages: ReglagesPadel) {
  return (rappel: () => void) => {
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const programmer = () => {
      const maintenant = new Date().getTime();
      const prochain = prochainChangementPadel(reglages, maintenant);
      if (prochain === undefined) return;
      const delai = prochain - maintenant + 1000;
      if (delai >= 2 ** 31 - 1) return;
      minuteur = setTimeout(() => {
        rappel();
        programmer();
      }, delai);
    };
    programmer();
    return () => clearTimeout(minuteur);
  };
}

/**
 * Ce qu'on peut réserver à cet instant, en une chaîne comparable d'un rendu
 * à l'autre : « f » avant l'ouverture, sinon « o » et les jours proposés.
 */
function etatHorloge(reglages: ReglagesPadel, maintenant: number): string {
  return padelBikeOuvert(reglages, maintenant) ? ["o", ...joursPadelReservables(reglages, maintenant)].join("|") : "f";
}

/**
 * La réservation de Padel bike : on choisit son jour, combien on est, et
 * l'on paie. La sortie part à l'heure réglée dans l'administration (chaque
 * soir à 18 h 30 au lancement) : il n'y a pas d'heure à choisir.
 *
 * Pas de vélo à choisir non plus : le serveur attribue un vélo libre à
 * chaque personne, toutes gammes confondues, au même prix. La page demande
 * au serveur combien de vélos sont libres le jour choisi : c'est le plafond
 * du groupe. La suite est celle d'Octobre rose : la demande de paiement
 * part sur le téléphone du client, la page attend la validation, puis mène
 * au suivi de la réservation, et la facture part par email.
 *
 * Avant l'ouverture, la page annonce sa date et renvoie vers WhatsApp ; elle
 * s'ouvre seule à minuit, sans être rechargée. La page est mise en cache :
 * l'horloge est relue dans le navigateur, et le serveur refait tous les
 * contrôles.
 */
export function ReservationPadelBike({
  reglages: reglagesDuServeur,
  ouvertEnLigne,
  joursFermes,
  velosEnEtat,
  maintenantAuServeur,
}: {
  /** Les réglages de Padel bike, lus par le serveur. */
  reglages: ReglagesPadel;
  /** La réservation en ligne n'est pas fermée depuis le tableau de bord. */
  ouvertEnLigne: boolean;
  /** Les jours fermés à toutes les formules depuis le tableau de bord. */
  joursFermes: DateISO[];
  /** Les vélos en état de rouler : le plafond du groupe, le temps de connaître les vélos libres. */
  velosEnEtat: number;
  /** L'instant du rendu côté serveur : l'horloge s'hydrate dessus. */
  maintenantAuServeur: number;
}) {
  const routeur = useRouter();
  // Les réglages affichés : ceux du serveur au rendu, remplacés par les
  // nouveaux si le serveur répond qu'ils ont changé entre-temps (prix ou
  // horaire modifiés dans l'administration pendant que la page était ouverte).
  const [reglages, setReglages] = useState(reglagesDuServeur);
  const abonnement = useMemo(() => abonnementHorloge(reglages), [reglages]);
  const [etat, ...jours] = useSyncExternalStore(
    abonnement,
    () => etatHorloge(reglages, new Date().getTime()),
    () => etatHorloge(reglages, maintenantAuServeur),
  ).split("|");
  const ouvert = etat === "o";

  const [choix, setChoix] = useState<DateISO | null>(null);
  const [tousLesJours, setTousLesJours] = useState(false);
  const [nombre, setNombre] = useState(reglages.personnesMin);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [moyen, setMoyen] = useState<MoyenPaiement>("MTN_MONEY");
  const [cgv, setCgv] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [messagePaiement, setMessagePaiement] = useState<string | null>(null);
  // Réservation créée, demande poussée sur le téléphone : on ne recrée
  // surtout rien, les vélos sont déjà retenus.
  const [attente, setAttente] = useState<{
    token: string;
    paiementId: string;
    moyen: MoyenPaiement;
    telephone: string;
    urlCheckout?: string;
    /** Le montant demandé, figé à l'envoi : celui de la réservation enregistrée. */
    montantXof: number;
  } | null>(null);

  // Le jour choisi, s'il se réserve encore (une clôture a pu passer
  // entre-temps) et n'est pas fermé depuis le tableau de bord.
  const date = choix && jours.includes(choix) && !joursFermes.includes(choix) ? choix : null;

  // Les vélos libres sur les heures de la sortie, demandés au serveur dès
  // que le jour change. En attendant sa réponse, les vélos en état de rouler.
  const bloc = blocPadel(reglages);
  const [libres, setLibres] = useState<{ date: DateISO; nombre: number } | null>(null);
  useEffect(() => {
    if (!date) return;
    const controleur = new AbortController();
    fetch("/api/disponibilite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toutes: true,
        dateDebut: date,
        dateFin: date,
        heureDebut: bloc.heureDebut,
        heureFin: bloc.heureFin,
      }),
      signal: controleur.signal,
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (donnees && typeof donnees.libres === "number") setLibres({ date, nombre: donnees.libres });
      })
      .catch(() => undefined);
    return () => controleur.abort();
  }, [date, bloc.heureDebut, bloc.heureFin]);
  const libresCeJour = date && libres?.date === date ? libres.nombre : null;

  // Un vélo par personne : le groupe tient dans les vélos libres, entre le
  // minimum et le maximum réglés. Moins de vélos libres que le minimum : ce
  // départ est complet.
  const plafond = Math.min(reglages.personnesMax, libresCeJour ?? velosEnEtat);
  const complet = date !== null && plafond < reglages.personnesMin;
  const personnes = Math.max(reglages.personnesMin, Math.min(nombre, plafond));
  const total = calculerDevis({ offre: "padel-bike", nombrePersonnes: personnes }, { ...REGLAGES_PAR_DEFAUT, padel: reglages }).totalXof;
  const debite = total + fraisEncaissement(total);

  const coordonneesValides =
    prenom.trim().length >= 2 &&
    nom.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^[+0-9 ().-]{8,20}$/.test(telephone.trim());
  const pret = date !== null && !complet && coordonneesValides && cgv;

  // Pourquoi l'on ne peut pas réserver en ligne, s'il y a une raison.
  // Jamais pendant qu'un paiement est en cours : la demande est sur le
  // téléphone du client, l'horloge n'y change plus rien.
  const empechement = attente
    ? null
    : !ouvert
      ? {
          pastille: "Bientôt",
          titre: `Réservations en ligne dès le ${jourOuverturePadel(reglages)}`,
          texte:
            `Padel bike ouvre officiellement le ${jourOuverturePadel(reglages)} : la réservation en ligne ` +
            "s'ouvrira ici ce jour-là. D'ici là, écrivez-nous sur WhatsApp pour réserver votre sortie.",
        }
      : !ouvertEnLigne
        ? {
            pastille: "Complet pour le moment",
            titre: "La réservation en ligne est fermée pour le moment",
            texte: "Écrivez-nous sur WhatsApp : nous trouvons un créneau avec vous.",
          }
        : jours.length === 0
          ? {
              // Padel bike part les jours que l'équipe programme : aucun pour
              // l'instant, ou plus aucun qui se réserve encore.
              pastille: "Bientôt",
              titre: "Les prochaines dates arrivent bientôt",
              texte:
                "Aucun départ de Padel bike n'est ouvert à la réservation pour le moment. Écrivez-nous sur WhatsApp : nous vous disons quand part le prochain.",
            }
          : null;

  if (empechement) {
    return (
      <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
        <p className="inline-block rounded-[var(--radius-bouton)] bg-noir-piste px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-craie">
          {empechement.pastille}
        </p>
        <h2 className="titre-editorial mt-4 text-[1.6rem]">{empechement.titre}</h2>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-gris-cadre">{empechement.texte}</p>
        <BoutonLien
          href={lienWhatsApp(MESSAGES_WHATSAPP.padelBike)}
          target="_blank"
          rel="noreferrer noopener"
          variante="sombre"
          taille="lg"
          className="mt-6"
        >
          Écrire sur WhatsApp
        </BoutonLien>
      </div>
    );
  }

  const envoyer = async () => {
    if (!pret || !date) return;
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setMessagePaiement(null);
    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offre: "padel-bike",
          date,
          nombrePersonnes: personnes,
          client: { prenom, nom, email, telephone },
          moyenPaiement: moyen,
          cgvAcceptees: cgv,
          // Le prix et l'horaire que la page a montrés : le serveur refuse si
          // les réglages ont changé depuis, avant toute demande de paiement.
          attendu: { prixXof: reglages.prixXof, depart: reglages.depart, retour: reglages.retour },
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        // Le prix ou l'horaire a changé : la page prend les nouveaux réglages,
        // le client voit le nouveau montant avant de payer de nouveau.
        if (donnees.code === "REGLAGES" && donnees.reglages) setReglages(donnees.reglages as ReglagesPadel);
        // Des vélos viennent d'être pris : le serveur dit combien il en
        // reste ce jour-là.
        if (typeof donnees.places === "number") setLibres({ date, nombre: donnees.places });
        setErreur(
          `${donnees.erreur ?? "La réservation n'a pas pu aboutir."}${
            reponse.status === 409 || reponse.status === 403 ? " Aucun montant n'a été prélevé." : ""
          }`,
        );
        setErreurs(donnees.champs ?? {});
        // Une réservation à son nom attend déjà : « Reprendre ma demande » l'ouvre.
        if (reponse.status === 409 && donnees.code === "EN_ATTENTE" && donnees.reprise) retenirDemande(donnees.reprise);
        return;
      }

      // En démonstration, le serveur a déjà confirmé : rien à payer.
      if (donnees.confirmee) {
        oublierDemande();
        routeur.push(`/reservation/${donnees.token}?nouvelle=1`);
        return;
      }
      // L'onglet garde la demande, pour la reprendre s'il se ferme pendant la
      // validation sur le téléphone (décision 27 : aucun email avant le paiement).
      retenirDemande({
        reference: donnees.reference,
        token: donnees.token,
        expireLe: Date.now() + EXPIRATION_PANIER_MINUTES * 60_000,
      });
      // La demande n'est pas partie sur le téléphone : le suivi dit pourquoi
      // et propose de la relancer, les vélos restant retenus.
      if (!donnees.paiement?.suivi) {
        const motif = diagnostiquer(donnees.paiement?.message, donnees.paiement?.statut).motif;
        routeur.push(`/reservation/${donnees.token}?nouvelle=1&echec=${motif}`);
        return;
      }
      setAttente({
        token: donnees.token,
        paiementId: donnees.paiement.suivi.paiementId,
        moyen: donnees.paiement.suivi.moyen,
        telephone: donnees.paiement.suivi.telephone,
        urlCheckout: donnees.paiement.suivi.urlCheckout,
        // Le total enregistré par le serveur, frais de l'opérateur compris :
        // l'écran d'attente ne bouge plus, même si l'horloge de la page avance.
        montantXof:
          typeof donnees.totalXof === "number" ? donnees.totalXof + fraisEncaissement(donnees.totalXof) : debite,
      });
    } catch {
      setErreur("Connexion interrompue. Vérifiez votre réseau et réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const joursAffiches = tousLesJours ? jours : jours.slice(0, JOURS_VISIBLES);

  return (
    <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
      <h2 className="titre-editorial text-[1.6rem]">Je réserve ma sortie</h2>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-gris-cadre">
        {formatXof(reglages.prixXof)} par personne, le vélo et {formatDureeHeures(reglages.dureePadelHeures)} de
        padel compris. Départ à {horairePadel(reglages)}, retour des vélos vers {formatHeureMinute(reglages.retour)}
        &nbsp;: choisissez votre jour, un vélo est attribué à chacun.
      </p>

      {attente ? (
        <>
          <SuiviPaiementMomo
            token={attente.token}
            paiementId={attente.paiementId}
            moyen={attente.moyen}
            telephone={attente.telephone}
            montantXof={attente.montantXof}
            expiration="La demande de paiement a expiré et les vélos ne sont plus retenus. Rechargez cette page pour réserver de nouveau."
            urlCheckout={attente.urlCheckout}
            onConfirme={() => {
              oublierDemande();
              routeur.push(`/reservation/${attente.token}?nouvelle=1`);
            }}
            onEchec={(texte) => setMessagePaiement(texte)}
          />
          {messagePaiement && (
            <p role="alert" className="mt-4 rounded-[var(--radius-carte)] bg-craie px-5 py-4 text-[0.88rem] leading-relaxed text-orange-sourd">
              {messagePaiement}
            </p>
          )}
          <p className="mt-4 text-[0.85rem] leading-relaxed text-gris-cadre">
            Vos vélos restent retenus {EXPIRATION_PANIER_MINUTES} minutes. Si la demande n&apos;arrive
            pas, relancez-la depuis{" "}
            <a href={`/reservation/${attente.token}`} className="lien-souligne cible-elargie font-semibold">
              votre page de suivi
            </a>
            . Nous vous écrivons par email dès que le paiement est validé.
          </p>
        </>
      ) : (
        <form
          className="mt-6"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            if (pret && !envoi) void envoyer();
          }}
          noValidate
        >
          {/* Une demande de cet onglet attend encore son paiement. */}
          <RepriseDemande className="mb-6" />
          {/* Le jour d'abord : la sortie part à heure fixe, les vélos libres
              se comptent pour ce jour-là. Un jour fermé reste visible. */}
          <fieldset>
            <legend className="etiquette opacity-75">Votre jour</legend>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {joursAffiches.map((jour) => {
                const actif = date === jour;
                const ferme = joursFermes.includes(jour);
                return (
                  <label
                    key={jour}
                    className={`grid min-h-14 place-items-center rounded-[var(--radius-bouton)] border px-2 py-2 text-center text-[0.86rem] font-semibold leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-noir-piste ${
                      actif
                        ? "border-orange-signal bg-orange-signal/12"
                        : ferme
                          ? "cursor-not-allowed border-noir-piste/10 bg-craie opacity-55"
                          : "cursor-pointer border-noir-piste/15 bg-craie"
                    }`}
                  >
                    <input
                      type="radio"
                      name="padel-jour"
                      value={jour}
                      checked={actif}
                      disabled={ferme}
                      onChange={() => setChoix(jour)}
                      className="sr-only"
                    />
                    <span className="first-letter:uppercase">{formatteurPastille.format(new Date(`${jour}T12:00:00Z`))}</span>
                    {ferme && <span className="block text-[0.72rem] font-normal text-orange-sourd">Complet</span>}
                  </label>
                );
              })}
            </div>
            {jours.length > JOURS_VISIBLES && (
              <button
                type="button"
                onClick={() => setTousLesJours(!tousLesJours)}
                className="lien-souligne cible-elargie mt-3 text-[0.85rem] font-semibold"
              >
                {tousLesJours ? "Moins de dates" : "Voir les dates suivantes"}
              </button>
            )}
            <p className="mt-2 text-[0.8rem] text-gris-cadre">
              Départ à {horairePadel(reglages)}. On réserve en ligne {delaiPadelEnClair(reglages)}.
            </p>
            {erreurs.date && <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreurs.date}</p>}
          </fieldset>

          <div className="mt-6">
            <label htmlFor="padel-personnes" className="etiquette opacity-75">
              Nombre de personnes
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNombre(Math.max(reglages.personnesMin, personnes - 1))}
                disabled={complet || personnes <= reglages.personnesMin}
                aria-label="Une personne de moins"
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                −
              </button>
              <output
                id="padel-personnes"
                aria-live="polite"
                className="min-w-[7.5rem] text-center font-display text-[1.2rem] font-bold tabular-nums"
              >
                {personnes} personne{personnes > 1 ? "s" : ""}
              </output>
              <button
                type="button"
                onClick={() => setNombre(Math.min(plafond, personnes + 1))}
                disabled={complet || personnes >= plafond}
                aria-label="Une personne de plus"
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                +
              </button>
            </div>
            <p className={`mt-1.5 text-[0.8rem] ${complet ? "text-orange-sourd" : "text-gris-cadre"}`}>
              {complet
                ? `Pas assez de vélos libres ce jour-là pour ${reglages.personnesMin} personnes : choisissez un autre jour.`
                : libresCeJour !== null
                  ? `De ${reglages.personnesMin} à ${plafond} personnes : ${libresCeJour} vélo${libresCeJour > 1 ? "s" : ""} libre${libresCeJour > 1 ? "s" : ""} ce jour-là, un par personne.`
                  : `De ${reglages.personnesMin} à ${reglages.personnesMax} personnes, un vélo par personne, d'un seul paiement.`}
            </p>
            {erreurs.nombrePersonnes && (
              <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
            )}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Champ id="padel-prenom" libelle="Prénom" valeur={prenom} onChange={setPrenom} erreur={erreurs["client.prenom"]} autoComplete="given-name" />
            <Champ id="padel-nom" libelle="Nom" valeur={nom} onChange={setNom} erreur={erreurs["client.nom"]} autoComplete="family-name" />
            <Champ
              id="padel-email"
              libelle="Adresse email"
              type="email"
              valeur={email}
              onChange={setEmail}
              erreur={erreurs["client.email"]}
              autoComplete="email"
              aide="Votre confirmation et la facture y sont envoyées."
            />
            <Champ
              id="padel-telephone"
              libelle="Numéro Mobile Money"
              type="tel"
              valeur={telephone}
              onChange={setTelephone}
              erreur={erreurs["client.telephone"]}
              autoComplete="tel"
              aide="La demande de paiement part sur ce numéro."
            />
          </div>

          <fieldset className="mt-6">
            <legend className="etiquette opacity-75">Moyen de paiement</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {moyensDisponibles.map((option) => {
                const actif = moyen === option.code;
                return (
                  <label
                    key={option.code}
                    className={`cursor-pointer rounded-[var(--radius-bouton)] border p-4 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-noir-piste ${
                      actif ? "border-orange-signal bg-orange-signal/12" : "border-noir-piste/15 bg-craie"
                    }`}
                  >
                    <input
                      type="radio"
                      name="padel-moyen"
                      value={option.code}
                      checked={actif}
                      onChange={() => setMoyen(option.code)}
                      className="sr-only"
                    />
                    <span className="block font-semibold">{option.libelle}</span>
                    <span className={`mt-1 block text-[0.78rem] ${actif ? "text-noir-piste/80" : "text-gris-cadre"}`}>
                      {option.detail}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Ce qui sera réellement débité : SasPay ajoute sa commission, comme
              dans le tunnel. Mieux vaut le dire que le laisser découvrir. */}
          <dl className="mt-6 rounded-[var(--radius-carte)] bg-craie p-5 text-[0.88rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-gris-cadre">
                Padel bike{date ? `, ${formatDateAvecJour(date)} à ${horairePadel(reglages)}` : ""}, {personnes}
                &nbsp;personne{personnes > 1 ? "s" : ""}
              </dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatXof(total)}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-gris-cadre">
                Frais Mobile Money
                <span className="block text-[0.76rem] opacity-75">
                  {(TAUX_ENCAISSEMENT * 100).toLocaleString("fr-FR")} %, prélevés par l&apos;opérateur de
                  paiement
                </span>
              </dt>
              <dd className="shrink-0 whitespace-nowrap tabular-nums">+ {formatXof(fraisEncaissement(total))}</dd>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-noir-piste/12 pt-3">
              <dt className="font-semibold">Débité de votre compte</dt>
              <dd className="shrink-0 whitespace-nowrap font-display text-[1.2rem] font-extrabold tabular-nums">{formatXof(debite)}</dd>
            </div>
          </dl>

          <label className="mt-6 flex cursor-pointer items-start gap-3 text-[0.9rem] leading-relaxed">
            <input
              type="checkbox"
              checked={cgv}
              onChange={(evenement) => setCgv(evenement.target.checked)}
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
          {erreurs.cgvAcceptees && (
            <p className="mt-2 text-[0.82rem] text-orange-sourd">{erreurs.cgvAcceptees}</p>
          )}

          {erreur && (
            <p
              role="alert"
              className="mt-6 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem] leading-relaxed"
            >
              {erreur}
            </p>
          )}

          <Bouton
            type="submit"
            variante="sombre"
            taille="lg"
            className="mt-6 w-full sm:w-auto"
            disabled={!pret || envoi}
          >
            {envoi ? "Envoi de la demande…" : `Payer ${formatXof(debite)}`}
          </Bouton>
          {!pret && (
            <p className="mt-3 text-[0.82rem] text-gris-cadre">
              {!date
                ? "Choisissez votre jour pour payer."
                : complet
                  ? "Ce jour est complet : choisissez un autre jour."
                  : !coordonneesValides
                    ? "Prénom, nom, email et numéro Mobile Money sont nécessaires pour payer."
                    : "Acceptez les conditions générales pour payer."}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  onChange,
  type = "text",
  erreur,
  aide,
  autoComplete,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  type?: string;
  erreur?: string;
  aide?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="etiquette opacity-75">
        {libelle}
        <span className="text-orange-sourd"> *</span>
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        required
        autoComplete={autoComplete}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur` : aide ? `${id}-aide` : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-noir-piste ${
          erreur ? "border-orange-signal" : "border-noir-piste/15"
        }`}
      />
      {erreur ? (
        <p id={`${id}-erreur`} className="mt-1.5 text-[0.8rem] text-orange-sourd">
          {erreur}
        </p>
      ) : aide ? (
        <p id={`${id}-aide`} className="mt-1.5 text-[0.8rem] text-gris-cadre">
          {aide}
        </p>
      ) : null}
    </div>
  );
}
