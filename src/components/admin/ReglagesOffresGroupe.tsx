"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChampPrenom, usePrenomRetenu } from "@/components/admin/ChampPrenom";
import {
  lireChemin,
  montantF,
  nomDuReglage,
  RUBRIQUES_REGLAGES_OFFRES,
  type ChampReglage,
} from "@/data/libelles-reglages-offres";
import { NOMS_JOURS } from "@/data/reglages";
import type { ReglagesOffres, SourceReglagesOffres } from "@/data/reglages-offres";
import { penaliteRetardXof } from "@/lib/offres/retard";

/** Les jours dans l'ordre de la semaine, lundi d'abord. */
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];

/** Le formulaire tient ses valeurs comme les cases : du texte, ou une liste de jours. */
type Formulaire = Record<string, string | number[]>;

const TOUS_LES_CHAMPS: ChampReglage[] = RUBRIQUES_REGLAGES_OFFRES.flatMap((rubrique) => rubrique.champs);

/** Un pourcentage rangé (0,2) tel qu'on le tape (20). */
function versPourcent(valeur: number): string {
  return String(Math.round(valeur * 10000) / 100).replace(".", ",");
}

function versFormulaire(reglages: ReglagesOffres): Formulaire {
  const formulaire: Formulaire = {};
  for (const champ of TOUS_LES_CHAMPS) {
    const valeur = lireChemin(reglages, champ.chemin);
    if (champ.unite === "jours") {
      formulaire[champ.chemin] = Array.isArray(valeur) ? [...(valeur as number[])].sort((a, b) => a - b) : [];
    } else if (champ.unite === "%") {
      formulaire[champ.chemin] = typeof valeur === "number" ? versPourcent(valeur) : "";
    } else {
      formulaire[champ.chemin] = valeur === undefined || valeur === null ? "" : String(valeur);
    }
  }
  return formulaire;
}

/** « 1 500 », « 1500 », « 12,5 » : un nombre tapé. Vide ou illisible : NaN, que le serveur refuse. */
function nombreTape(texte: string): number {
  const nettoye = texte.replace(/[\s  ]/g, "").replace(",", ".");
  return nettoye === "" ? Number.NaN : Number(nettoye);
}

/** Pose `valeur` sous le chemin « a.b.c » d'un objet. */
function ecrireChemin(objet: Record<string, unknown>, chemin: string, valeur: unknown): void {
  const morceaux = chemin.split(".");
  let courant = objet;
  for (const morceau of morceaux.slice(0, -1)) {
    if (typeof courant[morceau] !== "object" || courant[morceau] === null) courant[morceau] = {};
    courant = courant[morceau] as Record<string, unknown>;
  }
  courant[morceaux[morceaux.length - 1]] = valeur;
}

/**
 * Les réglages à envoyer : ceux d'où l'on part (`base`), un réglage que la
 * page ne connaît pas encore compris, avec les cases par-dessus. Le serveur
 * vérifie tout.
 */
function versReglages(formulaire: Formulaire, base: ReglagesOffres): ReglagesOffres {
  const reglages = structuredClone(base) as unknown as Record<string, unknown>;
  for (const champ of TOUS_LES_CHAMPS) {
    const brut = formulaire[champ.chemin];
    let valeur: unknown;
    if (champ.unite === "jours") valeur = Array.isArray(brut) ? brut : [];
    else if (champ.unite === "heure") valeur = String(brut ?? "");
    else if (champ.unite === "%") valeur = nombreTape(String(brut ?? "")) / 100;
    else valeur = nombreTape(String(brut ?? ""));
    ecrireChemin(reglages, champ.chemin, valeur);
  }
  return reglages as unknown as ReglagesOffres;
}

