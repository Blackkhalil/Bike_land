"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  libelleCommission,
  libelleReduction,
  type CodeParrainage,
} from "@/lib/parrainage";
import { formatDate } from "@/lib/format";
import type { Partenaire } from "@/lib/types";

/**
 * Création et pilotage des codes de parrainage.
 *
 * Deux formulaires, car ce sont deux gestes distincts : on enregistre un
 * partenaire une fois, et on lui crée ensuite autant de codes qu'on veut.
 * Les mêler obligerait à ressaisir le partenaire à chaque code, et deux
 * orthographes du même nom rendraient les statistiques inexploitables.
 *
 * Aucun taux n'est saisissable : la réduction client et la commission
 * partenaire sont une politique unique (cf. src/lib/parrainage.ts). Un
 * taux par code laisserait s'installer des écarts que personne ne saurait
 * plus justifier six mois plus tard.
 *
 * La suppression n'est proposée que sur un code qui n'a jamais servi : au
 * delà, elle effacerait les utilisations comptées à son partenaire, et les
 * commissions qui lui sont dues. Le serveur le refuse de toute façon, mais
 * mieux vaut ne pas montrer un bouton qui ne peut pas marcher.
 */

export function GestionParrainage({
  partenaires,
  codes,
  clientsParPartenaire = {},
}: {
  partenaires: Partenaire[];
  codes: CodeParrainage[];
  /** Clients payants amenés par chaque partenaire, par identifiant. */
  clientsParPartenaire?: Record<string, number>;
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();

  const rafraichir = () => demarrerTransition(() => routeur.refresh());

  return (
    <div className="mt-10 grid gap-6 *:min-w-0 lg:grid-cols-2">
      <FormulairePartenaire onCree={rafraichir} />
      <FormulaireCode partenaires={partenaires} onCree={rafraichir} />
      <div className="lg:col-span-2">
        <ListePartenaires
          partenaires={partenaires}
          codes={codes}
          clientsParPartenaire={clientsParPartenaire}
          onChange={rafraichir}
          enCours={enCours}
        />
      </div>
      <div className="lg:col-span-2">
        <ListeCodes codes={codes} onChange={rafraichir} enCours={enCours} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Partenaire */

function FormulairePartenaire({ onCree }: { onCree: () => void }) {
  const [nom, setNom] = useState("");
  const [contact, setContact] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const envoyer = async () => {
    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    try {
      const reponse = await fetch("/api/admin/partenaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, contact }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le partenaire n'a pas pu être enregistré.");
        return;
      }
      setSucces(`${donnees.partenaire.nom} est enregistré.`);
      setNom("");
      setContact("");
      onCree();
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6">
      <h2 className="titre-editorial text-[1.2rem]">Nouveau partenaire</h2>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-gris-cadre">
        Un hôtel, une agence, un restaurant, un guide. À enregistrer une fois, avant de lui créer
        un code de parrainage.
      </p>

      <div className="mt-5 grid gap-4">
        <Champ libelle="Nom du partenaire" valeur={nom} onChange={setNom} />
        <Champ
          libelle="Contact"
          valeur={contact}
          onChange={setContact}
          aide="Téléphone ou email, facultatif."
        />
      </div>

      <button
        type="button"
        onClick={envoyer}
        disabled={envoi || nom.trim().length < 2}
        className="mt-5 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-2.5 text-[0.88rem] font-semibold text-craie transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        {envoi ? "Enregistrement…" : "Enregistrer le partenaire"}
      </button>

      {erreur && <p className="mt-3 text-[0.84rem] text-orange-sourd">{erreur}</p>}
      {succes && <p className="mt-3 text-[0.84rem] text-vert-lagune">{succes}</p>}
    </section>
  );
}

/* ----------------------------------------------------- Code parrainage */

function FormulaireCode({
  partenaires,
  onCree,
}: {
  partenaires: Partenaire[];
  onCree: () => void;
}) {
  const [code, setCode] = useState("");
  const [partenaireId, setPartenaireId] = useState("");
  const [debuteLe, setDebuteLe] = useState("");
  const [finitLe, setFinitLe] = useState("");
  const [utilisationsMax, setUtilisationsMax] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);

  /**
   * Le partenaire retenu, calcule a chaque rendu.
   *
   * Volontairement derive plutot que fige a l'initialisation : la page
   * s'ouvre souvent sans aucun partenaire, on en cree un, et la liste
   * se remplit sans que ce composant soit demonte. Une valeur posee une
   * seule fois au montage resterait vide, le menu afficherait pourtant
   * le premier partenaire, et l'envoi echouerait sur un champ que
   * l'exploitant voit rempli.
   */
  const partenaireRetenu = partenaireId || partenaires[0]?.id || "";

  const envoyer = async () => {
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setSucces(null);
    try {
      const reponse = await fetch("/api/admin/parrainage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          partenaireId: partenaireRetenu,
          debuteLe,
          finitLe,
          // Champ vide : pas de limite. `undefined` et non 0, qui
          // signifierait « zéro utilisation autorisée ».
          utilisationsMax: utilisationsMax ? Number(utilisationsMax) : undefined,
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le code n'a pas pu être créé.");
        setErreurs(donnees.champs ?? {});
        return;
      }
      setSucces(`Le code ${donnees.code.code} est actif.`);
      setCode("");
      onCree();
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  if (partenaires.length === 0) {
    return (
      <section className="rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6">
        <h2 className="titre-editorial text-[1.2rem]">Nouveau code de parrainage</h2>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-gris-cadre">
          Enregistrez d&apos;abord un partenaire : un code sans partenaire accorderait une
          réduction sans qu&apos;on sache jamais à qui verser la commission, ce qui est
          précisément ce qu&apos;on cherche à savoir.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6">
      <h2 className="titre-editorial text-[1.2rem]">Nouveau code de parrainage</h2>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-gris-cadre">
        Le client le saisit au moment de payer et obtient{" "}
        <strong className="font-semibold">{libelleReduction()}</strong>. Le partenaire touche{" "}
        <strong className="font-semibold">{libelleCommission()}</strong> de ce que son client a
        payé. Ces taux sont les mêmes pour tous les partenaires.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Champ
          libelle="Code"
          valeur={code}
          onChange={setCode}
          erreur={erreurs.code}
          aide="Majuscules automatiques."
        />
        <Liste
          libelle="Partenaire"
          valeur={partenaireRetenu}
          onChange={setPartenaireId}
          options={partenaires.map((partenaire) => ({
            valeur: partenaire.id,
            libelle: partenaire.actif ? partenaire.nom : `${partenaire.nom} (inactif)`,
          }))}
        />
        <Champ
          libelle="Valable à partir du"
          valeur={debuteLe}
          onChange={setDebuteLe}
          erreur={erreurs.debuteLe}
          type="date"
          aide="Vide : valable tout de suite."
        />
        <Champ
          libelle="Jusqu'au"
          valeur={finitLe}
          onChange={setFinitLe}
          erreur={erreurs.finitLe}
          type="date"
          aide="Vide : sans date de fin."
        />
        <Champ
          libelle="Utilisations maximum"
          valeur={utilisationsMax}
          onChange={setUtilisationsMax}
          erreur={erreurs.utilisationsMax}
          type="number"
          aide="Vide : sans limite."
        />
      </div>

      <button
        type="button"
        onClick={envoyer}
        disabled={envoi || code.trim().length < 3}
        className="mt-5 rounded-[var(--radius-bouton)] bg-orange-signal px-5 py-2.5 text-[0.88rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        {envoi ? "Création…" : "Créer le code"}
      </button>

      {erreur && <p className="mt-3 text-[0.84rem] text-orange-sourd">{erreur}</p>}
      {succes && <p className="mt-3 text-[0.84rem] text-vert-lagune">{succes}</p>}
    </section>
  );
}

/* ---------------------------------------------- Liste des partenaires */

/**
 * Les partenaires, avec de quoi les arrêter.
 *
 * Désactiver est le geste normal : le partenaire n'est plus proposé à la
 * création d'un code, mais ce qu'il a apporté et ce qu'on lui doit reste
 * lisible. Supprimer efface le partenaire et tous ses codes : ce n'est
 * proposé qu'à celui qui n'a jamais amené de client payant, sans quoi
 * ses commissions disparaîtraient avec lui. Le serveur le refuse de toute
 * façon, et refuse aussi tant qu'un client est en train de payer avec
 * l'un de ses codes.
 *
 * La suppression demande une confirmation qui dit ce qui part, codes
 * compris : on ne la déclenche pas d'un clic égaré.
 */
function ListePartenaires({
  partenaires,
  codes,
  clientsParPartenaire,
  onChange,
  enCours,
}: {
  partenaires: Partenaire[];
  codes: CodeParrainage[];
  clientsParPartenaire: Record<string, number>;
  onChange: () => void;
  enCours: boolean;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const appeler = async (id: string, methode: "PATCH" | "DELETE", corps?: object) => {
    setAction(id);
    setErreur(null);
    setSucces(null);
    try {
      const reponse = await fetch(`/api/admin/partenaires/${encodeURIComponent(id)}`, {
        method: methode,
        headers: corps ? { "Content-Type": "application/json" } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "L'opération a échoué.");
        return null;
      }
      onChange();
      return donnees;
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
      return null;
    } finally {
      setAction(null);
    }
  };

  const supprimer = async (partenaire: Partenaire) => {
    const donnees = await appeler(partenaire.id, "DELETE");
    setAConfirmer(null);
    if (donnees) {
      const n = donnees.codes ?? 0;
      setSucces(
        `${partenaire.nom} est supprimé${n > 0 ? `, avec ${n} code${n > 1 ? "s" : ""}` : ""}.`,
      );
    }
  };

  if (partenaires.length === 0) return null;

  return (
    <section>
      <h2 className="titre-editorial text-[1.2rem]">Partenaires</h2>
      <p className="mt-2 text-[0.84rem] leading-relaxed text-gris-cadre">
        Un partenariat qui s&apos;arrête se désactive : son historique et ses commissions restent
        lisibles. La suppression n&apos;est possible que pour un partenaire qui n&apos;a jamais
        amené de client payant.
      </p>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed"
        >
          {erreur}
        </p>
      )}
      {succes && <p className="mt-4 text-[0.86rem] text-vert-lagune">{succes}</p>}

      {/* Sur téléphone, une fiche par partenaire, ses actions en bas, à
          portée de pouce. Dans le tableau, elles tombaient hors de
          l'écran, au bout d'une ligne qu'il fallait faire glisser. */}
      <ul className="mt-4 grid gap-3 md:hidden">
        {partenaires.map((partenaire) => {
          const nombreCodes = codes.filter((c) => c.partenaireId === partenaire.id).length;
          const clients = clientsParPartenaire[partenaire.id] ?? 0;
          const occupe = action === partenaire.id || enCours;
          return (
            <li
              key={partenaire.id}
              className="rounded-[var(--radius-carte)] border border-noir-piste/12 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{partenaire.nom}</p>
                  <p className="text-[0.8rem] text-gris-cadre">
                    {partenaire.contact || "contact non renseigné"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                    partenaire.actif
                      ? "bg-vert-lagune/15 text-vert-lagune"
                      : "bg-craie-ombre text-noir-piste"
                  }`}
                >
                  {partenaire.actif ? "Actif" : "Désactivé"}
                </span>
              </div>
              <p className="mt-2 text-[0.82rem] text-gris-cadre">
                {nombreCodes} code{nombreCodes > 1 ? "s" : ""} · {clients} client
                {clients > 1 ? "s" : ""} payant{clients > 1 ? "s" : ""}
              </p>

              {aConfirmer === partenaire.id ? (
                <div className="mt-3 rounded-[var(--radius-carte)] bg-orange-signal/10 p-3">
                  <p className="text-[0.84rem]">
                    Supprimer {partenaire.nom}
                    {nombreCodes > 0
                      ? ` et ses ${nombreCodes} code${nombreCodes > 1 ? "s" : ""}`
                      : ""}{" "}
                    ?
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => supprimer(partenaire)}
                      disabled={occupe}
                      className="h-11 rounded-[var(--radius-bouton)] bg-orange-signal text-[0.84rem] font-semibold text-noir-piste disabled:opacity-40"
                    >
                      {action === partenaire.id ? "Suppression…" : "Oui, supprimer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAConfirmer(null)}
                      disabled={occupe}
                      className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[0.84rem] font-semibold"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`mt-3 grid gap-2 ${clients === 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                  <button
                    type="button"
                    onClick={() => appeler(partenaire.id, "PATCH", { actif: !partenaire.actif })}
                    disabled={occupe}
                    className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[0.84rem] font-semibold text-orange-sourd disabled:opacity-40"
                  >
                    {partenaire.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  {clients === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setErreur(null);
                        setSucces(null);
                        setAConfirmer(partenaire.id);
                      }}
                      disabled={occupe}
                      className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[0.84rem] font-semibold text-gris-cadre disabled:opacity-40"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] border-collapse text-left text-[0.86rem]">
          <thead>
            <tr className="border-b border-noir-piste/20 text-[0.74rem] uppercase tracking-[0.06em] text-gris-cadre">
              <th className="py-2 pr-4 font-semibold">Partenaire</th>
              <th className="py-2 pr-4 font-semibold">Contact</th>
              <th className="py-2 pr-4 text-right font-semibold">Codes</th>
              <th className="py-2 pr-4 text-right font-semibold">Clients payants</th>
              <th className="py-2 pr-4 font-semibold">État</th>
              <th className="py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {partenaires.map((partenaire) => {
              const nombreCodes = codes.filter((c) => c.partenaireId === partenaire.id).length;
              const clients = clientsParPartenaire[partenaire.id] ?? 0;
              const occupe = action === partenaire.id || enCours;
              return (
                <tr key={partenaire.id} className="border-b border-noir-piste/10 align-top">
                  <td className="py-3 pr-4 font-semibold">{partenaire.nom}</td>
                  <td className="py-3 pr-4 text-gris-cadre">{partenaire.contact || "non renseigné"}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{nombreCodes}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{clients}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                        partenaire.actif
                          ? "bg-vert-lagune/15 text-vert-lagune"
                          : "bg-craie-ombre text-noir-piste"
                      }`}
                    >
                      {partenaire.actif ? "Actif" : "Désactivé"}
                    </span>
                  </td>
                  <td className="py-3">
                    {aConfirmer === partenaire.id ? (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-[0.82rem]">
                          Supprimer {partenaire.nom}
                          {nombreCodes > 0
                            ? ` et ses ${nombreCodes} code${nombreCodes > 1 ? "s" : ""}`
                            : ""}{" "}
                          ?
                        </span>
                        <button
                          type="button"
                          onClick={() => supprimer(partenaire)}
                          disabled={occupe}
                          className="rounded-[var(--radius-bouton)] bg-orange-signal px-3 py-1.5 text-[0.8rem] font-semibold text-noir-piste disabled:opacity-40"
                        >
                          {action === partenaire.id ? "Suppression…" : "Oui, supprimer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAConfirmer(null)}
                          disabled={occupe}
                          className="lien-souligne cible-elargie text-[0.82rem]"
                        >
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <span className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => appeler(partenaire.id, "PATCH", { actif: !partenaire.actif })}
                          disabled={occupe}
                          className="lien-souligne cible-elargie text-[0.82rem] font-semibold text-orange-sourd disabled:opacity-40"
                        >
                          {partenaire.actif ? "Désactiver" : "Réactiver"}
                        </button>
                        {clients === 0 && (
                          <>
                            <span aria-hidden="true" className="px-2 text-noir-piste/30">
                              ·
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setErreur(null);
                                setSucces(null);
                                setAConfirmer(partenaire.id);
                              }}
                              disabled={occupe}
                              className="lien-souligne cible-elargie text-[0.82rem] font-semibold text-gris-cadre disabled:opacity-40"
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Liste des codes */

function ListeCodes({
  codes,
  onChange,
  enCours,
}: {
  codes: CodeParrainage[];
  onChange: () => void;
  enCours: boolean;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = async (code: string, actif: boolean) => {
    setAction(code);
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/parrainage/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif }),
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "La modification a échoué.");
        return;
      }
      onChange();
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setAction(null);
    }
  };

  const supprimer = async (code: string) => {
    setAction(code);
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/parrainage/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "La suppression a échoué.");
        return;
      }
      onChange();
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setAction(null);
    }
  };

  if (codes.length === 0) {
    return (
      <p className="rounded-[var(--radius-bloc)] border border-noir-piste/12 p-6 text-[0.88rem] leading-relaxed text-gris-cadre">
        Aucun code de parrainage pour le moment.
      </p>
    );
  }

  return (
    <section>
      <h2 className="titre-editorial text-[1.2rem]">Codes existants</h2>
      <p className="mt-2 text-[0.84rem] text-gris-cadre">
        Tous accordent {libelleReduction()} au client et {libelleCommission()} de commission au
        partenaire.
      </p>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem] leading-relaxed"
        >
          {erreur}
        </p>
      )}

      {/* Sur téléphone, une fiche par code, les actions en bas. */}
      <ul className="mt-4 grid gap-3 md:hidden">
        {codes.map((code) => {
          const occupe = action === code.code || enCours;
          return (
            <li
              key={code.code}
              className="rounded-[var(--radius-carte)] border border-noir-piste/12 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-[0.95rem] font-semibold">{code.code}</p>
                  <p className="text-[0.8rem] text-gris-cadre">
                    {code.partenaireNom || "non rattaché"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                    code.actif
                      ? "bg-vert-lagune/15 text-vert-lagune"
                      : "bg-craie-ombre text-noir-piste"
                  }`}
                >
                  {code.actif ? "Actif" : "Désactivé"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.82rem]">
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Utilisations</dt>
                  <dd className="tabular-nums">
                    {code.utilisations}
                    {code.utilisationsMax !== undefined && (
                      <span className="text-gris-cadre"> / {code.utilisationsMax}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Validité</dt>
                  <dd>
                    {code.debuteLe || code.finitLe ? (
                      <>
                        {code.debuteLe ? formatDate(code.debuteLe) : "dès maintenant"}
                        {" → "}
                        {code.finitLe ? formatDate(code.finitLe) : "sans fin"}
                      </>
                    ) : (
                      <span className="text-gris-cadre">sans limite</span>
                    )}
                  </dd>
                </div>
              </dl>
              <div
                className={`mt-3 grid gap-2 ${code.utilisations === 0 ? "grid-cols-2" : "grid-cols-1"}`}
              >
                <button
                  type="button"
                  onClick={() => basculer(code.code, !code.actif)}
                  disabled={occupe}
                  className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[0.84rem] font-semibold text-orange-sourd disabled:opacity-40"
                >
                  {code.actif ? "Désactiver" : "Réactiver"}
                </button>
                {code.utilisations === 0 && (
                  <button
                    type="button"
                    onClick={() => supprimer(code.code)}
                    disabled={occupe}
                    className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 text-[0.84rem] font-semibold text-gris-cadre disabled:opacity-40"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[46rem] border-collapse text-left text-[0.86rem]">
          <thead>
            <tr className="border-b border-noir-piste/20 text-[0.74rem] uppercase tracking-[0.06em] text-gris-cadre">
              <th className="py-2 pr-4 font-semibold">Code</th>
              <th className="py-2 pr-4 font-semibold">Partenaire</th>
              <th className="py-2 pr-4 font-semibold">Réduction</th>
              <th className="py-2 pr-4 font-semibold">Validité</th>
              <th className="py-2 pr-4 text-right font-semibold">Utilisations</th>
              <th className="py-2 pr-4 font-semibold">État</th>
              <th className="py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.code} className="border-b border-noir-piste/10">
                <td className="py-3 pr-4 font-mono font-semibold whitespace-nowrap">
                  {code.code}
                </td>
                <td className="py-3 pr-4">{code.partenaireNom || "non rattaché"}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{libelleReduction()}</td>
                <td className="py-3 pr-4 text-[0.8rem] whitespace-nowrap">
                  {code.debuteLe || code.finitLe ? (
                    <>
                      {code.debuteLe ? formatDate(code.debuteLe) : "dès maintenant"}
                      {" → "}
                      {code.finitLe ? formatDate(code.finitLe) : "sans fin"}
                    </>
                  ) : (
                    <span className="text-gris-cadre">sans limite de date</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {code.utilisations}
                  {code.utilisationsMax !== undefined && (
                    <span className="text-gris-cadre"> / {code.utilisationsMax}</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                      code.actif
                        ? "bg-vert-lagune/15 text-vert-lagune"
                        : "bg-craie-ombre text-noir-piste"
                    }`}
                  >
                    {code.actif ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => basculer(code.code, !code.actif)}
                    disabled={action === code.code || enCours}
                    className="lien-souligne text-[0.82rem] font-semibold text-orange-sourd disabled:opacity-40"
                  >
                    {code.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  {/* La suppression n'apparaît que sur un code jamais
                      utilisé : au-delà, elle effacerait les utilisations
                      comptées au partenaire. */}
                  {code.utilisations === 0 && (
                    <>
                      <span aria-hidden="true" className="px-2 text-noir-piste/30">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => supprimer(code.code)}
                        disabled={action === code.code || enCours}
                        className="lien-souligne text-[0.82rem] font-semibold text-gris-cadre disabled:opacity-40"
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Champs */

function Champ({
  libelle,
  valeur,
  onChange,
  erreur,
  aide,
  type = "text",
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  erreur?: string;
  aide?: string;
  type?: string;
}) {
  const identifiant = `promo-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;
  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
      </label>
      <input
        id={identifiant}
        type={type}
        value={valeur}
        aria-invalid={erreur ? true : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-4 py-2.5 text-[0.92rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/20"
        }`}
      />
      {erreur ? (
        <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreur}</p>
      ) : aide ? (
        <p className="mt-1.5 text-[0.78rem] text-gris-cadre">{aide}</p>
      ) : null}
    </div>
  );
}

function Liste({
  libelle,
  valeur,
  onChange,
  options,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  options: { valeur: string; libelle: string }[];
}) {
  const identifiant = `promo-liste-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;
  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
      </label>
      <select
        id={identifiant}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem] outline-none transition-colors focus:border-orange-signal"
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}
