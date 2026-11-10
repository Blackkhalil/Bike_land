/**
 * Implémentation « démo » du dépôt : tout en mémoire.
 *
 * Active tant que DATABASE_URL n'est pas défini. Elle permet de lancer le
 * site et le tableau de bord avec `npm run dev`, sans PostgreSQL, tout en
 * respectant la même règle métier que la production : impossible de créer
 * deux réservations qui se chevauchent sur un même vélo.
 *
 * Les écritures ne sont évidemment pas persistées au-delà du processus.
 */

import { optionsLocation, pointsDeRetrait, velos } from "@/data/catalogue";
import { aujourdhui, nombreDeJours, type DateISO } from "../dates";
import {
  DUREE_ROAD_TRIP_HEURES,
  estSurCommande,
  EXPIRATION_PANIER_MINUTES,
  FERMETURE_HEURE,
  OUVERTURE_HEURE,
  panierExpire,
  SORTIES_SUR_COMMANDE,
} from "@/data/offres";
import { blocPadel, lireReglagesAvec } from "@/data/reglages";
import { lireReglagesOffresAvec } from "@/data/reglages-offres";
import {
  attribuerVelos,
  construireParcDuJour,
  heureDeMinutes,
  heuresCouvrantes,
  minutesDeLigne,
  seChevauchent,
} from "../disponibilite";
import { penaliteRetardXof } from "../offres/retard";
import { calculerDevis } from "../tarification";
import { genererReference, genererToken, hacherToken, lireToken } from "../tokens";
import {
  commissionPour,
  normaliserCode,
  verifierCode,
  type CodeParrainage,
} from "../parrainage";
import type {
  AvisClient,
  Client,
  EvenementJournal,
  IndisponibiliteVelo,
  MessageContact,
  Partenaire,
  PointDeRetrait,
  Remboursement,
  Reservation,
  StatutRemboursement,
  StatutReservation,
  Velo,
  JourFerme,
} from "../types";
import {
  auteurAuJournal,
  CapaciteInsuffisanteError,
  ConflitDisponibiliteError,
  controlerDemandeGroupe,
  creneauOctobreRoseDemande,
  creneauxSeChevauchent,
  detailsReservationGroupe,
  estDateISO,
  journeeIndisponible,
  limiteJournal,
  memeRemboursement,
  MESSAGE_VELO_INDISPONIBLE,
  messagePlacesManquantes,
  messageVelosManquants,
  montantsDeLaDemandeGroupe,
  ordreAttribution,
  PreuveReductionInutilisableError,
  prixParLigne,
  raisonPreuveInutilisable,
  refusRetard,
  reservationsToucheesParmi,
  resteUneHeureLibre,
  RETARD_MAX_MINUTES,
  velosDeLaGamme,
  velosLibresDeLaGamme,
  TransactionDejaUtiliseeError,
  type CreneauOccupe,
  type Depot,
  type DemandeReservation,
  type FiltreCatalogue,
  type NouvelEvenement,
  type ParcDuJour,
  type ResultatReservation,
} from "./contrat";
import { construireHistorique } from "./historique";

interface EtatDemo {
  clients: Client[];
  reservations: Reservation[];
  messages: MessageContact[];
  avis: AvisClient[];
  partenaires: Partenaire[];
  codesPromo: CodeParrainage[];
  /** Une entrée par utilisation : c'est la source des statistiques. */
  utilisationsPromo: {
    code: string;
    reference: string;
    remiseXof: number;
    /** Figée à l'utilisation, comme en production. */
    commissionXof: number;
    /**
     * Un usage n'est acquis au partenaire qu'une fois le paiement
     * confirmé. Même règle qu'en production, sans quoi les deux modes
     * ne raconteraient pas la même chose.
     */
    statut: "EN_ATTENTE" | "VALIDE" | "ANNULE";
    le: string;
  }[];
  /** reference -> hachage du token de suivi. */
  tokens: Map<string, string>;
  /**
   * Réglages d'ouverture : ici, et non dans le module, pour que la page
   * qui propose les départs et l'API qui les ouvre lisent les mêmes. En
   * développement, Next charge le module une fois pour chacune.
   */
  reglagesCreneaux: Map<string, boolean>;
  joursFermes: JourFerme[];
  /** Réglages de l'administration (double authentification, réglages des produits). */
  parametresAdmin: Map<string, string>;
  /** Les vélos indisponibles un jour précis, une ligne par vélo et par jour. */
  indisponibilites: Omit<IndisponibiliteVelo, "veloNom">[];
  /** Le journal des événements, dans l'ordre où ils ont été écrits. */
  journal: EvenementJournal[];
  /** L'argent à rendre, rattaché à la réservation par son identifiant. */
  remboursements: Omit<Remboursement, "reference" | "offre" | "client">[];
  /**
   * Les preuves de réduction du road trip, réduites à ce que la réservation
   * en lit, comme les colonnes de PreuveReduction : la décision (« validee »,
   * « en_attente », « refusee ») et la réservation qui l'a consommée.
   */
  preuves: { id: string; statut: string; reference?: string; creeLe: string }[];
}

// L'état vit sur `globalThis` : en développement, le rechargement à chaud
// de Next.js réévalue les modules et réinitialiserait sinon les données à
// chaque modification de fichier.
const cle = Symbol.for("bikeland.demo.etat");

/** Identifiants des réservations dont le rappel de la veille est parti. */
const rappelsEnvoyes = new Set<string>();
/** Compteurs d'essais, en mémoire en démonstration. */
const compteursDemo = new Map<string, { nombre: number; expireLe: number }>();
type PorteurGlobal = typeof globalThis & { [cle]?: EtatDemo };

function etat(): EtatDemo {
  const porteur = globalThis as PorteurGlobal;
  if (!porteur[cle]) {
    const historique = construireHistorique(aujourdhui());
    porteur[cle] = {
      clients: historique.clients,
      reservations: historique.reservations,
      messages: [],
      avis: [],
      partenaires: [],
      codesPromo: [],
      utilisationsPromo: [],
      tokens: new Map(),
      reglagesCreneaux: new Map(),
      joursFermes: [],
      parametresAdmin: new Map(),
      indisponibilites: [],
      journal: [],
      remboursements: [],
      preuves: [],
    };
  }
  // Un état créé avant l'ajout de ces réglages, gardé par le rechargement à chaud.
  porteur[cle].reglagesCreneaux ??= new Map();
  porteur[cle].joursFermes ??= [];
  porteur[cle].parametresAdmin ??= new Map();
  porteur[cle].indisponibilites ??= [];
  porteur[cle].journal ??= [];
  porteur[cle].remboursements ??= [];
  porteur[cle].preuves ??= [];
  return porteur[cle]!;
}

/** Pour des identifiants uniques même à la même milliseconde. */
let compteurIdentifiants = 0;
function identifiant(prefixe: string): string {
  compteurIdentifiants += 1;
  return `${prefixe}-${Date.now().toString(36)}-${compteurIdentifiants.toString(36)}`;
}

/** Une ligne du journal, écrite sans attente : avec l'écriture qu'elle raconte. */
function ecrireAuJournal(evenement: NouvelEvenement): EvenementJournal {
  const ligne: EvenementJournal = {
    id: identifiant("jrn"),
    type: evenement.type,
    ...(evenement.reference ? { reference: evenement.reference } : {}),
    details: copie(evenement.details ?? {}),
    auteur: evenement.auteur,
    creeLe: new Date().toISOString(),
  };
  etat().journal.push(ligne);
  return ligne;
}

/** Le nom du vélo, lu dans le catalogue (il a pu changer depuis). */
function nomDuVelo(veloId: string): string {
  return velos.find((velo) => velo.id === veloId)?.nom ?? veloId;
}

