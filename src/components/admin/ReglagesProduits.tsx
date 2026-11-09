"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { jourCourtPadel, prochainsDepartsPadel } from "@/data/padel-bike";
import {
  formatDureeHeures,
  formatHeureMinute,
  NOMS_JOURS,
  programmeEnClair,
  type ReglagesPadel,
  type ReglagesProduits as Reglages,
} from "@/data/reglages";
import { ajouterJours } from "@/lib/dates";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { site } from "@/lib/site";

/** Les jours dans l'ordre de la semaine, lundi d'abord. */
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];

/**
 * Les réglages des produits, produit par produit : un formulaire par
 * produit, enregistré d'un geste. Padel bike le premier ; les autres
 * produits viendront s'ajouter ici sur le même modèle.
 */
export function ReglagesProduits({
  reglages,
  parDefaut,
  aujourdhui,
}: {
  reglages: Reglages;
  parDefaut: Reglages;
  /** Aujourd'hui à Cotonou, pour borner les dates à programmer. */
  aujourdhui: string;
}) {
  return (
    <div className="mt-8 grid gap-6">
      <CartePadel initial={reglages.padel} parDefaut={parDefaut.padel} aujourdhui={aujourdhui} />
    </div>
  );
}

/** Le formulaire tient ses valeurs en texte, comme les champs ; elles redeviennent des nombres à l'envoi. */
interface FormulairePadel {
  prixXof: string;
  depart: string;
  retour: string;
  dureePadelHeures: string;
  jours: number[];
  dates: string[];
  personnesMin: string;
  personnesMax: string;
  ouverture: string;
  clotureHeuresAvant: string;
}

function versFormulaire(reglages: ReglagesPadel): FormulairePadel {
  return {
    prixXof: String(reglages.prixXof),
    depart: reglages.depart.padStart(5, "0"),
    retour: reglages.retour.padStart(5, "0"),
    dureePadelHeures: String(reglages.dureePadelHeures),
    jours: [...reglages.jours],
    dates: [...reglages.dates],
    personnesMin: String(reglages.personnesMin),
    personnesMax: String(reglages.personnesMax),
    ouverture: reglages.ouverture,
    clotureHeuresAvant: String(reglages.clotureHeuresAvant),
  };
}

function versReglages(formulaire: FormulairePadel) {
  const nombre = (texte: string) => (texte.trim() === "" ? Number.NaN : Number(texte.replace(",", ".")));
  return {
    prixXof: nombre(formulaire.prixXof.replace(/\s/g, "")),
    depart: formulaire.depart,
    retour: formulaire.retour,
    dureePadelHeures: nombre(formulaire.dureePadelHeures),
    jours: formulaire.jours,
    dates: formulaire.dates,
    personnesMin: nombre(formulaire.personnesMin),
    personnesMax: nombre(formulaire.personnesMax),
    ouverture: formulaire.ouverture,
    clotureHeuresAvant: nombre(formulaire.clotureHeuresAvant),
  };
}

