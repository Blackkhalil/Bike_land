"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Bouton, BoutonLien } from "@/components/Bouton";
import { clotureInscriptionsOctobreRose, departOctobreRose } from "@/data/octobre-rose";
import { inscriptionsOctobreRoseOuvertes, MESSAGES_WHATSAPP, placesRestantes } from "@/data/produits";
import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { formatXof } from "@/lib/format";
import { fraisEncaissement, moyensDisponibles, TAUX_ENCAISSEMENT } from "@/lib/tarifs-paiement";
import { lienWhatsApp } from "@/lib/site";
import type { MoyenPaiement } from "@/lib/types";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";

/**
 * L'horloge de la page : elle se met à jour d'elle-même à l'heure limite
 * des inscriptions, puis au départ du groupe, sans être rechargée.
 */
function abonnementHorloge(rappel: () => void) {
  const minuteurs = [clotureInscriptionsOctobreRose(), departOctobreRose()]
    .filter((instant): instant is number => instant !== null)
    .map((instant) => instant - new Date().getTime() + 1000)
    .filter((delai) => delai > 0 && delai < 2 ** 31 - 1)
    .map((delai) => setTimeout(rappel, delai));
  return () => minuteurs.forEach((minuteur) => clearTimeout(minuteur));
}

/** Le groupe est-il parti ? */
function apresLeDepart(): boolean {
  const depart = departOctobreRose();
  return depart !== null && new Date().getTime() >= depart;
}



/**
 * L'inscription à Octobre rose : on clique, on paie.
 *
 * Pas de vélo à choisir ni de date : la sortie est fixée, et le serveur
 * attribue un vélo libre à chaque participant. Le client dit combien ils
 * sont et qui il est, choisit son opérateur, et la demande de paiement part
 * sur son téléphone. La suite est celle du tunnel : la page attend la
 * validation, puis mène au suivi de la réservation, et l'email de
 * confirmation, aux couleurs d'Octobre rose, part avec la facture.
 *
 * La page est mise en cache : l'heure limite des inscriptions est donc
 * relue dans le navigateur, et le serveur refait tous les contrôles.
 */