function versIndisponibilite(ligne: Omit<IndisponibiliteVelo, "veloNom">): IndisponibiliteVelo {
  return { ...ligne, veloNom: nomDuVelo(ligne.veloId) };
}

/** Un remboursement, avec la réservation et le client à qui rendre l'argent. */
function versRemboursement(ligne: EtatDemo["remboursements"][number]): Remboursement | null {
  const reservation = etat().reservations.find((r) => r.id === ligne.reservationId);
  if (!reservation) return null;
  return {
    ...ligne,
    reference: reservation.reference,
    offre: reservation.offre,
    client: {
      prenom: reservation.client.prenom,
      nom: reservation.client.nom,
      email: reservation.client.email,
      ...(reservation.client.telephone ? { telephone: reservation.client.telephone } : {}),
    },
  };
}

function copie<T>(valeur: T): T {
  return structuredClone(valeur);
}

function trouver(reference: string) {
  return etat().reservations.find(
    (r) => r.reference.toUpperCase() === reference.toUpperCase(),
  );
}

/*
 * Les contrôles qui précèdent une écriture sont faits sans aucune attente
 * (`await`) entre eux et l'écriture. Le mode démonstration n'a qu'un
 * processus, mais deux requêtes peuvent s'y entrelacer à chaque attente :
 * un contrôle fait avant une attente pouvait être périmé au moment
 * d'écrire, et deux réservations du même créneau passaient toutes deux.
 */

/** La réservation bloque-t-elle ses vélos ? Tout sauf l'annulé et le panier abandonné. */
function bloque(reservation: Reservation, limite = Date.now() - EXPIRATION_PANIER_MINUTES * 60_000): boolean {
  return (
    reservation.statut !== "ANNULEE" &&
    // Un panier abandonne cesse de bloquer le velo.
    !(reservation.statut === "EN_ATTENTE_PAIEMENT" && new Date(reservation.creeLe).getTime() < limite)
  );
}

/** Les créneaux des réservations qui bloquent ce vélo. */
function reservationsBloquantes(veloId: string): CreneauOccupe[] {
  const limite = Date.now() - EXPIRATION_PANIER_MINUTES * 60_000;
  return etat()
    .reservations.filter(
      (reservation) => bloque(reservation, limite) && reservation.lignes.some((ligne) => ligne.veloId === veloId),
    )
    .map((reservation) => ({
      debut: reservation.dateDebut,
      fin: reservation.dateFin,
      heureDebut: reservation.heureDebut,
      heureFin: reservation.heureFin,
    }));
}

/** Le vélo est-il déclaré indisponible un jour de cette période (bornes comprises) ? */
function indisponibleSurPeriode(veloId: string, debut: DateISO, fin: DateISO): boolean {
  return etat().indisponibilites.some((i) => i.veloId === veloId && i.date >= debut && i.date <= fin);
}

/**
 * Les créneaux qui bloquent ce vélo : ses réservations, sauf l'annulé et le
 * panier abandonné, et les jours où il est déclaré indisponible, pris en
 * entier pour toutes les offres (comme en base).
 */
function creneauxBloquants(veloId: string): CreneauOccupe[] {
  return [
    ...reservationsBloquantes(veloId),
    ...etat()
      .indisponibilites.filter((i) => i.veloId === veloId)
      .map((i) => journeeIndisponible(i.date)),
  ];
}

/**
 * Le parc d'un jour (src/lib/disponibilite), comme en base : les vélos en
 * état moins ceux déclarés indisponibles ce jour-là, et les créneaux que les
 * réservations qui bloquent prennent ce jour-là, toutes offres confondues, à
 * la minute près quand elles en portent.
 */
function parcDemo(date: DateISO) {
  const limite = Date.now() - EXPIRATION_PANIER_MINUTES * 60_000;
  const donnees = etat();
  const lignes = donnees.reservations
    .filter((reservation) => bloque(reservation, limite) && reservation.dateDebut <= date && date <= reservation.dateFin)
    .flatMap((reservation) =>
      reservation.lignes.map((ligne) => ({
        veloId: ligne.veloId,
        heureDebut: reservation.heureDebut,
        heureFin: reservation.heureFin,
        minuteDebut: reservation.minuteDebut,
        minuteFin: reservation.minuteFin,
      })),
    );
  const indisponibles = new Set(donnees.indisponibilites.filter((i) => i.date === date).map((i) => i.veloId));
  return construireParcDuJour(date, velos, indisponibles, lignes);
}

function veloLibre(
  veloId: string,
  debut: DateISO,
  fin: DateISO,
  heureDebut: number,
  heureFin: number,
): boolean {
  const velo = velos.find((v) => v.id === veloId);
  if (!velo || velo.statut === "RETIRE" || velo.statut === "MAINTENANCE") return false;
  return !creneauxBloquants(veloId).some((periode) =>
    creneauxSeChevauchent({ debut, fin, heureDebut, heureFin }, periode),
  );
}

function controleCode(code: string, montantXof: number) {
  const normalise = normaliserCode(code);
  const donnees = etat();
  const ligne = donnees.codesPromo.find((c) => c.code === normalise) ?? null;
  // Un partenariat désactivé retire toute valeur à ses codes.
  const partenaire = ligne
    ? donnees.partenaires.find((p) => p.id === ligne.partenaireId)
    : undefined;
  return verifierCode(ligne && partenaire?.actif ? ligne : null, montantXof);
}

