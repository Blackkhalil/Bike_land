"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import type { ReglagesOffres } from "@/data/reglages-offres";
import { ajouterJours, type DateISO } from "@/lib/dates";
import {
  calculerBikeForAllBudget,
  calculerBikeForAllDuree,
  calculerGbashi,
  calculerRoadTrip,
  formatMontant,
  heureEnClair,
  NOMS_GAMMES,
  ORDRE_GAMMES,
  type Coco,
  type CodeOffreGroupe,
  type ContexteOffre,
  type GammeVelo,
  type IssueOffre,
} from "@/lib/offres";
import { dateAuBeninDe, heureDe, jourDeLaSemaine, minutesDe } from "@/lib/offres/calendrier";
import { ROUTES_OFFRES_GROUPE, schemaClient, schemaDemandeDevis, type DemandeDevis } from "@/lib/offres-groupe/api";
import type { FaitsChat } from "@/lib/offres-groupe/conversation";
import { NOMS_OFFRES, personnesMinDe } from "@/lib/offres-groupe/textes-chat";

const CHAMP =
  "mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem] outline-none transition-colors focus:border-orange-signal";
const ETIQUETTE = "text-[0.8rem] text-gris-cadre";
const CLIENT_VIDE = { prenom: "", nom: "", email: "", telephone: "" };

/** Identifiant d'une saisie : la même vente envoyée deux fois ne compte qu'une fois. */
function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Le premier jour, à partir d'aujourd'hui, où l'offre part (road trip, Gbashi Bike) ; aujourd'hui pour Bike for All. */
function premierJour(offre: CodeOffreGroupe, reglages: ReglagesOffres, aujourdhui: DateISO): DateISO {
  const jours = offre === "road-trip-groupe" ? reglages.roadTrip.jours : offre === "gbashi-groupe" ? reglages.gbashi.jours : null;
  if (!jours || jours.length === 0) return aujourdhui;
  for (let ecart = 0; ecart < 7; ecart += 1) {
    const date = ajouterJours(aujourdhui, ecart);
    if (jours.includes(jourDeLaSemaine(date))) return date;
  }
  return aujourdhui;
}

/** Les départs de Bike for All, au pas réglé, du premier au dernier départ. */
function grilleDeparts(reglages: ReglagesOffres): string[] {
  const { premierDepart, dernierDepart, pasMinutes } = reglages.bikeForAll;
  const departs: string[] = [];
  for (let minute = minutesDe(premierDepart); minute <= minutesDe(dernierDepart); minute += pasMinutes) departs.push(heureDe(minute));
  return departs;
}

/** Ce que le serveur a enregistré : seule sa réponse fait foi. */
interface VenteGroupeEnregistree {
  reference: string;
  totalXof: number | null;
  emailEnvoye: boolean | null;
}

/** Un nombre entier saisi, ou `null`. */
function entier(saisie: string): number | null {
  const nombre = Number(saisie.replace(/\s/g, ""));
  return Number.isSafeInteger(nombre) && nombre >= 0 ? nombre : null;
}

/**
 * La vente au comptoir des trois offres de groupe (décision 12), réglée en
 * espèces : de simples champs, pas de chatbot. Mêmes réglages qu'en ligne,
 * canal « comptoir » : ni les 125 F de frais de paiement, ni la date limite
 * du vendredi, ni le délai avant le départ (une vente peut se saisir après
 * coup le jour même, jamais un jour passé).
 *
 * Le montant vient du moteur (src/lib/offres), comme en ligne ; le serveur
 * refait tout le calcul avec le parc du jour (route du comptoir du contrat
 * commun) et refuse d'encaisser un autre montant que celui vu ici.
 */
