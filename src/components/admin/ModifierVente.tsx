"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { usePrenomRetenu } from "@/components/admin/ChampPrenom";
import { Champ, type VeloComptoir } from "@/components/admin/VenteEspeces";
import { OCTOBRE_ROSE } from "@/data/octobre-rose";
import {
  estOffreGroupe,
  FERMETURE_COMPTOIR_HEURE,
  heureAuBenin,
  nomDeGamme,
  OUVERTURE_COMPTOIR_HEURE,
  roadTripsDuJour,
} from "@/data/offres";
import { jourProgrammePadel } from "@/data/padel-bike";
import { formatHeureMinute, type ReglagesProduits } from "@/data/reglages";
import { ajouterJours } from "@/lib/dates";
import { creneauxSeChevauchent, type CreneauOccupe } from "@/lib/db/contrat";
import { formatDateAvecJour, resumeOffre } from "@/lib/format";
import {
  calculerModification,
  champsModifiables,
  DUREES_LOCATION,
  messageVelosModification,
  PERSONNES_MAX_VENTE,
  prixDuComptoirAujourdhui,
  prixParGamme,
  type VenteAModifier,
} from "@/lib/modification-vente";
import { formatMontant } from "@/lib/offres";
import { insecables } from "@/lib/offres-groupe/textes-chat";
import { LIBELLE_AGENT, MESSAGE_PRENOM_ATTENDU, ressembleAUnPrenom } from "@/lib/prenom-agent";

/** Ce que la fenêtre de modification doit savoir de la vente, tiré d'elle par la page. */
export interface VenteModifiable extends VenteAModifier {
  reference: string;
  minuteDebut?: number;
  minuteFin?: number;
  client: { prenom: string; nom: string; email: string; telephone: string };
  encaissePar: string;
}

/** Un créneau pris, et la vente qui le prend : les siens ne gênent pas la vente qu'on modifie. */
export type CreneauPris = CreneauOccupe & { reference: string };

/** La réponse du serveur à une modification enregistrée. */
interface ModificationFaite {
  deja: boolean;
  ancienTotalXof: number;
  totalXof: number;
  differenceXof: number;
  /** La vente a été remise au prix du comptoir : rien à rendre par réflexe. */
  remiseAuPrixDuComptoir: boolean;
  velosRetires: string[];
  velosAjoutes: string[];
}