/** « Lundi », pour une liste. */
function jourAvecMajuscule(jour: number): string {
  const nom = NOMS_JOURS[jour] ?? "";
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/**
 * Les réglages des offres de groupe (cahier des charges, étape 1) : chaque
 * prix et chaque règle dans une case, rangés par rubrique, enregistrés d'un
 * geste. Le serveur vérifie tout avant de ranger ; le site relit ces
 * réglages à chaque calcul. Le prénom signe la ligne du journal.
 */
export function ReglagesOffresGroupe({
  reglages,
  source,
  probleme,
  parDefaut,
}: {
  reglages: ReglagesOffres;
  source: SourceReglagesOffres;
  probleme?: string;
  parDefaut: ReglagesOffres;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [base, setBase] = useState(reglages);
  const [reference, setReference] = useState(() => versFormulaire(reglages));
  const [valeurs, setValeurs] = useState(() => versFormulaire(reglages));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);
  const { prenom, setPrenom, retenir } = usePrenomRetenu();

  const modifie = JSON.stringify(valeurs) !== JSON.stringify(reference);
  // Illisibles en base : il faut enregistrer, même sans rien changer, pour
  // que la vente reprenne.
  const aEnregistrer = modifie || source === "illisible";
  const changer = (chemin: string, valeur: string | number[]) => {
    setValeurs((avant) => ({ ...avant, [chemin]: valeur }));
    setSucces(null);
  };
  const lu = (chemin: string) => nombreTape(String(valeurs[chemin] ?? ""));

  /** Une aide qui se calcule avec les cases : ce que le client verra en ligne. */
  const aideCalculee = (chemin: string): string | undefined => {
    const frais = lu("paiement.fraisParPersonneXof");
    if (chemin === "roadTrip.prixPersonneXof" && Number.isFinite(lu(chemin)) && Number.isFinite(frais)) {
      return `Soit ${montantF(lu(chemin) + frais)} par personne en ligne, frais de paiement compris.`;
    }
    if (chemin.startsWith("gbashi.prixXof.") && Number.isFinite(lu(chemin)) && Number.isFinite(frais)) {
      return `${montantF(lu(chemin) + frais)} en ligne, ${montantF(lu(chemin))} au comptoir.`;
    }
    if (chemin === "paiement.fraisParPersonneXof" && Number.isFinite(frais)) {
      return `Pour un groupe de 10 : ${montantF(frais * 10)}.`;
    }
    if (chemin === "retard.penaliteParMinuteXof") {
      const tolerance = lu("retard.toleranceMinutes");
      const parMinute = lu(chemin);
      if (Number.isFinite(tolerance) && Number.isFinite(parMinute)) {
        const exemple = penaliteRetardXof(10, { retard: { toleranceMinutes: tolerance, penaliteParMinuteXof: parMinute } });
        return `Exemple : 10 minutes de retard, ${montantF(exemple)} pour le groupe.`;
      }
    }
    return undefined;
  };

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setSucces(null);
    try {
      const reponse = await fetch("/api/admin/reglages-offres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reglages: versReglages(valeurs, base), prenom }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Les réglages n'ont pas pu être enregistrés.");
        setErreurs(donnees.champs ?? {});
        return;
      }
      retenir();
      const enregistres = donnees.reglages as ReglagesOffres;
      setBase(enregistres);
      setReference(versFormulaire(enregistres));
      setValeurs(versFormulaire(enregistres));
      setSucces(
        donnees.changements > 0
          ? `Enregistré : ${donnees.changements} réglage${donnees.changements > 1 ? "s" : ""} changé${donnees.changements > 1 ? "s" : ""}, noté${donnees.changements > 1 ? "s" : ""} au journal. Le site les applique dès maintenant.`
          : "Enregistré, sans changement. Le site applique ces réglages.",
      );
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  const erreursDeCases = Object.entries(erreurs).filter(([chemin]) => chemin !== "prenom" && chemin !== "general");

  return (
    <section
      aria-labelledby="reglages-offres"
      className="mt-10 rounded-[var(--radius-carte)] border border-noir-piste/8 bg-white p-4 sm:p-6"
    >
      <h2 id="reglages-offres" className="text-[1.05rem] font-semibold">
        Réglages des offres
      </h2>
      <p className="mt-1 text-[0.82rem] leading-relaxed text-gris-cadre">
        Les prix et les règles des trois offres de groupe : Bike for All, Road trip en groupe et
        Gbashi Bike. Le site les relit à chaque calcul. Les réservations déjà payées gardent leur
        prix. Pour montrer ou cacher ces offres aux clients, utilisez «&nbsp;Offres de groupe&nbsp;»
        dans «&nbsp;Ouverture des réservations&nbsp;», sur le tableau de bord.
      </p>

      {source === "illisible" && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed"
        >
          <p className="font-semibold">Les réglages enregistrés ne se lisent plus.</p>
          <p className="mt-1">
            Tant qu&apos;ils ne sont pas corrigés, les offres de groupe ne se vendent pas : le site
            refuse de calculer un prix au hasard.{probleme ? ` Problème trouvé : ${probleme}` : ""} Les
            cases montrent les valeurs de départ. Vérifiez-les, puis enregistrez.
          </p>
        </div>
      )}
      {source === "defaut" && (
        <p className="mt-4 rounded-[var(--radius-bouton)] bg-craie px-4 py-3 text-[0.82rem] leading-relaxed">
          Rien n&apos;est encore enregistré : ce sont les valeurs du tableur, avec vos décisions du
          9 novembre (road trip à 3 000 F + 125 F, Gbashi à 3 500, 4 000 et 4 500 F + 125 F).
        </p>
      )}

      <form
        className="mt-5"
        noValidate
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (aEnregistrer && !envoi) void enregistrer();
        }}
      >
        {/* Rien ne se modifie pendant l'enregistrement : la réponse du serveur
            remplace le formulaire, un changement fait entre-temps serait perdu. */}
        <fieldset disabled={envoi} className="m-0 min-w-0 border-0 p-0">
          <div className="grid gap-5">
            {RUBRIQUES_REGLAGES_OFFRES.map((rubrique) => (
              <fieldset
                key={rubrique.id}
                className="m-0 min-w-0 rounded-[var(--radius-bouton)] border border-noir-piste/10 p-4"
              >
                <legend className="px-1 text-[0.95rem] font-semibold">{rubrique.titre}</legend>
                <p className="text-[0.78rem] leading-relaxed text-gris-cadre">{rubrique.description}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rubrique.champs.map((champ) => (
                    <CaseReglage
                      key={champ.chemin}
                      champ={champ}
                      valeur={valeurs[champ.chemin] ?? ""}
                      onChange={(valeur) => changer(champ.chemin, valeur)}
                      erreur={erreurs[champ.chemin]}
                      aide={aideCalculee(champ.chemin) ?? champ.aide}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-5 max-w-xs">
            <ChampPrenom id="reglages-offres-prenom" valeur={prenom} onChange={setPrenom} erreur={erreurs.prenom} />
          </div>

          {erreur && (
            <div
              role="alert"
              className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]"
            >
              <p>
                {erreur}
                {erreurs.general ? ` ${erreurs.general}` : ""}
              </p>
              {erreursDeCases.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.82rem]">
                  {erreursDeCases.map(([chemin, message]) => (
                    <li key={chemin}>
                      <a href={`#reglage-${chemin.replace(/\./g, "-")}`} className="lien-souligne">
                        {nomDuReglage(chemin)}
                      </a>{" "}
                      : {message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {succes && !modifie && (
            <p role="status" className="mt-4 rounded-[var(--radius-carte)] bg-vert-lagune/12 px-4 py-3 text-[0.86rem] text-vert-lagune">
              {succes}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!aEnregistrer || envoi || enCours}
              className="min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.85rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {envoi ? "Enregistrement…" : "Enregistrer les réglages"}
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
                setSucces(null);
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

/** Une case de réglage, selon ce qu'elle contient. */
function CaseReglage({
  champ,
  valeur,
  onChange,
  erreur,
  aide,
}: {
  champ: ChampReglage;
  valeur: string | number[];
  onChange: (valeur: string | number[]) => void;
  erreur?: string;
  aide?: string;
}) {
  const id = `reglage-${champ.chemin.replace(/\./g, "-")}`;
  const note = erreur ?? aide;
  const bordure = erreur ? "border-orange-signal" : "border-noir-piste/20";

  if (champ.unite === "jours") {
    const jours = Array.isArray(valeur) ? valeur : [];
    return (
      <fieldset id={id} className="m-0 min-w-0 border-0 p-0 sm:col-span-2 xl:col-span-3">
        <legend className="text-[0.78rem] font-semibold text-gris-cadre">{champ.libelle}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDRE_JOURS.map((jour) => {
            const actif = jours.includes(jour);
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
                  onChange={() =>
                    onChange(actif ? jours.filter((j) => j !== jour) : [...jours, jour].sort((a, b) => a - b))
                  }
                  className="h-4 w-4 accent-[#f25c05]"
                />
                {jourAvecMajuscule(jour)}
              </label>
            );
          })}
        </div>
        {note && <p className={`mt-1.5 text-[0.74rem] ${erreur ? "text-orange-sourd" : "text-gris-cadre"}`}>{note}</p>}
      </fieldset>
    );
  }

  const suffixe: Partial<Record<ChampReglage["unite"], string>> = {
    F: "F",
    "%": "%",
    min: "min",
    km: "km",
  };

  return (
    <label className="block" htmlFor={id}>
      <span className="text-[0.78rem] font-semibold text-gris-cadre">{champ.libelle}</span>
      <span className="mt-1 flex items-center gap-2">
        {champ.unite === "jour" ? (
          <select
            id={id}
            value={String(valeur)}
            onChange={(evenement) => onChange(evenement.target.value)}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={note ? `${id}-note` : undefined}
            className={`h-10 w-full rounded-[var(--radius-bouton)] border bg-white px-3 text-[0.88rem] ${bordure}`}
          >
            {ORDRE_JOURS.map((jour) => (
              <option key={jour} value={String(jour)}>
                {jourAvecMajuscule(jour)}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={champ.unite === "heure" ? "time" : "text"}
            inputMode={champ.unite === "heure" ? undefined : champ.unite === "%" ? "decimal" : "numeric"}
            value={String(valeur)}
            onChange={(evenement) => onChange(evenement.target.value)}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={note ? `${id}-note` : undefined}
            className={`h-10 w-full min-w-0 rounded-[var(--radius-bouton)] border bg-white px-3 text-[0.88rem] tabular-nums ${bordure}`}
          />
        )}
        {suffixe[champ.unite] && (
          <span aria-hidden="true" className="shrink-0 text-[0.82rem] text-gris-cadre">
            {suffixe[champ.unite]}
          </span>
        )}
      </span>
      {note && (
        <span id={`${id}-note`} className={`mt-1 block text-[0.74rem] ${erreur ? "text-orange-sourd" : "text-gris-cadre"}`}>
          {note}
        </span>
      )}
    </label>
  );
}
