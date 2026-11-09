"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  creneauOctobreRose,
  formatHoraire,
  minutesDe,
  OCTOBRE_ROSE,
  sortieDeLaReservation,
  type SortieOctobreRose,
} from "@/data/octobre-rose";
import {
  CRENEAUX_ROAD_TRIP,
  creneauDuJour,
  DUREE_ROAD_TRIP_HEURES,
  estSurCommande,
  FERMETURE_COMPTOIR_HEURE,
  GAMMES,
  GRILLE_HORAIRE,
  gammesDuDepart,
  heureAuBenin,
  motifRoadTripGamme,
  OUVERTURE_COMPTOIR_HEURE,
  personnesMinRoadTrip,
  PRIX_GBASHI_BIKE_XOF,
  roadTripPossible,
  roadTripsDuJour,
  SORTIES_SUR_COMMANDE,
  type GammeVelo,
} from "@/data/offres";
import {
  blocPadel,
  formatHeureMinute,
  programmeEnClair,
  minutesDe as minutesDuReglage,
  type ReglagesProduits,
} from "@/data/reglages";
import { jourProgrammePadel } from "@/data/padel-bike";
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
  /** La formule enregistrée : Octobre rose s'affiche par son rendez-vous. */
  offre: CodeOffre;
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
  /** L'horaire exact d'une sortie réglée à la minute (Padel bike). */
  horaire?: { depart: string; retour: string };
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

/**
 * Le départ proposé tant que le commercial n'a rien tapé : l'heure qui
 * court, ramenée dans les heures du comptoir (retour à 22 h au plus tard).
 */
function heureParDefaut(heure: number, duree: number): number {
  return Math.min(Math.max(heure, OUVERTURE_COMPTOIR_HEURE), FERMETURE_COMPTOIR_HEURE - duree);
}

/**
 * L'heure tapée par le commercial : « 17 », « 17 h », « 17h00 », « 17:00 ».
 * Une heure pleine seulement : la location se compte à l'heure, et les
 * minutes ne sont pas gardées. `null` si la saisie n'en est pas une.
 */
function lireHeureTapee(saisie: string): number | null {
  const trouve = saisie.trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:)?\s*(?:00)?$/);
  if (!trouve) return null;
  const heure = Number(trouve[1]);
  return heure <= 23 ? heure : null;
}

/** La saisie porte-t-elle des minutes (« 17 h 30 ») ? */
const avecMinutes = (saisie: string) => /^\d{1,2}\s*(?:h|:)\s*\d{1,2}\s*$/i.test(saisie.trim());

/**
 * Les sorties Octobre rose qui se vendent encore au comptoir : fixées, et
 * dont le groupe n'est pas parti. Le jour même, jusqu'à l'heure du départ ;
 * le serveur tranche à la minute près (il refuse après 16 h 30).
 */
function sortiesRoseEnVente(jour: string, heure: number): SortieOctobreRose[] {
  return OCTOBRE_ROSE.sorties.filter(
    (sortie) =>
      sortie.date > jour || (sortie.date === jour && heure < Math.ceil(minutesDe(sortie.depart) / 60)),
  );
}