function CartePadel({
  initial,
  parDefaut,
  aujourdhui,
}: {
  initial: ReglagesPadel;
  parDefaut: ReglagesPadel;
  aujourdhui: string;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [reference, setReference] = useState(() => versFormulaire(initial));
  const [valeurs, setValeurs] = useState(() => versFormulaire(initial));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState(false);
  // La date à ajouter au programme, tapée ou choisie dans le calendrier.
  const [dateAAjouter, setDateAAjouter] = useState("");
  // L'instant d'ouverture de la page : les prochains départs s'en déduisent.
  const [instant] = useState(() => new Date().getTime());

  const modifie = JSON.stringify(valeurs) !== JSON.stringify(reference);
  const changer = <C extends keyof FormulairePadel>(champ: C, valeur: FormulairePadel[C]) => {
    setValeurs((avant) => ({ ...avant, [champ]: valeur }));
    setSucces(false);
  };
  const basculerJour = (jour: number) =>
    changer("jours", valeurs.jours.includes(jour) ? valeurs.jours.filter((j) => j !== jour) : [...valeurs.jours, jour]);
  const dateAjoutable = /^\d{4}-\d{2}-\d{2}$/.test(dateAAjouter) && dateAAjouter >= aujourdhui;
  const ajouterDate = () => {
    if (!dateAjoutable) return;
    if (!valeurs.dates.includes(dateAAjouter)) changer("dates", [...valeurs.dates, dateAAjouter].sort());
    setDateAAjouter("");
  };
  const retirerDate = (date: string) => changer("dates", valeurs.dates.filter((d) => d !== date));
  // Les dates passées ne comptent plus : le serveur les retire à l'enregistrement.
  const datesAVenir = valeurs.dates.filter((date) => date >= aujourdhui);

  // Ce que le site dira, tant que les valeurs se lisent.
  const lu = versReglages(valeurs);
  const lisible =
    /^\d{2}:\d{2}$/.test(lu.depart) &&
    /^\d{2}:\d{2}$/.test(lu.retour) &&
    [lu.prixXof, lu.dureePadelHeures, lu.personnesMin, lu.personnesMax, lu.clotureHeuresAvant].every(Number.isFinite) &&
    /^\d{4}-\d{2}-\d{2}$/.test(lu.ouverture);
  // Les prochains départs que donneront ces réglages.
  const prochains = lisible ? prochainsDepartsPadel({ ...lu, dates: datesAVenir }, instant, 5) : [];

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setSucces(false);
    try {
      const reponse = await fetch("/api/admin/reglages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produit: "padel", reglages: versReglages(valeurs) }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le réglage n'a pas pu être enregistré.");
        setErreurs(donnees.champs ?? {});
        return;
      }
      const enregistres = versFormulaire(donnees.reglages as ReglagesPadel);
      setReference(enregistres);
      setValeurs(enregistres);
      setSucces(true);
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section
      aria-labelledby="reglages-padel"
      className="rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="reglages-padel" className="text-[1.05rem] font-semibold">
          Padel bike
        </h2>
        {/* Lien complet : l'administration peut avoir sa propre adresse. */}
        <a href={`${site.url}/padel-bike`} target="_blank" rel="noreferrer" className="lien-souligne text-[0.82rem] font-semibold text-orange-sourd">
          Voir la page sur le site
        </a>
      </div>
      <p className="mt-1 text-[0.82rem] leading-relaxed text-gris-cadre">
        À vélo jusqu&apos;au terrain de padel, puis le padel. Réservé en ligne sur sa page, et vendu au
        comptoir aux mêmes heure et prix. Pour fermer la réservation en ligne un moment, utilisez
        «&nbsp;Ouverture des réservations&nbsp;» sur le tableau de bord.
      </p>

      <form
        className="mt-5"
        noValidate
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (modifie && !envoi) void enregistrer();
        }}
      >
        {/* Rien ne se modifie pendant l'enregistrement : la réponse du serveur
            remplace le formulaire, un changement fait entre-temps serait perdu. */}
        <fieldset disabled={envoi} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Champ
            id="padel-prix"
            libelle="Prix par personne (F CFA)"
            valeur={valeurs.prixXof}
            onChange={(v) => changer("prixXof", v)}
            erreur={erreurs.prixXof}
            inputMode="numeric"
            aide="Le même en ligne et au comptoir."
          />
          <Champ
            id="padel-depart"
            libelle="Heure du départ à vélo"
            type="time"
            valeur={valeurs.depart}
            onChange={(v) => changer("depart", v)}
            erreur={erreurs.depart}
          />
          <Champ
            id="padel-retour"
            libelle="Heure du retour des vélos"
            type="time"
            valeur={valeurs.retour}
            onChange={(v) => changer("retour", v)}
            erreur={erreurs.retour}
            aide="Les vélos sont bloqués du départ jusqu'à cette heure."
          />
          <Champ
            id="padel-duree"
            libelle="Durée du padel (heures)"
            valeur={valeurs.dureePadelHeures}
            onChange={(v) => changer("dureePadelHeures", v)}
            erreur={erreurs.dureePadelHeures}
            inputMode="decimal"
            aide="Ce que le site annonce : 3, ou 1,5 pour 1 h 30."
          />
          <Champ
            id="padel-min"
            libelle="Personnes au minimum"
            valeur={valeurs.personnesMin}
            onChange={(v) => changer("personnesMin", v)}
            erreur={erreurs.personnesMin}
            inputMode="numeric"
          />
          <Champ
            id="padel-max"
            libelle="Personnes au maximum, par réservation"
            valeur={valeurs.personnesMax}
            onChange={(v) => changer("personnesMax", v)}
            erreur={erreurs.personnesMax}
            inputMode="numeric"
            aide="12 au plus, et jamais plus que de vélos libres."
          />
          <Champ
            id="padel-ouverture"
            libelle="Réservation en ligne à partir du"
            type="date"
            valeur={valeurs.ouverture}
            onChange={(v) => changer("ouverture", v)}
            erreur={erreurs.ouverture}
            aide="À minuit ce jour-là, la page s'ouvre d'elle-même."
          />
          <Champ
            id="padel-cloture"
            libelle="Réservation en ligne jusqu'à (heures avant le départ)"
            valeur={valeurs.clotureHeuresAvant}
            onChange={(v) => changer("clotureHeuresAvant", v)}
            erreur={erreurs.clotureHeuresAvant}
            inputMode="numeric"
            aide="0 : jusqu'à l'heure du départ. Après, le client passe par WhatsApp."
          />
        </div>

        {/* Le programme : Padel bike part certains jours seulement, que
            l'équipe programme ici, chaque semaine ou date par date. */}
        <div className="mt-6 rounded-[var(--radius-bouton)] border border-noir-piste/10 p-4">
          <p className="text-[0.9rem] font-semibold">Programme des départs</p>
          <p className="mt-1 text-[0.78rem] leading-relaxed text-gris-cadre">
            Padel bike ne part que les jours programmés ici : des jours de chaque semaine, des
            dates une à une, ou les deux. Sans rien de programmé, la page annonce des dates bientôt.
          </p>
        <fieldset className="mt-4">
          <legend className="text-[0.78rem] font-semibold text-gris-cadre">Chaque semaine (facultatif)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ORDRE_JOURS.map((jour) => {
              const actif = valeurs.jours.includes(jour);
              return (
                <label
                  key={jour}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-bouton)] border px-3 text-[0.85rem] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-noir-piste ${
                    actif ? "border-orange-signal bg-orange-signal/12" : "border-noir-piste/15 bg-craie"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={actif}
                    onChange={() => basculerJour(jour)}
                    className="h-4 w-4 accent-[#f25c05]"
                  />
                  <span className="first-letter:uppercase">{NOMS_JOURS[jour]}</span>
                </label>
              );
            })}
          </div>
          {erreurs.jours && <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.jours}</p>}
        </fieldset>

        <div className="mt-4">
          <label htmlFor="padel-date-programmee" className="text-[0.78rem] font-semibold text-gris-cadre">
            Dates programmées une à une
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id="padel-date-programmee"
              type="date"
              min={aujourdhui}
              max={ajouterJours(aujourdhui, 365)}
              value={dateAAjouter}
              onChange={(evenement) => setDateAAjouter(evenement.target.value)}
              onKeyDown={(evenement) => {
                if (evenement.key === "Enter") {
                  evenement.preventDefault();
                  ajouterDate();
                }
              }}
              className="h-10 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-3 text-[0.88rem]"
            />
            <button
              type="button"
              onClick={ajouterDate}
              disabled={!dateAjoutable}
              className="min-h-10 rounded-[var(--radius-bouton)] bg-orange-signal px-4 text-[0.82rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              Ajouter cette date
            </button>
          </div>
          {datesAVenir.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Dates programmées">
              {datesAVenir.map((date) => (
                <li
                  key={date}
                  className="flex min-h-10 items-center gap-1 rounded-[var(--radius-bouton)] border border-orange-signal bg-orange-signal/12 pl-3 text-[0.85rem] font-semibold"
                >
                  <span className="first-letter:uppercase">{jourCourtPadel(date)}</span>
                  <button
                    type="button"
                    onClick={() => retirerDate(date)}
                    className="grid h-10 w-10 place-items-center text-[1.1rem] leading-none text-orange-sourd"
                  >
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">Retirer le {formatDateAvecJour(date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.76rem] text-gris-cadre">Aucune date ajoutée.</p>
          )}
          {erreurs.dates && <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.dates}</p>}
        </div>
        </div>

        <p className="mt-5 rounded-[var(--radius-bouton)] bg-craie px-4 py-3 text-[0.85rem] leading-relaxed">
          <span className="font-semibold">Sur le site&nbsp;: </span>
          {lisible ? (
            <>
              {programmeEnClair({ jours: lu.jours, dates: datesAVenir })}, de {formatHeureMinute(lu.depart)} à{" "}
              {formatHeureMinute(lu.retour)},{" "}
              {formatDureeHeures(lu.dureePadelHeures)} de padel, {formatXof(lu.prixXof)} par personne,{" "}
              {lu.personnesMin === lu.personnesMax
                ? `${lu.personnesMin} personnes`
                : `de ${lu.personnesMin} à ${lu.personnesMax} personnes`}
              . Réservation en ligne à partir du {formatDateAvecJour(lu.ouverture)},{" "}
              {lu.clotureHeuresAvant > 0 ? `jusqu'à ${lu.clotureHeuresAvant} h avant le départ` : "jusqu'à l'heure du départ"}.
              <span className="mt-1 block">
                <span className="font-semibold">Prochains départs&nbsp;: </span>
                {prochains.length > 0
                  ? prochains.map((date) => jourCourtPadel(date)).join(", ")
                  : "aucun pour le moment, programmez des jours ou des dates."}
              </span>
            </>
          ) : (
            "complétez les champs pour voir ce que le site affichera."
          )}
        </p>

        {erreur && (
          <p
            role="alert"
            className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]"
          >
            {erreur}
            {erreurs.general ? ` ${erreurs.general}` : ""}
          </p>
        )}
        {succes && !modifie && (
          <p role="status" className="mt-4 rounded-[var(--radius-carte)] bg-vert-lagune/12 px-4 py-3 text-[0.86rem] text-vert-lagune">
            Enregistré&nbsp;: le site et le comptoir appliquent maintenant ces réglages.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!modifie || envoi || enCours}
            className="min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
          {modifie && (
            <button
              type="button"
              onClick={() => {
                setValeurs(reference);
                setErreurs({});
                setErreur(null);
              }}
              className="lien-souligne cible-elargie text-[0.82rem] font-semibold"
            >
              Annuler les changements
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setValeurs(versFormulaire(parDefaut));
              setSucces(false);
            }}
            className="lien-souligne cible-elargie text-[0.82rem] font-semibold text-gris-cadre"
          >
            Revenir aux valeurs de départ
          </button>
        </div>
        </fieldset>
      </form>
    </section>
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
  inputMode,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  type?: string;
  erreur?: string;
  aide?: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[0.78rem] font-semibold text-gris-cadre">{libelle}</span>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur || aide ? `${id}-note` : undefined}
        className={`mt-1 h-10 w-full rounded-[var(--radius-bouton)] border bg-white px-3 text-[0.88rem] tabular-nums ${
          erreur ? "border-orange-signal" : "border-noir-piste/20"
        }`}
      />
      {(erreur || aide) && (
        <span id={`${id}-note`} className={`mt-1 block text-[0.74rem] ${erreur ? "text-orange-sourd" : "text-gris-cadre"}`}>
          {erreur ?? aide}
        </span>
      )}
    </label>
  );
}