export function VenteComptoirGroupe({
  offre,
  faits,
  maintenant,
  encaissePar,
  onEncaisseParChange,
  onEnregistree,
}: {
  offre: CodeOffreGroupe;
  faits: FaitsChat;
  /** L'horloge du comptoir, relue chaque minute. */
  maintenant: number;
  /** « Argent reçu par » : le prénom de qui encaisse, partagé avec le reste du comptoir. */
  encaissePar: string;
  onEncaisseParChange: (valeur: string) => void;
  /** Appelé après l'enregistrement : le comptoir retient le prénom sur ce téléphone. */
  onEnregistree: () => void;
}) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();
  const reglages = faits.reglages;
  const aujourdhui = dateAuBeninDe(maintenant);
  const minimum = personnesMinDe(offre, reglages);

  const [date, setDate] = useState(() => premierJour(offre, reglages, aujourdhui));
  const departs = grilleDeparts(reglages);
  const [depart, setDepart] = useState(departs[0] ?? "08:00");
  const [personnes, setPersonnes] = useState(String(minimum));
  const [mode, setMode] = useState<"budget" | "duree">("budget");
  const [budget, setBudget] = useState("");
  const [minutes, setMinutes] = useState(String(reglages.bikeForAll.dureeMinMinutes));
  const [coco, setCoco] = useState<Coco>("aucun");
  const [gateaux, setGateaux] = useState("0");
  const [accompagnateur, setAccompagnateur] = useState(false);
  const [velos, setVelos] = useState<Record<GammeVelo, string>>({ CLASSIQUE: String(minimum), PREMIUM: "0", PRESTIGE: "0" });
  const [client, setClient] = useState(CLIENT_VIDE);
  const [cgv, setCgv] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attenduServeur, setAttenduServeur] = useState<number | null>(null);
  const [vente, setVente] = useState<VenteGroupeEnregistree | null>(null);
  const cleVente = useRef<string | null>(null);

  // La demande, telle que le contrat commun la décrit (schemaDemandeDevis).
  const gateauxParPersonne = entier(gateaux) ?? 0;
  const nombre = entier(personnes) ?? 0;
  const velosLus = Object.fromEntries(ORDRE_GAMMES.map((gamme) => [gamme, entier(velos[gamme]) ?? 0])) as Record<GammeVelo, number>;
  const demande: DemandeDevis =
    offre === "bike-for-all"
      ? mode === "budget"
        ? {
            offre,
            date,
            saisie: { mode, personnes: nombre, budgetXof: entier(budget) ?? 0, depart, gateauxParPersonne, accompagnateur },
          }
        : {
            offre,
            date,
            saisie: { mode, personnes: nombre, minutes: entier(minutes) ?? 0, depart, coco, gateauxParPersonne, accompagnateur },
          }
      : offre === "road-trip-groupe"
        ? { offre, date, saisie: { personnes: nombre, gateauxParPersonne } }
        : { offre, date, saisie: { velos: velosLus, gateauxParPersonne } };

  // Le calcul du moteur, au comptoir. Le parc en état sert de plafond ici ;
  // le serveur recompte les vélos libres de ce créneau à l'enregistrement.
  const contexte: ContexteOffre = {
    canal: "comptoir",
    date,
    maintenant,
    velosDisponibles: faits.velosEnEtat,
    stockParGamme: faits.parGamme,
  };
  const issue: IssueOffre =
    demande.offre === "bike-for-all"
      ? demande.saisie.mode === "budget"
        ? calculerBikeForAllBudget(demande.saisie, reglages, contexte)
        : calculerBikeForAllDuree(demande.saisie, reglages, contexte)
      : demande.offre === "road-trip-groupe"
        ? calculerRoadTrip(demande.saisie, reglages, contexte)
        : calculerGbashi(demande.saisie, reglages, contexte);
  const total = attenduServeur ?? (issue.ok ? issue.resultat.totalXof : null);

  const clientValide = schemaClient.safeParse(client).success;
  const obstacle = !issue.ok
    ? issue.refus.message
    : !clientValide
      ? "Renseignez le prénom, le nom, l'email et le téléphone du client."
      : encaissePar.trim().length < 2
        ? "Indiquez qui reçoit l'argent."
        : !cgv
          ? "Le client doit accepter les conditions générales."
          : null;

  /** Toute saisie qui change le prix oublie un montant donné par le serveur. */
  const changer = <T,>(maj: (valeur: T) => void) => (valeur: T) => {
    setAttenduServeur(null);
    setErreur(null);
    maj(valeur);
  };

  const enregistrer = async () => {
    if (obstacle || total === null || envoi) return;
    const lecture = schemaDemandeDevis.safeParse(demande);
    if (!lecture.success) {
      setErreur("Une valeur n'est pas valable : vérifiez les champs.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    cleVente.current ??= nouvelleCle();
    try {
      const reponse = await fetch(ROUTES_OFFRES_GROUPE.comptoir, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...demande,
          client: {
            prenom: client.prenom.trim(),
            nom: client.nom.trim(),
            email: client.email.trim(),
            telephone: client.telephone.trim(),
          },
          encaissePar: encaissePar.trim(),
          cgvAcceptees: true,
          attendu: { totalXof: total },
          cleVente: cleVente.current,
        }),
      });
      const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
      if (reponse.ok && corps && typeof corps.reference === "string") {
        cleVente.current = null;
        setVente({
          reference: corps.reference,
          totalXof: typeof corps.totalXof === "number" ? corps.totalXof : total,
          emailEnvoye: typeof corps.emailEnvoye === "boolean" ? corps.emailEnvoye : null,
        });
        onEnregistree();
        demarrerTransition(() => routeur.refresh());
        return;
      }
      const code = typeof corps?.code === "string" ? corps.code : "";
      const message =
        typeof corps?.message === "string" ? corps.message : typeof corps?.erreur === "string" ? corps.erreur : "";
      if (code === "REGLAGES" && typeof corps?.devis === "object" && corps.devis !== null) {
        // Le prix a changé : on montre celui du serveur, et l'on encaisse ce montant-là.
        const nouveau = (corps.devis as { issue?: { ok?: boolean; resultat?: { totalXof?: unknown } } }).issue;
        if (nouveau?.ok && typeof nouveau.resultat?.totalXof === "number") {
          setAttenduServeur(nouveau.resultat.totalXof);
          setErreur(`${message || "Le prix vient de changer."} Nouveau montant : ${formatMontant(nouveau.resultat.totalXof)}. Vérifiez-le avec le client, puis enregistrez de nouveau.`);
          return;
        }
      }
      if (code === "REFUS" && typeof corps?.refus === "object" && corps.refus !== null) {
        const refus = corps.refus as { message?: unknown };
        setErreur(typeof refus.message === "string" ? refus.message : "La vente est refusée.");
        return;
      }
      if (reponse.status === 401) {
        setErreur("Votre session a expiré : reconnectez-vous, puis enregistrez de nouveau.");
        return;
      }
      if (code === "FERME" || reponse.status === 403) {
        setErreur(message || "Les offres de groupe sont fermées : ouvrez l'interrupteur « Offres de groupe » dans le tableau de bord pour les vendre.");
        return;
      }
      setErreur(message || "La vente n'a pas pu être enregistrée. Réessayez sans rien changer : elle ne sera pas comptée deux fois.");
    } catch {
      setErreur(
        "Pas de réseau : la vente a peut-être été enregistrée. Appuyez de nouveau sur le bouton sans rien changer quand la connexion revient, elle ne sera pas comptée deux fois.",
      );
    } finally {
      setEnvoi(false);
    }
  };

  if (vente) {
    return (
      <div className="mt-6 rounded-[var(--radius-carte)] border-l-4 border-vert-lagune bg-craie p-5">
        <p className="font-display text-[1.2rem] font-semibold">Vente enregistrée</p>
        <p className="mt-2 text-[0.9rem] leading-relaxed">
          {NOMS_OFFRES[offre]}, référence <span className="font-mono font-semibold">{vente.reference}</span>
          {vente.totalXof !== null ? ` : ${formatMontant(vente.totalXof)} reçus par ${encaissePar.trim()}.` : "."}
        </p>
        <p className="mt-1 text-[0.84rem] text-gris-cadre">
          {vente.emailEnvoye === false
            ? "L'email n'est pas parti : renvoyez la facture depuis la liste des encaissements."
            : "Le client reçoit sa confirmation et sa facture par email."}
        </p>
        <button
          type="button"
          onClick={() => {
            setVente(null);
            setClient(CLIENT_VIDE);
            setCgv(false);
            setAttenduServeur(null);
          }}
          className="mt-4 min-h-11 rounded-[var(--radius-bouton)] bg-noir-piste px-5 text-[0.88rem] font-semibold text-craie"
        >
          Nouvelle vente
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 2. Le groupe et le créneau */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">2. Le groupe et le créneau</legend>
        <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-3">
          <Champ libelle="Date">
            <input
              type="date"
              value={date}
              min={aujourdhui}
              max={ajouterJours(aujourdhui, 90)}
              onChange={(evenement) => evenement.target.value && changer(setDate)(evenement.target.value)}
              className={CHAMP}
            />
          </Champ>
          {offre === "bike-for-all" ? (
            <Champ libelle="Départ">
              <select value={depart} onChange={(evenement) => changer(setDepart)(evenement.target.value)} className={CHAMP}>
                {departs.map((heure) => (
                  <option key={heure} value={heure}>
                    {heureEnClair(heure)}
                  </option>
                ))}
              </select>
            </Champ>
          ) : (
            <Champ libelle="Horaire, fixé dans les réglages">
              <p className="mt-2 rounded-[var(--radius-bouton)] bg-craie px-4 py-2.5 text-[0.92rem]">
                {offre === "road-trip-groupe"
                  ? `${heureEnClair(reglages.roadTrip.depart)} - ${heureEnClair(reglages.roadTrip.retour)}`
                  : `${heureEnClair(reglages.gbashi.depart)} - ${heureEnClair(reglages.gbashi.retour)}`}
              </p>
            </Champ>
          )}
          {offre !== "gbashi-groupe" && (
            <Champ libelle={`Personnes (${minimum} au moins)`}>
              <input
                type="number"
                inputMode="numeric"
                min={minimum}
                max={faits.velosEnEtat}
                value={personnes}
                onChange={(evenement) => changer(setPersonnes)(evenement.target.value)}
                className={CHAMP}
              />
            </Champ>
          )}
        </div>

        {offre === "bike-for-all" && (
          <div className="mt-4 grid *:min-w-0 gap-4 sm:grid-cols-3">
            <Champ libelle="Le client donne">
              <select value={mode} onChange={(evenement) => changer(setMode)(evenement.target.value === "duree" ? "duree" : "budget")} className={CHAMP}>
                <option value="budget">son budget</option>
                <option value="duree">sa durée</option>
              </select>
            </Champ>
            {mode === "budget" ? (
              <Champ libelle="Budget du groupe, en francs">
                <input
                  inputMode="numeric"
                  value={budget}
                  onChange={(evenement) => changer(setBudget)(evenement.target.value)}
                  placeholder={String(reglages.bikeForAll.budgetMinXof)}
                  className={CHAMP}
                />
              </Champ>
            ) : (
              <>
                <Champ libelle="Durée de vélo">
                  <select value={minutes} onChange={(evenement) => changer(setMinutes)(evenement.target.value)} className={CHAMP}>
                    {Array.from({ length: 16 }, (_, rang) => reglages.bikeForAll.dureeMinMinutes + rang * reglages.bikeForAll.pasMinutes).map((duree) => (
                      <option key={duree} value={duree}>
                        {duree < 60 ? `${duree} min` : `${Math.floor(duree / 60)} h${duree % 60 ? ` ${String(duree % 60).padStart(2, "0")}` : ""}`}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Coco">
                  <select value={coco} onChange={(evenement) => changer(setCoco)(evenement.target.value as Coco)} className={CHAMP}>
                    <option value="aucun">Sans coco</option>
                    <option value="petit">Petit ({formatMontant(reglages.consommables.cocoPetitXof)})</option>
                    <option value="grand">Grand ({formatMontant(reglages.consommables.cocoGrandXof)})</option>
                  </select>
                </Champ>
              </>
            )}
          </div>
        )}

        {offre === "gbashi-groupe" && (
          <div className="mt-4 grid *:min-w-0 gap-4 sm:grid-cols-3">
            {ORDRE_GAMMES.map((gamme) => (
              <Champ key={gamme} libelle={`${NOMS_GAMMES[gamme]} (${formatMontant(reglages.gbashi.prixXof[gamme])}, ${faits.parGamme[gamme]} en état)`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={faits.parGamme[gamme]}
                  value={velos[gamme]}
                  onChange={(evenement) => {
                    const valeur = evenement.target.value;
                    changer(setVelos)({ ...velos, [gamme]: valeur });
                  }}
                  className={CHAMP}
                />
              </Champ>
            ))}
          </div>
        )}

        <div className="mt-4 grid *:min-w-0 gap-4 sm:grid-cols-3">
          <Champ libelle="Gâteaux par personne">
            <select value={gateaux} onChange={(evenement) => changer(setGateaux)(evenement.target.value)} className={CHAMP}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Aucun" : `${n} (${formatMontant(reglages.consommables.gateauPrixXof)} l'unité)`}
                </option>
              ))}
            </select>
          </Champ>
          {offre === "bike-for-all" && (
            <label className="flex items-center gap-3 self-end pb-2.5 text-[0.88rem]">
              <input
                type="checkbox"
                checked={accompagnateur}
                onChange={(evenement) => changer(setAccompagnateur)(evenement.target.checked)}
                className="h-4 w-4 accent-orange-signal"
              />
              Avec un accompagnateur
            </label>
          )}
        </div>
        {offre === "road-trip-groupe" && (
          <p className="mt-2 text-[0.78rem] text-gris-cadre">
            La réduction du road trip ne s&apos;accorde qu&apos;en ligne, sur une capture validée : au comptoir, le
            prix est sans réduction.
          </p>
        )}
      </fieldset>

      {/* 3. Le client */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">3. Le client</legend>
        <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
          {(
            [
              ["prenom", "Prénom", "text"],
              ["nom", "Nom", "text"],
              ["email", "Email (la facture part ici)", "email"],
              ["telephone", "Téléphone", "tel"],
            ] as const
          ).map(([cle, libelle, type]) => (
            <Champ key={cle} libelle={libelle}>
              <input
                type={type}
                autoComplete="off"
                value={client[cle]}
                onChange={(evenement) => {
                  const valeur = evenement.target.value;
                  setClient((avant) => ({ ...avant, [cle]: valeur }));
                }}
                className={CHAMP}
              />
            </Champ>
          ))}
        </div>
      </fieldset>

      {/* 4. L'encaissement */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">4. L&apos;encaissement</legend>
        <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
          <Champ libelle="Argent reçu par" aide="Votre prénom. Il est retenu sur ce téléphone.">
            <input
              value={encaissePar}
              autoComplete="given-name"
              onChange={(evenement) => onEncaisseParChange(evenement.target.value)}
              className={CHAMP}
            />
          </Champ>
        </div>
        <label className="mt-4 flex items-start gap-3 text-[0.86rem] leading-relaxed">
          <input
            type="checkbox"
            checked={cgv}
            onChange={(evenement) => setCgv(evenement.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-orange-signal"
          />
          <span>Le client a pris connaissance des conditions générales de vente et les accepte.</span>
        </label>
      </fieldset>

      {/* Le montant, sous les yeux jusqu'au bouton */}
      <div className="mt-6 rounded-[var(--radius-carte)] bg-noir-piste p-5 text-craie">
        <p className="text-[0.8rem] text-craie/70">Montant à encaisser, en espèces</p>
        <p className="mt-1 font-display text-[2rem] font-bold leading-none tabular-nums">
          {total !== null ? formatMontant(total) : "à calculer"}
        </p>
        {issue.ok && (
          <ul className="mt-3 space-y-1 text-[0.82rem] text-craie/80">
            {issue.resultat.lignes.map((ligne) => (
              <li key={ligne.code} className="flex justify-between gap-3">
                <span>
                  {ligne.libelle}
                  {ligne.detail ? ` (${ligne.detail})` : ""}
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">{formatMontant(ligne.montantXof)}</span>
              </li>
            ))}
            <li className="pt-1 text-craie/60">
              Départ {heureEnClair(issue.resultat.depart)}, retour {heureEnClair(issue.resultat.fin)}. Pas de frais de paiement au
              comptoir.
            </li>
          </ul>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem]">
          {erreur}
        </p>
      )}

      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={Boolean(obstacle) || envoi || total === null}
        className="mt-4 min-h-[52px] w-full rounded-[var(--radius-bouton)] bg-orange-signal px-5 text-[0.95rem] font-semibold text-noir-piste transition-colors hover:bg-orange-vif disabled:opacity-40"
      >
        {envoi ? "Enregistrement…" : total !== null ? `J'ai reçu ${formatMontant(total)} : enregistrer la vente` : "Enregistrer la vente"}
      </button>
      {obstacle && !envoi && <p className="mt-2 text-center text-[0.8rem] text-gris-cadre">{obstacle}</p>}
    </div>
  );
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={ETIQUETTE}>{libelle}</span>
      {children}
      {aide && <span className="mt-1.5 block text-[0.76rem] text-gris-cadre">{aide}</span>}
    </label>
  );
}
