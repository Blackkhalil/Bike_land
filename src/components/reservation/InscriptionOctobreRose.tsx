"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Bouton, BoutonLien } from "@/components/Bouton";
import {
  clotureInscriptionsOctobreRose,
  departOctobreRose,
  formatHoraire,
  inscriptionOctobreRoseOuverte,
  OCTOBRE_ROSE,
  sortieOctobreRoseDu,
  sortieOctobreRosePartie,
  type SortieOctobreRose,
} from "@/data/octobre-rose";
import {
  horaireDeLaSortie,
  jourDeLaSortie,
  MESSAGES_WHATSAPP,
  placesRestantes,
} from "@/data/produits";
import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import type { DateISO } from "@/lib/dates";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { fraisEncaissement, moyensDisponibles, TAUX_ENCAISSEMENT } from "@/lib/tarifs-paiement";
import { lienWhatsApp } from "@/lib/site";
import type { MoyenPaiement } from "@/lib/types";
import { oublierDemande, retenirDemande } from "@/lib/demande-en-attente";
import { RepriseDemande } from "./RepriseDemande";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";

/**
 * L'horloge de la page : elle se met à jour d'elle-même à l'heure limite
 * des inscriptions de chaque jour, puis au départ de chaque groupe, sans
 * être rechargée. Le minuteur suivant se pose quand le précédent sonne.
 */
function abonnementHorloge(rappel: () => void) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const programmer = () => {
    const maintenant = new Date().getTime();
    const prochain = OCTOBRE_ROSE.sorties
      .flatMap((sortie) => [clotureInscriptionsOctobreRose(sortie), departOctobreRose(sortie)])
      .filter((instant) => instant > maintenant)
      .sort((a, b) => a - b)[0];
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
}

/**
 * L'état de chaque jour à l'horloge, en une chaîne comparable d'un rendu à
 * l'autre : « o » inscriptions ouvertes ou « f » closes, puis « p » groupe
 * parti ou « - ».
 */
function horlogeDesJours(dates: DateISO[], maintenant: number): string {
  return dates
    .map((date) => {
      const sortie = sortieOctobreRoseDu(date);
      if (!sortie) return "fp";
      return (
        (inscriptionOctobreRoseOuverte(sortie, maintenant) ? "o" : "f") +
        (sortieOctobreRosePartie(sortie, maintenant) ? "p" : "-")
      );
    })
    .join(",");
}

/** Un jour de sortie, tel que le serveur l'a vu au rendu de la page. */
export interface JourInscription {
  /** AAAA-MM-JJ : une sortie de src/data/octobre-rose.ts. */
  date: DateISO;
  /** Les vélos libres ce jour-là, au rendu. */
  places: number;
  /** Les vélos retenus par des inscriptions qui attendent leur paiement. */
  placesEnAttente: number;
  /** Le jour n'est pas fermé (« Sold out ») depuis le tableau de bord. */
  ouvertEnLigne: boolean;
}

/**
 * L'inscription à Octobre rose : on choisit son jour, on paie.
 *
 * Pas de vélo à choisir : le serveur attribue un vélo libre à chaque
 * participant, ce jour-là. Le client choisit son jour, dit combien ils sont
 * et qui il est, choisit son opérateur, et la demande de paiement part sur
 * son téléphone. La suite est celle du tunnel : la page attend la
 * validation, puis mène au suivi de la réservation, et l'email de
 * confirmation, aux couleurs d'Octobre rose, part avec la facture.
 *
 * Avec plusieurs jours ouverts, aucun n'est choisi d'avance : un samedi pris
 * par erreur pour un dimanche ferait venir quelqu'un le mauvais jour.
 *
 * La page est mise en cache : les heures limites sont donc relues dans le
 * navigateur, et le serveur refait tous les contrôles.
 */
