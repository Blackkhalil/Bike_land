"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  CRENEAUX_ROAD_TRIP,
  DUREE_ROAD_TRIP_HEURES,
  FERMETURE_HEURE,
  GAMMES,
  GRILLE_HORAIRE,
  heureAuBenin,
  OUVERTURE_HEURE,
  roadTripsDuJour,
  type GammeVelo,
} from "@/data/offres";
import { ajouterJours } from "@/lib/dates";
import { creneauxSeChevauchent, type CreneauOccupe } from "@/lib/db/contrat";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { calculerDevis } from "@/lib/tarification";
import type { CodeOffre, StatutVelo } from "@/lib/types";

/** Ce que le comptoir doit savoir d'un vélo. */
export interface VeloComptoir {
  id: string;
  nom: string;
  gamme: GammeVelo;
  statut: StatutVelo;
  photo?: string;
}

/** Le devis du serveur, rattaché aux choix pour lesquels il a été fait. */
interface Apercu {
  signature: string;
  totalXof: number;
  remiseXof: number;
  refusCode?: string;
}

/**
 * La vente telle que le serveur l'a enregistrée. Tout vient de sa réponse
 * et non du formulaire : après une réponse perdue, la saisie a pu changer,
 * et c'est la vente réellement enregistrée qu'il faut montrer.
 */
interface VenteEnregistree {
  reference: string;
  facture: string;
  totalXof: number;
  cautionXof: number;
  email: string;
  client: string;
  veloNom: string;
  formule: string;
  dateDebut: string;
  heureDebut: number;
  heureFin: number;
  /** `null` quand un envoi précédent avait déjà enregistré la vente. */
  emailEnvoye: boolean | null;
  /** La même saisie était déjà enregistrée : rien n'a été compté deux fois. */
  deja: boolean;
  /** …et le formulaire avait changé depuis le premier envoi. */
  saisieDifferente: boolean;
  montantDifferent: boolean;
  /** Le montant affiché au moment d'encaisser. */
  montantVuXof: number;
  /** Départ prévu aujourd'hui : le vélo peut être remis tout de suite. */
  departDuJour: boolean;
}

const CLE_ENCAISSEUR = "bikeland.encaisse-par";
const DUREES = GRILLE_HORAIRE.CLASSIQUE.map((palier) => palier.heures);
const HEURE_ROAD_TRIP = CRENEAUX_ROAD_TRIP[0].heureDebut;
const CLIENT_VIDE = { prenom: "", nom: "", email: "", telephone: "" };

const nomGamme = (gamme: GammeVelo) => GAMMES.find((g) => g.code === gamme)?.nom ?? gamme;
const enEtat = (velo: VeloComptoir) => velo.statut !== "MAINTENANCE" && velo.statut !== "RETIRE";
/** « samedi 17 octobre » devient « Samedi 17 octobre ». */
const jourLisible = (date: string) => {
  const texte = formatDateAvecJour(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

/** Le départ proposé : l'heure qui court, ramenée dans les heures d'ouverture. */
function heureParDefaut(heure: number, duree: number): number {
  return Math.min(Math.max(heure, OUVERTURE_HEURE), FERMETURE_HEURE - duree);
}

/** Les prochains jours de road trip, aujourd'hui compris s'il en part un. */
function joursDeRoadTrip(jour: string): string[] {
  const dates: string[] = [];
  for (let ecart = 0; dates.length < 4 && ecart < 28; ecart += 1) {
    const date = ajouterJours(jour, ecart);
    if (roadTripsDuJour(date).length > 0) dates.push(date);
  }
  return dates;
}

/**
 * Le road trip proposé d'office : le prochain qui n'est pas encore parti.
 * Celui du jour reste proposé après son départ, pour une vente saisie après
 * coup, mais il n'est plus choisi d'office : une place vendue l'après-midi
 * pour le lendemain était sinon enregistrée pour un départ déjà passé.
 */
function premierRoadTripAVenir(ici: { date: string; heure: number }): string {
  return (
    joursDeRoadTrip(ici.date).find((date) => !(date === ici.date && ici.heure >= HEURE_ROAD_TRIP)) ?? ici.date
  );
}

/** Identifiant d'une saisie : une vente envoyée deux fois ne compte qu'une fois. */
function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Renvoie au client sa confirmation et sa facture. Partagé par l'écran de
 * fin de vente et par la liste des encaissements.
 */
async function demanderRenvoi(reference: string): Promise<{ ok: boolean; message: string }> {
  try {
    const reponse = await fetch("/api/admin/especes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renvoyer", reference }),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) return { ok: false, message: donnees.erreur ?? "L'envoi a échoué." };
    return { ok: true, message: `Facture renvoyée à ${donnees.email}.` };
  } catch {
    return { ok: false, message: "Pas de réseau. Réessayez quand la connexion revient." };
  }
}

/** Annule une vente au comptoir : l'argent est rendu sur-le-champ. */
async function demanderAnnulation(reference: string): Promise<{ ok: boolean; message: string }> {
  try {
    const reponse = await fetch("/api/admin/especes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "annuler", reference }),
    });
    const donnees = await reponse.json().catch(() => null);
    if (!reponse.ok) return { ok: false, message: donnees?.erreur ?? "L'annulation a échoué." };
    return {
      ok: true,
      message: `Vente annulée : rendez ${formatXof(donnees.renduXof)} au client.${
        donnees.emailEnvoye ? " Il en est prévenu par email." : ""
      }`,
    };
  } catch {
    return { ok: false, message: "Pas de réseau. Réessayez quand la connexion revient." };
  }
}

