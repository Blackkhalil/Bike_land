"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import { EXIGENCES, GRILLE_HORAIRE, OFFRES, PRIX_ROAD_TRIP_XOF } from "@/data/offres";
import type { DateISO } from "@/lib/dates";
import { formatDate, formatXof } from "@/lib/format";
import { moyensDisponibles } from "@/lib/paiement";
import { calculerDevis } from "@/lib/tarification";
import type { CodeOffre, MoyenPaiement, PointDeRetrait, Velo } from "@/lib/types";

/**
 * Tunnel de réservation en trois étapes (§2.1).
 *
 * Le principe du cahier des charges est respecté à la lettre : aucun compte
 * n'est créé, et les coordonnées comme le moyen de paiement ne sont demandés
 * qu'à la dernière étape, une fois le prix connu.
 */

type Etape = 1 | 2 | 3;

const etapes: { numero: Etape; titre: string }[] = [
  { numero: 1, titre: "Votre location" },
  { numero: 2, titre: "Vos coordonnées" },
  { numero: 3, titre: "Paiement" },
];

interface Props {
  velo: Velo;
  offre: CodeOffre;
  dureeHeures: number;
  nombrePersonnes: number;
  point?: PointDeRetrait;
  dateDebut: DateISO;
  dateFin: DateISO;
  optionsInitiales: string[];
}

