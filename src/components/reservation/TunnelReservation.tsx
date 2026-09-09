"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { libellesCategorie, optionsLocation } from "@/data/catalogue";
import type { DateISO } from "@/lib/dates";
import { formatDate, formatXof } from "@/lib/format";
import { moyensDisponibles } from "@/lib/paiement";
import { calculerDevis } from "@/lib/tarification";
import type { MoyenPaiement, PointDeRetrait, Velo } from "@/lib/types";

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
  point?: PointDeRetrait;
  dateDebut: DateISO;
  dateFin: DateISO;
  optionsInitiales: string[];
}

export function TunnelReservation({ velo, point, dateDebut, dateFin, optionsInitiales }: Props) {
  const routeur = useRouter();
  const [etape, setEtape] = useState<Etape>(1);
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
      calculerDevis(
        velo,
        dateDebut,
        dateFin,
        optionsChoisies.map((code) => ({ code, quantite: 1 })),
      ),
    [velo, dateDebut, dateFin, optionsChoisies],
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
                    ? "text-encre-900"
                    : item.numero < etape
                      ? "text-terre-700 hover:opacity-70"
                      : "text-encre-900/35"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[0.72rem] ${
                    item.numero === etape
                      ? "bg-encre-900 text-sable-50"
                      : item.numero < etape
                        ? "bg-terre-600 text-sable-50"
                        : "border border-current"
                  }`}
                >
                  {item.numero < etape ? "✓" : item.numero}
                </span>
                {item.titre}
              </button>
              {index < etapes.length - 1 && (
                <span aria-hidden="true" className="h-px w-6 bg-encre-900/20 sm:w-10" />
              )}
            </li>
          ))}
        </ol>

        {erreurGlobale && (
          <p
            role="alert"
            className="mt-8 rounded-2xl border border-terre-300 bg-terre-50 px-5 py-4 text-[0.9rem] leading-relaxed text-terre-800"
          >
            {erreurGlobale}
          </p>
        )}

        {/* ---------------------------------------------- Étape 1 : location */}
        {etape === 1 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Votre location</h2>

            <div className="mt-6 flex flex-wrap items-center gap-5 rounded-[1.25rem] bg-white p-5">
              <div
                className="grid h-24 w-32 shrink-0 place-items-center rounded-xl px-2"
                style={{ background: velo.teintes[1] }}
              >
                <VeloIllustration categorie={velo.categorie} teintes={velo.teintes} className="w-full" />
              </div>
              <div className="flex-1">
                <p className="font-display text-[1.2rem] font-extrabold uppercase leading-none">
                  {velo.nom}
                </p>
                <p className="mt-1.5 text-[0.85rem] text-encre-500">
                  {libellesCategorie[velo.categorie]} · taille {velo.taille}
                </p>
                <p className="mt-2 text-[0.85rem]">
                  Du <strong className="font-semibold">{formatDate(dateDebut)}</strong> au{" "}
                  <strong className="font-semibold">{formatDate(dateFin)}</strong>
                </p>
              </div>
              <a
                href={`/velos/${velo.slug}?debut=${dateDebut}&fin=${dateFin}`}
                className="lien-souligne text-[0.82rem] font-semibold text-terre-700"
              >
                Changer les dates
              </a>
            </div>

            {point && (
              <p className="mt-4 text-[0.88rem] text-encre-500">
                Retrait et restitution : <strong className="text-encre-900">{point.nom}</strong>,{" "}
                {point.adresse}, {point.ville}. {point.horaires}.
              </p>
            )}

            <fieldset className="mt-10">
              <legend className="etiquette opacity-55">Options</legend>
              <div className="mt-4 space-y-3">
                {optionsLocation.map((option) => {
                  const actif = optionsChoisies.includes(option.code);
                  return (
                    <label
                      key={option.code}
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors ${
                        actif ? "border-terre-500 bg-terre-50" : "border-encre-900/12 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={() => basculerOption(option.code)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#b04726]"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold">{option.libelle}</span>
                          <span className="text-[0.85rem] font-semibold text-terre-700">
                            {formatXof(option.prixXof)}
                            <span className="font-normal text-encre-500">
                              {option.unite === "jour" ? " / jour" : " forfait"}
                            </span>
                          </span>
                        </span>
                        <span className="mt-1 block text-[0.85rem] leading-relaxed text-encre-500">
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
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-encre-500">
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
              <span className="etiquette opacity-55">Un mot pour nous ? (facultatif)</span>
              <textarea
                value={message}
                onChange={(evenement) => setMessage(evenement.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Votre taille, votre itinéraire, un besoin particulier…"
                className="mt-2 w-full rounded-2xl border border-encre-900/15 bg-white px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-terre-500"
              />
            </label>

            <div className="mt-8 flex flex-wrap gap-3">
              <Bouton variante="contour" className="text-encre-900" onClick={() => setEtape(1)}>
                Retour
              </Bouton>
              <Bouton onClick={() => setEtape(3)} disabled={!coordonneesValides} taille="lg">
                Continuer vers le paiement
              </Bouton>
            </div>
            {!coordonneesValides && (
              <p className="mt-3 text-[0.82rem] text-encre-500">
                Prénom, nom et adresse email sont nécessaires pour continuer.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------- Étape 3 : paiement */}
        {etape === 3 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Paiement</h2>
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-encre-500">
              Le paiement est traité par un agrégateur béninois. Aucune coordonnée bancaire ne
              transite ni n&apos;est conservée par Bike Land.
            </p>

            <fieldset className="mt-8">
              <legend className="etiquette opacity-55">Moyen de paiement</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {moyensDisponibles.map((moyen) => {
                  const actif = moyenPaiement === moyen.code;
                  return (
                    <label
                      key={moyen.code}
                      className={`cursor-pointer rounded-2xl border p-4 text-center transition-colors ${
                        actif ? "border-terre-500 bg-terre-50" : "border-encre-900/12 bg-white"
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
                      <span className="mt-1 block text-[0.78rem] text-encre-500">{moyen.detail}</span>
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
                className="mt-1 h-4 w-4 shrink-0 accent-[#b04726]"
              />
              <span>
                J&apos;accepte les{" "}
                <a href="/cgv" target="_blank" className="lien-souligne font-semibold text-terre-700">
                  conditions générales de vente
                </a>{" "}
                et la{" "}
                <a
                  href="/donnees-personnelles"
                  target="_blank"
                  className="lien-souligne font-semibold text-terre-700"
                >
                  politique de protection des données
                </a>
                .
              </span>
            </label>
            {erreursChamps.cgvAcceptees && (
              <p className="mt-2 text-[0.82rem] text-terre-700">{erreursChamps.cgvAcceptees}</p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Bouton variante="contour" className="text-encre-900" onClick={() => setEtape(2)}>
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
          <div className="rounded-[1.5rem] bg-white p-6 shadow-[0_24px_60px_-40px_rgba(42,35,30,0.5)]">
            <div className="flex items-center justify-between gap-4">
              <p className="etiquette opacity-55">Récapitulatif</p>
              <Pastille ton="neutre">
                {devis.jours} jour{devis.jours > 1 ? "s" : ""}
              </Pastille>
            </div>

            <dl className="mt-5 space-y-2.5 text-[0.88rem]">
              {devis.lignes.map((ligne) => (
                <div key={ligne.libelle} className="flex justify-between gap-4">
                  <dt className="text-encre-500">
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

            <div className="mt-5 flex items-baseline justify-between border-t border-encre-900/12 pt-4">
              <p className="font-display text-[1.05rem] font-bold uppercase">Total à payer</p>
              <p className="font-display text-[1.5rem] font-extrabold tabular-nums text-terre-700">
                {formatXof(devis.totalXof)}
              </p>
            </div>

            {devis.cautionXof > 0 ? (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-encre-500">
                Une caution de {formatXof(devis.cautionXof)} est pré-autorisée séparément et
                libérée dans les 48 h suivant la restitution.
              </p>
            ) : (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-olive-600">
                Assurance sérénité souscrite : aucune caution n&apos;est retenue.
              </p>
            )}
          </div>

          <ul className="mt-6 space-y-2.5 text-[0.82rem] text-encre-500">
            {[
              "Annulation gratuite jusqu'à 72 h avant le départ",
              "Facture envoyée par email juste après le paiement",
              "Lien de suivi personnel, sans mot de passe",
            ].map((garantie) => (
              <li key={garantie} className="flex items-start gap-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" className="mt-1 shrink-0 text-olive-500">
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
      <label htmlFor={identifiant} className="etiquette opacity-55">
        {libelle}
        {obligatoire && <span className="text-terre-600"> *</span>}
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
        className={`mt-2 w-full rounded-full border bg-white px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-terre-500 ${
          erreur ? "border-terre-500" : "border-encre-900/15"
        }`}
      />
      {erreur ? (
        <p id={`${identifiant}-erreur`} className="mt-1.5 text-[0.8rem] text-terre-700">
          {erreur}
        </p>
      ) : aide ? (
        <p id={`${identifiant}-aide`} className="mt-1.5 text-[0.8rem] text-encre-500">
          {aide}
        </p>
      ) : null}
    </div>
  );
}