/**
 * Annuler une vente au comptoir, en deux temps : on ne rend pas d'argent
 * sur un clic égaré. Proposé tant que le vélo n'est pas parti.
 */
export function AnnulerVente({
  reference,
  montantXof,
  onAnnulee,
}: {
  reference: string;
  montantXof: number;
  onAnnulee?: () => void;
}) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();
  const [etape, setEtape] = useState<"repos" | "confirmer" | "envoi" | "fait">("repos");
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);

  const confirmer = async () => {
    setEtape("envoi");
    const resultat = await demanderAnnulation(reference);
    setMessage({ texte: resultat.message, ok: resultat.ok });
    setEtape(resultat.ok ? "fait" : "confirmer");
    if (resultat.ok) {
      onAnnulee?.();
      demarrerTransition(() => routeur.refresh());
    }
  };

  if (etape === "fait") {
    return <span className="text-[0.8rem] font-semibold text-vert-lagune">{message?.texte}</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {etape === "repos" ? (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEtape("confirmer");
          }}
          className="lien-souligne text-[0.8rem] font-semibold text-gris-cadre"
        >
          Annuler la vente
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2 text-[0.8rem]">
          <span>Annuler et rendre {formatXof(montantXof)} au client ?</span>
          <button
            type="button"
            onClick={confirmer}
            disabled={etape === "envoi"}
            className="rounded-full bg-orange-signal px-3 py-1 font-semibold text-noir-piste disabled:opacity-40"
          >
            {etape === "envoi" ? "Annulation…" : "Oui, annuler"}
          </button>
          <button
            type="button"
            onClick={() => setEtape("repos")}
            disabled={etape === "envoi"}
            className="font-semibold text-gris-cadre disabled:opacity-40"
          >
            Non
          </button>
        </span>
      )}
      {message && !message.ok && <span className="text-[0.74rem] text-orange-sourd">{message.texte}</span>}
    </span>
  );
}

/**
 * La vente au comptoir.
 *
 * Pensée pour un téléphone tenu au point de départ, client en face : les
 * étapes se suivent de haut en bas, et le montant à encaisser reste sous
 * les yeux jusqu'au bouton. Ce montant n'est jamais saisi : il vient du
 * même calcul que la réservation en ligne, et le serveur refuse d'en
 * enregistrer un autre. Le code de parrainage, lui, est vérifié par le
 * serveur avant d'être compté.
 */