export function TunnelReservation({
  velo,
  offre: offreInitiale,
  dureeHeures: dureeInitiale,
  nombrePersonnes: personnesInitiales,
  point,
  dateDebut,
  dateFin,
  optionsInitiales,
}: Props) {
  const routeur = useRouter();
  const [etape, setEtape] = useState<Etape>(1);

  // La formule se choisit ici, et non sur la fiche vélo : c'est elle qui
  // commande le prix, la caution et ce qu'il faudra présenter au départ.
  // La fiche vélo ne demande que la date.
  const [offre, setOffre] = useState<CodeOffre>(offreInitiale);
  const [dureeHeures, setDureeHeures] = useState(dureeInitiale);
  const [nombrePersonnes, setNombrePersonnes] = useState(personnesInitiales);
  const [optionsChoisies, setOptionsChoisies] = useState<string[]>(optionsInitiales);

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [message, setMessage] = useState("");
  const [moyenPaiement, setMoyenPaiement] = useState<MoyenPaiement>("MTN_MONEY");
  const [cgv, setCgv] = useState(false);

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [erreursChamps, setErreursChamps] = useState<Record<string, string>>({});

  const devis = useMemo(
    () =>
      calculerDevis({
        offre,
        nombrePersonnes,
        dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
        options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
      }),
    [offre, nombrePersonnes, dureeHeures, optionsChoisies],
  );

  const basculerOption = (code: string) =>
    setOptionsChoisies((actuelles) =>
      actuelles.includes(code) ? actuelles.filter((c) => c !== code) : [...actuelles, code],
    );

  const coordonneesValides =
    prenom.trim().length >= 2 && nom.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email.trim());

  const envoyer = async () => {
    setEnvoiEnCours(true);
    setErreurGlobale(null);
    setErreursChamps({});

    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veloId: velo.id,
          offre,
          nombrePersonnes,
          dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
          dateDebut,
          dateFin,
          options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
          client: { prenom, nom, email, telephone: telephone || undefined },
          moyenPaiement,
          message: message || undefined,
          cgvAcceptees: cgv,
        }),
      });

      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        if (reponse.status === 409) {
          setErreurGlobale(
            "Ce vélo vient d'être réservé sur ces dates. Revenez au catalogue pour en choisir un autre — aucun montant n'a été prélevé.",
          );
        } else {
          setErreurGlobale(donnees.erreur ?? "La réservation n'a pas pu aboutir.");
          setErreursChamps(donnees.champs ?? {});
          if (donnees.champs && Object.keys(donnees.champs).some((c) => c.startsWith("client"))) {
            setEtape(2);
          }
        }
        return;
      }

      routeur.push(`/reservation/${donnees.token}?nouvelle=1`);
    } catch {
      setErreurGlobale("Connexion interrompue. Vérifiez votre réseau et réessayez.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        {/* Fil des étapes */}
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {etapes.map((item, index) => (
            <li key={item.numero} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => item.numero < etape && setEtape(item.numero)}
                disabled={item.numero >= etape}
                className={`flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-[0.08em] transition-opacity ${
                  item.numero === etape
                    ? "text-noir-piste"
                    : item.numero < etape
                      ? "text-orange-signal hover:opacity-70"
                      : "text-noir-piste/35"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[0.72rem] ${
                    item.numero === etape
                      ? "bg-noir-piste text-craie"
                      : item.numero < etape
                        ? "bg-orange-signal text-noir-piste"
                        : "border border-current"
                  }`}
                >
                  {item.numero < etape ? "✓" : item.numero}
                </span>
                {item.titre}
              </button>
              {index < etapes.length - 1 && (
                <span aria-hidden="true" className="h-px w-6 bg-noir-piste/20 sm:w-10" />
              )}
            </li>
          ))}
        </ol>

        {erreurGlobale && (
          <p
            role="alert"
            className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-noir-releve px-5 py-4 text-[0.9rem] leading-relaxed text-craie"
          >
            {erreurGlobale}
          </p>
        )}

        {/* ---------------------------------------------- Étape 1 : location */}
        {etape === 1 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Votre location</h2>

            <div className="mt-6 flex flex-wrap items-center gap-5 rounded-[var(--radius-carte)] bg-craie p-5">
              <div
                className="grid h-24 w-32 shrink-0 place-items-center rounded-[var(--radius-bouton)] px-2"
                style={{ background: velo.teintes[1] }}
              >
                <VeloIllustration categorie={velo.categorie} teintes={velo.teintes} className="w-full" />
              </div>
              <div className="flex-1">
                <p className="titre-editorial text-[1.35rem]">
                  {velo.nom}
                </p>
                <p className="mt-2 text-[0.85rem]">
                  Le <strong className="font-semibold">{formatDate(dateDebut)}</strong>
                </p>
                <p className="mt-1 text-[0.8rem] text-gris-cadre">
                  Réglé à votre taille au départ.
                </p>
              </div>
              <a
                href={`/velos/${velo.slug}?debut=${dateDebut}&fin=${dateFin}`}
                className="lien-souligne text-[0.82rem] font-semibold text-orange-signal"
              >
                Changer les dates
              </a>
            </div>

            {/* ------------------------------------------- La formule */}
            <fieldset className="mt-8">
              <legend className="titre-editorial text-[1.2rem]">Votre formule</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {OFFRES.map((item) => {
                  const actif = offre === item.code;
                  return (
                    <label
                      key={item.code}
                      className={`flex cursor-pointer flex-col rounded-[var(--radius-carte)] border p-4 transition-colors ${
                        actif
                          ? "border-orange-signal bg-orange-signal/10"
                          : "border-noir-piste/15 bg-white hover:border-noir-piste/40"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{item.nom}</span>
                        <input
                          type="radio"
                          name="offre"
                          checked={actif}
                          onChange={() => setOffre(item.code)}
                          className="sr-only"
                        />
                        <span className="shrink-0 font-display text-[1.1rem] text-orange-sourd">
                          {item.code === "road-trip"
                            ? `${formatXof(PRIX_ROAD_TRIP_XOF)} / pers.`
                            : `dès ${formatXof(GRILLE_HORAIRE[0].prixXof)}`}
                        </span>
                      </span>
                      <span className="mt-2 text-[0.85rem] leading-relaxed text-gris-cadre">
                        {item.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* --------------------------------- Durée ou participants */}
            {offre === "location-libre" ? (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">Combien de temps ?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRILLE_HORAIRE.map((palier) => {
                    const actif = dureeHeures === palier.heures;
                    return (
                      <button
                        key={palier.heures}
                        type="button"
                        onClick={() => setDureeHeures(palier.heures)}
                        aria-pressed={actif}
                        className={`min-h-[44px] flex-1 rounded-[var(--radius-bouton)] border px-3 transition-colors ${
                          actif
                            ? "border-orange-signal bg-orange-signal text-noir-piste"
                            : "border-noir-piste/20 bg-white hover:border-noir-piste/50"
                        }`}
                      >
                        <span className="block font-semibold">{palier.heures} h</span>
                        <span className="block text-[0.72rem] opacity-75">
                          {formatXof(palier.prixXof)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">Combien de personnes ?</legend>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNombrePersonnes((n) => Math.max(1, n - 1))}
                    aria-label="Retirer une personne"
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem]"
                  >
                    −
                  </button>
                  <span className="min-w-[3rem] text-center font-display text-[1.5rem] tabular-nums">
                    {nombrePersonnes}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNombrePersonnes((n) => Math.min(12, n + 1))}
                    aria-label="Ajouter une personne"
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem]"
                  >
                    +
                  </button>
                </div>
              </fieldset>
            )}

            {/* --------------------------------- Ce qu'il faut prévoir */}
            <ul className="mt-7 space-y-2 rounded-[var(--radius-carte)] bg-craie p-5 text-[0.86rem] leading-relaxed text-gris-cadre">
              {EXIGENCES[offre].map((exigence) => (
                <li key={exigence} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-orange-signal">
                    •
                  </span>
                  {exigence}
                </li>
              ))}
            </ul>

            {point && (
              <p className="mt-4 text-[0.88rem] text-gris-cadre">
                Retrait et restitution : <strong className="text-noir-piste">{point.nom}</strong>,{" "}
                {point.adresse}, {point.ville}. {point.horaires}.
              </p>
            )}

            <fieldset className="mt-10">
              <legend className="etiquette opacity-75">Options</legend>
              <div className="mt-4 space-y-3">
                {optionsLocation.map((option) => {
                  const actif = optionsChoisies.includes(option.code);
                  return (
                    <label
                      key={option.code}
                      className={`flex cursor-pointer items-start gap-4 rounded-[var(--radius-bouton)] border p-4 transition-colors ${
                        actif ? "border-orange-signal bg-orange-signal/10" : "border-noir-piste/15 bg-craie"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={() => basculerOption(option.code)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#f25c05]"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold">{option.libelle}</span>
                          <span className="text-[0.85rem] font-semibold text-orange-sourd">
                            {formatXof(option.prixXof)}
                            <span className="font-normal text-gris-cadre">
                              {option.unite === "jour" ? " / jour" : " forfait"}
                            </span>
                          </span>
                        </span>
                        <span className="mt-1 block text-[0.85rem] leading-relaxed text-gris-cadre">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Bouton onClick={() => setEtape(2)} taille="lg" className="mt-8">
              Continuer
            </Bouton>
          </div>
        )}

        {/* ------------------------------------------- Étape 2 : coordonnées */}
        {etape === 2 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Vos coordonnées</h2>
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-gris-cadre">
              Nous n&apos;ouvrons pas de compte. Ces informations servent à préparer votre vélo,
              vous envoyer la facture et vous transmettre votre lien de suivi.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Champ
                libelle="Prénom"
                valeur={prenom}
                onChange={setPrenom}
                erreur={erreursChamps["client.prenom"]}
                autoComplete="given-name"
                obligatoire
              />
              <Champ
                libelle="Nom"
                valeur={nom}
                onChange={setNom}
                erreur={erreursChamps["client.nom"]}
                autoComplete="family-name"
                obligatoire
              />
              <Champ
                libelle="Adresse email"
                type="email"
                valeur={email}
                onChange={setEmail}
                erreur={erreursChamps["client.email"]}
                autoComplete="email"
                aide="Votre facture et votre lien de suivi y sont envoyés."
                obligatoire
              />
              <Champ
                libelle="Téléphone"
                type="tel"
                valeur={telephone}
                onChange={setTelephone}
                erreur={erreursChamps["client.telephone"]}
                autoComplete="tel"
                aide="Pour vous joindre en cas d'imprévu."
              />
            </div>

            <label className="mt-6 block">
              <span className="etiquette opacity-75">Un mot pour nous ? (facultatif)</span>
              <textarea
                value={message}
                onChange={(evenement) => setMessage(evenement.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Votre taille, votre itinéraire, un besoin particulier…"
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/25 bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal"
              />
            </label>

            <div className="mt-8 flex flex-wrap gap-3">
              <Bouton variante="contour" className="text-noir-piste" onClick={() => setEtape(1)}>
                Retour
              </Bouton>
              <Bouton onClick={() => setEtape(3)} disabled={!coordonneesValides} taille="lg">
                Continuer vers le paiement
              </Bouton>
            </div>
            {!coordonneesValides && (
              <p className="mt-3 text-[0.82rem] text-gris-cadre">
                Prénom, nom et adresse email sont nécessaires pour continuer.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------- Étape 3 : paiement */}
        {etape === 3 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Paiement</h2>
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-gris-cadre">
              Le paiement est traité par un agrégateur béninois. Aucune coordonnée bancaire ne
              transite ni n&apos;est conservée par Bike Land.
            </p>

            <fieldset className="mt-8">
              <legend className="etiquette opacity-75">Moyen de paiement</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {moyensDisponibles.map((moyen) => {
                  const actif = moyenPaiement === moyen.code;
                  return (
                    <label
                      key={moyen.code}
                      className={`cursor-pointer rounded-[var(--radius-bouton)] border p-4 text-center transition-colors ${
                        actif ? "border-orange-signal bg-orange-signal/10" : "border-noir-piste/15 bg-craie"
                      }`}
                    >
                      <input
                        type="radio"
                        name="moyen-paiement"
                        value={moyen.code}
                        checked={actif}
                        onChange={() => setMoyenPaiement(moyen.code)}
                        className="sr-only"
                      />
                      <span className="block font-semibold">{moyen.libelle}</span>
                      <span className="mt-1 block text-[0.78rem] text-gris-cadre">{moyen.detail}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="mt-8 flex cursor-pointer items-start gap-3 text-[0.9rem] leading-relaxed">
              <input
                type="checkbox"
                checked={cgv}
                onChange={(evenement) => setCgv(evenement.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#f25c05]"
              />
              <span>
                J&apos;accepte les{" "}
                <a href="/cgv" target="_blank" className="lien-souligne font-semibold text-orange-sourd">
                  conditions générales de vente
                </a>{" "}
                et la{" "}
                <a
                  href="/donnees-personnelles"
                  target="_blank"
                  className="lien-souligne font-semibold text-orange-sourd"
                >
                  politique de protection des données
                </a>
                .
              </span>
            </label>
            {erreursChamps.cgvAcceptees && (
              <p className="mt-2 text-[0.82rem] text-orange-sourd">{erreursChamps.cgvAcceptees}</p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Bouton variante="contour" className="text-noir-piste" onClick={() => setEtape(2)}>
                Retour
              </Bouton>
              <Bouton onClick={envoyer} disabled={!cgv || envoiEnCours} taille="lg">
                {envoiEnCours ? "Paiement en cours…" : `Payer ${formatXof(devis.totalXof)}`}
              </Bouton>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------- Récapitulatif fixe */}
      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <div className="border border-noir-piste/15 bg-craie p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="etiquette opacity-75">Récapitulatif</p>
              <Pastille ton="neutre">
                {offre === "road-trip"
                  ? `Road trip · ${devis.nombrePersonnes} pers.`
                  : `Location libre · ${devis.dureeHeures} h`}
              </Pastille>
            </div>

            <dl className="mt-5 space-y-2.5 text-[0.88rem]">
              {devis.lignes.map((ligne) => (
                <div key={ligne.libelle} className="flex justify-between gap-4">
                  <dt className="text-gris-cadre">
                    {ligne.libelle}
                    <span className="block text-[0.76rem] opacity-70">{ligne.detail}</span>
                  </dt>
                  <dd className="shrink-0 tabular-nums">
                    {ligne.montantXof < 0 ? "− " : ""}
                    {formatXof(Math.abs(ligne.montantXof))}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex items-baseline justify-between border-t border-noir-piste/12 pt-4">
              <p className="font-display text-[1.05rem] font-bold uppercase">Total à payer</p>
              <p className="font-display text-[1.5rem] font-extrabold tabular-nums text-orange-sourd">
                {formatXof(devis.totalXof)}
              </p>
            </div>

            {devis.cautionXof > 0 ? (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-gris-cadre">
                Une caution de {formatXof(devis.cautionXof)} est remise en espèces au départ, en
                même temps que votre pièce d&apos;identité. Elle vous est rendue à la restitution
                du vélo — elle n&apos;est jamais encaissée en ligne.
              </p>
            ) : (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-vert-lagune">
                Aucune caution : la sortie est encadrée par un coordinateur, qui récupère le
                vélo et le kit à l&apos;arrivée.
              </p>
            )}

            {/* Le coco et l'eau sont compris dans le forfait road trip : on
                les montre plutôt que de les écrire, c'est ce que le client
                retient de la sortie. */}
            {offre === "road-trip" && (
              <div className="mt-5 flex items-center gap-4 rounded-[var(--radius-carte)] bg-white p-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-bouton)]">
                  <Image
                    src="/images/xiaoyu-li-tW0j8n-GIUY-unsplash.jpg"
                    alt="Un coco frais servi avec une paille"
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <p className="text-[0.8rem] leading-relaxed">
                  <strong className="font-semibold">Coco frais et eau compris</strong>
                  <span className="mt-0.5 block text-gris-cadre">
                    Servis à l&apos;arrivée, pour chaque participant.
                  </span>
                </p>
              </div>
            )}
          </div>

          <ul className="mt-6 space-y-2.5 text-[0.82rem] text-gris-cadre">
            {[
              "Annulation gratuite jusqu'à 72 h avant le départ",
              "Facture envoyée par email juste après le paiement",
              "Lien de suivi personnel, sans mot de passe",
            ].map((garantie) => (
              <li key={garantie} className="flex items-start gap-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" className="mt-1 shrink-0 text-vert-lagune">
                  <path
                    d="m3 8.4 3.2 3.2L13 4.8"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                {garantie}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  type = "text",
  erreur,
  aide,
  autoComplete,
  obligatoire = false,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  type?: string;
  erreur?: string;
  aide?: string;
  autoComplete?: string;
  obligatoire?: boolean;
}) {
  const identifiant = `champ-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;

  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
        {obligatoire && <span className="text-orange-signal"> *</span>}
      </label>
      <input
        id={identifiant}
        type={type}
        value={valeur}
        required={obligatoire}
        autoComplete={autoComplete}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${identifiant}-erreur` : aide ? `${identifiant}-aide` : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/15"
        }`}
      />
      {erreur ? (
        <p id={`${identifiant}-erreur`} className="mt-1.5 text-[0.8rem] text-orange-sourd">
          {erreur}
        </p>
      ) : aide ? (
        <p id={`${identifiant}-aide`} className="mt-1.5 text-[0.8rem] text-gris-cadre">
          {aide}
        </p>
      ) : null}
    </div>
  );
}