export function InscriptionOctobreRose({
  jours,
  maxParInscription,
  maintenantAuServeur,
}: {
  /** Les jours de la campagne, dans l'ordre. */
  jours: JourInscription[];
  maxParInscription: number;
  /** L'instant du rendu côté serveur : l'horloge s'hydrate dessus. */
  maintenantAuServeur: number;
}) {
  const routeur = useRouter();
  const dates = jours.map((jour) => jour.date);
  const horloge = useSyncExternalStore(
    abonnementHorloge,
    () => horlogeDesJours(dates, new Date().getTime()),
    () => horlogeDesJours(dates, maintenantAuServeur),
  ).split(",");

  const [placesParJour, setPlacesParJour] = useState<Record<string, number>>(() =>
    Object.fromEntries(jours.map((jour) => [jour.date, jour.places])),
  );
  const [choix, setChoix] = useState<DateISO | null>(null);
  const [nombre, setNombre] = useState(1);
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
  // Inscription créée, demande poussée sur le téléphone : on ne recrée
  // surtout rien, les vélos sont déjà retenus.
  const [attente, setAttente] = useState<{
    token: string;
    paiementId: string;
    moyen: MoyenPaiement;
    telephone: string;
    urlCheckout?: string;
  } | null>(null);

  // Chaque jour, avec ce qui l'empêche d'être choisi s'il y a quelque chose.
  const etats = jours.flatMap((jour, index) => {
    const sortie = sortieOctobreRoseDu(jour.date);
    if (!sortie) return [];
    const [clos, parti] = horloge[index] ?? "fp";
    const places = placesParJour[jour.date] ?? jour.places;
    const motif =
      parti === "p"
        ? "Sortie passée"
        : clos !== "o"
          ? "Inscriptions closes"
          : !jour.ouvertEnLigne
            ? "Sold out"
            : places === 0
              ? jour.placesEnAttente > 0
                ? "Complet pour le moment"
                : "Complet"
              : null;
    return [{ ...jour, sortie, places, ouvertALHeure: clos === "o", parti: parti === "p", motif }];
  });
  const aVenir = etats.filter((etat) => !etat.parti);
  const choisissables = etats.filter((etat) => etat.motif === null);
  // Un seul jour possible : il est choisi d'office. Un jour choisi qui ne
  // l'est plus (heure limite passée entre-temps) est à rechoisir.
  const jourChoisi =
    choisissables.length === 1
      ? choisissables[0]
      : (choisissables.find((etat) => etat.date === choix) ?? null);
  const sortieChoisie: SortieOctobreRose | null = jourChoisi?.sortie ?? null;
  const prixXof = sortieChoisie?.prixXof ?? Math.min(...etats.map((etat) => etat.sortie.prixXof));

  const maximum = Math.max(1, Math.min(maxParInscription, jourChoisi?.places ?? maxParInscription));
  const personnes = Math.min(nombre, maximum);
  const total = prixXof * personnes;
  const debite = total + fraisEncaissement(total);

  const coordonneesValides =
    prenom.trim().length >= 2 &&
    nom.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^[+0-9 ().-]{8,20}$/.test(telephone.trim());

  // Pourquoi l'on ne peut s'inscrire à aucun jour, s'il y a une raison.
  // Jamais pendant qu'un paiement est en cours : la demande est sur le
  // téléphone du client, l'heure limite ou les places n'y changent plus rien.
  // Tant qu'un jour reste possible, le formulaire s'affiche, et les jours
  // impossibles y disent pourquoi.
  const ouvertsALHeure = aVenir.filter((etat) => etat.ouvertALHeure);
  const empechement =
    attente || choisissables.length > 0
      ? null
      : aVenir.length === 0
        ? {
            pastille: "Merci",
            titre: "La sortie a eu lieu",
            texte: "Merci à toutes celles et à tous ceux qui ont roulé en rose avec nous. Rendez-vous l'an prochain !",
            whatsapp: false,
          }
        : ouvertsALHeure.length === 0
          ? {
              pastille: "Inscriptions closes",
              titre: "Les inscriptions en ligne sont closes",
              texte: "Il reste peut-être un vélo : écrivez-nous sur WhatsApp avant le rassemblement.",
              whatsapp: true,
            }
          : ouvertsALHeure.some((etat) => etat.motif === "Complet pour le moment")
            ? {
                pastille: "Complet pour le moment",
                titre: "Les dernières places attendent leur paiement",
                texte: `Celles qui ne seront pas payées se libèrent d'ici ${EXPIRATION_PANIER_MINUTES} minutes. Revenez un peu plus tard, ou écrivez-nous sur WhatsApp.`,
                whatsapp: true,
              }
            : {
                pastille: "Sold out",
                titre: "Toutes les places sont prises",
                texte: "Écrivez-nous sur WhatsApp : si une place se libère, nous vous la gardons.",
                whatsapp: true,
              };

  if (empechement) {
    return (
      <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
        <p
          className="inline-block rounded-[var(--radius-bouton)] bg-noir-piste px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-craie"
          lang={empechement.pastille === "Sold out" ? "en" : undefined}
        >
          {empechement.pastille}
        </p>
        <h2 className="titre-editorial mt-4 text-[1.6rem]">{empechement.titre}</h2>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-gris-cadre">{empechement.texte}</p>
        {empechement.whatsapp && (
          <BoutonLien
            href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
            target="_blank"
            rel="noreferrer noopener"
            variante="sombre"
            taille="lg"
            className="mt-6"
          >
            Écrire sur WhatsApp
          </BoutonLien>
        )}
      </div>
    );
  }

  const envoyer = async () => {
    if (!jourChoisi) return;
    const date = jourChoisi.date;
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setMessagePaiement(null);
    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offre: "octobre-rose",
          date,
          nombrePersonnes: personnes,
          client: { prenom, nom, email, telephone },
          moyenPaiement: moyen,
          cgvAcceptees: cgv,
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        // Des places viennent d'être prises : le serveur dit combien il en
        // reste ce jour-là.
        if (typeof donnees.places === "number") {
          setPlacesParJour((avant) => ({ ...avant, [date]: donnees.places }));
        }
        setErreur(
          `${donnees.erreur ?? "L'inscription n'a pas pu aboutir."}${
            reponse.status === 409 || reponse.status === 403 ? " Aucun montant n'a été prélevé." : ""
          }`,
        );
        setErreurs(donnees.champs ?? {});
        // Une inscription à son nom attend déjà : « Reprendre ma demande » l'ouvre.
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
      });
    } catch {
      setErreur("Connexion interrompue. Vérifiez votre réseau et réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
      <h2 className="titre-editorial text-[1.6rem]">Je réserve ma place</h2>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-gris-cadre">
        {formatXof(prixXof)} par personne, quel que soit le vélo&nbsp;: choisissez votre jour, un vélo
        vous est attribué.
      </p>

      {attente ? (
        <>
          <SuiviPaiementMomo
            token={attente.token}
            paiementId={attente.paiementId}
            moyen={attente.moyen}
            telephone={attente.telephone}
            montantXof={debite}
            expiration="La demande de paiement a expiré et vos places ne sont plus retenues. Rechargez cette page pour vous inscrire de nouveau."
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
            Vos places restent retenues {EXPIRATION_PANIER_MINUTES} minutes. Si la demande n&apos;arrive
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
            if (jourChoisi && cgv && coordonneesValides && !envoi) void envoyer();
          }}
          noValidate
        >
          {/* Une demande de cet onglet attend encore son paiement. */}
          <RepriseDemande className="mb-6" />
          {/* Le jour d'abord : c'est lui qui fixe les places et le vélo
              attribué. Un jour impossible reste visible, avec sa raison. */}
          <fieldset>
            <legend className="etiquette opacity-75">Votre jour</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {aVenir.map((etat) => {
                const actif = jourChoisi?.date === etat.date;
                const possible = etat.motif === null;
                return (
                  <label
                    key={etat.date}
                    className={`rounded-[var(--radius-bouton)] border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-noir-piste ${
                      actif
                        ? "border-rose-octobre bg-rose-octobre/15"
                        : possible
                          ? "cursor-pointer border-noir-piste/15 bg-craie"
                          : "cursor-not-allowed border-noir-piste/10 bg-craie opacity-60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rose-jour"
                      id={`rose-jour-${etat.date}`}
                      value={etat.date}
                      checked={actif}
                      disabled={!possible}
                      onChange={() => setChoix(etat.date)}
                      className="sr-only"
                    />
                    <span className="block font-semibold">{jourDeLaSortie(etat.sortie)}</span>
                    <span className="mt-0.5 block text-[0.85rem]">
                      {horaireDeLaSortie(etat.sortie)}, rassemblement à {formatHoraire(etat.sortie.rassemblement)}
                    </span>
                    <span
                      className={`mt-1.5 block text-[0.8rem] font-semibold ${possible ? "text-noir-piste/75" : "text-orange-sourd"}`}
                      lang={etat.motif === "Sold out" ? "en" : undefined}
                    >
                      {etat.motif ?? placesRestantes(etat.places)}
                    </span>
                  </label>
                );
              })}
            </div>
            {erreurs.date && <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreurs.date}</p>}
          </fieldset>

          <div className="mt-6">
            <label htmlFor="rose-personnes" className="etiquette opacity-75">
              Nombre de personnes
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNombre(Math.max(1, personnes - 1))}
                disabled={personnes <= 1}
                aria-label="Une personne de moins"
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                −
              </button>
              <output
                id="rose-personnes"
                aria-live="polite"
                className="min-w-[7.5rem] text-center font-display text-[1.2rem] font-bold tabular-nums"
              >
                {personnes} personne{personnes > 1 ? "s" : ""}
              </output>
              <button
                type="button"
                onClick={() => setNombre(Math.min(maximum, personnes + 1))}
                disabled={personnes >= maximum}
                aria-label="Une personne de plus"
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[1.2rem] font-semibold disabled:opacity-35"
              >
                +
              </button>
            </div>
            <p className="mt-1.5 text-[0.8rem] text-gris-cadre">
              Vous inscrivez vos proches d&apos;un seul paiement, {maxParInscription} personnes au plus.
            </p>
            {erreurs.nombrePersonnes && (
              <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
            )}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Champ id="rose-prenom" libelle="Prénom" valeur={prenom} onChange={setPrenom} erreur={erreurs["client.prenom"]} autoComplete="given-name" />
            <Champ id="rose-nom" libelle="Nom" valeur={nom} onChange={setNom} erreur={erreurs["client.nom"]} autoComplete="family-name" />
            <Champ
              id="rose-email"
              libelle="Adresse email"
              type="email"
              valeur={email}
              onChange={setEmail}
              erreur={erreurs["client.email"]}
              autoComplete="email"
              aide="Votre confirmation et la facture y sont envoyées."
            />
            <Champ
              id="rose-telephone"
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
                      actif ? "border-rose-octobre bg-rose-octobre/15" : "border-noir-piste/15 bg-craie"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rose-moyen"
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
                Octobre rose{jourChoisi ? `, ${formatDateAvecJour(jourChoisi.date)}` : ""},{" "}
                {personnes}&nbsp;personne{personnes > 1 ? "s" : ""}
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
              className="mt-1 h-4 w-4 shrink-0 accent-[#e8458b]"
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
            disabled={!jourChoisi || !cgv || !coordonneesValides || envoi}
          >
            {envoi ? "Envoi de la demande…" : `Payer ${formatXof(debite)}`}
          </Bouton>
          {(!jourChoisi || !coordonneesValides || !cgv) && (
            <p className="mt-3 text-[0.82rem] text-gris-cadre">
              {!jourChoisi
                ? "Choisissez votre jour pour payer."
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