export const depotDemo: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    let resultat = filtre?.inclureRetires
      ? velos
      : velos.filter((velo) => velo.statut !== "RETIRE");

    if (filtre?.pointDeRetraitId) {
      resultat = resultat.filter((velo) => velo.pointDeRetraitId === filtre.pointDeRetraitId);
    }
    if (filtre?.dateDebut && filtre?.dateFin) {
      // « Ce vélo a-t-il encore de la place ce jour-là », et non « est-il
      // intégralement libre » : une sortie du matin laisse l'après-midi.
      const libres = new Set<string>();
      for (const velo of resultat) {
        // Un vélo à l'atelier ne se propose pas, quelle que soit la date.
        if (velo.statut === "MAINTENANCE") continue;
        const pris = await this.periodesIndisponibles(velo.id);
        if (
          resteUneHeureLibre(
            pris,
            filtre.dateDebut,
            filtre.dateFin,
            OUVERTURE_HEURE,
            FERMETURE_HEURE,
          )
        ) {
          libres.add(velo.id);
        }
      }
      resultat = resultat.filter((velo) => libres.has(velo.id));
    }

    return copie(resultat);
  },

  async trouverVeloParSlug(slug: string) {
    return copie(velos.find((velo) => velo.slug === slug) ?? null);
  },

  async trouverVeloParId(id: string) {
    return copie(velos.find((velo) => velo.id === id) ?? null);
  },

  async listerPointsDeRetrait(): Promise<PointDeRetrait[]> {
    return copie(pointsDeRetrait.filter((point) => point.actif));
  },

  async periodesIndisponibles(veloId: string) {
    // Dans le même ordre qu'en base : par jour, puis par heure de départ.
    return creneauxBloquants(veloId).sort((a, b) => a.debut.localeCompare(b.debut) || a.heureDebut - b.heureDebut);
  },

  async estDisponible(
    veloId: string,
    debut: DateISO,
    fin: DateISO,
    heureDebut: number,
    heureFin: number,
  ) {
    return veloLibre(veloId, debut, fin, heureDebut, heureFin);
  },

  async velosLibres(date: DateISO, heureDebut: number, heureFin: number) {
    return copie(ordreAttribution(velos.filter((velo) => veloLibre(velo.id, date, date, heureDebut, heureFin))));
  },

  async creerReservation(demande: DemandeReservation): Promise<ResultatReservation> {
    // Même règle qu'en base : Octobre rose ne se réserve pas sur un vélo
    // choisi, les vélos sont attribués plus bas, un par participant, parmi
    // ceux libres sur la sortie du jour demandé.
    const octobreRose = demande.offre === "octobre-rose";
    // Padel bike, comme Octobre rose et comme en base : vélos attribués d'office.
    const attribueDOffice = octobreRose || demande.offre === "padel-bike";
    const creneauSortie = octobreRose ? creneauOctobreRoseDemande(demande) : null;
    // Comme en base : les réglages des produits, lus ici même. Padel bike
    // part à l'heure réglée, au prix réglé.
    const reglages = await lireReglagesAvec(async (cleReglage) => etat().parametresAdmin.get(cleReglage) ?? null);
    const sortiePadel = demande.offre === "padel-bike" ? reglages.padel : null;
    const heureDebut = sortiePadel ? blocPadel(sortiePadel).heureDebut : demande.heureDebut;
    const velo = attribueDOffice || !demande.veloId ? undefined : velos.find((v) => v.id === demande.veloId);
    if (!attribueDOffice && demande.veloId && !velo) throw new Error("Vélo introuvable.");
    // Même règle qu'en base : la gamme du vélo précis (le comptoir), sinon
    // celle que le client a choisie sur le site.
    const gamme = attribueDOffice ? undefined : (velo?.gamme ?? demande.gamme);
    if (!attribueDOffice && !gamme) throw new Error("Gamme manquante.");

    // Même règle qu'en base : une vente au comptoir se règle en espèces.
    const encaissement = demande.encaissement;
    if (encaissement && demande.moyenPaiement !== "ESPECES") {
      throw new Error("Une vente encaissée au comptoir se règle en espèces.");
    }

    // Devis sans remise d'abord : c'est sur son total que le code de parrainage
    // s'applique.
    const devisBrut = calculerDevis({
      offre: demande.offre,
      // La gamme fixe le prix, et les vélos attribués sont de cette gamme.
      // Octobre rose s'en passe : le jour de sa sortie le fixe.
      gamme,
      date: demande.dateDebut,
      nombrePersonnes: demande.nombrePersonnes,
      dureeHeures: demande.dureeHeures,
      options: demande.options,
      // Prix de la plaquette pour une vente encaissée au comptoir, comme en base.
      especes: Boolean(encaissement),
    }, reglages);

    // L'heure de fin découle de la formule : le road trip dure le temps
    // de son créneau, Octobre rose jusqu'au retour des vélos, la location
    // libre le nombre d'heures choisi.
    const heureFin = creneauSortie
      ? creneauSortie.heureFin
      : sortiePadel
        ? blocPadel(sortiePadel).heureFin
      : estSurCommande(demande.offre)
        ? demande.heureDebut + SORTIES_SUR_COMMANDE[demande.offre].dureeHeures
        : demande.offre === "road-trip"
          ? demande.heureDebut + DUREE_ROAD_TRIP_HEURES
          : demande.heureDebut + (devisBrut.dureeHeures ?? 1);

    // Dernières vérifications, puis l'écriture, sans aucune attente d'ici à
    // l'enregistrement (voir `creneauxBloquants`) : c'est ici que se joue
    // l'absence de double réservation, et de double vente au comptoir.
    if (
      encaissement?.reference &&
      etat().reservations.some((r) =>
        r.paiements.some((p) => p.referenceFournisseur === encaissement.reference),
      )
    ) {
      throw new TransactionDejaUtiliseeError("Cette vente est déjà enregistrée.");
    }
    let velosAttribues: Velo[];
    if (attribueDOffice) {
      const libres = ordreAttribution(
        velos.filter((v) => veloLibre(v.id, demande.dateDebut, demande.dateFin, heureDebut, heureFin)),
      );
      if (libres.length < devisBrut.nombrePersonnes) {
        throw new ConflitDisponibiliteError(
          messagePlacesManquantes(devisBrut.nombrePersonnes, libres.length, Boolean(encaissement)),
        );
      }
      velosAttribues = libres.slice(0, devisBrut.nombrePersonnes);
    } else if (!velo) {
      // Réservation par gamme, comme en base : autant de vélos de la gamme
      // libres sur le créneau que de personnes, dans l'ordre d'attribution.
      const libres = velos.filter(
        (v) =>
          v.statut !== "MAINTENANCE" &&
          v.statut !== "RETIRE" &&
          veloLibre(v.id, demande.dateDebut, demande.dateFin, heureDebut, heureFin),
      );
      const choisis = velosLibresDeLaGamme(gamme!, libres, devisBrut.nombrePersonnes);
      if (!choisis) {
        throw new ConflitDisponibiliteError(
          messageVelosManquants(gamme!, libres.filter((v) => v.gamme === gamme).length),
        );
      }
      velosAttribues = choisis;
    } else {
      // Comme en base : un vélo déclaré indisponible un jour de la période ne
      // roule pas, quelle que soit l'offre.
      if (indisponibleSurPeriode(velo!.id, demande.dateDebut, demande.dateFin)) {
        throw new ConflitDisponibiliteError(MESSAGE_VELO_INDISPONIBLE);
      }
      if (!veloLibre(velo!.id, demande.dateDebut, demande.dateFin, heureDebut, heureFin)) {
        throw new ConflitDisponibiliteError();
      }
      // Un vélo par personne, comme en base : le vélo choisi, puis d'autres
      // de sa gamme, libres sur le créneau.
      const libres = velos.filter((v) => veloLibre(v.id, demande.dateDebut, demande.dateFin, heureDebut, heureFin));
      const choisis = velosDeLaGamme(velo!, libres, devisBrut.nombrePersonnes);
      if (!choisis) {
        throw new ConflitDisponibiliteError(
          messageVelosManquants(velo!.gamme, libres.filter((v) => v.gamme === velo!.gamme).length),
        );
      }
      velosAttribues = choisis;
    }

    // Le code est vérifié et consommé dans la foulée, avec la même règle
    // qu'en production, sans quoi les deux modes ne répondraient pas pareil.
    // Pas de code sur Octobre rose : son prix est forfaitaire.
    let remise: { code: string; montantXof: number } | undefined;
    if (demande.codeParrainage && !octobreRose && !estSurCommande(demande.offre)) {
      const controle = controleCode(demande.codeParrainage, devisBrut.totalXof);
      if (controle.valide && controle.remiseXof > 0) {
        const ligne = etat().codesPromo.find((c) => c.code === controle.code.code);
        if (ligne) {
          ligne.utilisations += 1;
          remise = { code: ligne.code, montantXof: controle.remiseXof };
        }
      }
    }

    const devis = remise
      ? calculerDevis({
          offre: demande.offre,
          gamme,
          date: demande.dateDebut,
          nombrePersonnes: demande.nombrePersonnes,
          dureeHeures: demande.dureeHeures,
          options: demande.options,
          especes: Boolean(encaissement),
          remise,
        }, reglages)
      : devisBrut;
    const donnees = etat();

    const emailNormalise = demande.client.email.trim().toLowerCase();
    let client = donnees.clients.find((c) => c.email === emailNormalise);
    if (!client) {
      client = {
        id: `cli-${donnees.clients.length + 1}-${Date.now().toString(36)}`,
        email: emailNormalise,
        prenom: demande.client.prenom.trim(),
        nom: demande.client.nom.trim(),
        telephone: demande.client.telephone?.trim(),
        creeLe: new Date().toISOString(),
      };
      donnees.clients.push(client);
    }
    // Même règle qu'en base : une fiche existante n'est jamais réécrite,
    // pas même pour compléter un téléphone manquant.
    // Ce que la personne a saisi pour cette réservation, à part de la fiche.
    const contact = {
      ...client,
      prenom: demande.client.prenom.trim(),
      nom: demande.client.nom.trim(),
      telephone: demande.client.telephone?.trim() || client.telephone,
    };

    const reference = genererReference();
    const token = genererToken(reference);
    donnees.tokens.set(reference, hacherToken(token));

    const maintenant = new Date().toISOString();
    const reservation: Reservation = {
      id: `res-${reference}`,
      reference,
      // La reservation nait EN ATTENTE : seul le paiement verifie la
      // confirme. Sans cela, on pourrait reserver un velo sans payer.
      // La vente au comptoir, deja encaissee, nait confirmee.
      statut: encaissement ? "CONFIRMEE" : "EN_ATTENTE_PAIEMENT",
      confirmeLe: encaissement ? maintenant : undefined,
      offre: demande.offre,
      nombrePersonnes: devis.nombrePersonnes,
      dureeHeures: devis.dureeHeures ?? undefined,
      clientId: client.id,
      client: contact,
      pointDeRetraitId: velosAttribues[0].pointDeRetraitId,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      heureDebut,
      heureFin,
      ...(sortiePadel ? { horaire: { depart: sortiePadel.depart, retour: sortiePadel.retour } } : {}),
      jours: nombreDeJours(demande.dateDebut, demande.dateFin),
      // Comme en base : un vélo par participant pour Octobre rose, chacun
      // au prix d'une place ; ailleurs, le vélo choisi porte la location.
      lignes: velosAttribues.map((attribue) => {
        const prixLigne =
          velosAttribues.length > 1
            ? Math.round(devis.sousTotalXof / velosAttribues.length)
            : devis.sousTotalXof;
        return {
          veloId: attribue.id,
          veloNom: attribue.nom,
          veloSlug: attribue.slug,
          prixUnitaireXof: prixLigne,
          totalLigneXof: prixLigne,
        };
      }),
      options: devis.optionsDetaillees.map((ligne) => ({
        code: ligne.option.code,
        libelle: ligne.option.libelle,
        prixXof: ligne.montantXof,
        quantite: ligne.quantite,
      })),
      sousTotalXof: devis.sousTotalXof,
      optionsXof: devis.optionsXof,
      remiseXof: devis.remiseXof,
      codeParrainage: remise?.code,
      commissionParrainageXof: remise ? commissionPour(devis.totalXof) : undefined,
      cautionXof: devis.cautionXof,
      totalXof: devis.totalXof,
      paiements: [
        {
          id: `pay-${reference}`,
          fournisseur: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "SASPAY",
          moyen: demande.moyenPaiement,
          statut: encaissement ? "REUSSI" : "INITIE",
          montantXof: devis.totalXof,
          // Référence provisoire d'un paiement en ligne ; pour les espèces,
          // celle de la saisie au comptoir, comme en base.
          referenceFournisseur: encaissement ? encaissement.reference : `TX-${reference}`,
          estCaution: false,
          encaissePar: encaissement?.par,
          creeLe: maintenant,
        },
      ],
      message: demande.message,
      creeLe: maintenant,
    };

    donnees.reservations.push(reservation);

    // L'utilisation est enregistrée après coup, une fois la référence
    // connue : c'est elle qui rattache ce client au partenaire.
    if (remise) {
      donnees.utilisationsPromo.push({
        code: remise.code,
        reference: reservation.reference,
        remiseXof: remise.montantXof,
        commissionXof: commissionPour(devis.totalXof),
        statut: encaissement ? "VALIDE" : "EN_ATTENTE",
        le: maintenant,
      });
    }
    return { reservation: copie(reservation), token };
  },

  async trouverReservationParToken(token: string) {
    const reference = lireToken(token);
    if (!reference) return null;

    const hachageAttendu = etat().tokens.get(reference);
    // L'historique de démonstration n'a pas de token émis : on autorise
    // alors l'accès sur la seule signature, qui reste vérifiée.
    if (hachageAttendu && hachageAttendu !== hacherToken(token)) return null;

    return this.trouverReservationParReference(reference);
  },

  async trouverReservationParReference(reference: string) {
    const reservation = etat().reservations.find(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    return reservation ? copie(reservation) : null;
  },

  async trouverReservationParPaiement(referencePaiement: string) {
    const reservation = etat().reservations.find((r) =>
      r.paiements.some((p) => p.referenceFournisseur === referencePaiement),
    );
    return reservation ? copie(reservation) : null;
  },

  async supprimerReservation(reference: string) {
    const donnees = etat();
    const index = donnees.reservations.findIndex(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    if (index === -1) return false;

    const reservation = donnees.reservations[index];
    // De l'argent à rendre y est rattaché : comme en base, elle reste.
    if (donnees.remboursements.some((r) => r.reservationId === reservation.id)) return false;
    // Même garde-fou qu'en base : ce qui a encaissé ne s'efface pas, ni ce
    // qui porte un paiement reçu hors délai (la référence provisoire
    // « TX-… » de la démonstration ne compte pas).
    const aEncaisse = reservation.paiements.some(
      (paiement) =>
        !paiement.estCaution &&
        (paiement.statut === "REUSSI" ||
          Boolean(paiement.referenceFournisseur && !paiement.referenceFournisseur.startsWith("TX-"))),
    );
    if (aEncaisse || reservation.statut !== "EN_ATTENTE_PAIEMENT") return false;

    const usage = donnees.utilisationsPromo.find(
      (u) => u.reference === reservation.reference && u.statut === "EN_ATTENTE",
    );
    if (usage) {
      const code = donnees.codesPromo.find((c) => c.code === usage.code);
      if (code) code.utilisations = Math.max(0, code.utilisations - 1);
      donnees.utilisationsPromo.splice(donnees.utilisationsPromo.indexOf(usage), 1);
    }

    donnees.reservations.splice(index, 1);
    return true;
  },

  async annulerReservation(reference: string, options?: { rembourseAuComptoir?: boolean }) {
    const reservation = etat().reservations.find(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    if (!reservation) return null;
    const comptoir = Boolean(options?.rembourseAuComptoir);
    // Même règle qu'en base : seul l'appel qui annule réellement renvoie la
    // réservation ; une vente au comptoir ne s'annule que tant que le vélo
    // n'est pas parti, et l'argent est rendu sur-le-champ, en entier.
    const annulable = comptoir
      ? reservation.statut === "CONFIRMEE"
      : reservation.statut === "EN_ATTENTE_PAIEMENT" || reservation.statut === "CONFIRMEE";
    if (!annulable) return null;
    const maintenant = new Date().toISOString();
    reservation.statut = "ANNULEE";
    reservation.annuleLe = maintenant;
    if (comptoir) {
      for (const paiement of reservation.paiements) {
        if (!paiement.estCaution && paiement.moyen === "ESPECES" && paiement.statut === "REUSSI") {
          paiement.statut = "REMBOURSE";
          paiement.rembourseLe = maintenant;
          paiement.montantRenduXof = paiement.montantXof;
        }
      }
    }

    // Un usage encore en attente libère le quota qu'il retenait. Un
    // usage validé, lui, correspond à un paiement encaissé : on n'y
    // touche pas, sauf pour une vente au comptoir annulée et remboursée,
    // qui n'était qu'une erreur de saisie.
    const donnees = etat();
    const usage = donnees.utilisationsPromo.find(
      (u) =>
        u.reference === reservation.reference &&
        (u.statut === "EN_ATTENTE" || (comptoir && u.statut === "VALIDE")),
    );
    if (usage) {
      usage.statut = "ANNULE";
      const code = donnees.codesPromo.find((c) => c.code === usage.code);
      if (code && code.utilisations > 0) code.utilisations -= 1;
    }

    return copie(reservation);
  },

  async noterRemboursementEspeces(reference: string, montantXof: number) {
    const reservation = trouver(reference);
    if (!reservation || reservation.statut !== "ANNULEE") return null;
    const paiement = reservation.paiements.find(
      (p) => !p.estCaution && p.moyen === "ESPECES" && p.statut === "REUSSI",
    );
    if (!paiement) return null;
    paiement.statut = "REMBOURSE";
    paiement.rembourseLe = new Date().toISOString();
    paiement.montantRenduXof = montantXof;
    return copie(reservation);
  },

  async listerRappelsAEnvoyer(date: DateISO) {
    return copie(
      etat()
        .reservations.filter(
          (r) => r.statut === "CONFIRMEE" && r.dateDebut === date && !rappelsEnvoyes.has(r.id),
        )
        .sort((a, b) => a.heureDebut - b.heureDebut),
    );
  },

  async retenirRappel(reservationId: string) {
    if (rappelsEnvoyes.has(reservationId)) return false;
    rappelsEnvoyes.add(reservationId);
    return true;
  },

  async libererRappel(reservationId: string) {
    rappelsEnvoyes.delete(reservationId);
  },

  async listerReservations(options?: { statut?: StatutReservation; depuis?: DateISO; jusqua?: DateISO }) {
    let resultat = etat().reservations;
    if (options?.statut) resultat = resultat.filter((r) => r.statut === options.statut);
    if (options?.depuis) resultat = resultat.filter((r) => r.dateFin >= options.depuis!);
    if (options?.jusqua) resultat = resultat.filter((r) => r.dateDebut <= options.jusqua!);
    return copie([...resultat].sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1)));
  },

  async listerClients() {
    return copie(etat().clients);
  },

  async confirmerPaiement(reference: string, referenceTransaction?: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;

    // Équivalent en mémoire de la contrainte d'unicité de PostgreSQL :
    // un identifiant de transaction ne confirme qu'une seule réservation.
    if (referenceTransaction) {
      const ailleurs = etat().reservations.some(
        (autre) =>
          autre.reference !== reservation.reference &&
          autre.paiements.some(
            (paiement) => paiement.referenceFournisseur === referenceTransaction,
          ),
      );
      if (ailleurs) throw new TransactionDejaUtiliseeError();
    }

    // Idempotence : rejouer la notification ne doit rien changer, et
    // surtout ne pas renvoyer un second email au client.
    if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
      return { reservation: copie(reservation), dejaConfirmee: true };
    }

    // Même contrôle qu'en base : un panier expiré ne bloquait plus le vélo,
    // quelqu'un a pu le reprendre. Fait sans attente avant l'écriture.
    if (panierExpire(reservation.creeLe)) {
      const creneau = {
        debut: reservation.dateDebut,
        fin: reservation.dateFin,
        heureDebut: reservation.heureDebut,
        heureFin: reservation.heureFin,
      };
      const minutes = minutesDeLigne(reservation);
      const limite = Date.now() - EXPIRATION_PANIER_MINUTES * 60_000;
      // Vélo par vélo, dans le même ordre qu'en base : repris par une autre
      // réservation (mêmes jours et heures pleines, puis mêmes minutes : un
      // groupe de 8 h 30 ne reprend pas les vélos d'un groupe de 8 h à
      // 8 h 30), ou déclaré indisponible entre-temps un jour de la sortie.
      for (const ligne of reservation.lignes) {
        const repris = etat().reservations.some(
          (autre) =>
            autre.id !== reservation.id &&
            bloque(autre, limite) &&
            autre.lignes.some((l) => l.veloId === ligne.veloId) &&
            creneauxSeChevauchent(creneau, {
              debut: autre.dateDebut,
              fin: autre.dateFin,
              heureDebut: autre.heureDebut,
              heureFin: autre.heureFin,
            }) &&
            seChevauchent(minutes, minutesDeLigne(autre)),
        );
        if (repris) throw new ConflitDisponibiliteError();
        if (indisponibleSurPeriode(ligne.veloId, reservation.dateDebut, reservation.dateFin)) {
          throw new ConflitDisponibiliteError(MESSAGE_VELO_INDISPONIBLE);
        }
      }
    }

    reservation.statut = "CONFIRMEE";
    reservation.confirmeLe = new Date().toISOString();
    for (const paiement of reservation.paiements) {
      if (paiement.estCaution) continue;
      paiement.statut = "REUSSI";
      if (referenceTransaction) {
        if (paiement.referenceFournisseur && paiement.referenceFournisseur !== referenceTransaction) {
          console.warn(
            `[paiement] ${reservation.reference} : la transaction ${referenceTransaction} remplace ${paiement.referenceFournisseur}, déjà notée sur ce paiement. Vérifiez un double paiement.`,
          );
        }
        paiement.referenceFournisseur = referenceTransaction;
      }
    }

    // Le parrainage n'est acquis au partenaire qu'ici. Le filtre sur
    // « en attente » interdit le double comptage d'un webhook rejoué.
    const usage = etat().utilisationsPromo.find(
      (u) => u.reference === reservation.reference && u.statut === "EN_ATTENTE",
    );
    if (usage) usage.statut = "VALIDE";

    return { reservation: copie(reservation), dejaConfirmee: false };
  },

  async marquerDepart(reference: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;
    // Même règle qu'en base : un départ ne part que d'une réservation
    // confirmée. Une réservation annulée ne repart pas ; une déjà en cours
    // reste en cours (le coordinateur a pu cliquer deux fois).
    if (reservation.statut === "CONFIRMEE") reservation.statut = "EN_COURS";
    return copie(reservation);
  },

  async marquerRetour(reference: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;
    // Un retour ne part que d'une réservation en cours.
    if (reservation.statut === "EN_COURS") reservation.statut = "TERMINEE";
    return copie(reservation);
  },

  async creerVelo(champs) {
    // Même logique que `majVelo` : le catalogue est un module importé,
    // donc partagé. On y pousse le vélo, sans rien persister au-delà du
    // processus, c'est la limite assumée du mode démonstration.
    const velo: Velo = {
      id: `velo-${slugifier(champs.nom)}-${Date.now().toString(36)}`,
      slug: slugUnique(slugifier(champs.nom)),
      nom: champs.nom,
      categorie: champs.categorie,
      gamme: champs.gamme,
      taille: champs.taille,
      statut: "DISPONIBLE",
      accroche: champs.accroche,
      description: champs.description,
      poidsKg: champs.poidsKg,
      vitesses: champs.vitesses,
      chargeMaxKg: champs.chargeMaxKg,
      autonomieConseilleeKm: champs.autonomieConseilleeKm,
      equipementInclus: champs.equipementInclus,
      pointDeRetraitId: champs.pointDeRetraitId ?? pointsDeRetrait[0].id,
      noteMoyenne: 0,
      nombreAvis: 0,
      teintes: ["#1c1b19", "#f25c05"],
      photo: champs.photo,
      video: champs.video,
    };
    velos.push(velo);
    return copie(velo);
  },

  async lireParametreAdmin(cle: string) {
    return etat().parametresAdmin.get(cle) ?? null;
  },

  async ecrireParametreAdmin(cle: string, valeur: string) {
    etat().parametresAdmin.set(cle, valeur);
  },

  async effacerParametreAdmin(cle: string) {
    etat().parametresAdmin.delete(cle);
  },

  async avancerParametreAdmin(cle: string, valeur: number) {
    const actuelle = Number(etat().parametresAdmin.get(cle) ?? Number.NEGATIVE_INFINITY);
    if (!(valeur > actuelle)) return false;
    etat().parametresAdmin.set(cle, String(valeur));
    return true;
  },

  async compterEssai(cle: string, fenetreSecondes: number) {
    const maintenant = Date.now();
    const actuel = compteursDemo.get(cle);
    if (!actuel || actuel.expireLe < maintenant) {
      compteursDemo.set(cle, { nombre: 1, expireLe: maintenant + fenetreSecondes * 1000 });
      return 1;
    }
    actuel.nombre += 1;
    return actuel.nombre;
  },

  async effacerCompteur(cle: string) {
    compteursDemo.delete(cle);
  },

  async marquerTransactionRecue(reference: string, referenceTransaction: string) {
    const reservation = trouver(reference);
    const deja = etat().reservations.some((r) =>
      r.paiements.some((p) => p.referenceFournisseur === referenceTransaction),
    );
    // En démonstration, le paiement naît avec une référence provisoire
    // « TX-… » ; en base, il naît sans : les deux comptent comme vides.
    const paiement = reservation?.paiements.find(
      (p) => !p.estCaution && (!p.referenceFournisseur || p.referenceFournisseur.startsWith("TX-")),
    );
    if (paiement && !deja) paiement.referenceFournisseur = referenceTransaction;
  },

  async majVelo(id, champs) {
    // Le catalogue est un module importe, donc partage : on mute
    // l'objet en place, comme le fait deja l'historique de demonstration
    // pour les reservations. Rien n'est persiste au-dela du processus.
    const velo = velos.find((v) => v.id === id);
    if (!velo) return null;
    if (champs.statut !== undefined) velo.statut = champs.statut;
    if (champs.gamme !== undefined) velo.gamme = champs.gamme;
    return copie(velo);
  },

  /* ------------------------------------------------ Parrainage partenaires */

  async verifierCodeParrainage(code, montantXof) {
    return controleCode(code, montantXof);
  },

  async listerPartenaires(options) {
    const liste = options?.inclureInactifs
      ? etat().partenaires
      : etat().partenaires.filter((p) => p.actif);
    return copie([...liste].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
  },

  async creerPartenaire(champs) {
    const donnees = etat();
    const partenaire: Partenaire = {
      id: `part-${donnees.partenaires.length + 1}-${Date.now().toString(36)}`,
      nom: champs.nom.trim(),
      contact: champs.contact?.trim() || undefined,
      notes: champs.notes?.trim() || undefined,
      actif: true,
      creeLe: new Date().toISOString(),
    };
    donnees.partenaires.push(partenaire);
    return copie(partenaire);
  },

  async majPartenaire(id, champs) {
    const partenaire = etat().partenaires.find((p) => p.id === id);
    if (!partenaire) return null;
    if (champs.actif !== undefined) partenaire.actif = champs.actif;
    return copie(partenaire);
  },

  async listerCodesParrainage() {
    return copie([...etat().codesPromo].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1)));
  },

  async creerCodeParrainage(champs) {
    const donnees = etat();
    const partenaire = donnees.partenaires.find((p) => p.id === champs.partenaireId);
    const code: CodeParrainage = {
      code: normaliserCode(champs.code),
      partenaireId: champs.partenaireId,
      partenaireNom: partenaire?.nom ?? "",
      debuteLe: champs.debuteLe,
      // Fin de journée incluse : un code qui finit « le 31 » vaut tout le 31.
      finitLe: champs.finitLe ? new Date(`${champs.finitLe}T23:59:59`).toISOString() : undefined,
      utilisationsMax: champs.utilisationsMax,
      utilisations: 0,
      actif: true,
      creeLe: new Date().toISOString(),
    };
    donnees.codesPromo.push(code);
    return copie(code);
  },

  async majCodeParrainage(code, champs) {
    const ligne = etat().codesPromo.find((c) => c.code === normaliserCode(code));
    if (!ligne) return null;
    if (champs.actif !== undefined) ligne.actif = champs.actif;
    return copie(ligne);
  },

  async lireOuverture() {
    const { reglagesCreneaux, joursFermes } = etat();
    return copie({
      creneaux: Object.fromEntries(reglagesCreneaux),
      joursFermes: [...joursFermes].sort((a, b) => a.date.localeCompare(b.date)),
    });
  },

  async reglerCreneau(code, actif) {
    etat().reglagesCreneaux.set(code, actif);
  },

  async fermerJour({ date, formule, motif }) {
    const joursFermesDemo = etat().joursFermes;
    const existant = joursFermesDemo.find((j) => j.date === date && j.formule === formule);
    if (existant) {
      existant.motif = motif || undefined;
      return copie(existant);
    }
    const jour: JourFerme = {
      id: `jf-${date}-${formule}`,
      date,
      formule,
      motif: motif || undefined,
      creeLe: new Date().toISOString(),
    };
    joursFermesDemo.push(jour);
    return copie(jour);
  },

  async rouvrirJour(id) {
    const joursFermesDemo = etat().joursFermes;
    const index = joursFermesDemo.findIndex((j) => j.id === id);
    if (index < 0) return false;
    joursFermesDemo.splice(index, 1);
    return true;
  },

  async supprimerPartenaire(id) {
    const donnees = etat();
    const index = donnees.partenaires.findIndex((p) => p.id === id);
    if (index < 0) return { supprime: false };
    const siens = new Set(donnees.codesPromo.filter((c) => c.partenaireId === id).map((c) => c.code));
    const usages = donnees.utilisationsPromo.filter((u) => siens.has(u.code));
    if (usages.some((u) => u.statut === "VALIDE")) return { supprime: false, raison: "commissions" as const };
    if (usages.some((u) => u.statut === "EN_ATTENTE")) return { supprime: false, raison: "en-attente" as const };
    donnees.utilisationsPromo = donnees.utilisationsPromo.filter((u) => !siens.has(u.code));
    donnees.codesPromo = donnees.codesPromo.filter((c) => !siens.has(c.code));
    donnees.partenaires.splice(index, 1);
    return { supprime: true, codes: siens.size };
  },

  async supprimerCodeParrainage(code) {
    const normalise = normaliserCode(code);
    const donnees = etat();
    // Effacer un code déjà utilisé effacerait la seule trace de ce que le
    // partenaire a apporté.
    if (donnees.utilisationsPromo.some((u) => u.code === normalise)) {
      return { supprime: false, raison: "deja-utilise" as const };
    }
    const index = donnees.codesPromo.findIndex((c) => c.code === normalise);
    if (index < 0) return { supprime: false };
    donnees.codesPromo.splice(index, 1);
    return { supprime: true };
  },

  async statistiquesPartenaires() {
    const donnees = etat();
    return copie(
      [...donnees.partenaires]
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        .map((partenaire) => {
          const codes = donnees.codesPromo
            .filter((c) => c.partenaireId === partenaire.id)
            .map((c) => c.code);

          // Les réservations annulées ne comptent pas : le partenaire n'a
          // pas apporté un client qui s'est décommandé.
          const utilisations = donnees.utilisationsPromo
            .filter((u) => codes.includes(u.code) && u.statut === "VALIDE")
            .map((u) => ({
              ...u,
              reservation: donnees.reservations.find((r) => r.reference === u.reference),
            }))
            .filter((u) => u.reservation && u.reservation.statut !== "ANNULEE");

          return {
            partenaire,
            codes,
            utilisations: utilisations.length,
            reductionsAccordeesXof: utilisations.reduce((total, u) => total + u.remiseXof, 0),
            chiffreAffairesXof: utilisations.reduce(
              (total, u) => total + (u.reservation?.totalXof ?? 0),
              0,
            ),
            commissionDueXof: utilisations.reduce((total, u) => total + u.commissionXof, 0),
            derniereUtilisation: utilisations.map((u) => u.le).sort().at(-1),
          };
        }),
    );
  },

  /* ------------------------------------------------------- Avis clients */

  async enregistrerAvis(entree) {
    const reservation = trouver(entree.reference);
    // On ne note que ce qu'on a vécu : la sortie doit être terminée.
    if (!reservation || reservation.statut !== "TERMINEE") return null;

    const donnees = etat();
    const ligne = reservation.lignes[0];
    const existant = donnees.avis.find(
      (avis) => avis.reference.toUpperCase() === entree.reference.toUpperCase(),
    );

    // Un second envoi corrige le premier plutôt que d'en empiler un autre,
    // et repasse en relecture : le texte a changé.
    if (existant) {
      existant.note = entree.note;
      existant.titre = entree.titre;
      existant.commentaire = entree.commentaire;
      existant.publie = false;
      return copie(existant);
    }

    const avis: AvisClient = {
      id: `avis-${reservation.reference}`,
      veloId: ligne?.veloId ?? "",
      veloNom: ligne?.veloNom ?? "",
      reference: reservation.reference,
      // Le nom de famille reste chez nous : un avis public n'a pas à
      // désigner quelqu'un précisément.
      auteur: `${reservation.client.prenom} ${reservation.client.nom.slice(0, 1)}.`,
      note: entree.note,
      titre: entree.titre,
      commentaire: entree.commentaire,
      publie: false,
      creeLe: new Date().toISOString(),
    };
    donnees.avis.push(avis);
    return copie(avis);
  },

  async trouverAvisParReference(reference) {
    const avis = etat().avis.find(
      (element) => element.reference.toUpperCase() === reference.toUpperCase(),
    );
    return copie(avis ?? null);
  },

  async listerAvis(filtre) {
    let resultat = etat().avis;
    if (filtre?.publiesSeulement) resultat = resultat.filter((avis) => avis.publie);
    if (filtre?.veloId) resultat = resultat.filter((avis) => avis.veloId === filtre.veloId);
    return copie([...resultat].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1)));
  },

  async publierAvis(id, publie) {
    const avis = etat().avis.find((element) => element.id === id);
    if (!avis) return null;
    avis.publie = publie;
    return copie(avis);
  },

  async enregistrerMessageContact(message) {
    const enregistre: MessageContact = {
      ...message,
      id: `msg-${Date.now().toString(36)}`,
      creeLe: new Date().toISOString(),
    };
    etat().messages.unshift(enregistre);
    return copie(enregistre);
  },

  async listerMessagesContact() {
    return copie(etat().messages);
  },

  /* ------------------------------------------ Offres de groupe : administration */

  async listerIndisponibilites(options) {
    return copie(
      etat()
        .indisponibilites.filter(
          (i) =>
            (!options?.depuis || i.date >= options.depuis) &&
            (!options?.jusqua || i.date <= options.jusqua) &&
            (!options?.veloId || i.veloId === options.veloId),
        )
        .map(versIndisponibilite)
        .sort((a, b) => a.date.localeCompare(b.date) || a.veloNom.localeCompare(b.veloNom, "fr")),
    );
  },

  async ajouterIndisponibilite({ veloId, date, motif, par }) {
    // Comme en base : un vélo inconnu n'est pas déclaré, et un vélo déjà
    // déclaré ce jour-là garde sa ligne, motif mis à jour.
    if (!velos.some((velo) => velo.id === veloId)) return null;
    const donnees = etat();
    const motifNettoye = motif?.trim() || undefined;
    let ligne = donnees.indisponibilites.find((i) => i.veloId === veloId && i.date === date);
    const dejaDeclare = Boolean(ligne);
    if (ligne) {
      ligne.motif = motifNettoye;
    } else {
      ligne = {
        id: identifiant("indispo"),
        veloId,
        date,
        ...(motifNettoye ? { motif: motifNettoye } : {}),
        creePar: par,
        creeLe: new Date().toISOString(),
      };
      donnees.indisponibilites.push(ligne);
    }
    ecrireAuJournal({
      type: "indisponibilite-ajoutee",
      details: { veloId, veloNom: nomDuVelo(veloId), date, motif: motifNettoye ?? null, dejaDeclare },
      auteur: par,
    });
    return copie(versIndisponibilite(ligne));
  },

  async retirerIndisponibilite(id, par) {
    const donnees = etat();
    const index = donnees.indisponibilites.findIndex((i) => i.id === id);
    if (index < 0) return false;
    const [ligne] = donnees.indisponibilites.splice(index, 1);
    ecrireAuJournal({
      type: "indisponibilite-retiree",
      details: { veloId: ligne.veloId, veloNom: nomDuVelo(ligne.veloId), date: ligne.date, motif: ligne.motif ?? null },
      auteur: par,
    });
    return true;
  },

  async journaliser(evenement) {
    return copie(ecrireAuJournal(evenement));
  },

  async listerJournal(filtre) {
    const reference = filtre?.reference?.trim().toUpperCase();
    // Du plus récent au plus ancien : l'ordre d'écriture, retourné, départage
    // deux événements de la même milliseconde comme en base.
    return copie(
      [...etat().journal]
        .reverse()
        .filter(
          (e) =>
            (!filtre?.type || e.type === filtre.type) &&
            (!reference || e.reference?.toUpperCase() === reference) &&
            (!filtre?.depuis || e.creeLe >= filtre.depuis),
        )
        .slice(0, limiteJournal(filtre)),
    );
  },

  async creerRemboursement({ reference, montantXof, motif, par, cleIdempotence }) {
    const reservation = trouver(reference);
    if (!reservation) return null;
    const donnees = etat();
    const cleNettoyee = cleIdempotence?.trim() || undefined;
    const demande = {
      reservationId: reservation.id,
      montantXof,
      motif: motif.trim(),
      ...(cleNettoyee ? { cleIdempotence: cleNettoyee } : {}),
    };
    // La même demande deux fois (un webhook rejoué) : la première, rien de
    // plus, qu'elle soit encore à faire ou déjà faite (comme en base).
    const existant = donnees.remboursements.find((r) => memeRemboursement(r, demande));
    if (existant) return copie(versRemboursement(existant));
    const ligne: EtatDemo["remboursements"][number] = {
      id: identifiant("remb"),
      ...demande,
      statut: "a_faire",
      creeLe: new Date().toISOString(),
    };
    donnees.remboursements.push(ligne);
    ecrireAuJournal({
      type: "remboursement-cree",
      reference: reservation.reference,
      details: { remboursementId: ligne.id, montantXof, motif: demande.motif },
      auteur: par ?? "site",
    });
    return copie(versRemboursement(ligne));
  },

  async listerRemboursements(filtre) {
    const ordre = (statut: StatutRemboursement) =>
      etat()
        .remboursements.filter((r) => r.statut === statut)
        // À faire : le plus ancien d'abord, c'est le plus pressé. Faits : le
        // plus récent d'abord.
        .sort((a, b) =>
          statut === "a_faire"
            ? a.creeLe.localeCompare(b.creeLe)
            : (b.faitLe ?? b.creeLe).localeCompare(a.faitLe ?? a.creeLe),
        );
    const lignes = filtre?.statut ? ordre(filtre.statut) : [...ordre("a_faire"), ...ordre("fait")];
    const resultat = lignes
      .map(versRemboursement)
      .filter((r): r is Remboursement => r !== null);
    return copie(filtre?.limite ? resultat.slice(0, Math.max(1, Math.floor(filtre.limite))) : resultat);
  },

  async marquerRemboursementFait(id, par) {
    const ligne = etat().remboursements.find((r) => r.id === id);
    // Sous condition, comme en base : un second clic ne note rien deux fois.
    if (!ligne || ligne.statut !== "a_faire") return null;
    ligne.statut = "fait";
    ligne.faitPar = par;
    ligne.faitLe = new Date().toISOString();
    const remboursement = versRemboursement(ligne);
    ecrireAuJournal({
      type: "remboursement-fait",
      reference: remboursement?.reference,
      details: { remboursementId: ligne.id, montantXof: ligne.montantXof, motif: ligne.motif },
      auteur: par,
    });
    return copie(remboursement);
  },

  async enregistrerRetard(reference, minutes, par) {
    // Les réglages d'abord : l'attente vient avant les contrôles et
    // l'écriture, qui se suivent sans attente (voir `creneauxBloquants`).
    const lecture = await lireReglagesOffresAvec(async (cleReglage) => etat().parametresAdmin.get(cleReglage) ?? null);
    const reservation = trouver(reference);
    if (!reservation) return { ok: false as const, raison: "introuvable" as const };
    const refus = refusRetard(reservation);
    if (refus) return { ok: false as const, raison: refus };
    // Jamais au prix par défaut quand les réglages enregistrés ne se lisent plus.
    if (lecture.source === "illisible") return { ok: false as const, raison: "reglages" as const };
    const retenues = Math.max(0, Math.min(RETARD_MAX_MINUTES, Math.floor(minutes)));
    const penaliteXof = penaliteRetardXof(retenues, lecture.reglages);
    const avant = reservation.retard;
    reservation.retard = { minutes: retenues, penaliteXof, saisiPar: par };
    ecrireAuJournal({
      type: "retard",
      reference: reservation.reference,
      details: {
        minutes: retenues,
        penaliteXof,
        toleranceMinutes: lecture.reglages.retard.toleranceMinutes,
        penaliteParMinuteXof: lecture.reglages.retard.penaliteParMinuteXof,
        avant: avant ? { minutes: avant.minutes, penaliteXof: avant.penaliteXof } : null,
      },
      auteur: par,
    });
    return { ok: true as const, reservation: copie(reservation) };
  },

  async reservationsTouchees(depuis) {
    const donnees = etat();
    return copie(
      reservationsToucheesParmi(
        donnees.reservations,
        new Map(velos.map((velo) => [velo.id, velo.statut])),
        donnees.indisponibilites,
        depuis,
      ),
    );
  },
  /* ------------------------------------------- Offres de groupe (lot 3) */

  async parcDuJour(date): Promise<ParcDuJour> {
    if (!estDateISO(date)) throw new Error("Date attendue au format AAAA-MM-JJ.");
    const parc = parcDemo(date);
    return copie({
      date: parc.date,
      velos: parc.velos.map(({ id, nom, gamme }) => ({ id, nom, gamme })),
      occupations: parc.occupations,
    });
  },

  async creerReservationGroupe(demande) {
    // Les mêmes refus qu'en base, puis les mêmes règles : le parc relu, les
    // vélos attribués, la preuve consommée et l'écriture, sans aucune
    // attente entre eux (voir `creneauxBloquants`).
    controlerDemandeGroupe(demande);
    const encaissement = demande.encaissement;
    const creneau = { debutMinute: demande.debutMinute, finMinute: demande.finMinute };
    const { heureDebut, heureFin } = heuresCouvrantes(creneau);
    const depart = heureDeMinutes(demande.debutMinute);
    const retour = heureDeMinutes(demande.finMinute);
    const { sousTotalXof, remiseXof } = montantsDeLaDemandeGroupe(demande);
    const donnees = etat();

    if (
      encaissement?.reference &&
      donnees.reservations.some((r) => r.paiements.some((p) => p.referenceFournisseur === encaissement.reference))
    ) {
      throw new TransactionDejaUtiliseeError("Cette vente est déjà enregistrée.");
    }
    const { velos: attribues, libres } = attribuerVelos(parcDemo(demande.date), creneau, demande.velos);
    if (!attribues) throw new CapaciteInsuffisanteError(libres.total, libres.parGamme);

    const preuve = demande.preuveId ? (donnees.preuves.find((p) => p.id === demande.preuveId) ?? null) : null;
    if (demande.preuveId) {
      const liee = preuve?.reference ? trouver(preuve.reference) : undefined;
      const raison = raisonPreuveInutilisable(preuve, liee ? { statut: liee.statut, creeLe: liee.creeLe } : null);
      if (raison) throw new PreuveReductionInutilisableError(raison);
    }

    // Le client, comme `creerReservation` : une fiche existante n'est jamais
    // réécrite, le contact saisi reste sur la réservation.
    const emailNormalise = demande.client.email.trim().toLowerCase();
    let client = donnees.clients.find((c) => c.email === emailNormalise);
    if (!client) {
      client = {
        id: `cli-${donnees.clients.length + 1}-${Date.now().toString(36)}`,
        email: emailNormalise,
        prenom: demande.client.prenom.trim(),
        nom: demande.client.nom.trim(),
        telephone: demande.client.telephone.trim() || undefined,
        creeLe: new Date().toISOString(),
      };
      donnees.clients.push(client);
    }
    const contact = {
      ...client,
      prenom: demande.client.prenom.trim(),
      nom: demande.client.nom.trim(),
      telephone: demande.client.telephone.trim() || client.telephone,
    };

    const reference = genererReference();
    const token = genererToken(reference);
    donnees.tokens.set(reference, hacherToken(token));
    const maintenant = new Date().toISOString();
    const prixLigne = prixParLigne(sousTotalXof, attribues.length);
    const reservation: Reservation = {
      id: `res-${reference}`,
      reference,
      statut: encaissement ? "CONFIRMEE" : "EN_ATTENTE_PAIEMENT",
      confirmeLe: encaissement ? maintenant : undefined,
      offre: demande.offre,
      nombrePersonnes: demande.nombrePersonnes,
      clientId: client.id,
      client: contact,
      pointDeRetraitId: attribues[0].pointDeRetraitId,
      dateDebut: demande.date,
      dateFin: demande.date,
      // Les heures pleines qui couvrent les minutes, comme en base.
      heureDebut,
      heureFin,
      horaire: { depart, retour },
      minuteDebut: demande.debutMinute,
      minuteFin: demande.finMinute,
      offreDetails: copie(demande.details),
      jours: 1,
      lignes: attribues.map((velo) => ({
        veloId: velo.id,
        veloNom: velo.nom,
        veloSlug: velo.slug,
        prixUnitaireXof: prixLigne,
        totalLigneXof: prixLigne,
      })),
      options: [],
      sousTotalXof,
      optionsXof: 0,
      remiseXof,
      cautionXof: 0,
      totalXof: demande.totalXof,
      paiements: [
        {
          id: `pay-${reference}`,
          fournisseur: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "SASPAY",
          moyen: demande.moyenPaiement,
          statut: encaissement ? "REUSSI" : "INITIE",
          montantXof: demande.totalXof,
          // Référence provisoire d'un paiement en ligne ; pour les espèces,
          // celle de la saisie au comptoir, comme `creerReservation`.
          referenceFournisseur: encaissement ? encaissement.reference : `TX-${reference}`,
          estCaution: false,
          encaissePar: encaissement?.par,
          creeLe: maintenant,
        },
      ],
      message: demande.message,
      creeLe: maintenant,
    };
    donnees.reservations.push(reservation);
    if (preuve) preuve.reference = reference;
    ecrireAuJournal({
      type: "reservation-groupe",
      reference,
      details: detailsReservationGroupe(demande, attribues.length, depart, retour),
      auteur: auteurAuJournal(encaissement),
    });
    return { reservation: copie(reservation), token };
  },
};

/** Exposé pour les récapitulatifs : le catalogue d'options est statique. */
export { optionsLocation };

/** « Vélo de ville N°3 » devient « velo-de-ville-n-3 ». */
function slugifier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Suffixe le slug tant qu'un vélo porte déjà le même. */
function slugUnique(base: string): string {
  if (!velos.some((velo) => velo.slug === base)) return base;
  let suffixe = 2;
  while (velos.some((velo) => velo.slug === `${base}-${suffixe}`)) suffixe += 1;
  return `${base}-${suffixe}`;
}