export function VenteEspeces({
  velos,
  occupes,
  instant,
}: {
  velos: VeloComptoir[];
  /** Créneaux déjà pris, par vélo. Le serveur revérifie à l'enregistrement. */
  occupes: Record<string, CreneauOccupe[]>;
  /** L'instant du rendu serveur : l'horloge du comptoir part de là. */
  instant: number;
}) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();

  // L'heure du Bénin, relue chaque minute : un téléphone resté ouvert le
  // matin ne doit pas proposer à midi un départ à 9 h comme l'heure qui court.
  const [maintenant, setMaintenant] = useState(instant);
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => clearInterval(minuteur);
  }, []);
  const ici = heureAuBenin(new Date(maintenant));

  const [offre, setOffre] = useState<CodeOffre>("location-libre");
  // Une date par formule : passer du road trip à la location libre et
  // retour ne doit pas emporter, sans le dire, la date choisie pour l'autre.
  const [dateLocation, setDateLocation] = useState(ici.date);
  const [dateRoadTrip, setDateRoadTrip] = useState(() => premierRoadTripAVenir(ici));
  const [dureeHeures, setDureeHeures] = useState(1);
  // L'heure de départ suit l'horloge tant que le commercial ne l'a pas
  // choisie lui-même : une page ouverte le matin propose encore, l'après-
  // midi, l'heure qui court.
  const [heureChoisie, setHeureChoisie] = useState<number | null>(null);
  const heureDebut = heureChoisie ?? heureParDefaut(ici.heure, dureeHeures);
  const [nombrePersonnes, setNombrePersonnes] = useState(1);
  const [veloId, setVeloId] = useState("");
  const [client, setClient] = useState(CLIENT_VIDE);
  const [code, setCode] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [verification, setVerification] = useState(false);
  const [encaissePar, setEncaissePar] = useState("");
  const [cgv, setCgv] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [vente, setVente] = useState<VenteEnregistree | null>(null);
  // Gardée d'un essai à l'autre tant que la vente n'est pas enregistrée :
  // c'est elle qui empêche un second envoi de compter deux fois l'argent.
  const cleVente = useRef<string | null>(null);

  // Le nom de qui encaisse est retenu sur ce téléphone : on ne le retape
  // pas à chaque client. Lu après le premier rendu, le serveur n'en sait rien.
  useEffect(() => {
    const depart = setTimeout(() => {
      try {
        const retenu = window.localStorage.getItem(CLE_ENCAISSEUR);
        if (retenu) setEncaissePar((actuel) => actuel || retenu);
      } catch {
        // Stockage indisponible (navigation privée) : on le retapera.
      }
    }, 0);
    return () => clearTimeout(depart);
  }, []);

  const roadTrip = offre === "road-trip";
  const date = roadTrip ? dateRoadTrip : dateLocation;
  const heure = roadTrip ? HEURE_ROAD_TRIP : heureDebut;
  const heureFin = roadTrip ? heure + DUREE_ROAD_TRIP_HEURES : heure + dureeHeures;
  const velo = velos.find((v) => v.id === veloId);
  // Une personne, un vélo : pas plus de personnes que de vélos en état dans la gamme.
  const personnesMax = velo
    ? Math.max(1, velos.filter((v) => v.gamme === velo.gamme && enEtat(v)).length)
    : 1;
  const personnes = roadTrip ? Math.min(nombrePersonnes, personnesMax) : 1;

  const occupeSurCreneau = (id: string) =>
    (occupes[id] ?? []).some((pris) =>
      creneauxSeChevauchent({ debut: date, fin: date, heureDebut: heure, heureFin }, pris),
    );

  // Le devis : calculé ici pour s'afficher tout de suite, avec la même
  // fonction que le serveur, au prix de la plaquette (sans les frais du
  // paiement en ligne). Avec un code, seul le serveur fait foi.
  const codeNormalise = code.trim().toUpperCase().replace(/\s+/g, "");
  const signature = JSON.stringify([offre, veloId, date, heure, roadTrip ? 0 : dureeHeures, personnes, codeNormalise]);
  const devisLocal = velo
    ? calculerDevis({
        offre,
        gamme: velo.gamme,
        nombrePersonnes: personnes,
        dureeHeures: roadTrip ? undefined : dureeHeures,
        especes: true,
      })
    : null;
  const apercuValable = apercu && apercu.signature === signature ? apercu : null;
  const montant = apercuValable
    ? apercuValable.totalXof
    : codeNormalise
      ? null
      : (devisLocal?.totalXof ?? null);

  // Ce qui empêche encore d'encaisser, dit en clair.
  const roadTripCeJour = roadTripsDuJour(date).length > 0;
  const dejaPasse = date === ici.date && !roadTrip && heure < ici.heure;
  // Plus aucun départ de cette durée ne rentre avant la fermeture.
  const tropTard = date === ici.date && !roadTrip && ici.heure > FERMETURE_HEURE - dureeHeures;
  const roadTripParti = roadTrip && date === ici.date && ici.heure >= HEURE_ROAD_TRIP;
  const pendantRoadTrip =
    !roadTrip &&
    roadTripsDuJour(date).some((c) => heure < c.heureFin && heureFin > c.heureDebut);
  const obstacle = !velo
    ? "Choisissez le vélo."
    : !enEtat(velo)
      ? "Ce vélo est en entretien."
      : occupeSurCreneau(velo.id)
        ? "Ce vélo est déjà pris sur ce créneau."
        : roadTrip && !roadTripCeJour
          ? "Le road trip part le samedi et le dimanche."
          : !roadTrip && heureFin > FERMETURE_HEURE
            ? `Le vélo rentrerait après ${FERMETURE_HEURE} h.`
            : date < ici.date
              ? "Cette date est passée."
              : montant === null
                ? "Appliquez le code de parrainage pour connaître le montant exact."
                : !client.prenom.trim() || !client.nom.trim() || !client.email.trim()
                  ? "Renseignez le prénom, le nom et l'email du client."
                  : encaissePar.trim().length < 2
                    ? "Indiquez qui reçoit l'argent."
                    : !cgv
                      ? "Le client doit accepter les conditions générales."
                      : null;

  const choisirOffre = (nouvelle: CodeOffre) => {
    setOffre(nouvelle);
    setErreur(null);
  };

  /** Le vélo choisi vient d'être pris : on le dit, et l'on relit le parc. */
  const veloPrisEntreTemps = (message?: string) => {
    setVeloId("");
    setErreur(message ?? "Ce vélo vient d'être pris sur ce créneau : choisissez-en un autre.");
    demarrerTransition(() => routeur.refresh());
  };

  const choisirDuree = (duree: number) => {
    setDureeHeures(duree);
    // Un départ qui ferait rentrer le vélo après la fermeture recule d'autant.
    setHeureChoisie((choisie) => (choisie === null ? null : Math.min(choisie, FERMETURE_HEURE - duree)));
  };

  const appliquerCode = async () => {
    if (!velo || !codeNormalise) return;
    setVerification(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/admin/especes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "devis",
          veloId,
          offre,
          nombrePersonnes: personnes,
          dureeHeures: roadTrip ? undefined : dureeHeures,
          date,
          heureDebut: heure,
          codeParrainage: codeNormalise,
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le code n'a pas pu être vérifié.");
        setErreurs(donnees.champs ?? {});
        return;
      }
      if (typeof donnees.totalXof !== "number") {
        setErreur("La réponse n'est pas arrivée en entier : appliquez le code à nouveau.");
        return;
      }
      if (donnees.libre === false) {
        veloPrisEntreTemps();
        return;
      }
      setApercu({
        signature,
        totalXof: donnees.totalXof,
        remiseXof: donnees.remiseXof,
        refusCode: donnees.refusCode,
      });
    } catch {
      setErreur("Pas de réseau. Réessayez pour appliquer le code.");
    } finally {
      setVerification(false);
    }
  };

  const reinitialiser = () => {
    // Le client suivant part en général maintenant : le jour et l'heure
    // repartent de l'heure qui court, et non du créneau de la vente d'avant,
    // qui pouvait dater du matin.
    const heureCourante = Date.now();
    const maintenantIci = heureAuBenin(new Date(heureCourante));
    setMaintenant(heureCourante);
    setDateLocation(maintenantIci.date);
    setDateRoadTrip(premierRoadTripAVenir(maintenantIci));
    setHeureChoisie(null);
    setVente(null);
    setClient(CLIENT_VIDE);
    setCode("");
    setApercu(null);
    setVeloId("");
    setNombrePersonnes(1);
    setCgv(false);
    setErreur(null);
    setErreurs({});
  };

  const enregistrer = async () => {
    if (obstacle || montant === null || !velo) return;
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    cleVente.current ??= nouvelleCle();
    try {
      const reponse = await fetch("/api/admin/especes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enregistrer",
          cleVente: cleVente.current,
          veloId,
          offre,
          nombrePersonnes: personnes,
          dureeHeures: roadTrip ? undefined : dureeHeures,
          date,
          heureDebut: heure,
          // Un code que le serveur vient de refuser n'est pas transmis : le
          // prix plein est celui qui s'affiche, donc celui qui est encaissé.
          codeParrainage: apercuValable?.refusCode ? "" : codeNormalise,
          client,
          encaissePar: encaissePar.trim(),
          montantAttenduXof: montant,
          cgvAcceptees: cgv,
        }),
      });
      const donnees = await reponse.json().catch(() => null);

      // Pas de réponse lisible du serveur (délai dépassé, serveur coupé,
      // corps tronqué par le réseau, même après un succès) : la vente a pu
      // être enregistrée. On le dit tel quel, et la clé de la saisie est
      // gardée : la renvoyer telle quelle ne la compte pas deux fois. Les
      // refus du serveur, eux, arrivent avec leur message.
      const illisible = reponse.ok
        ? !donnees || typeof donnees.reference !== "string"
        : !donnees || typeof donnees.erreur !== "string";
      if (illisible) {
        setErreur(
          "La réponse n'est pas arrivée : la vente a peut-être été enregistrée. Appuyez de nouveau sur le bouton sans rien changer, elle ne sera pas comptée deux fois.",
        );
        return;
      }

      if (!reponse.ok) {
        if (donnees.code === "INDISPONIBLE") {
          veloPrisEntreTemps(donnees.erreur);
          return;
        }
        if (donnees.code === "MONTANT" && donnees.devis) {
          setApercu({ signature, ...donnees.devis });
        }
        setErreur(donnees.erreur ?? "La vente n'a pas pu être enregistrée.");
        setErreurs(donnees.champs ?? {});
        return;
      }

      try {
        window.localStorage.setItem(CLE_ENCAISSEUR, encaissePar.trim());
      } catch {
        // Sans stockage, le nom sera simplement à retaper.
      }
      cleVente.current = null;
      setVente({
        reference: donnees.reference,
        facture: donnees.facture,
        totalXof: donnees.totalXof,
        cautionXof: donnees.cautionXof,
        email: donnees.email,
        client: donnees.client,
        veloNom: donnees.veloNom,
        formule: donnees.formule,
        dateDebut: donnees.dateDebut,
        heureDebut: donnees.heureDebut,
        heureFin: donnees.heureFin,
        emailEnvoye: typeof donnees.emailEnvoye === "boolean" ? donnees.emailEnvoye : null,
        deja: Boolean(donnees.deja),
        saisieDifferente: Boolean(donnees.saisieDifferente),
        montantDifferent: Boolean(donnees.montantDifferent),
        montantVuXof: montant,
        departDuJour: donnees.dateDebut === heureAuBenin(new Date()).date,
      });
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur(
        "Pas de réseau : la vente a peut-être été enregistrée. Appuyez de nouveau sur le bouton sans rien changer quand la connexion revient, elle ne sera pas comptée deux fois.",
      );
    } finally {
      setEnvoi(false);
    }
  };

  if (vente) {
    return <VenteTerminee vente={vente} onNouvelle={reinitialiser} />;
  }

  const datesRoadTrip = joursDeRoadTrip(ici.date);
  const heuresProposees: number[] = [];
  for (let h = OUVERTURE_HEURE; h + dureeHeures <= FERMETURE_HEURE; h += 1) heuresProposees.push(h);

  return (
    <section
      aria-labelledby="titre-vente"
      className="rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-5 sm:p-6"
    >
      <h2 id="titre-vente" className="titre-editorial text-[1.3rem]">
        Nouvelle vente en espèces
      </h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-gris-cadre">
        Le client paie au comptoir. Dès l&apos;enregistrement, il reçoit sa confirmation et sa
        facture par email, et la vente s&apos;ajoute au suivi ci-dessous.
      </p>

      {/* 1. La formule */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">1. La formule</legend>
        <div className="mt-2 grid *:min-w-0 grid-cols-2 gap-2">
          {(
            [
              ["location-libre", "Location libre", "À l'heure, avec caution"],
              ["road-trip", "Road trip", "Samedi et dimanche, 8 h"],
            ] as const
          ).map(([valeur, libelle, detail]) => (
            <button
              key={valeur}
              type="button"
              onClick={() => choisirOffre(valeur)}
              aria-pressed={offre === valeur}
              className={`min-h-[56px] rounded-[var(--radius-bouton)] border px-3 py-2 text-left transition-colors ${
                offre === valeur
                  ? "border-orange-signal bg-orange-signal/10"
                  : "border-noir-piste/20 bg-craie hover:border-noir-piste/40"
              }`}
            >
              <span className="block text-[0.92rem] font-semibold">{libelle}</span>
              <span className="block text-[0.76rem] text-gris-cadre">{detail}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 2. Le créneau */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">2. Le créneau</legend>
        {roadTrip ? (
          <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.8rem] text-gris-cadre">Jour du road trip (départ {HEURE_ROAD_TRIP} h)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {datesRoadTrip.map((jour) => (
                  <button
                    key={jour}
                    type="button"
                    onClick={() => setDateRoadTrip(jour)}
                    aria-pressed={date === jour}
                    className={`rounded-full border px-3.5 py-2 text-[0.84rem] font-semibold ${
                      date === jour
                        ? "border-orange-signal bg-orange-signal/10"
                        : "border-noir-piste/20 bg-craie"
                    }`}
                  >
                    {jour !== ici.date
                      ? jourLisible(jour)
                      : ici.heure >= HEURE_ROAD_TRIP
                        ? `Aujourd'hui (parti à ${HEURE_ROAD_TRIP} h)`
                        : "Aujourd'hui"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="vente-personnes" className="text-[0.8rem] text-gris-cadre">
                Nombre de personnes
              </label>
              <select
                id="vente-personnes"
                value={personnes}
                onChange={(evenement) => setNombrePersonnes(Number(evenement.target.value))}
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem]"
              >
                {Array.from({ length: personnesMax }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} personne{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
              {!velo && (
                <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
                  Le maximum dépend de la gamme du vélo choisi.
                </p>
              )}
              {erreurs.nombrePersonnes && (
                <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="vente-date" className="text-[0.8rem] text-gris-cadre">
                Date
              </label>
              <input
                id="vente-date"
                type="date"
                value={date}
                min={ici.date}
                max={ajouterJours(ici.date, 60)}
                onChange={(evenement) => evenement.target.value && setDateLocation(evenement.target.value)}
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem]"
              />
            </div>
            <div>
              <label htmlFor="vente-duree" className="text-[0.8rem] text-gris-cadre">
                Durée
              </label>
              <select
                id="vente-duree"
                value={dureeHeures}
                onChange={(evenement) => choisirDuree(Number(evenement.target.value))}
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem]"
              >
                {DUREES.map((duree) => (
                  <option key={duree} value={duree}>
                    {duree} h
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vente-heure" className="text-[0.8rem] text-gris-cadre">
                Départ
              </label>
              <select
                id="vente-heure"
                value={heureDebut}
                onChange={(evenement) => setHeureChoisie(Number(evenement.target.value))}
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem]"
              >
                {heuresProposees.map((h) => (
                  <option key={h} value={h}>
                    {h} h, retour {h + dureeHeures} h
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {erreurs.date && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.date}</p>}
        {erreurs.dureeHeures && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.dureeHeures}</p>}
        {erreurs.heureDebut && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.heureDebut}</p>}
        {tropTard ? (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            Il est {ici.heure} h : une location de {dureeHeures} h ne rentre plus avant{" "}
            {FERMETURE_HEURE} h aujourd&apos;hui. Réduisez la durée, ou choisissez un autre jour ;
            sinon la vente sera enregistrée après coup, à l&apos;heure choisie.
          </p>
        ) : (
          dejaPasse && (
            <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
              Il est {ici.heure} h : ce départ de {heure} h est déjà passé. Si le client part
              maintenant, choisissez {ici.heure} h ; sinon la vente sera enregistrée après coup, à
              l&apos;heure choisie.
            </p>
          )
        )}
        {roadTripParti && (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            Le road trip d&apos;aujourd&apos;hui est parti à {HEURE_ROAD_TRIP} h : la vente sera
            enregistrée après coup, pour ce départ. Pour une place au prochain départ, choisissez une
            autre date.
          </p>
        )}
        {pendantRoadTrip && (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            Le road trip est sur la route de {HEURE_ROAD_TRIP} h à{" "}
            {HEURE_ROAD_TRIP + DUREE_ROAD_TRIP_HEURES} h ce jour-là : le site ne propose pas ces
            heures. Vérifiez qu&apos;un vélo reste bien au point de départ.
          </p>
        )}
      </fieldset>

      {/* 3. Le vélo */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">3. Le vélo</legend>
        <div className="mt-2 grid *:min-w-0 gap-2 sm:grid-cols-2">
          {velos.map((v) => {
            const pris = occupeSurCreneau(v.id);
            const horsService = !enEtat(v);
            const choisi = v.id === veloId;
            // Le prix au comptoir de ce vélo : par personne en road trip.
            const prix = calculerDevis({
              offre,
              gamme: v.gamme,
              nombrePersonnes: 1,
              dureeHeures: roadTrip ? undefined : dureeHeures,
              especes: true,
            }).sousTotalXof;
            return (
              <label
                key={v.id}
                className={`flex items-center gap-3 rounded-[var(--radius-carte)] border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-signal ${
                  choisi
                    ? "border-orange-signal bg-orange-signal/10"
                    : "border-noir-piste/15 bg-craie hover:border-noir-piste/35"
                } ${pris || horsService ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="vente-velo"
                  value={v.id}
                  checked={choisi}
                  disabled={pris || horsService}
                  onChange={() => {
                    setVeloId(v.id);
                    setErreur(null);
                  }}
                  className="sr-only"
                />
                <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-[var(--radius-bouton)] bg-white">
                  {v.photo && <Image src={v.photo} alt="" fill sizes="64px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold">{v.nom}</span>
                  <span className="block text-[0.76rem] text-gris-cadre">
                    {nomGamme(v.gamme)}
                    {` · ${formatXof(prix)}${roadTrip ? " / pers." : ""}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[0.72rem] font-semibold ${
                    horsService || pris ? "text-orange-sourd" : "text-vert-lagune"
                  }`}
                >
                  {horsService ? "Entretien" : pris ? "Pris" : "Libre"}
                </span>
              </label>
            );
          })}
        </div>
        {erreurs.veloId && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.veloId}</p>}
      </fieldset>

      {/* 4. Le client */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">4. Le client</legend>
        <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
          <Champ
            id="vente-prenom"
            libelle="Prénom"
            valeur={client.prenom}
            onChange={(prenom) => setClient((c) => ({ ...c, prenom }))}
            erreur={erreurs["client.prenom"]}
            autoComplete="off"
          />
          <Champ
            id="vente-nom"
            libelle="Nom"
            valeur={client.nom}
            onChange={(nom) => setClient((c) => ({ ...c, nom }))}
            erreur={erreurs["client.nom"]}
            autoComplete="off"
          />
          <Champ
            id="vente-email"
            libelle="Email (la facture part ici)"
            type="email"
            valeur={client.email}
            onChange={(email) => setClient((c) => ({ ...c, email }))}
            erreur={erreurs["client.email"]}
            aide="Faites-la épeler au client : une faute, et il ne reçoit rien."
            autoComplete="off"
          />
          <Champ
            id="vente-telephone"
            libelle="Téléphone (facultatif)"
            type="tel"
            valeur={client.telephone}
            onChange={(telephone) => setClient((c) => ({ ...c, telephone }))}
            erreur={erreurs["client.telephone"]}
            autoComplete="off"
          />
        </div>
      </fieldset>

      {/* 5. L'encaissement */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">5. L&apos;encaissement</legend>
        <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="vente-code" className="text-[0.8rem] text-gris-cadre">
              Code de parrainage (facultatif)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="vente-code"
                value={code}
                onChange={(evenement) => setCode(evenement.target.value)}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem] uppercase outline-none focus:border-orange-signal"
              />
              <button
                type="button"
                onClick={appliquerCode}
                disabled={!velo || !codeNormalise || verification}
                className="shrink-0 rounded-[var(--radius-bouton)] border border-noir-piste/25 px-4 text-[0.84rem] font-semibold disabled:opacity-40"
              >
                {verification ? "Vérification…" : "Appliquer"}
              </button>
            </div>
            {apercuValable?.refusCode && (
              <p className="mt-1.5 text-[0.78rem] text-orange-sourd">
                {apercuValable.refusCode} Le prix plein s&apos;applique.
              </p>
            )}
            {apercuValable && apercuValable.remiseXof > 0 && (
              <p className="mt-1.5 text-[0.78rem] text-vert-lagune">
                Code accepté : − {formatXof(apercuValable.remiseXof)}.
              </p>
            )}
          </div>
          <Champ
            id="vente-encaisse-par"
            libelle="Argent reçu par"
            valeur={encaissePar}
            onChange={setEncaissePar}
            erreur={erreurs.encaissePar}
            aide="Votre prénom. Il est retenu sur ce téléphone."
            autoComplete="given-name"
          />
        </div>

        <label className="mt-4 flex items-start gap-3 text-[0.86rem] leading-relaxed">
          <input
            type="checkbox"
            checked={cgv}
            onChange={(evenement) => setCgv(evenement.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-orange-signal"
          />
          <span>
            Le client a pris connaissance des conditions générales de location et les accepte.
          </span>
        </label>
        {erreurs.cgvAcceptees && (
          <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.cgvAcceptees}</p>
        )}
      </fieldset>

      {/* Le montant, sous les yeux jusqu'au bouton */}
      <div className="mt-6 rounded-[var(--radius-carte)] bg-noir-piste p-5 text-craie">
        <p className="text-[0.8rem] text-craie/70">Montant à encaisser</p>
        <p className="mt-1 font-display text-[2rem] font-bold leading-none tabular-nums">
          {montant !== null ? formatXof(montant) : "à calculer"}
        </p>
        {velo && devisLocal && (
          <p className="mt-2 text-[0.82rem] text-craie/75">
            {roadTrip
              ? `Road trip, ${personnes} personne${personnes > 1 ? "s" : ""}`
              : `Location libre, ${dureeHeures} h`}{" "}
            · {velo.nom}
          </p>
        )}
        {!roadTrip && devisLocal && devisLocal.cautionXof > 0 && (
          <p className="mt-2 text-[0.82rem] leading-relaxed text-craie/75">
            Plus la caution de {formatXof(devisLocal.cautionXof)} en espèces et la pièce
            d&apos;identité, rendues au retour du vélo. La caution n&apos;est pas sur la facture.
          </p>
        )}
        {client.email.trim() && (
          <p className="mt-2 text-[0.82rem] text-craie/75">
            Facture envoyée à
            <strong className="block break-all text-craie">{client.email.trim()}</strong>
          </p>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem]">
          {erreur}
        </p>
      )}

      <button
        type="button"
        onClick={enregistrer}
        disabled={Boolean(obstacle) || envoi}
        className="mt-4 min-h-[52px] w-full rounded-[var(--radius-bouton)] bg-orange-signal px-5 text-[0.95rem] font-semibold text-noir-piste transition-colors hover:bg-orange-vif disabled:opacity-40"
      >
        {envoi
          ? "Enregistrement et envoi de la facture…"
          : montant !== null
            ? `J'ai reçu ${formatXof(montant)} : enregistrer et envoyer la facture`
            : "Enregistrer la vente"}
      </button>
      {obstacle && !envoi && <p className="mt-2 text-center text-[0.8rem] text-gris-cadre">{obstacle}</p>}
    </section>
  );
}

/** L'écran qui suit l'enregistrement : ce qui est fait, et ce qui reste à faire. */
function VenteTerminee({ vente, onNouvelle }: { vente: VenteEnregistree; onNouvelle: () => void }) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();
  const [depart, setDepart] = useState<"a-faire" | "en-cours" | "fait">("a-faire");
  const [renvoi, setRenvoi] = useState<{ enCours: boolean; message?: string; ok?: boolean }>({ enCours: false });
  const [erreur, setErreur] = useState<string | null>(null);
  // Annulée par le bouton de cet écran, ou ailleurs (liste, autre téléphone),
  // ce que le serveur révèle au moment de noter le départ.
  const [annulee, setAnnulee] = useState(false);
  const [annuleeAilleurs, setAnnuleeAilleurs] = useState(false);

  const remettre = async () => {
    setDepart("en-cours");
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/reservations/${vente.reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "depart" }),
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        setErreur(donnees?.erreur ?? "Le départ n'a pas pu être noté.");
        setDepart("a-faire");
        return;
      }
      // Le serveur dit l'état réel : une vente annulée entre-temps (autre
      // bouton, autre téléphone) ne part pas, et ne doit pas l'afficher.
      if (donnees?.statut === "ANNULEE") {
        setAnnulee(true);
        setAnnuleeAilleurs(true);
        setErreur("Cette vente a été annulée : ne remettez pas le vélo.");
        setDepart("a-faire");
        demarrerTransition(() => routeur.refresh());
        return;
      }
      if (donnees?.statut !== "EN_COURS") {
        setErreur("Le départ n'a pas pu être noté. Rechargez la page pour voir l'état de la vente.");
        setDepart("a-faire");
        return;
      }
      setDepart("fait");
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
      setDepart("a-faire");
    }
  };

  const renvoyer = async () => {
    setRenvoi({ enCours: true });
    const resultat = await demanderRenvoi(vente.reference);
    setRenvoi({ enCours: false, message: resultat.message, ok: resultat.ok });
  };

  return (
    <section
      aria-live="polite"
      className="rounded-[var(--radius-bloc)] border border-vert-lagune/40 bg-white p-5 sm:p-6"
    >
      <p className={`etiquette ${annulee ? "text-orange-sourd" : "text-vert-lagune"}`}>
        {annulee ? "Vente annulée" : "Vente enregistrée"}
      </p>
      <p className={`mt-2 font-display text-[2rem] font-bold leading-none tabular-nums ${annulee ? "line-through opacity-50" : ""}`}>
        {formatXof(vente.totalXof)}
      </p>
      <p className="mt-2 text-[0.88rem] text-gris-cadre">
        Réservation <span className="font-mono">{vente.reference}</span> · facture{" "}
        <span className="font-mono">{vente.facture}</span>
      </p>
      <p className="mt-1 text-[0.88rem]">
        {vente.client} · {vente.formule} · {vente.veloNom}
        <span className="block text-gris-cadre">
          {jourLisible(vente.dateDebut)}, de {vente.heureDebut} h à {vente.heureFin} h
        </span>
      </p>

      {vente.montantDifferent && (
        <p className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem] leading-relaxed">
          Le code de parrainage s&apos;est épuisé au moment même de l&apos;enregistrement : la vente
          est comptée {formatXof(vente.totalXof)} et non {formatXof(vente.montantVuXof)}. Réglez
          la différence de {formatXof(Math.abs(vente.totalXof - vente.montantVuXof))} avec le client.
        </p>
      )}

      {vente.deja && (
        <p className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem] leading-relaxed">
          {vente.saisieDifferente ? (
            <>
              <strong>Attention : la saisie avait changé.</strong> C&apos;est la vente du premier
              envoi, dont la réponse s&apos;était perdue, qui est enregistrée, telle
              qu&apos;affichée ci-dessus ; vos modifications ne l&apos;ont pas été. Si elle est
              fausse, annulez-la ci-dessous, puis faites une nouvelle vente.
            </>
          ) : (
            <>
              Cette vente avait déjà été enregistrée par l&apos;envoi précédent, dont la réponse
              s&apos;était perdue : elle n&apos;est comptée qu&apos;une fois.
            </>
          )}
        </p>
      )}

      {annulee ? null : vente.emailEnvoye ? (
        <p className="mt-4 text-[0.88rem] leading-relaxed text-vert-lagune">
          La confirmation et la facture sont parties vers <strong className="break-all">{vente.email}</strong>.
        </p>
      ) : (
        <div className="mt-4 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem] leading-relaxed">
          <p>
            {vente.emailEnvoye === null ? (
              <>
                Si le client n&apos;a pas reçu sa facture à{" "}
                <strong className="break-all">{vente.email}</strong>, renvoyez-la.
              </>
            ) : (
              <>
                La vente est bien enregistrée, mais l&apos;email vers{" "}
                <strong className="break-all">{vente.email}</strong> n&apos;est pas parti.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={renvoyer}
            disabled={renvoi.enCours}
            className="mt-2 rounded-[var(--radius-bouton)] border border-noir-piste/25 bg-white px-4 py-2 text-[0.84rem] font-semibold disabled:opacity-40"
          >
            {renvoi.enCours ? "Envoi…" : "Renvoyer la facture"}
          </button>
          {renvoi.message && (
            <p className={`mt-2 ${renvoi.ok ? "text-vert-lagune" : "text-orange-sourd"}`}>{renvoi.message}</p>
          )}
        </div>
      )}

      {vente.cautionXof > 0 && !annulee && (
        <p className="mt-4 rounded-[var(--radius-bouton)] bg-craie px-4 py-3 text-[0.86rem] leading-relaxed">
          Avant de remettre le vélo : caution de {formatXof(vente.cautionXof)} en espèces, pièce
          d&apos;identité gardée jusqu&apos;au retour, engagement de restitution signé.
        </p>
      )}

      {erreur && <p className="mt-3 text-[0.84rem] text-orange-sourd">{erreur}</p>}

      {/* Une erreur de saisie se corrige ici, tant que le vélo n'est pas
          parti : la vente est annulée et l'argent rendu sur-le-champ. Une
          vente annulée ailleurs entre-temps n'a plus rien à annuler. */}
      {depart !== "fait" && !annuleeAilleurs && (
        <div className="mt-4">
          <AnnulerVente reference={vente.reference} montantXof={vente.totalXof} onAnnulee={() => setAnnulee(true)} />
        </div>
      )}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {vente.departDuJour && depart !== "fait" && !annulee && (
          <button
            type="button"
            onClick={remettre}
            disabled={depart === "en-cours"}
            className="min-h-[48px] rounded-[var(--radius-bouton)] border border-noir-piste/25 px-4 text-[0.9rem] font-semibold disabled:opacity-40"
          >
            {depart === "en-cours" ? "Enregistrement…" : "Vélo remis au client maintenant"}
          </button>
        )}
        {depart === "fait" && (
          <p className="flex min-h-[48px] items-center justify-center rounded-[var(--radius-bouton)] bg-vert-lagune/15 px-4 text-[0.88rem] font-semibold text-vert-lagune">
            Départ noté
          </p>
        )}
        <button
          type="button"
          onClick={onNouvelle}
          className="min-h-[48px] rounded-[var(--radius-bouton)] bg-orange-signal px-4 text-[0.9rem] font-semibold text-noir-piste transition-colors hover:bg-orange-vif"
        >
          Nouvelle vente
        </button>
      </div>
    </section>
  );
}

/**
 * Noter que l'argent d'une vente annulée par le client lui a été rendu, en
 * deux temps. Tant que ce n'est pas fait, la vente reste « à rendre » et
 * l'argent compte encore dans la caisse.
 */
export function NoterRemboursement({ reference, montantXof }: { reference: string; montantXof: number }) {
  const routeur = useRouter();
  const [, demarrerTransition] = useTransition();
  const [etape, setEtape] = useState<"repos" | "confirmer" | "envoi" | "fait">("repos");
  const [message, setMessage] = useState<string | null>(null);

  const confirmer = async () => {
    setEtape("envoi");
    setMessage(null);
    try {
      const reponse = await fetch("/api/admin/especes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rendre", reference }),
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        setMessage(donnees?.erreur ?? "Le remboursement n'a pas pu être noté.");
        setEtape("confirmer");
        return;
      }
      setEtape("fait");
      demarrerTransition(() => routeur.refresh());
    } catch {
      setMessage("Pas de réseau. Réessayez quand la connexion revient.");
      setEtape("confirmer");
    }
  };

  if (etape === "fait") {
    return <span className="text-[0.8rem] font-semibold text-vert-lagune">Remboursement noté.</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {etape === "repos" ? (
        <button
          type="button"
          onClick={() => setEtape("confirmer")}
          className="lien-souligne text-[0.8rem] font-semibold text-orange-sourd"
        >
          Noter l&apos;argent rendu
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2 text-[0.8rem]">
          <span>{formatXof(montantXof)} rendus au client ?</span>
          <button
            type="button"
            onClick={confirmer}
            disabled={etape === "envoi"}
            className="rounded-full bg-orange-signal px-3 py-1 font-semibold text-noir-piste disabled:opacity-40"
          >
            {etape === "envoi" ? "Enregistrement…" : "Oui, rendus"}
          </button>
          <button
            type="button"
            onClick={() => setEtape("repos")}
            disabled={etape === "envoi"}
            className="font-semibold text-gris-cadre disabled:opacity-40"
          >
            Non
          </button>
        </span>
      )}
      {message && <span className="text-[0.74rem] text-orange-sourd">{message}</span>}
    </span>
  );
}

/** Renvoi de la facture depuis la liste des encaissements. */
export function RenvoyerFacture({ reference }: { reference: string }) {
  const [etat, setEtat] = useState<{ enCours: boolean; message?: string; ok?: boolean }>({ enCours: false });
  const renvoyer = async () => {
    setEtat({ enCours: true });
    const resultat = await demanderRenvoi(reference);
    setEtat({ enCours: false, message: resultat.message, ok: resultat.ok });
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={renvoyer}
        disabled={etat.enCours}
        className="lien-souligne text-[0.8rem] font-semibold text-orange-sourd disabled:opacity-40"
      >
        {etat.enCours ? "Envoi…" : "Renvoyer la facture"}
      </button>
      {etat.message && (
        <span className={`text-[0.74rem] ${etat.ok ? "text-vert-lagune" : "text-orange-sourd"}`}>{etat.message}</span>
      )}
    </span>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  onChange,
  erreur,
  aide,
  type = "text",
  autoComplete,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  erreur?: string;
  aide?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[0.8rem] text-gris-cadre">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        autoComplete={autoComplete}
        aria-invalid={erreur ? true : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-4 py-2.5 text-[0.92rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/20"
        }`}
      />
      {erreur ? (
        <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreur}</p>
      ) : aide ? (
        <p className="mt-1.5 text-[0.76rem] text-gris-cadre">{aide}</p>
      ) : null}
    </div>
  );
}