/** « samedi 17 octobre » devient « Samedi 17 octobre ». */
const jourLisible = (date: string) => {
  const texte = formatDateAvecJour(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const enEtat = (velo: VeloComptoir) => velo.statut !== "MAINTENANCE" && velo.statut !== "RETIRE";

/**
 * Le bouton « Modifier » d'une vente en espèces, et sa fenêtre (demande du
 * responsable du 19 novembre 2026). Une vente même ancienne se corrige : le
 * client, l'agent qui a encaissé, et pour une vente au comptoir classique le
 * nombre, le jour, l'heure et la durée, là où la vente les laissait choisir.
 * Une offre de groupe ne change que de client et d'agent.
 *
 * Le nouveau montant s'affiche avant l'enregistrement, avec ce qu'il faut
 * rendre au client ou encaisser en plus : il vient du même calcul que le
 * serveur, qui le refait et refuse tout autre montant. Une vente ancienne
 * enregistrée à un autre prix que celui du comptoir d'aujourd'hui peut y
 * être remise, d'une case à cocher. Aucun email ne part.
 */
export function ModifierVente({
  vente,
  velos,
  occupes,
  reglages,
}: {
  vente: VenteModifiable;
  velos: VeloComptoir[];
  occupes: Record<string, CreneauPris[]>;
  reglages: ReglagesProduits;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="lien-souligne text-[0.8rem] font-semibold text-orange-sourd"
      >
        Modifier
      </button>
      {ouvert && (
        <FenetreModification
          vente={vente}
          velos={velos}
          occupes={occupes}
          reglages={reglages}
          onFermer={() => setOuvert(false)}
        />
      )}
    </>
  );
}

function FenetreModification({
  vente,
  velos,
  occupes,
  reglages,
  onFermer,
}: {
  vente: VenteModifiable;
  velos: VeloComptoir[];
  occupes: Record<string, CreneauPris[]>;
  reglages: ReglagesProduits;
  onFermer: () => void;
}) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();
  const id = useId();
  const fenetre = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogue = fenetre.current;
    if (dialogue && !dialogue.open) dialogue.showModal();
  }, []);

  const [aujourdhuiIci] = useState(() => heureAuBenin(new Date()).date);
  const peut = champsModifiables(vente.offre);
  const groupe = estOffreGroupe(vente.offre);
  const locationLibre = vente.offre === "location-libre";

  const [personnes, setPersonnes] = useState(vente.nombrePersonnes);
  const [date, setDate] = useState(vente.dateDebut);
  const [heure, setHeure] = useState(vente.heureDebut);
  const [duree, setDuree] = useState(vente.dureeHeures ?? 1);
  const [prenom, setPrenom] = useState(vente.client.prenom);
  const [nom, setNom] = useState(vente.client.nom);
  const [email, setEmail] = useState(vente.client.email);
  const [telephone, setTelephone] = useState(vente.client.telephone);
  const [encaissePar, setEncaissePar] = useState(vente.encaissePar);
  const [auPrixDuComptoir, setAuPrixDuComptoir] = useState(false);
  // « Modifié par » : le prénom retenu sur ce téléphone, comme celui de l'agent qui encaisse.
  const { prenom: modifiePar, setPrenom: setModifiePar, retenir } = usePrenomRetenu();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [fait, setFait] = useState<ModificationFaite | null>(null);

  // Seuls les champs changés partent : une autre modification faite entre-temps sur un autre champ n'est pas défaite.
  const creneau = {
    ...(peut.personnes && personnes !== vente.nombrePersonnes ? { nombrePersonnes: personnes } : {}),
    ...(peut.date && date !== vente.dateDebut ? { date } : {}),
    ...(peut.heure && heure !== vente.heureDebut ? { heureDebut: heure } : {}),
    ...(peut.duree && duree !== (vente.dureeHeures ?? 1) ? { dureeHeures: duree } : {}),
  };
  const contact = {
    ...(prenom.trim() !== vente.client.prenom ? { prenom: prenom.trim() } : {}),
    ...(nom.trim() !== vente.client.nom ? { nom: nom.trim() } : {}),
    ...(email.trim().toLowerCase() !== vente.client.email ? { email: email.trim().toLowerCase() } : {}),
    ...(telephone.trim() !== vente.client.telephone ? { telephone: telephone.trim() } : {}),
    ...(encaissePar.trim() !== vente.encaissePar ? { encaissePar: encaissePar.trim() } : {}),
  };

  // Le prix du comptoir d'aujourd'hui pour la vente telle quelle : s'il
  // diffère du montant enregistré, le commercial peut l'y remettre. La case
  // ne sert que si rien d'autre ne refait déjà le prix (nombre, durée).
  const prixComptoir = prixDuComptoirAujourdhui(vente, reglages, aujourdhuiIci);
  const sansLaCase = calculerModification(vente, creneau, reglages, aujourdhuiIci);
  const caseProposee =
    prixComptoir !== null && prixComptoir !== vente.totalXof && !(sansLaCase.ok && sansLaCase.calcul.recalcule);
  const remettre = caseProposee && auPrixDuComptoir;
  const changements = { ...creneau, ...contact, ...(remettre ? { remettreAuPrixDuComptoir: true } : {}) };

  const issue = remettre
    ? calculerModification(vente, { ...creneau, remettreAuPrixDuComptoir: true }, reglages, aujourdhuiIci)
    : sansLaCase;
  const calcul = issue.ok ? issue.calcul : null;
  const champs: Record<string, string> = { ...(issue.ok ? {} : issue.champs), ...erreurs };
  const nouveauTotal = calcul?.totalXof ?? vente.totalXof;
  const ecart = nouveauTotal - vente.totalXof;

  // Les vélos libres pour cette vente sur le créneau, les siens compris : une
  // indication, le serveur recompte. Les créneaux passés ne sont pas connus ici.
  const parGamme = prixParGamme(vente.offre);
  const libres =
    calcul && calcul.date >= aujourdhuiIci && (calcul.creneauChange || personnes > vente.nombrePersonnes)
      ? velos.filter(
          (velo) =>
            enEtat(velo) &&
            (!parGamme || velo.gamme === vente.gamme) &&
            !(occupes[velo.id] ?? []).some(
              (pris) =>
                pris.reference !== vente.reference &&
                creneauxSeChevauchent(
                  { debut: calcul.date, fin: calcul.date, heureDebut: calcul.heureDebut, heureFin: calcul.heureFin },
                  pris,
                ),
            ),
        ).length
      : null;

  // L'agent qui a encaissé et celui qui modifie : un prénom, deux lettres au
  // moins. Une ancienne vente qui porte un montant à la place (« 3500 ») le
  // dit dès l'ouverture, jusqu'à ce que le commercial le remplace.
  const agent = encaissePar.trim();
  const erreurAgent =
    agent.length < 2 ? "Indiquez qui a reçu l'argent." : !ressembleAUnPrenom(agent) ? MESSAGE_PRENOM_ATTENDU : null;
  const signataire = modifiePar.trim();
  const erreurSignataire =
    signataire.length < 2 ? "Indiquez qui modifie la vente." : !ressembleAUnPrenom(signataire) ? MESSAGE_PRENOM_ATTENDU : null;

  const obstacle = fait
    ? null
    : erreurAgent
      ? erreurAgent
      : Object.keys(changements).length === 0
        ? "Rien n'a changé."
        : !issue.ok
          ? "Corrigez les champs signalés."
          : libres !== null && personnes > libres
            ? messageVelosModification(vente.offre, vente.gamme, libres)
            : contact.prenom === "" || contact.nom === "" || contact.email === ""
              ? "Renseignez le prénom, le nom et l'email du client."
              : erreurSignataire;

  const fermer = () => fenetre.current?.close();

  const enregistrer = async () => {
    if (obstacle || envoi || !calcul) return;
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    try {
      const reponse = await fetch(`/api/admin/especes/${encodeURIComponent(vente.reference)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...changements,
          totalAttenduXof: vente.totalXof,
          nouveauTotalXof: calcul.totalXof,
          modifiePar: modifiePar.trim(),
        }),
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || typeof donnees?.totalXof !== "number") {
        setErreur(
          donnees?.erreur ??
            (reponse.ok
              ? "La réponse n'est pas arrivée en entier : fermez, puis rouvrez la vente pour voir si elle a changé."
              : "La modification n'a pas pu être enregistrée."),
        );
        setErreurs(donnees?.champs ?? {});
        // La vente ou les réglages ont changé : la page relit tout, le montant se recalcule.
        if (["CHANGEE", "MONTANT", "ANNULEE"].includes(donnees?.code)) demarrerTransition(() => routeur.refresh());
        return;
      }
      retenir();
      setFait({
        deja: Boolean(donnees.deja),
        ancienTotalXof: donnees.ancienTotalXof ?? vente.totalXof,
        totalXof: donnees.totalXof,
        differenceXof: donnees.differenceXof ?? 0,
        remiseAuPrixDuComptoir: remettre,
        velosRetires: donnees.velosRetires ?? [],
        velosAjoutes: donnees.velosAjoutes ?? [],
      });
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient : la modification ne sera pas comptée deux fois.");
    } finally {
      setEnvoi(false);
    }
  };

  // Les jours proposés : ceux du départ (road trip) ou des sorties (Octobre rose), le jour de la vente compris.
  const joursProposes =
    vente.offre === "road-trip"
      ? [
          ...new Set([
            vente.dateDebut,
            ...Array.from({ length: 28 }, (_, ecart) => ajouterJours(aujourdhuiIci, ecart)).filter(
              (jour) => roadTripsDuJour(jour).length > 0,
            ).slice(0, 6),
          ]),
        ].sort()
      : vente.offre === "octobre-rose"
        ? [...new Set([vente.dateDebut, ...OCTOBRE_ROSE.sorties.map((s) => s.date).filter((jour) => jour >= aujourdhuiIci)])].sort()
        : null;
  const horaire = calcul?.horaire ?? vente.horaire;
  const padelHorsProgramme = vente.offre === "padel-bike" && date !== vente.dateDebut && !jourProgrammePadel(reglages.padel, date);
  const unite = locationLibre ? "vélo" : "personne";

  return (
    <dialog
      ref={fenetre}
      onClose={onFermer}
      aria-labelledby={`${id}-titre`}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-[var(--radius-bloc)] border-0 bg-white p-0 text-left text-noir-piste shadow-xl backdrop:bg-noir-piste/50"
    >
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-titre`} className="titre-editorial text-[1.25rem]">
              Modifier la vente
            </h2>
            <p className="mt-1 text-[0.8rem] text-gris-cadre">
              <span className="font-mono">{vente.reference}</span> · {resumeOffre(vente)} ·{" "}
              {vente.client.prenom} {vente.client.nom}
            </p>
          </div>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer"
            className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[1.4rem] leading-none text-gris-cadre hover:bg-craie"
          >
            ×
          </button>
        </div>

        {fait ? (
          <div role="status" className="mt-5 rounded-[var(--radius-carte)] bg-vert-lagune/12 px-4 py-3 text-[0.88rem] leading-relaxed text-vert-lagune">
            <p className="font-semibold">
              {fait.deja ? "Cette modification était déjà enregistrée." : "Vente modifiée et notée au journal."}
            </p>
            {/* Remise au prix du comptoir : le montant noté est corrigé, rien n'est à rendre par réflexe. */}
            {fait.remiseAuPrixDuComptoir && fait.differenceXof !== 0 && (
              <p className="mt-1 font-semibold text-noir-piste">
                Le montant enregistré est passé de {formatMontant(fait.ancienTotalXof)} à {formatMontant(fait.totalXof)}.
              </p>
            )}
            {!fait.remiseAuPrixDuComptoir && fait.differenceXof < 0 && (
              <p className="mt-1 font-semibold text-noir-piste">Rendez {formatMontant(-fait.differenceXof)} au client.</p>
            )}
            {!fait.remiseAuPrixDuComptoir && fait.differenceXof > 0 && (
              <p className="mt-1 font-semibold text-noir-piste">Encaissez {formatMontant(fait.differenceXof)} de plus.</p>
            )}
            {fait.velosRetires.length > 0 && (
              <p className="mt-1 text-noir-piste">
                {insecables(`${fait.velosRetires.length > 1 ? "Vélos libérés" : "Vélo libéré"} : ${fait.velosRetires.join(", ")}`)}
              </p>
            )}
            {fait.velosAjoutes.length > 0 && (
              <p className="mt-1 text-noir-piste">
                {insecables(`${fait.velosAjoutes.length > 1 ? "Vélos à remettre en plus" : "Vélo à remettre en plus"} : ${fait.velosAjoutes.join(", ")}`)}
              </p>
            )}
            <p className="mt-1 text-gris-cadre">Aucun email n&apos;est parti au client.</p>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(evenement) => {
              evenement.preventDefault();
              void enregistrer();
            }}
          >
            <fieldset disabled={envoi} className="m-0 min-w-0 border-0 p-0">
              {groupe ? (
                <p className="mt-4 rounded-[var(--radius-bouton)] bg-craie px-3 py-2 text-[0.8rem] leading-relaxed">
                  {insecables("Offre de groupe : seuls le client et l'agent qui a encaissé se modifient ici.")}
                </p>
              ) : (
                <div className="mt-4 grid gap-4 *:min-w-0 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-personnes`} className="text-[0.8rem] text-gris-cadre">
                      {locationLibre ? "Nombre de vélos" : "Nombre de personnes"}
                    </label>
                    <select
                      id={`${id}-personnes`}
                      value={personnes}
                      onChange={(evenement) => setPersonnes(Number(evenement.target.value))}
                      className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-3 py-2.5 text-[0.92rem]"
                    >
                      {Array.from({ length: Math.max(PERSONNES_MAX_VENTE, vente.nombrePersonnes) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {pluriel(n, unite)}
                        </option>
                      ))}
                    </select>
                    {champs.nombrePersonnes ? (
                      <p className="mt-1.5 text-[0.76rem] text-orange-sourd">{insecables(champs.nombrePersonnes)}</p>
                    ) : libres !== null ? (
                      <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
                        {pluriel(libres, "vélo")}
                        {parGamme && vente.gamme ? ` ${nomDeGamme(vente.gamme)}` : ""} libre{libres > 1 ? "s" : ""} pour cette vente sur ce créneau.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor={`${id}-jour`} className="text-[0.8rem] text-gris-cadre">
                      Jour
                    </label>
                    {joursProposes ? (
                      <select
                        id={`${id}-jour`}
                        value={date}
                        onChange={(evenement) => setDate(evenement.target.value)}
                        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-3 py-2.5 text-[0.92rem]"
                      >
                        {joursProposes.map((jour) => (
                          <option key={jour} value={jour}>
                            {jourLisible(jour)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`${id}-jour`}
                        type="date"
                        value={date}
                        min={vente.dateDebut < aujourdhuiIci ? vente.dateDebut : aujourdhuiIci}
                        max={ajouterJours(aujourdhuiIci, 60)}
                        onChange={(evenement) => evenement.target.value && setDate(evenement.target.value)}
                        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-3 py-2.5 text-[0.92rem]"
                      />
                    )}
                    {champs.date ? (
                      <p className="mt-1.5 text-[0.76rem] text-orange-sourd">{insecables(champs.date)}</p>
                    ) : padelHorsProgramme ? (
                      <p className="mt-1.5 text-[0.76rem] text-orange-sourd">
                        {insecables("Attention : aucun Padel bike n'est programmé ce jour-là. Vérifiez la date.")}
                      </p>
                    ) : null}
                  </div>

                  {peut.heure && (
                    <div>
                      <label htmlFor={`${id}-heure`} className="text-[0.8rem] text-gris-cadre">
                        Départ
                      </label>
                      <select
                        id={`${id}-heure`}
                        value={heure}
                        onChange={(evenement) => setHeure(Number(evenement.target.value))}
                        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-3 py-2.5 text-[0.92rem]"
                      >
                        {Array.from(
                          { length: FERMETURE_COMPTOIR_HEURE - OUVERTURE_COMPTOIR_HEURE },
                          (_, i) => OUVERTURE_COMPTOIR_HEURE + i,
                        ).map((h) => (
                          <option key={h} value={h}>
                            {h} h
                          </option>
                        ))}
                      </select>
                      <p className={`mt-1.5 text-[0.76rem] ${champs.heureDebut ? "text-orange-sourd" : "text-gris-cadre"}`}>
                        {champs.heureDebut ? insecables(champs.heureDebut) : calcul ? `Retour à ${calcul.heureFin} h.` : null}
                      </p>
                    </div>
                  )}

                  {peut.duree && (
                    <div>
                      <label htmlFor={`${id}-duree`} className="text-[0.8rem] text-gris-cadre">
                        Durée
                      </label>
                      <select
                        id={`${id}-duree`}
                        value={duree}
                        onChange={(evenement) => setDuree(Number(evenement.target.value))}
                        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-3 py-2.5 text-[0.92rem]"
                      >
                        {DUREES_LOCATION.map((h) => (
                          <option key={h} value={h}>
                            {h} h
                          </option>
                        ))}
                      </select>
                      {champs.dureeHeures && (
                        <p className="mt-1.5 text-[0.76rem] text-orange-sourd">{insecables(champs.dureeHeures)}</p>
                      )}
                    </div>
                  )}

                  {vente.offre === "padel-bike" && horaire && (
                    <p className="self-end text-[0.8rem] text-gris-cadre sm:col-span-2">
                      {insecables(`Horaire : ${formatHeureMinute(horaire.depart)} - ${formatHeureMinute(horaire.retour)}.`)}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-4 *:min-w-0 sm:grid-cols-2">
                <Champ id={`${id}-prenom`} libelle="Prénom" valeur={prenom} onChange={setPrenom} erreur={champs.prenom} autoComplete="off" />
                <Champ id={`${id}-nom`} libelle="Nom" valeur={nom} onChange={setNom} erreur={champs.nom} autoComplete="off" />
                <Champ
                  id={`${id}-email`}
                  libelle="Email"
                  type="email"
                  valeur={email}
                  onChange={setEmail}
                  erreur={champs.email}
                  autoComplete="off"
                />
                <Champ
                  id={`${id}-telephone`}
                  libelle="Téléphone (facultatif)"
                  type="tel"
                  valeur={telephone}
                  onChange={setTelephone}
                  erreur={champs.telephone}
                  autoComplete="off"
                />
                <Champ
                  id={`${id}-encaisse-par`}
                  libelle={LIBELLE_AGENT}
                  obligatoire
                  valeur={encaissePar}
                  onChange={setEncaissePar}
                  erreur={champs.encaissePar ?? erreurAgent ?? undefined}
                  autoComplete="off"
                />
                <Champ
                  id={`${id}-modifie-par`}
                  libelle="Modifié par"
                  obligatoire
                  valeur={modifiePar}
                  onChange={setModifiePar}
                  erreur={champs.modifiePar ?? (signataire.length >= 2 && erreurSignataire ? erreurSignataire : undefined)}
                  aide="Votre prénom. Il est retenu sur ce téléphone."
                  autoComplete="given-name"
                />
              </div>

              {/* Une vente ancienne, enregistrée à un autre prix que celui du comptoir d'aujourd'hui. */}
              {caseProposee && prixComptoir !== null && (
                <label className="mt-4 flex items-start gap-3 rounded-[var(--radius-bouton)] bg-craie px-3 py-3 text-[0.86rem] leading-relaxed">
                  <input
                    type="checkbox"
                    checked={auPrixDuComptoir}
                    onChange={(evenement) => setAuPrixDuComptoir(evenement.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-orange-signal"
                  />
                  <span>
                    Remettre au prix du comptoir d&apos;aujourd&apos;hui ({formatMontant(prixComptoir)} au lieu de{" "}
                    {formatMontant(vente.totalXof)})
                  </span>
                </label>
              )}

              {/* Le montant, avant d'enregistrer : l'ancien, le nouveau, et l'écart à régler. */}
              <div className="mt-5 rounded-[var(--radius-carte)] bg-noir-piste p-4 text-craie" aria-live="polite">
                {ecart === 0 ? (
                  <p className="text-[0.9rem]">
                    {insecables("Montant inchangé : ")}
                    <strong className="tabular-nums">{formatMontant(vente.totalXof)}</strong>
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 text-[0.86rem] tabular-nums">
                      <dt className="text-craie/70">Ancien montant</dt>
                      <dd className="text-right text-craie/70 line-through">{formatMontant(vente.totalXof)}</dd>
                      <dt className="text-craie/70">Nouveau montant</dt>
                      <dd className="text-right font-display text-[1.4rem] font-bold">{formatMontant(nouveauTotal)}</dd>
                    </dl>
                    {remettre ? (
                      // Remise au prix du comptoir : le montant noté est corrigé. Rien à rendre par réflexe.
                      <p className="mt-2 text-[0.86rem] leading-relaxed">
                        Le montant enregistré passe de {formatMontant(vente.totalXof)} à {formatMontant(nouveauTotal)}. Si
                        vous aviez déjà encaissé {formatMontant(nouveauTotal)}, il n&apos;y a rien à{" "}
                        {ecart < 0 ? "rendre" : "encaisser en plus"}.
                      </p>
                    ) : (
                      <p className="mt-2 text-[0.9rem] font-semibold text-orange-signal">
                        {insecables(
                          ecart < 0
                            ? `À rendre au client : ${formatMontant(-ecart)}`
                            : `À encaisser en plus : ${formatMontant(ecart)}`,
                        )}
                      </p>
                    )}
                  </>
                )}
                <p className="mt-2 text-[0.76rem] text-craie/70">Aucun email ne part au client.</p>
              </div>

              {erreur && (
                <p role="alert" className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.86rem]">
                  {insecables(erreur)}
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  type="submit"
                  disabled={Boolean(obstacle) || envoi}
                  className="min-h-[48px] rounded-[var(--radius-bouton)] bg-orange-signal px-4 text-[0.92rem] font-semibold text-noir-piste transition-colors hover:bg-orange-vif disabled:opacity-40"
                >
                  {envoi ? "Enregistrement…" : "Enregistrer la modification"}
                </button>
                <button
                  type="button"
                  onClick={fermer}
                  className="min-h-[48px] rounded-[var(--radius-bouton)] border border-noir-piste/25 px-4 text-[0.9rem] font-semibold"
                >
                  Fermer
                </button>
              </div>
              {obstacle && !envoi && <p className="mt-2 text-center text-[0.8rem] text-gris-cadre">{insecables(obstacle)}</p>}
            </fieldset>
          </form>
        )}

        {fait && (
          <button
            type="button"
            onClick={fermer}
            className="mt-4 min-h-[48px] w-full rounded-[var(--radius-bouton)] bg-noir-piste px-4 text-[0.9rem] font-semibold text-craie"
          >
            Fermer
          </button>
        )}
      </div>
    </dialog>
  );
}