export function InscriptionOctobreRose({
  prixXof,
  placesInitiales,
  placesEnAttente,
  maxParInscription,
  ouvertAuServeur,
  partiAuServeur,
  ouvertEnLigne,
}: {
  /** Prix d'une place, en ligne. */
  prixXof: number;
  /** Les vélos libres sur la sortie au moment du rendu. */
  placesInitiales: number;
  /** Les vélos retenus par des inscriptions qui attendent leur paiement. */
  placesEnAttente: number;
  maxParInscription: number;
  /** L'heure limite des inscriptions n'était pas passée au rendu. */
  ouvertAuServeur: boolean;
  /** Le groupe était déjà parti au rendu. */
  partiAuServeur: boolean;
  /** L'inscription n'est pas fermée (« Sold out ») depuis le tableau de bord. */
  ouvertEnLigne: boolean;
}) {
  const routeur = useRouter();
  const ouvertes = useSyncExternalStore(
    abonnementHorloge,
    () => inscriptionsOctobreRoseOuvertes(new Date()),
    () => ouvertAuServeur,
  );
  const partie = useSyncExternalStore(abonnementHorloge, apresLeDepart, () => partiAuServeur);

  const [places, setPlaces] = useState(placesInitiales);
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

  const maximum = Math.max(1, Math.min(maxParInscription, places));
  const personnes = Math.min(nombre, maximum);
  const total = prixXof * personnes;
  const debite = total + fraisEncaissement(total);

  const coordonneesValides =
    prenom.trim().length >= 2 &&
    nom.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^[+0-9 ().-]{8,20}$/.test(telephone.trim());

  // Pourquoi l'on ne peut pas s'inscrire, s'il y a une raison. Jamais pendant
  // qu'un paiement est en cours : la demande est sur le téléphone du client,
  // l'heure limite ou les places n'y changent plus rien.
  const empechement = attente
    ? null
    : partie
      ? {
          pastille: "Merci",
          titre: "La sortie a eu lieu",
          texte: "Merci à toutes celles et à tous ceux qui ont roulé en rose avec nous. Rendez-vous l'an prochain !",
          whatsapp: false,
        }
      : !ouvertes
        ? {
            pastille: "Inscriptions closes",
            titre: "Les inscriptions en ligne sont closes",
            texte: "Il reste peut-être un vélo : écrivez-nous sur WhatsApp avant le rassemblement.",
            whatsapp: true,
          }
        : !ouvertEnLigne || (places === 0 && placesEnAttente === 0)
          ? {
              pastille: "Sold out",
              titre: "Toutes les places sont prises",
              texte: "Écrivez-nous sur WhatsApp : si une place se libère, nous vous la gardons.",
              whatsapp: true,
            }
          : places === 0
            ? {
                pastille: "Complet pour le moment",
                titre: "Les dernières places attendent leur paiement",
                texte: `Celles qui ne seront pas payées se libèrent d'ici ${EXPIRATION_PANIER_MINUTES} minutes. Revenez un peu plus tard, ou écrivez-nous sur WhatsApp.`,
                whatsapp: true,
              }
            : null;

  if (empechement) {
    return (
      <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
        <p
          className="inline-block rounded-[var(--radius-bouton)] bg-noir-piste px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-craie"
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
          nombrePersonnes: personnes,
          client: { prenom, nom, email, telephone },
          moyenPaiement: moyen,
          cgvAcceptees: cgv,
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        // Des places viennent d'être prises : le serveur dit combien il en reste.
        if (typeof donnees.places === "number") setPlaces(donnees.places);
        setErreur(
          `${donnees.erreur ?? "L'inscription n'a pas pu aboutir."}${
            reponse.status === 409 || reponse.status === 403 ? " Aucun montant n'a été prélevé." : ""
          }`,
        );
        setErreurs(donnees.champs ?? {});
        return;
      }

      // En démonstration, le serveur a déjà confirmé : rien à payer.
      if (donnees.confirmee) {
        routeur.push(`/reservation/${donnees.token}?nouvelle=1`);
        return;
      }
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
        {formatXof(prixXof)} par personne, quel que soit le vélo : rien à choisir, un vélo vous est
        attribué. {placesRestantes(places)}
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
            onConfirme={() => routeur.push(`/reservation/${attente.token}?nouvelle=1`)}
            onEchec={(texte) => setMessagePaiement(texte)}
          />
          {messagePaiement && (
            <p role="alert" className="mt-4 rounded-[var(--radius-carte)] bg-craie px-5 py-4 text-[0.88rem] leading-relaxed text-orange-sourd">
              {messagePaiement}
            </p>
          )}
          <p className="mt-4 text-[0.85rem] leading-relaxed text-gris-cadre">
            Vos places restent retenues {EXPIRATION_PANIER_MINUTES} minutes. Si la demande n&apos;arrive
            pas, vous pourrez la relancer depuis le lien reçu par email.
          </p>
        </>
      ) : (
        <form
          className="mt-6"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            if (cgv && coordonneesValides && !envoi) void envoyer();
          }}
          noValidate
        >
          <div>
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
              aide="Votre confirmation, la facture et l'itinéraire y sont envoyés."
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
                Octobre rose, {personnes} personne{personnes > 1 ? "s" : ""}
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

          <Bouton type="submit" variante="sombre" taille="lg" className="mt-6 w-full sm:w-auto" disabled={!cgv || !coordonneesValides || envoi}>
            {envoi ? "Envoi de la demande…" : `Payer ${formatXof(debite)}`}
          </Bouton>
          {(!coordonneesValides || !cgv) && (
            <p className="mt-3 text-[0.82rem] text-gris-cadre">
              {!coordonneesValides
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