/** « Samedi 24 ou dimanche 25, 16 h 30 » : les jours en vente, pour le bouton de la formule. */
function detailFormuleRose(sorties: SortieOctobreRose[]): string {
  const jours = sorties.map((sortie, index) => {
    const jour = formatDateAvecJour(sortie.date).split(" ").slice(0, 2).join(" ");
    return index === 0 ? jour.charAt(0).toUpperCase() + jour.slice(1) : jour;
  });
  return `${jours.join(" ou ")}, ${formatHoraire(sorties[0].depart)}`;
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
  reglages,
}: {
  velos: VeloComptoir[];
  /** Créneaux déjà pris, par vélo. Le serveur revérifie à l'enregistrement. */
  occupes: Record<string, CreneauOccupe[]>;
  /** L'instant du rendu serveur : l'horloge du comptoir part de là. */
  instant: number;
  /** Les réglages des produits (Padel bike : son heure, son prix), lus par le serveur. */
  reglages: ReglagesProduits;
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
  // L'heure de départ, tapée par le commercial. Tant qu'il n'a rien tapé,
  // elle suit l'horloge : une page ouverte le matin propose encore,
  // l'après-midi, l'heure qui court.
  const [heureSaisie, setHeureSaisie] = useState<string | null>(null);
  const texteHeure = heureSaisie ?? String(heureParDefaut(ici.heure, dureeHeures));
  const heureTapee = lireHeureTapee(texteHeure);
  const heureDebut = heureTapee ?? heureParDefaut(ici.heure, dureeHeures);
  const [nombrePersonnes, setNombrePersonnes] = useState(1);
  // Le jour de la sortie Octobre rose vendue ; à défaut, la prochaine.
  const [jourRose, setJourRose] = useState<string | null>(null);
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

  // Octobre rose, tant qu'il se vend : sans vélo à choisir, les vélos sont
  // attribués d'office à l'enregistrement, un par personne, le jour choisi.
  // Sans choix, la prochaine sortie : le sélecteur l'affiche, rien ne se
  // vend sans que le jour soit sous les yeux.
  const sortiesRose = sortiesRoseEnVente(ici.date, ici.heure);
  const sortieRoseChoisie = sortiesRose.find((sortie) => sortie.date === jourRose) ?? sortiesRose[0] ?? null;
  const sortieRose = sortieRoseChoisie ? creneauOctobreRose(sortieRoseChoisie) : null;
  const octobreRose = offre === "octobre-rose" && sortieRose !== null;
  const roadTrip = offre === "road-trip";
  // Les deux sorties encadrées se vendent à la personne, sans durée.
  const encadree = roadTrip || octobreRose;
  // Gbashi bike et Padel bike, sur commande : au jour et à l'heure tapés,
  // pour une durée fixe, à la personne (SORTIES_SUR_COMMANDE).
  const surCommande = estSurCommande(offre);
  const padel = offre === "padel-bike";
  // Pas de durée à choisir : les sorties encadrées et sur commande.
  const sansDuree = encadree || surCommande;
  // Vélos attribués d'office, sans vélo à choisir : Octobre rose et Padel bike.
  const attribueDOffice = octobreRose || padel;
  // Padel bike part à l'heure réglée dans l'administration : rien à taper.
  const sortiePadel = reglages.padel;
  const blocDuPadel = blocPadel(sortiePadel);
  const date = octobreRose ? sortieRose.date : roadTrip ? dateRoadTrip : dateLocation;
  const heure = octobreRose
    ? sortieRose.heureDebut
    : roadTrip
      ? HEURE_ROAD_TRIP
      : padel
        ? blocDuPadel.heureDebut
        : heureDebut;
  const heureFin = octobreRose
    ? sortieRose.heureFin
    : roadTrip
      ? heure + DUREE_ROAD_TRIP_HEURES
      : padel
        ? blocDuPadel.heureFin
      : estSurCommande(offre)
        ? heure + SORTIES_SUR_COMMANDE[offre].dureeHeures
        : heure + dureeHeures;
  const velo = attribueDOffice ? undefined : velos.find((v) => v.id === veloId);

  const occupeSurCreneau = (id: string) =>
    (occupes[id] ?? []).some((pris) =>
      creneauxSeChevauchent({ debut: date, fin: date, heureDebut: heure, heureFin }, pris),
    );

  // Octobre rose : autant de places que de vélos en état et libres sur la
  // sortie. Le serveur refait le compte à l'enregistrement.
  // Padel bike de même : ses vélos sont attribués d'office, toutes gammes.
  const placesRose = attribueDOffice ? velos.filter((v) => enEtat(v) && !occupeSurCreneau(v.id)).length : 0;
  // Les places d'un jour de sortie, pour le sélecteur.
  const placesLe = (sortie: SortieOctobreRose) => {
    const c = creneauOctobreRose(sortie);
    return velos.filter(
      (v) =>
        enEtat(v) &&
        !(occupes[v.id] ?? []).some((pris) =>
          creneauxSeChevauchent({ debut: c.date, fin: c.date, heureDebut: c.heureDebut, heureFin: c.heureFin }, pris),
        ),
    ).length;
  };
  // Un vélo par personne : pas plus de personnes, ou de vélos en location
  // libre, que la gamme du vélo choisi n'en a de libres à cette heure ; pas
  // plus de places que de vélos libres pour Octobre rose. Le serveur refait
  // le compte à l'enregistrement.
  const libresDeLaGamme = velo
    ? velos.filter((v) => v.gamme === velo.gamme && enEtat(v) && !occupeSurCreneau(v.id)).length
    : 0;
  const personnesMax = attribueDOffice ? Math.max(1, placesRose) : Math.max(1, libresDeLaGamme);
  // Le road trip du samedi se fait en groupe de dix au moins, comme en
  // ligne ; Gbashi bike, le dimanche, n'a pas ce minimum.
  const minimumGroupe = roadTrip ? personnesMinRoadTrip(date) : 1;
  const personnes = Math.max(minimumGroupe, Math.min(nombrePersonnes, personnesMax));
  // Les vélos libres d'une gamme sur ce créneau : il en faut dix pour un groupe du samedi.
  const libresDe = (gamme: GammeVelo) =>
    velos.filter((v) => v.gamme === gamme && enEtat(v) && !occupeSurCreneau(v.id)).length;

  // Le devis : calculé ici pour s'afficher tout de suite, avec la même
  // fonction que le serveur, au prix de la plaquette (sans les frais du
  // paiement en ligne). Avec un code, seul le serveur fait foi. Pas de code
  // sur Octobre rose : son prix est forfaitaire.
  // Pas de code non plus sur une sortie sur commande : son prix est annoncé.
  const codeNormalise = octobreRose || surCommande ? "" : code.trim().toUpperCase().replace(/\s+/g, "");
  const signature = JSON.stringify([offre, veloId, date, heure, sansDuree ? 0 : dureeHeures, personnes, codeNormalise]);
  // Le road trip du samedi se roule en Premium ou Prestige : un Classique
  // choisi pour ce départ n'a pas de prix, et ne se vend pas.
  const veloHorsGamme = roadTrip && velo !== undefined && !roadTripPossible(velo.gamme, date);
  const devisLocal = octobreRose
    ? calculerDevis({ offre: "octobre-rose", date, nombrePersonnes: personnes, especes: true })
    : padel
      ? calculerDevis({ offre: "padel-bike", nombrePersonnes: personnes, especes: true }, reglages)
      : velo && !veloHorsGamme
        ? calculerDevis({
            offre,
            gamme: velo.gamme,
            // Le jour fixe le prix du road trip ; Gbashi bike a celui de la gamme.
            date,
            nombrePersonnes: personnes,
            dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
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
  // Padel bike un jour qui n'est pas programmé : le comptoir vend quand même
  // (une sortie convenue avec le client), en le disant.
  const padelHorsProgramme = padel && !jourProgrammePadel(sortiePadel, date);
  // Padel bike : son départ du jour, à la minute, est-il passé ?
  const padelParti = padel && date === ici.date && ici.heure * 60 + ici.minute >= minutesDuReglage(sortiePadel.depart);
  const dejaPasse = date === ici.date && !encadree && !padel && heure < ici.heure;
  // Plus aucun départ de cette durée ne rentre avant 22 h. Padel bike rentre
  // à l'heure réglée, la fermeture ne le concerne pas.
  const tropTard =
    date === ici.date && !encadree && !padel && ici.heure > FERMETURE_COMPTOIR_HEURE - (heureFin - heure);
  const roadTripParti = roadTrip && date === ici.date && ici.heure >= HEURE_ROAD_TRIP;
  const pendantRoadTrip =
    !encadree &&
    roadTripsDuJour(date).some((c) => heure < c.heureFin && heureFin > c.heureDebut);
  // Une location libre saisie au comptoir pendant la sortie Octobre rose :
  // le site ne la propose pas, le comptoir la laisse passer en prévenant.
  const creneauRoseChevauche = encadree
    ? null
    : (OCTOBRE_ROSE.sorties
        .map(creneauOctobreRose)
        .find((c) => c.date === date && heure < c.heureFin && heureFin > c.heureDebut) ?? null);
  const pendantOctobreRose = creneauRoseChevauche !== null;
  const obstacleCreneau =
    offre === "octobre-rose" && !sortieRose
      ? "Les sorties Octobre rose sont passées : choisissez une autre formule."
      : attribueDOffice
        ? placesRose < personnes
          ? placesRose === 0
            ? "Plus aucun vélo libre pour la sortie Octobre rose de ce jour."
            : `Il ne reste que ${placesRose} vélo${placesRose > 1 ? "s" : ""} libre${placesRose > 1 ? "s" : ""} pour la sortie.`
          : null
        : !encadree && heureTapee === null
          ? avecMinutes(texteHeure)
            ? "Heure pleine seulement, par exemple 17 : les minutes ne sont pas notées."
            : "Tapez l'heure de départ : une heure pleine, par exemple 17."
          : !velo
          ? "Choisissez le vélo."
          : !enEtat(velo)
            ? "Ce vélo est en entretien."
            : occupeSurCreneau(velo.id)
              ? "Ce vélo est déjà pris sur ce créneau."
              : roadTrip && !roadTripCeJour
                ? "Le road trip part le samedi et le dimanche."
                : veloHorsGamme
                  ? (motifRoadTripGamme(velo.gamme, date) ?? "Ce vélo ne roule pas ce road trip.")
                : roadTrip && libresDeLaGamme < minimumGroupe
                  ? `Le road trip du samedi se fait en groupe de ${minimumGroupe} personnes au moins : il ne reste que ${libresDeLaGamme} vélo${libresDeLaGamme > 1 ? "s" : ""} ${nomGamme(velo.gamme)} libre${libresDeLaGamme > 1 ? "s" : ""} sur ce départ.`
                : !roadTrip && heureFin > FERMETURE_COMPTOIR_HEURE
                  ? `Le vélo rentrerait après ${FERMETURE_COMPTOIR_HEURE} h.`
                  : null;
  const obstacle =
    obstacleCreneau ??
    (date < ici.date
      ? "Cette date est passée."
      : montant === null
        ? "Appliquez le code de parrainage pour connaître le montant exact."
        : !client.prenom.trim() || !client.nom.trim() || !client.email.trim()
          ? "Renseignez le prénom, le nom et l'email du client."
          : encaissePar.trim().length < 2
            ? "Indiquez qui reçoit l'argent."
            : !cgv
              ? "Le client doit accepter les conditions générales."
              : null);

  const choisirOffre = (nouvelle: CodeOffre) => {
    setOffre(nouvelle);
    // Un nombre choisi pour une formule ne passe pas à l'autre : trois
    // personnes en road trip ne deviennent pas trois vélos en location libre.
    if (nouvelle !== offre) setNombrePersonnes(1);
    setErreur(null);
  };

  /** Le vélo choisi vient d'être pris : on le dit, et l'on relit le parc. */
  const veloPrisEntreTemps = (message?: string) => {
    setVeloId("");
    setErreur(message ?? "Ce vélo vient d'être pris sur ce créneau : choisissez-en un autre.");
    demarrerTransition(() => routeur.refresh());
  };

  // L'heure tapée n'est jamais changée en douce : si la nouvelle durée fait
  // rentrer le vélo après 22 h, l'écran le dit et le commercial corrige.
  const choisirDuree = (duree: number) => setDureeHeures(duree);

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
          dureeHeures: sansDuree ? undefined : dureeHeures,
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
    setHeureSaisie(null);
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
    if (obstacle || montant === null || (!velo && !attribueDOffice)) return;
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
          // Octobre rose et Padel bike : les vélos sont attribués par le serveur.
          veloId: attribueDOffice ? undefined : veloId,
          offre,
          nombrePersonnes: personnes,
          dureeHeures: sansDuree ? undefined : dureeHeures,
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
        if (donnees.code === "GAMME") {
          // Ce vélo ne roule pas ce road trip (un Classique, le samedi) : on
          // le désélectionne, et l'on relit le parc, sa gamme a pu changer.
          setVeloId("");
          setErreur(donnees.erreur);
          demarrerTransition(() => routeur.refresh());
          return;
        }
        if (donnees.code === "PLACES") {
          // Octobre rose : des vélos viennent d'être pris. On relit le parc.
          setErreur(donnees.erreur);
          demarrerTransition(() => routeur.refresh());
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
        offre: (["road-trip", "location-libre", "octobre-rose", "gbashi-bike", "padel-bike"] as const).find((o) => o === donnees.offre) ?? offre,
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
        horaire: donnees.horaire ?? undefined,
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
  const formules: (readonly [CodeOffre, string, string])[] = [
    ["location-libre", "Location libre", "À l'heure, avec caution"],
    // Le samedi et le dimanche, en Premium ou Prestige, dix personnes au moins.
    ["road-trip", "Road trip", `8 h, samedi et dimanche : ${gammesDuDepart("samedi-matin")}, ${CRENEAUX_ROAD_TRIP[0].personnesMin} personnes min.`],
    // Les sorties sur commande : au jour et à l'heure convenus avec le client.
    [
      "gbashi-bike",
      "Gbashi bike",
      `Sur commande, ${SORTIES_SUR_COMMANDE["gbashi-bike"].dureeHeures} h : ${GAMMES.map((g) => formatXof(PRIX_GBASHI_BIKE_XOF[g.code])).join(" / ")} par personne`,
    ],
    [
      "padel-bike",
      "Padel bike",
      `${formatHeureMinute(sortiePadel.depart)}, ${programmeEnClair(sortiePadel)} : ${formatXof(sortiePadel.prixXof)} par personne, vélos attribués`,
    ],
    ...(sortiesRose.length > 0
      ? ([["octobre-rose", "Octobre rose", detailFormuleRose(sortiesRose)]] as const)
      : []),
  ];

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
        <div className={`mt-2 grid *:min-w-0 grid-cols-2 gap-2 ${formules.length > 2 ? "sm:grid-cols-3" : ""}`}>
          {formules.map(([valeur, libelle, detail]) => (
            <button
              key={valeur}
              type="button"
              onClick={() => choisirOffre(valeur)}
              aria-pressed={offre === valeur}
              className={`min-h-[56px] rounded-[var(--radius-bouton)] border px-3 py-2 text-left transition-colors ${
                valeur === "octobre-rose" ? "col-span-2 sm:col-span-1" : ""
              } ${
                offre === valeur
                  ? valeur === "octobre-rose"
                    ? "border-rose-octobre bg-rose-octobre/15"
                    : "border-orange-signal bg-orange-signal/10"
                  : "border-noir-piste/20 bg-craie hover:border-noir-piste/40"
              }`}
            >
              <span className="flex items-center gap-2 text-[0.92rem] font-semibold">
                {valeur === "octobre-rose" && (
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-octobre" />
                )}
                {libelle}
              </span>
              <span
                className={`block text-[0.76rem] ${offre === valeur && valeur === "octobre-rose" ? "text-noir-piste/80" : "text-gris-cadre"}`}
              >
                {detail}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 2. Le créneau */}
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">2. Le créneau</legend>
        {octobreRose ? (
          <div className="mt-2 grid *:min-w-0 gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-bouton)] bg-rose-octobre/15 px-4 py-3">
              <label htmlFor="vente-jour-rose" className="text-[0.8rem] text-noir-piste/80">
                Jour de la sortie
              </label>
              <select
                id="vente-jour-rose"
                value={sortieRose.date}
                onChange={(evenement) => setJourRose(evenement.target.value)}
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white px-4 py-2.5 text-[0.92rem] font-semibold"
              >
                {sortiesRose.map((sortie) => {
                  const libres = placesLe(sortie);
                  return (
                    <option key={sortie.date} value={sortie.date}>
                      {jourLisible(sortie.date)} ·{" "}
                      {libres === 0 ? "complet" : `${libres} vélo${libres > 1 ? "s" : ""} libre${libres > 1 ? "s" : ""}`}
                    </option>
                  );
                })}
              </select>
              {sortieRoseChoisie && (
                <p className="mt-1.5 text-[0.8rem] text-noir-piste/80">
                  Rassemblement {formatHoraire(sortieRoseChoisie.rassemblement)}, départ{" "}
                  {formatHoraire(sortieRoseChoisie.depart)}, retour vers{" "}
                  {formatHoraire(sortieRoseChoisie.retour)}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="vente-personnes-rose" className="text-[0.8rem] text-gris-cadre">
                Nombre de personnes
              </label>
              <select
                id="vente-personnes-rose"
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
              <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
                {placesRose === 0
                  ? "Plus aucun vélo libre pour la sortie."
                  : `${placesRose} vélo${placesRose > 1 ? "s" : ""} encore libre${placesRose > 1 ? "s" : ""} pour la sortie.`}
              </p>
              {erreurs.nombrePersonnes && (
                <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
              )}
            </div>
          </div>
        ) : roadTrip ? (
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
                {Array.from({ length: Math.max(1, personnesMax - minimumGroupe + 1) }, (_, i) => minimumGroupe + i).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n} personne{n > 1 ? "s" : ""}
                    </option>
                  ),
                )}
              </select>
              {minimumGroupe > 1 && (
                <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
                  Groupe de {minimumGroupe} personnes au moins, le samedi.
                </p>
              )}
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
            {padel ? (
              // Padel bike part à l'heure réglée dans Réglages des produits.
              <div>
                <p className="text-[0.8rem] text-gris-cadre">Horaire</p>
                <p className="mt-2 rounded-[var(--radius-bouton)] bg-craie px-4 py-2.5 text-[0.92rem]">
                  {formatHeureMinute(sortiePadel.depart)} - {formatHeureMinute(sortiePadel.retour)}
                </p>
                <p className={`mt-1.5 text-[0.76rem] ${padelHorsProgramme ? "text-orange-sourd" : "text-gris-cadre"}`}>
                  {padelHorsProgramme
                    ? "Ce jour n'est pas programmé pour Padel bike : la vente reste possible, pour une sortie convenue avec le client."
                    : `Départ ${programmeEnClair(sortiePadel)}, réglé dans Réglages des produits.`}
                </p>
              </div>
            ) : estSurCommande(offre) ? (
              // Une sortie sur commande a sa durée : rien à choisir.
              <div>
                <p className="text-[0.8rem] text-gris-cadre">Durée</p>
                <p className="mt-2 rounded-[var(--radius-bouton)] bg-craie px-4 py-2.5 text-[0.92rem]">
                  {SORTIES_SUR_COMMANDE[offre].dureeHeures} h, fixée
                </p>
              </div>
            ) : (
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
            )}
            {!padel && (
            <div>
              <label htmlFor="vente-heure" className="text-[0.8rem] text-gris-cadre">
                Départ, à l&apos;heure
              </label>
              {/* Le commercial tape l'heure qu'il veut. Une heure pleine : la
                  location se compte à l'heure, retour à 22 h au plus tard. */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="vente-heure"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={texteHeure}
                  onChange={(evenement) => setHeureSaisie(evenement.target.value)}
                  onFocus={(evenement) => evenement.target.select()}
                  aria-invalid={heureTapee === null || heureFin > FERMETURE_COMPTOIR_HEURE ? true : undefined}
                  aria-describedby="vente-heure-aide"
                  className="w-24 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem] tabular-nums outline-none focus:border-orange-signal aria-[invalid=true]:border-orange-signal"
                />
                <span className="text-[0.92rem]" aria-hidden="true">
                  h
                </span>
              </div>
              <p
                id="vente-heure-aide"
                className={`mt-1.5 text-[0.76rem] ${
                  heureTapee !== null && heureFin > FERMETURE_COMPTOIR_HEURE ? "text-orange-sourd" : "text-gris-cadre"
                }`}
              >
                {heureTapee === null
                  ? "Une heure pleine, de 0 à 21 h : par exemple 17."
                  : heureFin > FERMETURE_COMPTOIR_HEURE
                    ? `Retour à ${heureFin} h : trop tard, le vélo rentre à ${FERMETURE_COMPTOIR_HEURE} h au plus tard.`
                    : `Retour du vélo à ${heureFin} h.`}
              </p>
            </div>
            )}
            {surCommande && (
              <div>
                <label htmlFor="vente-personnes-commande" className="text-[0.8rem] text-gris-cadre">
                  Nombre de personnes
                </label>
                <select
                  id="vente-personnes-commande"
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
                <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
                  {padel
                    ? `${placesRose} vélo${placesRose > 1 ? "s" : ""} libre${placesRose > 1 ? "s" : ""} sur ce créneau.`
                    : velo
                      ? `Un vélo ${nomGamme(velo.gamme)} par personne.`
                      : "Le maximum dépend de la gamme du vélo choisi."}
                </p>
                {erreurs.nombrePersonnes && (
                  <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
                )}
              </div>
            )}
          </div>
        )}
        {erreurs.date && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.date}</p>}
        {erreurs.dureeHeures && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.dureeHeures}</p>}
        {erreurs.heureDebut && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.heureDebut}</p>}
        {tropTard ? (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            Il est {ici.heure} h : {surCommande ? `une sortie de ${heureFin - heure} h` : `une location de ${dureeHeures} h`} ne rentre plus avant{" "}
            {FERMETURE_COMPTOIR_HEURE} h aujourd&apos;hui. Réduisez la durée, ou choisissez un autre
            jour ; sinon la vente sera enregistrée après coup, à l&apos;heure choisie.
          </p>
        ) : padelParti ? (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-orange-signal bg-orange-signal/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            Le départ de Padel bike de {formatHeureMinute(sortiePadel.depart)} est passé aujourd&apos;hui : la vente
            sera enregistrée après coup, pour ce départ. Pour le prochain, choisissez une autre date.
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
        {pendantOctobreRose && creneauRoseChevauche && (
          <p className="mt-2 rounded-[var(--radius-bouton)] border-l-4 border-rose-octobre bg-rose-octobre/10 px-3 py-2 text-[0.8rem] leading-relaxed">
            La sortie Octobre rose occupe les vélos de {creneauRoseChevauche.heureDebut} h à {creneauRoseChevauche.heureFin} h
            ce jour-là : le site ne propose pas ces heures. Ce vélo ne pourra pas servir à la sortie.
          </p>
        )}
      </fieldset>

      {/* 3. Le vélo */}
      {attribueDOffice ? (
        <div className="mt-6">
          <p className="etiquette opacity-75">3. Les vélos</p>
          <p className="mt-2 rounded-[var(--radius-bouton)] bg-craie px-4 py-3 text-[0.84rem] leading-relaxed">
            Rien à choisir : un vélo libre est attribué à chaque personne à l&apos;enregistrement,
            le Classique d&apos;abord. Les vélos attribués s&apos;affichent ensuite, à remettre au
            {octobreRose ? " rassemblement." : " départ."}
          </p>
        </div>
      ) : (
      <fieldset className="mt-6">
        <legend className="etiquette opacity-75">3. Le vélo</legend>
        <div className="mt-2 grid *:min-w-0 gap-2 sm:grid-cols-2">
          {velos.map((v) => {
            const pris = occupeSurCreneau(v.id);
            // Le road trip du samedi ne se roule pas en Classique : ces
            // vélos restent visibles, grisés, sans prix ce jour-là.
            // Le samedi, une gamme qui n'a plus dix vélos libres ne porte pas
            // un groupe : ses vélos sont grisés aussi.
            const horsGamme =
              roadTrip && (!roadTripPossible(v.gamme, date) || libresDe(v.gamme) < minimumGroupe);
            const horsService = !enEtat(v);
            const choisi = v.id === veloId;
            // Le prix au comptoir de ce vélo : par personne en road trip.
            const prix = horsGamme
              ? null
              : calculerDevis({
                  offre: roadTrip ? "road-trip" : offre === "gbashi-bike" ? "gbashi-bike" : "location-libre",
                  gamme: v.gamme,
                  date,
                  nombrePersonnes: 1,
                  dureeHeures: roadTrip || offre === "gbashi-bike" ? undefined : dureeHeures,
                  especes: true,
                }).sousTotalXof;
            return (
              <label
                key={v.id}
                className={`flex items-center gap-3 rounded-[var(--radius-carte)] border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-signal ${
                  choisi
                    ? "border-orange-signal bg-orange-signal/10"
                    : "border-noir-piste/15 bg-craie hover:border-noir-piste/35"
                } ${pris || horsService || horsGamme ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="vente-velo"
                  value={v.id}
                  checked={choisi}
                  disabled={pris || horsService || horsGamme}
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
                    {prix === null
                      ? roadTripPossible(v.gamme, date)
                        ? ` · moins de ${minimumGroupe} vélos libres`
                        : " · pas ce road trip"
                      : ` · ${formatXof(prix)}${roadTrip || offre === "gbashi-bike" ? " / pers." : ""}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[0.75rem] font-semibold ${
                    horsService || pris || horsGamme ? "text-orange-sourd" : "text-vert-lagune"
                  }`}
                >
                  {horsService ? "Entretien" : pris ? "Pris" : horsGamme ? "Non" : "Libre"}
                </span>
              </label>
            );
          })}
        </div>
        {erreurs.veloId && <p className="mt-2 text-[0.78rem] text-orange-sourd">{erreurs.veloId}</p>}
        {/* Plusieurs vélos de la même gamme : le vélo choisi, puis d'autres
            libres à cette heure, attribués à l'enregistrement. */}
        {offre === "location-libre" && velo && personnesMax > 1 && (
          <div className="mt-4">
            <label htmlFor="vente-velos" className="block text-[0.8rem] text-gris-cadre">
              Nombre de vélos
            </label>
            <select
              id="vente-velos"
              value={personnes}
              onChange={(evenement) => setNombrePersonnes(Number(evenement.target.value))}
              className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-2.5 text-[0.92rem] sm:w-auto"
            >
              {Array.from({ length: personnesMax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} vélo{n > 1 ? "s" : ""} {nomGamme(velo.gamme)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.76rem] text-gris-cadre">
              {personnes > 1
                ? `Le ${velo.nom}, puis ${personnes - 1} autre${personnes > 2 ? "s" : ""} vélo${personnes > 2 ? "s" : ""} ${nomGamme(velo.gamme)} libre${personnes > 2 ? "s" : ""} à cette heure, attribué${personnes > 2 ? "s" : ""} à l'enregistrement.`
                : `Jusqu'à ${personnesMax} vélos ${nomGamme(velo.gamme)} libres à cette heure.`}
            </p>
            {erreurs.nombrePersonnes && (
              <p className="mt-1.5 text-[0.78rem] text-orange-sourd">{erreurs.nombrePersonnes}</p>
            )}
          </div>
        )}
      </fieldset>
      )}

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
          {/* Pas de code sur Octobre rose, ni sur une sortie sur commande : leur prix est annoncé. */}
          {octobreRose || surCommande ? (
            <p className="self-center text-[0.8rem] leading-relaxed text-gris-cadre">
              {octobreRose ? "Octobre rose" : padel ? "Padel bike" : "Gbashi bike"} a un prix annoncé, le même
              pour tous&nbsp;: pas de code de parrainage.
            </p>
          ) : (
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
          )}
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
        {octobreRose && devisLocal && (
          <p className="mt-2 text-[0.82rem] text-craie/75">
            Octobre rose, {jourLisible(date)}, {personnes}&nbsp;personne{personnes > 1 ? "s" : ""} ·{" "}
            {formatXof(devisLocal.sousTotalXof / personnes)} par personne en espèces
          </p>
        )}
        {velo && devisLocal && (
          <p className="mt-2 text-[0.82rem] text-craie/75">
            {roadTrip
              ? `${creneauDuJour(date)?.produit ?? "Road trip"}, ${personnes} personne${personnes > 1 ? "s" : ""}`
              : `Location libre, ${dureeHeures} h${personnes > 1 ? `, ${personnes} vélos` : ""}`}{" "}
            · {velo.nom}
            {personnes > 1 ? ` et ${personnes - 1} autre${personnes > 2 ? "s" : ""} de la gamme` : ""}
          </p>
        )}
        {!encadree && devisLocal && devisLocal.cautionXof > 0 && (
          <p className="mt-2 text-[0.82rem] leading-relaxed text-craie/75">
            Plus la caution de {formatXof(devisLocal.cautionXof)} en espèces et la pièce
            d&apos;identité, rendues au retour {personnes > 1 ? "des vélos" : "du vélo"}. La caution n&apos;est pas sur la facture.
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
  // Octobre rose : la sortie de ce jour-là, pour l'heure du rassemblement.
  const sortieVente = sortieDeLaReservation({ offre: vente.offre, dateDebut: vente.dateDebut });

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
          {vente.offre === "octobre-rose" && sortieVente
            ? `${jourLisible(vente.dateDebut)}, rassemblement à ${formatHoraire(sortieVente.rassemblement)} : vélos à remettre au rassemblement`
            : vente.horaire
              ? `${jourLisible(vente.dateDebut)}, de ${formatHeureMinute(vente.horaire.depart)} à ${formatHeureMinute(vente.horaire.retour)}`
              : `${jourLisible(vente.dateDebut)}, de ${vente.heureDebut} h à ${vente.heureFin} h`}
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
        {/* Octobre rose : les vélos se remettent au rassemblement, depuis la
            sortie du jour. Noter le départ ici, à la vente, sortirait
            l'inscription de la liste du rassemblement. */}
        {vente.departDuJour && vente.offre !== "octobre-rose" && depart !== "fait" && !annulee && (
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
