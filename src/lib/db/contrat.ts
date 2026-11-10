/**
 * Contrat de la couche de données.
 *
 * Deux implémentations le remplissent :
 *  - `demo.ts`   : jeu de données en mémoire, actif quand DATABASE_URL est absent.
 *                  Il rend le site entièrement navigable (y compris le tableau
 *                  de bord) sans installer PostgreSQL.
 *  - `postgres.ts` : implémentation Prisma / PostgreSQL retenue au §6.1 du
 *                  cahier des charges pour la mise en production.
 *
 * Aucune page ni route d'API n'importe Prisma directement : elles passent
 * toutes par `depot` (src/lib/db/index.ts).
 */

import { listerJours, type DateISO } from "../dates";
import { creneauOctobreRose, sortieOctobreRoseDu } from "@/data/octobre-rose";
import { estOffreGroupe, GAMMES, panierExpire, type GammeVelo } from "@/data/offres";
import type { CodeParrainage, VerificationParrainage } from "../parrainage";
import type {
  AvisClient,
  CategorieVelo,
  Client,
  CodeOffre,
  CodeOffreGroupe,
  DetailsOffreGroupe,
  EvenementJournal,
  IndisponibiliteVelo,
  MessageContact,
  MoyenPaiement,
  Partenaire,
  PointDeRetrait,
  PreuveReduction,
  StatutPreuveReduction,
  RaisonVeloTouche,
  Remboursement,
  Reservation,
  ReservationTouchee,
  StatistiquesPartenaire,
  StatutRemboursement,
  StatutReservation,
  StatutVelo,
  TailleVelo,
  Velo,
  FormuleFermee,
  JourFerme,
  ReglagesOuverture,
} from "../types";

/**
 * Filtre du catalogue.
 *
 * Ni catégorie, ni taille, ni prix : le prix ne dépend plus du vélo mais
 * de la formule choisie, et le coordinateur règle la machine à la
 * morphologie du client au départ. Un filtre sur ces critères
 * laisserait croire qu'ils changent quelque chose.
 */
export interface FiltreCatalogue {
  pointDeRetraitId?: string;
  dateDebut?: DateISO;
  dateFin?: DateISO;
  /** Réservé à l'administration : inclut les vélos retirés du parc public. */
  inclureRetires?: boolean;
}

/** Un intervalle déjà réservé, jour et heures comprises. */
export interface CreneauOccupe {
  debut: DateISO;
  fin: DateISO;
  heureDebut: number;
  heureFin: number;
}

/** Deux créneaux se gênent-ils ? Même jour, et heures qui se recouvrent. */
export function creneauxSeChevauchent(
  a: { debut: DateISO; fin: DateISO; heureDebut: number; heureFin: number },
  b: { debut: DateISO; fin: DateISO; heureDebut: number; heureFin: number },
): boolean {
  // Les jours doivent d'abord se recouvrir.
  if (a.debut > b.fin || b.debut > a.fin) return false;
  // Puis les heures. Un retour à 11 h et un départ à 11 h ne se gênent
  // pas : le vélo est rendu avant d'être repris.
  return a.heureDebut < b.heureFin && b.heureDebut < a.heureFin;
}

/**
 * Reste-t-il au moins une heure libre sur cette période ?
 *
 * C'est la question que pose le filtre du catalogue, et elle n'a plus la
 * même réponse qu'avant : une sortie de 8 h à 11 h ne retire plus le vélo
 * de la journée entière. Masquer un vélo libre l'après-midi reviendrait à
 * refuser une location qui peut parfaitement avoir lieu.
 */
export function resteUneHeureLibre(
  creneauxPris: CreneauOccupe[],
  debut: DateISO,
  fin: DateISO,
  ouverture: number,
  fermeture: number,
): boolean {
  for (const jour of listerJours(debut, fin)) {
    const prises = new Array(fermeture - ouverture).fill(false);
    for (const creneau of creneauxPris) {
      if (jour < creneau.debut || jour > creneau.fin) continue;
      for (let h = creneau.heureDebut; h < creneau.heureFin; h += 1) {
        const index = h - ouverture;
        if (index >= 0 && index < prises.length) prises[index] = true;
      }
    }
    if (prises.some((prise) => !prise)) return true;
  }
  return false;
}

export interface DemandeReservation {
  /**
   * Un vélo précis : celui que le commercial tend au comptoir, ou celui
   * d'un ancien lien de réservation encore ouvert. Le site public ne fait
   * plus choisir de vélo : il envoie `gamme`.
   */
  veloId?: string;
  /**
   * La gamme choisie par le client sur le site, sans vélo précis : le dépôt
   * attribue d'office, dans la transaction qui écrit, autant de vélos de
   * cette gamme libres sur le créneau que de personnes (ou de vélos loués),
   * dans l'ordre d'attribution. Ignorée quand `veloId` est donné, et pour
   * Octobre rose, dont les vélos sont attribués toutes gammes confondues.
   */
  gamme?: GammeVelo;
  offre: CodeOffre;
  nombrePersonnes?: number;
  dureeHeures?: number;
  /**
   * Octobre rose : le jour de la sortie choisie, qui la désigne parmi celles
   * de la campagne (`sortieOctobreRoseDu`), et `dateFin` le même jour. Un
   * jour sans sortie est refusé.
   */
  dateDebut: DateISO;
  dateFin: DateISO;
  /**
   * Heure de départ. Imposée par le créneau en road trip, et pour Octobre
   * rose par la sortie du jour (`creneauOctobreRose(sortie).heureDebut`) ;
   * choisie en location libre.
   */
  heureDebut: number;
  options: { code: string; quantite: number }[];
  /**
   * Code de parrainage saisi par le client, non vérifié.
   *
   * Il est revalidé dans la transaction d'écriture : un code épuisé entre
   * l'affichage et la validation ne doit pas accorder de remise, et deux
   * clients simultanés ne doivent pas pouvoir dépasser le quota.
   */
  codeParrainage?: string;
  client: { prenom: string; nom: string; email: string; telephone?: string };
  moyenPaiement: MoyenPaiement;
  message?: string;
  /** Accepte les conditions générales : obligatoire côté serveur aussi. */
  cgvAcceptees: boolean;
  /**
   * Vente au comptoir, réglée en espèces et saisie dans l'administration.
   *
   * L'argent est déjà dans la caisse : la réservation naît donc confirmée
   * et payée, dans la transaction même qui la crée. Il n'y a aucun
   * paiement à attendre, et rien ne doit pouvoir la laisser « en attente »
   * entre deux écritures. `par` nomme qui a reçu l'argent.
   *
   * `reference` identifie la saisie. Elle est rangée comme référence du
   * paiement, unique en base : la même saisie envoyée deux fois (double
   * clic, réponse perdue puis nouvel envoi) lève alors
   * `TransactionDejaUtiliseeError` au lieu de compter deux fois l'argent.
   */
  encaissement?: { par: string; reference?: string };
}

/**
 * Ce qu'il faut savoir d'un vélo pour l'inscrire au parc.
 *
 * Ni prix ni caution : ils ne dépendent pas de la machine mais de la
 * formule choisie par le client (cf. src/data/offres.ts).
 */
export interface NouveauVelo {
  nom: string;
  categorie: CategorieVelo;
  /** Gamme commerciale : c'est elle qui fixe le tarif du vélo. */
  gamme: GammeVelo;
  taille: TailleVelo;
  accroche: string;
  description: string;
  poidsKg: number;
  vitesses: number;
  chargeMaxKg: number;
  autonomieConseilleeKm: number;
  equipementInclus: string[];
  pointDeRetraitId?: string;
  /** Photo du vélo : un fichier de `public` ou une adresse Vercel Blob. */
  photo?: string;
  /** Vidéo du vélo, déposée depuis l'admin. Gardée, pas affichée sur le site. */
  video?: string;
}

export interface ResultatReservation {
  reservation: Reservation;
  /** Token en clair, à n'utiliser que pour construire le lien envoyé par email. */
  token: string;
}

const RANG_GAMME: Record<GammeVelo, number> = { CLASSIQUE: 0, PREMIUM: 1, PRESTIGE: 2 };

/**
 * L'ordre dans lequel les vélos sont attribués d'office, pour Octobre
 * rose : le Classique d'abord, le Prestige en dernier, puis par nom. Le
 * prix ne dépend pas du vélo ; on garde ainsi les plus belles machines
 * pour les derniers inscrits plutôt que de les user les premières, et
 * l'attribution est la même, en démonstration comme en base.
 */
export function ordreAttribution<T extends { gamme: GammeVelo; nom: string }>(velos: T[]): T[] {
  return [...velos].sort(
    (a, b) => RANG_GAMME[a.gamme] - RANG_GAMME[b.gamme] || a.nom.localeCompare(b.nom, "fr"),
  );
}

/**
 * Les vélos d'une réservation à plusieurs, road trip ou location libre : un
 * vélo par personne, de la gamme choisie. Le vélo choisi d'abord, puis
 * d'autres de sa gamme parmi ceux libres sur le créneau, dans l'ordre
 * d'attribution. `null` s'il n'y en a pas assez : on ne complète jamais
 * avec une autre gamme, qui n'a pas le même prix.
 */
export function velosDeLaGamme<T extends { id: string; gamme: GammeVelo; nom: string }>(
  choisi: T,
  libres: T[],
  nombre: number,
): T[] | null {
  const autres = ordreAttribution(libres.filter((velo) => velo.id !== choisi.id && velo.gamme === choisi.gamme));
  if (autres.length + 1 < nombre) return null;
  return [choisi, ...autres.slice(0, Math.max(0, nombre - 1))];
}

/**
 * Les vélos libres d'une gamme pour une réservation sans vélo précis : un
 * par personne, dans l'ordre d'attribution. `null` s'il n'y en a pas
 * assez : on ne complète jamais avec une autre gamme, qui n'a pas le même
 * prix.
 */
export function velosLibresDeLaGamme<T extends { gamme: GammeVelo; nom: string }>(
  gamme: GammeVelo,
  libres: T[],
  nombre: number,
): T[] | null {
  const deLaGamme = ordreAttribution(libres.filter((velo) => velo.gamme === gamme));
  return deLaGamme.length < nombre ? null : deLaGamme.slice(0, nombre);
}

/**
 * Les heures où plus aucun vélo d'une gamme n'est libre, pour le calendrier
 * d'une réservation par gamme : un jour n'y est plein que si tous les vélos
 * de la gamme le sont en même temps. Les créneaux de chaque vélo s'y
 * croisent heure par heure, de l'ouverture à la fermeture, et ressortent
 * regroupés en plages d'un seul jour.
 */
export function occupationsDeLaGamme(
  creneauxParVelo: CreneauOccupe[][],
  ouverture: number,
  fermeture: number,
): CreneauOccupe[] {
  if (creneauxParVelo.length === 0) return [];
  const jours = new Set<DateISO>();
  for (const creneaux of creneauxParVelo) {
    for (const creneau of creneaux) {
      for (const jour of listerJours(creneau.debut, creneau.fin)) jours.add(jour);
    }
  }
  const pleines: CreneauOccupe[] = [];
  for (const jour of [...jours].sort()) {
    let debutPlage: number | null = null;
    for (let heure = ouverture; heure <= fermeture; heure += 1) {
      const toutPris =
        heure < fermeture &&
        creneauxParVelo.every((creneaux) =>
          creneaux.some(
            (c) => jour >= c.debut && jour <= c.fin && c.heureDebut <= heure && heure < c.heureFin,
          ),
        );
      if (toutPris && debutPlage === null) debutPlage = heure;
      if (!toutPris && debutPlage !== null) {
        pleines.push({ debut: jour, fin: jour, heureDebut: debutPlage, heureFin: heure });
        debutPlage = null;
      }
    }
  }
  return pleines;
}

/**
 * Pourquoi une réservation à plusieurs ne passe pas : « Il ne reste que 3
 * vélos Premium libres à cette heure : 3 au plus. »
 */
export function messageVelosManquants(gamme: GammeVelo, libres: number): string {
  const nom = GAMMES.find((entree) => entree.code === gamme)?.nom ?? gamme;
  if (libres <= 0) {
    return `Plus aucun vélo ${nom} n'est libre à cette heure : choisissez une autre heure, un autre jour ou une autre gamme.`;
  }
  return libres === 1
    ? `Il ne reste qu'un vélo ${nom} libre à cette heure : un seul vélo pour cette réservation.`
    : `Il ne reste que ${libres} vélos ${nom} libres à cette heure : ${libres} au plus.`;
}

/**
 * Le créneau de la sortie Octobre rose que vise une inscription : celle du
 * jour demandé, à l'heure de son rassemblement, dans la journée. Écrit une
 * fois ici pour que la démonstration et la base refusent exactement la même
 * chose : le dépôt n'écrit jamais une inscription hors des sorties de la
 * campagne, quoi que l'appelant ait vérifié avant lui.
 */
export function creneauOctobreRoseDemande(
  demande: Pick<DemandeReservation, "dateDebut" | "dateFin" | "heureDebut">,
): { date: DateISO; heureDebut: number; heureFin: number } {
  const sortie = sortieOctobreRoseDu(demande.dateDebut);
  if (!sortie) throw new Error(`Aucune sortie Octobre rose le ${demande.dateDebut}.`);
  const creneau = creneauOctobreRose(sortie);
  if (
    demande.dateDebut !== creneau.date ||
    demande.dateFin !== creneau.date ||
    demande.heureDebut !== creneau.heureDebut
  ) {
    throw new Error("Une inscription à Octobre rose porte sur le jour et l'heure de sa sortie.");
  }
  return creneau;
}

/**
 * Le message d'une sortie qui n'a plus assez de vélos libres pour cette
 * inscription : au client en ligne, ou au commercial au comptoir. Les places
 * se comptent par sortie, donc par jour.
 */
export function messagePlacesManquantes(demandees: number, libres: number, auComptoir = false): string {
  if (libres === 0) return "Plus aucune place ce jour-là : tous les vélos de la sortie sont pris.";
  if (auComptoir) {
    return libres === 1
      ? "Il ne reste qu'un vélo libre pour la sortie : une seule personne."
      : `Il ne reste que ${libres} vélos libres pour la sortie : ${libres} personnes au plus.`;
  }
  return libres === 1
    ? `Il ne reste qu'une place : inscrivez une seule personne, ou écrivez-nous pour les autres.`
    : `Il ne reste que ${libres} places : inscrivez ${libres} personnes au plus, ou écrivez-nous pour les autres.`;
}

/* ------------------------------------------ Offres de groupe : administration */

/** Un événement à écrire au journal. `auteur` : « admin (Koffi) ». */
export interface NouvelEvenement {
  type: string;
  reference?: string;
  details?: Record<string, unknown>;
  auteur: string;
}

export interface FiltreJournal {
  type?: string;
  /** La référence d'une réservation, sans tenir compte de la casse. */
  reference?: string;
  /** Les événements écrits à partir de cet instant (ISO). */
  depuis?: string;
  /** Combien au plus, les plus récents d'abord : 200 par défaut, 1 000 au plus. */
  limite?: number;
}

export const LIMITE_JOURNAL_PAR_DEFAUT = 200;
export const LIMITE_JOURNAL_MAX = 1000;

/** Le nombre d'événements à rendre, borné. */
export function limiteJournal(filtre?: FiltreJournal): number {
  const demandee = Math.floor(filtre?.limite ?? LIMITE_JOURNAL_PAR_DEFAUT);
  return Math.max(1, Math.min(LIMITE_JOURNAL_MAX, Number.isFinite(demandee) ? demandee : LIMITE_JOURNAL_PAR_DEFAUT));
}

/**
 * Ce que donne la saisie d'un retard : la réservation à jour, ou pourquoi
 * rien n'a été écrit. `reglages` : les réglages des offres ne se lisent
 * plus, la pénalité ne se calcule pas au prix par défaut.
 */
export type ResultatRetard =
  | { ok: true; reservation: Reservation }
  | { ok: false; raison: "introuvable" | "offre" | "statut" | "reglages" };

/** Le plus long retard qu'on saisit : douze heures. */
export const RETARD_MAX_MINUTES = 720;

/**
 * Pourquoi un retard ne se saisit pas sur cette réservation, ou `null` s'il
 * le peut. La pénalité de retard est celle des offres de groupe (cahier des
 * charges, étape 9) ; elle se saisit au retour des vélos, donc sur une
 * réservation payée : confirmée (le départ a pu ne pas être noté), en cours
 * ou terminée. La même règle en démonstration et en base.
 */
export function refusRetard(reservation: Pick<Reservation, "offre" | "statut">): "offre" | "statut" | null {
  if (!estOffreGroupe(reservation.offre)) return "offre";
  if (!["CONFIRMEE", "EN_COURS", "TERMINEE"].includes(reservation.statut)) return "statut";
  return null;
}

/**
 * Les réservations payées, à venir ou en cours, dont un vélo attribué n'est
 * plus là : retiré du parc, à l'atelier, ou déclaré indisponible un jour de
 * la sortie. Écrit une fois ici, la démonstration et la base y passent les
 * mêmes données et trouvent les mêmes réservations.
 *
 * `depuis` : on ne regarde que les sorties qui finissent ce jour-là ou
 * après. Triées par jour, puis par heure de départ.
 */
export function reservationsToucheesParmi(
  reservations: Pick<
    Reservation,
    | "reference"
    | "offre"
    | "statut"
    | "dateDebut"
    | "dateFin"
    | "heureDebut"
    | "heureFin"
    | "horaire"
    | "nombrePersonnes"
    | "dureeHeures"
    | "minuteDebut"
    | "minuteFin"
    | "client"
    | "lignes"
  >[],
  statutsVelos: ReadonlyMap<string, StatutVelo>,
  indisponibilites: Pick<IndisponibiliteVelo, "veloId" | "date" | "motif">[],
  depuis: DateISO,
): ReservationTouchee[] {
  const touchees: ReservationTouchee[] = [];
  for (const reservation of reservations) {
    if (reservation.statut !== "CONFIRMEE" && reservation.statut !== "EN_COURS") continue;
    if (reservation.dateFin < depuis) continue;
    const velos: ReservationTouchee["velos"] = [];
    for (const ligne of reservation.lignes) {
      const statut = statutsVelos.get(ligne.veloId);
      let raison: RaisonVeloTouche | null = statut === "RETIRE" ? "RETIRE" : statut === "MAINTENANCE" ? "MAINTENANCE" : null;
      let date: DateISO | undefined;
      let motif: string | undefined;
      if (!raison) {
        const indisponible = indisponibilites
          .filter(
            (i) =>
              i.veloId === ligne.veloId &&
              i.date >= reservation.dateDebut &&
              i.date <= reservation.dateFin &&
              i.date >= depuis,
          )
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (indisponible) {
          raison = "INDISPONIBLE";
          date = indisponible.date;
          motif = indisponible.motif;
        }
      }
      if (raison) {
        velos.push({
          veloId: ligne.veloId,
          veloNom: ligne.veloNom,
          raison,
          ...(date ? { date } : {}),
          ...(motif ? { motif } : {}),
        });
      }
    }
    if (velos.length === 0) continue;
    touchees.push({
      reference: reservation.reference,
      offre: reservation.offre,
      statut: reservation.statut,
      dateDebut: reservation.dateDebut,
      dateFin: reservation.dateFin,
      heureDebut: reservation.heureDebut,
      heureFin: reservation.heureFin,
      ...(reservation.horaire ? { horaire: reservation.horaire } : {}),
      nombrePersonnes: reservation.nombrePersonnes,
      ...(reservation.dureeHeures !== undefined ? { dureeHeures: reservation.dureeHeures } : {}),
      ...(reservation.minuteDebut !== undefined && reservation.minuteFin !== undefined
        ? { minuteDebut: reservation.minuteDebut, minuteFin: reservation.minuteFin }
        : {}),
      client: {
        prenom: reservation.client.prenom,
        nom: reservation.client.nom,
        ...(reservation.client.telephone ? { telephone: reservation.client.telephone } : {}),
      },
      velos,
    });
  }
  return touchees.sort(
    (a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.heureDebut - b.heureDebut || a.reference.localeCompare(b.reference),
  );
}

/**
 * La même demande de remboursement, envoyée deux fois (un webhook rejoué) :
 * elle n'en crée pas une seconde, l'argent ne se rend qu'une fois. Même clé
 * d'idempotence quand les deux en portent une (la clé fait foi : l'index
 * unique de la base la protège aussi de deux demandes simultanées) ; sinon
 * même réservation, même montant, même motif. Que le premier remboursement
 * soit encore à faire ou déjà fait n'y change rien : un remboursement noté
 * fait puis redemandé ne se refait pas (relecture du lot 2). Deux paiements
 * reçus en double se distinguent par leur motif (qui cite la transaction),
 * ou par leur clé.
 */
export function memeRemboursement(
  a: Pick<Remboursement, "reservationId" | "montantXof" | "motif"> & { cleIdempotence?: string | null },
  b: { reservationId: string; montantXof: number; motif: string; cleIdempotence?: string | null },
): boolean {
  if (a.cleIdempotence && b.cleIdempotence) return a.cleIdempotence === b.cleIdempotence;
  return a.reservationId === b.reservationId && a.montantXof === b.montantXof && a.motif === b.motif;
}

/* ------------------------------------------- Offres de groupe (lot 3) */

/**
 * La journée entière d'un vélo déclaré indisponible (IndisponibiliteVelo) :
 * de minuit à minuit, pour toutes les offres, location libre, road trip,
 * Octobre rose et Padel bike comprises. Rangée parmi les créneaux pris du
 * vélo (`periodesIndisponibles`), elle se croise comme une réservation avec
 * `creneauxSeChevauchent`, `resteUneHeureLibre` et `occupationsDeLaGamme`.
 */
export function journeeIndisponible(date: DateISO): CreneauOccupe {
  return { debut: date, fin: date, heureDebut: 0, heureFin: 24 };
}

/** Le refus d'un vélo précis déclaré indisponible un jour de la période demandée. */
export const MESSAGE_VELO_INDISPONIBLE = "Ce vélo n'est pas disponible ce jour-là : choisissez-en un autre.";

/** La date au format AAAA-MM-JJ, et qui existe au calendrier. */
export function estDateISO(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const lue = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(lue.getTime()) && lue.toISOString().slice(0, 10) === date;
}

const entierPositif = (valeur: unknown): valeur is number => Number.isInteger(valeur) && (valeur as number) >= 0;

/**
 * Ce que le dépôt refuse d'écrire, quoi qu'ait vérifié l'appelant, pour une
 * réservation d'offre de groupe. Écrit une fois ici pour que la
 * démonstration et la base refusent exactement la même chose. Ne contrôle
 * aucun prix : le serveur les a calculés (src/lib/offres), le dépôt les range.
 */
export function controlerDemandeGroupe(demande: DemandeReservationGroupe): void {
  if (!estOffreGroupe(demande.offre)) throw new Error("Cette offre n'est pas une offre de groupe.");
  if (!estDateISO(demande.date)) throw new Error("Date attendue au format AAAA-MM-JJ.");
  const { debutMinute, finMinute } = demande;
  if (!entierPositif(debutMinute) || !entierPositif(finMinute) || finMinute > 24 * 60 || debutMinute >= finMinute) {
    throw new Error("Créneau impossible : départ et retour en minutes depuis minuit, le retour après le départ.");
  }
  if (demande.offre === "gbashi-groupe") {
    if (typeof demande.velos !== "object" || demande.velos === null) {
      throw new Error("Gbashi Bike se réserve gamme par gamme : le nombre de vélos de chaque gamme.");
    }
    const parGamme = demande.velos;
    const inconnues = Object.keys(parGamme).filter((cle) => !GAMMES.some((gamme) => gamme.code === cle));
    if (inconnues.length > 0) throw new Error(`Gamme inconnue : ${inconnues.join(", ")}.`);
    const nombres = Object.values(parGamme).filter((n) => n !== undefined);
    if (!nombres.every(entierPositif) || nombres.reduce((total, n) => total + n, 0) < 1) {
      throw new Error("Au moins un vélo, en nombres entiers, pour chaque gamme.");
    }
  } else if (!Number.isInteger(demande.velos) || (demande.velos as number) < 1) {
    throw new Error("Le nombre de vélos à bloquer, toutes gammes confondues : un entier, un au moins.");
  }
  if (!Number.isInteger(demande.nombrePersonnes) || demande.nombrePersonnes < 1) {
    throw new Error("Une personne au moins.");
  }
  if (!entierPositif(demande.totalXof)) throw new Error("Le total doit être un montant entier en francs CFA.");
  if (!demande.cgvAcceptees) throw new Error("Les conditions générales doivent être acceptées.");
  // Une vente au comptoir ne se règle qu'en espèces, comme `creerReservation`.
  if (demande.encaissement && demande.moyenPaiement !== "ESPECES") {
    throw new Error("Une vente encaissée au comptoir se règle en espèces.");
  }
  // La réduction sur preuve n'existe que pour le road trip : une preuve citée
  // ailleurs se perdrait sans rien accorder.
  if (demande.preuveId && demande.offre !== "road-trip-groupe") throw new PreuveReductionInutilisableError("offre");
}

/**
 * La réduction rangée sur une réservation de groupe, et le sous-total avant
 * elle : la facture et la page de suivi lisent « sous-total, remise, total ».
 * La réduction vient de l'instantané du calcul (`details.reductionXof`,
 * road trip avec preuve validée) ; sans elle, le sous-total est le total.
 */
export function montantsDeLaDemandeGroupe(demande: Pick<DemandeReservationGroupe, "totalXof" | "details">): {
  sousTotalXof: number;
  remiseXof: number;
} {
  const reduction = demande.details?.reductionXof;
  const remiseXof = entierPositif(reduction) ? reduction : 0;
  return { sousTotalXof: demande.totalXof + remiseXof, remiseXof };
}

/** Le prix d'une ligne de vélo : le sous-total partagé entre les vélos, comme `creerReservation`. */
export function prixParLigne(sousTotalXof: number, nombreDeVelos: number): number {
  return nombreDeVelos > 1 ? Math.round(sousTotalXof / nombreDeVelos) : sousTotalXof;
}

/**
 * Ce que le journal garde d'une réservation de groupe (type
 * « reservation-groupe ») : de quoi la retrouver sans ouvrir sa fiche.
 */
export function detailsReservationGroupe(
  demande: DemandeReservationGroupe,
  nombreDeVelos: number,
  depart: string,
  retour: string,
): Record<string, unknown> {
  return {
    offre: demande.offre,
    date: demande.date,
    depart,
    retour,
    personnes: demande.nombrePersonnes,
    velos: nombreDeVelos,
    ...(typeof demande.velos === "object" ? { gammes: { ...demande.velos } } : {}),
    totalXof: demande.totalXof,
    comptoir: Boolean(demande.encaissement),
    ...(demande.preuveId ? { preuveId: demande.preuveId } : {}),
  };
}

/**
 * L'auteur d'une réservation au journal : « site » pour une demande en ligne,
 * « admin (prénom) » pour une vente au comptoir, du nom de qui a reçu
 * l'argent (même forme que `auteurAdmin` de src/lib/journal.ts).
 */
export function auteurAuJournal(encaissement?: { par: string }): string {
  if (!encaissement) return "site";
  const par = encaissement.par.trim();
  if (/^admin( \(.+\))?$/.test(par)) return par;
  return par ? `admin (${par})` : "admin";
}

/**
 * Pourquoi une preuve de réduction ne peut pas servir à cette réservation.
 * « deja-eue » : le client a déjà eu la réduction des abonnés sur une autre
 * réservation, elle ne se donne qu'une fois par client (décision 25).
 */
export type RaisonPreuveInutilisable = "inconnue" | "en_attente" | "refusee" | "deja-utilisee" | "deja-eue" | "offre";

/**
 * Ce qu'une réservation retient tant qu'elle compte (ses vélos, sa
 * réduction) : payée, ou en attente de paiement depuis moins de 30 minutes.
 * Une réservation annulée, ou jamais payée et expirée, ne retient plus rien.
 */
export function reservationRetenue(reservation: { statut: StatutReservation; creeLe: string }, maintenant = Date.now()): boolean {
  return (
    reservation.statut === "CONFIRMEE" ||
    reservation.statut === "EN_COURS" ||
    reservation.statut === "TERMINEE" ||
    (reservation.statut === "EN_ATTENTE_PAIEMENT" && !panierExpire(reservation.creeLe, maintenant))
  );
}

/* --------------- La réduction des abonnés, une seule fois par client (décision 25) */

/**
 * Qui est un client pour la réduction du road trip (décision 25 du
 * responsable, 10 novembre 2026) : un numéro de téléphone, reconnu à ses
 * huit derniers chiffres comme pour la limite de débit (« +229 01 97… » et
 * « 0197… » se reconnaissent), ou une adresse email, sans espaces autour et
 * en minuscules. L'un ou l'autre suffit.
 */
export interface IdentiteClient {
  email?: string | null;
  telephone?: string | null;
}

/** L'email d'un client tel qu'il se compare : sans espaces autour, en minuscules. */
export function emailDuClient(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/** Les huit derniers chiffres d'un numéro ; vide s'il en a moins de huit. */
export function numeroDuClient(telephone?: string | null): string {
  const chiffres = (telephone ?? "").replace(/[^0-9]/g, "");
  return chiffres.length >= 8 ? chiffres.slice(-8) : "";
}

/** Le même client : la même adresse email, ou le même numéro (ses huit derniers chiffres). */
export function memeClient(a: IdentiteClient, b: IdentiteClient): boolean {
  const email = emailDuClient(a.email);
  if (email && email === emailDuClient(b.email)) return true;
  const numero = numeroDuClient(a.telephone);
  return numero !== "" && numero === numeroDuClient(b.telephone);
}

/**
 * Une réservation du Road trip en groupe, réduite à ce que regarde la règle
 * « une réduction par client » : son contact, son état et sa réduction.
 */
export interface ReservationRoadTripClient {
  reference: string;
  statut: StatutReservation;
  creeLe: string;
  email: string;
  telephone?: string;
  /** La réduction des abonnés comptée sur cette réservation ; 0 au prix normal. */
  reductionXof: number;
}

/**
 * La réservation où l'un de ces clients a déjà eu la réduction des abonnés
 * (décision 25) : un road trip en groupe avec la réduction, qui la retient
 * encore (payée, ou en attente de paiement depuis moins de 30 minutes).
 * `null` s'il ne l'a jamais eue, ou si elle ne compte plus (annulée, jamais
 * payée et expirée). La même règle en démonstration et en base.
 */
export function reductionDejaEue(
  reservations: readonly ReservationRoadTripClient[],
  identites: readonly IdentiteClient[],
  maintenant = Date.now(),
): ReservationRoadTripClient | null {
  return (
    reservations.find(
      (reservation) =>
        reservation.reductionXof > 0 &&
        reservationRetenue(reservation, maintenant) &&
        identites.some((identite) => memeClient(identite, reservation)),
    ) ?? null
  );
}

/**
 * Une preuve validée peut-elle encore servir ? « deja-utilisee » : elle
 * retient déjà la réduction d'une réservation (payée, ou en attente de
 * paiement depuis moins de 30 minutes) ; « deja-eue » : son client, reconnu
 * au contact de la capture ou à l'un des contacts `autres` (celui de la
 * réservation en cours), a déjà eu la réduction sur une autre réservation
 * (décision 25). Le devis, le statut de la capture et la transaction qui
 * écrit la réservation appliquent tous cette règle.
 */
export async function usageDUnePreuveValidee(
  preuve: Pick<PreuveReduction, "reference" | "email" | "telephone">,
  depot: Pick<Depot, "trouverReservationParReference" | "listerReservationsRoadTripGroupe">,
  maintenant = Date.now(),
  autres: readonly IdentiteClient[] = [],
): Promise<"validee" | "deja-utilisee" | "deja-eue"> {
  if (preuve.reference) {
    const liee = await depot.trouverReservationParReference(preuve.reference);
    if (liee && reservationRetenue(liee, maintenant)) return "deja-utilisee";
  }
  const reductions = await depot.listerReservationsRoadTripGroupe({ avecReduction: true });
  const identites: IdentiteClient[] = [{ email: preuve.email, telephone: preuve.telephone }, ...autres];
  return reductionDejaEue(reductions, identites, maintenant) ? "deja-eue" : "validee";
}

/**
 * La preuve de réduction peut-elle servir ? Elle doit être validée (par
 * l'agent IA ou à la main), et ne pas retenir déjà la réduction d'une autre
 * réservation : une par groupe. Une preuve rattachée à une réservation qui ne
 * retient plus rien (annulée, ou jamais payée et expirée au bout de 30
 * minutes) redevient libre : le client qui recommence après un paiement
 * échoué garde sa réduction. `null` si elle peut servir. La même règle en
 * démonstration et en base.
 */
export function raisonPreuveInutilisable(
  preuve: { statut: string; reference?: string | null } | null,
  reservationLiee: { statut: StatutReservation; creeLe: string } | null,
  maintenant = Date.now(),
): RaisonPreuveInutilisable | null {
  if (!preuve) return "inconnue";
  if (preuve.statut !== "validee") return preuve.statut === "refusee" ? "refusee" : "en_attente";
  if (!preuve.reference || !reservationLiee) return null;
  return reservationRetenue(reservationLiee, maintenant) ? "deja-utilisee" : null;
}

export interface Depot {
  listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]>;
  trouverVeloParSlug(slug: string): Promise<Velo | null>;
  trouverVeloParId(id: string): Promise<Velo | null>;
  listerPointsDeRetrait(): Promise<PointDeRetrait[]>;

  /**
   * Créneaux déjà pris pour un vélo.
   *
   * Les heures s'y trouvent depuis que deux clients peuvent louer le même
   * vélo le même jour : le calendrier s'en sert pour n'interdire une
   * journée que si elle est réellement pleine, et le sélecteur d'heure
   * pour n'offrir que les départs encore libres.
   */
  periodesIndisponibles(veloId: string): Promise<CreneauOccupe[]>;

  /**
   * Le vélo est-il libre sur ce créneau précis ?
   *
   * Deux créneaux du même jour ne se gênent que s'ils se chevauchent
   * vraiment : 8 h-11 h et 14 h-16 h cohabitent sans difficulté sur la
   * même machine.
   */
  estDisponible(
    veloId: string,
    debut: DateISO,
    fin: DateISO,
    heureDebut: number,
    heureFin: number,
  ): Promise<boolean>;

  /**
   * Les vélos en état et libres sur tout ce créneau, dans l'ordre où ils
   * seraient attribués (`ordreAttribution`). Leur nombre est celui des
   * places restantes d'une sortie Octobre rose, pour son jour seul : chaque
   * sortie a son créneau (`creneauOctobreRose`). Indicatif : c'est la
   * transaction qui écrit qui attribue, et revérifie.
   */
  velosLibres(date: DateISO, heureDebut: number, heureFin: number): Promise<Velo[]>;

  creerReservation(demande: DemandeReservation): Promise<ResultatReservation>;
  trouverReservationParToken(token: string): Promise<Reservation | null>;
  trouverReservationParReference(reference: string): Promise<Reservation | null>;
  /**
   * La réservation dont le paiement porte cette référence : identifiant
   * SasPay, ou référence d'une saisie au comptoir. `null` si aucune.
   */
  trouverReservationParPaiement(referencePaiement: string): Promise<Reservation | null>;
  /**
   * Annule une réservation en attente de paiement ou confirmée.
   *
   * Renvoie la réservation annulée, ou `null` si cet appel n'a rien annulé
   * (introuvable, déjà annulée, partie ou terminée, ou annulée au même
   * instant par un autre appel) : l'appelant ne prévient alors personne et
   * ne rend rien.
   *
   * `rembourseAuComptoir` : vente en espèces annulée depuis l'administration
   * (erreur de saisie, client qui renonce sur place). Elle ne s'annule que
   * tant que le vélo n'est pas parti (statut CONFIRMEE), l'argent est rendu
   * sur-le-champ et en entier (paiement REMBOURSE, daté, montant noté), et
   * le partenaire du code de parrainage perd l'utilisation : personne n'a
   * été apporté.
   */
  annulerReservation(reference: string, options?: { rembourseAuComptoir?: boolean }): Promise<Reservation | null>;

  /**
   * Note le remboursement d'une vente en espèces que le client a annulée
   * lui-même : le paiement passe à REMBOURSE, daté du jour où l'argent sort
   * de la caisse, avec le montant rendu. `null` si rien n'était à rendre
   * (vente non annulée, déjà rendue, ou pas en espèces).
   */
  noterRemboursementEspeces(reference: string, montantXof: number): Promise<Reservation | null>;

  /**
   * Efface définitivement une réservation jamais payée.
   *
   * Réservé aux paniers abandonnés. L'implémentation refuse d'effacer
   * tout ce qui porte un paiement réussi : un règlement encaissé est une
   * pièce comptable, il s'annule mais ne s'efface pas.
   */
  supprimerReservation(reference: string): Promise<boolean>;

  /**
   * Les réservations payées qui partent ce jour-là et n'ont pas encore
   * reçu leur rappel de la veille.
   */
  listerRappelsAEnvoyer(date: DateISO): Promise<Reservation[]>;

  /**
   * Retient l'envoi du rappel avant de l'envoyer : vrai si cet appel l'a
   * obtenu, faux si un autre l'avait déjà. C'est ce qui empêche un
   * rappel de partir deux fois, même si la tâche tourne deux fois.
   */
  retenirRappel(reservationId: string): Promise<boolean>;

  /** Libère le rappel retenu, quand son envoi a échoué. */
  libererRappel(reservationId: string): Promise<void>;

  listerReservations(options?: {
    statut?: StatutReservation;
    depuis?: DateISO;
    jusqua?: DateISO;
  }): Promise<Reservation[]>;
  listerClients(): Promise<Client[]>;

  /**
   * Marque le depart effectif d'une reservation : le velo est remis au
   * client. Fait passer la reservation en EN_COURS.
   *
   * C'est le coordinateur qui declenche cela depuis la fiche du jour, au
   * moment ou il tend le velo. On ne le deduit pas des dates : une
   * reservation dont la date de depart est passee mais dont le client
   * n'est jamais venu ne doit pas compter comme sortie.
   */
  /**
   * Confirme une reservation dont le paiement est verifie.
   *
   * Appelee par le webhook de l'agregateur, jamais par le navigateur :
   * c'est la seule porte par laquelle une reservation passe de
   * EN_ATTENTE_PAIEMENT a CONFIRMEE. Idempotente, un agregateur peut
   * rejouer sa notification.
   */
  confirmerPaiement(
    reference: string,
    referenceTransaction?: string,
  ): Promise<{ reservation: Reservation; dejaConfirmee: boolean } | null>;

  marquerDepart(reference: string): Promise<Reservation | null>;

  /** Marque le retour effectif : la reservation passe en TERMINEE. */
  marquerRetour(reference: string): Promise<Reservation | null>;

  /**
   * Ajoute un vélo au parc.
   *
   * Seuls les champs qu'un exploitant connaît en recevant la machine sont
   * demandés. Le reste, note moyenne, historique, se construit tout
   * seul. Le `slug` se déduit du nom : il sert d'adresse publique, et le
   * laisser saisir à la main ouvrirait la porte aux doublons.
   */
  creerVelo(champs: NouveauVelo): Promise<Velo>;

  /**
   * Réglages sensibles de l'administration (secret de double
   * authentification, chiffré). `null` quand la clé n'existe pas.
   */
  lireParametreAdmin(cle: string): Promise<string | null>;
  ecrireParametreAdmin(cle: string, valeur: string): Promise<void>;
  effacerParametreAdmin(cle: string): Promise<void>;
  /**
   * Écrit `valeur` (un entier) sous `cle` seulement si elle dépasse celle
   * déjà enregistrée, en une seule opération atomique. Vrai si l'écriture
   * a eu lieu. Sert à refuser qu'un code de double authentification
   * serve deux fois, même pour deux requêtes simultanées.
   */
  avancerParametreAdmin(cle: string, valeur: number): Promise<boolean>;

  /**
   * Compte un essai sous `cle` et renvoie le total sur la fenêtre en
   * cours (`fenetreSecondes` depuis le premier essai). Atomique et commun
   * à tous les serveurs : c'est ce qui borne vraiment les essais de mot de
   * passe et de code, et les envois du formulaire de contact.
   */
  compterEssai(cle: string, fenetreSecondes: number): Promise<number>;
  effacerCompteur(cle: string): Promise<void>;

  /**
   * Note l'identifiant d'un paiement reçu sur une réservation qui ne peut
   * pas le prendre (annulée, ou payée trop tard). L'unicité de
   * l'identifiant empêche alors qu'il confirme une autre réservation.
   */
  marquerTransactionRecue(reference: string, referenceTransaction: string): Promise<void>;

  /**
   * Met a jour les champs d'un velo modifiables depuis l'admin.
   *
   * Deux champs seulement, et ce sont les deux qui changent en cours
   * d'exploitation : le statut quand la machine part a l'atelier, et la
   * gamme quand on revoit sa place dans la grille tarifaire.
   *
   * La gamme commande le prix (cf. src/data/offres.ts) : la changer ici
   * change ce que paieront les prochains clients, et rien d'autre. Les
   * reservations deja prises gardent le montant qu'elles portent.
   */
  majVelo(
    id: string,
    champs: { statut?: StatutVelo; gamme?: GammeVelo },
  ): Promise<Velo | null>;

  /* ------------------------------------------------ Parrainage partenaires */

  /**
   * Ce code est-il utilisable, et de combien réduit-il ce montant ?
   *
   * Sert au tunnel pour afficher la remise avant paiement. La réponse
   * n'engage à rien : elle est recalculée à l'écriture, car le quota peut
   * s'épuiser entre-temps.
   */
  verifierCodeParrainage(code: string, montantXof: number): Promise<VerificationParrainage>;

  listerPartenaires(options?: { inclureInactifs?: boolean }): Promise<Partenaire[]>;
  creerPartenaire(champs: {
    nom: string;
    contact?: string;
    notes?: string;
  }): Promise<Partenaire>;
  /** Active ou désactive un partenaire. Ses codes cessent alors de valoir. */
  majPartenaire(id: string, champs: { actif?: boolean }): Promise<Partenaire | null>;

  /**
   * Supprime un partenaire et ses codes.
   *
   * Refusé dès qu'une commission lui est comptée ou qu'un client attend
   * encore de payer avec l'un de ses codes : la suppression effacerait en
   * cascade ces utilisations, et avec elles ce qu'on lui doit. Un
   * partenariat qui s'arrête se désactive. Les utilisations annulées, qui
   * n'engagent plus rien, ne bloquent pas.
   */
  /* ------------------------------------ Ouverture des réservations */

  /**
   * Les créneaux et les jours que l'exploitant a ouverts ou fermés.
   *
   * Ne lève jamais : si les tables n'existent pas encore, la réservation
   * reste ouverte selon les valeurs par défaut, plutôt que de tomber.
   */
  lireOuverture(): Promise<ReglagesOuverture>;
  reglerCreneau(code: string, actif: boolean): Promise<void>;
  /** Ferme un jour. Refermer un jour déjà fermé met seulement le motif à jour. */
  fermerJour(champs: { date: DateISO; formule: FormuleFermee; motif?: string }): Promise<JourFerme>;
  rouvrirJour(id: string): Promise<boolean>;

  supprimerPartenaire(id: string): Promise<{
    supprime: boolean;
    raison?: "commissions" | "en-attente";
    codes?: number;
  }>;

  listerCodesParrainage(): Promise<CodeParrainage[]>;
  /**
   * Crée un code de parrainage.
   *
   * Ni taux de réduction ni commission à saisir : ce sont des constantes
   * de politique commerciale (cf. src/lib/parrainage.ts), les mêmes pour
   * tous les partenaires.
   */
  creerCodeParrainage(champs: {
    code: string;
    partenaireId: string;
    debuteLe?: string;
    finitLe?: string;
    utilisationsMax?: number;
  }): Promise<CodeParrainage>;
  majCodeParrainage(code: string, champs: { actif?: boolean }): Promise<CodeParrainage | null>;
  /**
   * Supprime un code.
   *
   * Refusé dès qu'il a servi : effacer un code utilisé effacerait aussi
   * les utilisations qui y sont rattachées, et donc la trace de ce que le
   * partenaire a apporté comme des commissions qui lui sont dues. Un code
   * qu'on ne veut plus voir servir se désactive.
   */
  supprimerCodeParrainage(code: string): Promise<{ supprime: boolean; raison?: "deja-utilise" }>;

  /** Ce que chaque partenaire a apporté et ce qu'on lui doit. */
  statistiquesPartenaires(): Promise<StatistiquesPartenaire[]>;

  /* ------------------------------------------------------- Avis clients */

  /**
   * Enregistre l'avis d'un client sur sa sortie.
   *
   * Il naît non publié : quelqu'un le relit avant qu'il paraisse. La
   * contrainte d'unicité sur la réservation garantit qu'un client ne
   * note sa sortie qu'une fois, un second envoi corrige le premier
   * plutôt que d'en empiler un deuxième.
   *
   * Renvoie `null` si la réservation n'existe pas ou n'est pas terminée :
   * on ne note pas une sortie qu'on n'a pas faite.
   */
  enregistrerAvis(entree: {
    reference: string;
    note: number;
    titre?: string;
    commentaire?: string;
  }): Promise<AvisClient | null>;

  /** L'avis déjà laissé sur cette réservation, s'il existe. */
  trouverAvisParReference(reference: string): Promise<AvisClient | null>;

  /**
   * Les avis, filtrés.
   *
   * Sans filtre, tout remonte, c'est ce dont l'écran de modération a
   * besoin. Le site public, lui, ne demande que les avis publiés.
   */
  listerAvis(filtre?: { publiesSeulement?: boolean; veloId?: string }): Promise<AvisClient[]>;

  /** Publie ou retire un avis du site. */
  publierAvis(id: string, publie: boolean): Promise<AvisClient | null>;

  enregistrerMessageContact(
    message: Omit<MessageContact, "id" | "creeLe" | "traiteLe">,
  ): Promise<MessageContact>;
  listerMessagesContact(): Promise<MessageContact[]>;

  /* ------------------------------------------ Offres de groupe : administration */

  /**
   * Les vélos déclarés indisponibles un jour précis, du plus proche au plus
   * lointain. Sans borne, tous ; `depuis` et `jusqua` incluses.
   */
  listerIndisponibilites(options?: { depuis?: DateISO; jusqua?: DateISO; veloId?: string }): Promise<IndisponibiliteVelo[]>;

  /**
   * Déclare un vélo indisponible ce jour-là, et l'écrit au journal. Un vélo
   * déjà déclaré ce jour-là n'est pas compté deux fois : son motif est mis à
   * jour. `null` si le vélo n'existe pas. Les réservations déjà payées sur
   * ce vélo ce jour-là ne sont pas annulées : elles remontent dans
   * `reservationsTouchees`, pour que Bike Land appelle les clients.
   */
  ajouterIndisponibilite(champs: {
    veloId: string;
    date: DateISO;
    motif?: string;
    par: string;
  }): Promise<IndisponibiliteVelo | null>;

  /** Rend le vélo au parc ce jour-là, et l'écrit au journal. Faux s'il n'était plus déclaré. */
  retirerIndisponibilite(id: string, par: string): Promise<boolean>;

  /** Écrit une ligne au journal des événements. Une ligne ne se modifie ni ne s'efface. */
  journaliser(evenement: NouvelEvenement): Promise<EvenementJournal>;

  /** Le journal, les événements les plus récents d'abord. */
  listerJournal(filtre?: FiltreJournal): Promise<EvenementJournal[]>;

  /**
   * Note de l'argent à rendre au client d'une réservation, et l'écrit au
   * journal. La même demande envoyée deux fois n'en crée qu'une
   * (`memeRemboursement`), qu'elle soit encore à faire ou déjà faite : la
   * première est renvoyée. `cleIdempotence` (facultative, unique en base,
   * par exemple l'identifiant de la transaction reçue) la désigne à coup
   * sûr, même pour deux demandes simultanées. `null` si la réservation
   * n'existe pas.
   */
  creerRemboursement(champs: {
    reference: string;
    montantXof: number;
    motif: string;
    par?: string;
    cleIdempotence?: string;
  }): Promise<Remboursement | null>;

  /** Les remboursements, les plus anciens d'abord quand ils sont à faire, les plus récents d'abord une fois faits. */
  listerRemboursements(filtre?: { statut?: StatutRemboursement; limite?: number }): Promise<Remboursement[]>;

  /**
   * Note qu'un remboursement est fait, par qui et quand, et l'écrit au
   * journal. Sous condition : `null` s'il n'existe pas ou s'il était déjà
   * noté, un second clic ne compte rien deux fois.
   */
  marquerRemboursementFait(id: string, par: string): Promise<Remboursement | null>;

  /**
   * Note le retard au retour des vélos d'une offre de groupe et sa pénalité,
   * calculée avec les réglages des offres du moment (`penaliteRetardXof`),
   * puis l'écrit au journal. Une nouvelle saisie corrige la précédente ; zéro
   * efface la pénalité. Rien n'est écrit si les réglages ne se lisent plus.
   */
  enregistrerRetard(reference: string, minutes: number, par: string): Promise<ResultatRetard>;

  /**
   * Les réservations payées, à venir ou en cours (dernier jour à partir de
   * `depuis`), dont un vélo attribué est retiré du parc, à l'atelier, ou
   * déclaré indisponible un jour de la sortie (`reservationsToucheesParmi`).
   */
  reservationsTouchees(depuis: DateISO): Promise<ReservationTouchee[]>;

  /* ------------------------- Offres de groupe : preuves de réduction (lot 5b) */

  /**
   * Enregistre une capture reçue pour la réduction du road trip, « en_attente ».
   * Le fichier, déjà réencodé, est soit rangé hors de la base (`fichierCle`,
   * « blob:… »), soit gardé dans la base elle-même (`octets`, table
   * FichierPreuve), dans la même transaction : sa clé vaut alors « base:<id> ».
   */
  creerPreuve(champs: NouvellePreuve): Promise<PreuveReduction>;

  trouverPreuve(id: string): Promise<PreuveReduction | null>;

  /**
   * Les preuves : celles qui attendent, la plus ancienne d'abord (c'est la
   * plus pressée) ; les décidées, la plus récente d'abord. 200 au plus.
   */
  listerPreuves(filtre?: { statut?: StatutPreuveReduction; limite?: number }): Promise<PreuveReduction[]>;

  /** Le fichier d'une preuve gardé dans la base (« base:… »), ou `null`. */
  lireFichierPreuve(id: string): Promise<Uint8Array | null>;

  /**
   * Note la décision sur une preuve encore « en_attente », et l'écrit au
   * journal. Sous condition : `null` si elle n'existe pas ou si elle était
   * déjà décidée ; deux clics, ou l'agent IA et l'administration au même
   * instant, ne décident pas deux fois.
   */
  deciderPreuve(id: string, decision: DecisionPreuve): Promise<PreuveReduction | null>;

  /**
   * Efface le fichier d'une preuve : les octets gardés dans la base et la
   * clé, avec la date de l'effacement. Un fichier rangé hors de la base est
   * effacé avant, par l'appelant. `null` si la preuve n'existe pas.
   */
  effacerFichierPreuve(id: string): Promise<PreuveReduction | null>;

  /**
   * Les preuves dont le fichier est encore là alors qu'il ne devrait plus :
   * décidées, ou reçues avant `avant` (un instant ISO, 30 jours plus tôt).
   */
  listerFichiersPreuvesAEffacer(avant: string): Promise<PreuveReduction[]>;

  /**
   * Le nombre de captures qui attendent d'être vérifiées, en une seule
   * requête de comptage : le tableau de bord et le menu le montrent sur
   * chaque page de l'administration (décision 24).
   */
  compterPreuvesEnAttente(): Promise<number>;

  /**
   * Efface l'email et le téléphone des preuves décidées avant `avant` (un
   * instant ISO, 30 jours plus tôt) et de celles qui ont servi à une
   * réservation. La preuve reste, sans eux : une capture validée qui n'a pas
   * servi garde son identifiant et reste utilisable une fois. La règle « une
   * réduction par client » (décision 25) s'appuie sur le contact des
   * réservations, pas sur celui des captures. Rend le nombre de preuves
   * dont le contact a été effacé.
   */
  effacerContactsPreuves(avant: string): Promise<number>;

  /**
   * Efface les compteurs d'essais expirés (clés faites d'une adresse IP ou
   * de chiffres de téléphone). Un compteur expiré repart de zéro de toute
   * façon : rien ne change pour les limites, la trace seulement disparaît.
   */
  purgerCompteursExpires(): Promise<number>;

  /* ------------------------- Offres de groupe : une réduction par client (décision 25) */

  /**
   * Les réservations du Road trip en groupe, jamais les annulées, réduites à
   * leur contact, leur état et leur réduction (`ReservationRoadTripClient`) :
   * avec la réduction des abonnés (`avecReduction`), ou au prix normal ;
   * `depuis` (instant ISO) : créées depuis cet instant. Une demande en attente
   * de paiement y figure même expirée : `reservationRetenue` en décide.
   */
  listerReservationsRoadTripGroupe(filtre: { avecReduction: boolean; depuis?: string }): Promise<ReservationRoadTripClient[]>;

  /* ------------------------------------------- Offres de groupe (lot 3) */

  /**
   * Le parc d'un jour et ses créneaux déjà pris, en minutes : la matière de
   * tous les calculs de disponibilité des offres de groupe (vélos libres sur
   * un créneau, créneau libre le plus proche), faits ensuite sans base par
   * src/lib/disponibilite. Toutes les offres partagent les mêmes vélos.
   */
  parcDuJour(date: DateISO): Promise<ParcDuJour>;

  /**
   * Écrit une réservation d'offre de groupe, déjà calculée par le serveur.
   * Dans une seule transaction sérialisable (avec reprise) : revérifie les
   * vélos libres sur le créneau, attribue les vélos (toutes gammes, ou le
   * nombre exact de chaque gamme pour Gbashi Bike), écrit la réservation, ses
   * vélos et son paiement, et consomme la preuve de réduction citée.
   * Lève CapaciteInsuffisanteError si les vélos viennent d'être pris, et
   * PreuveReductionInutilisableError si la preuve ne peut pas servir, entre
   * autres quand le client (contact de la réservation ou de la capture) a
   * déjà eu la réduction sur une autre réservation (« deja-eue », décision 25).
   */
  creerReservationGroupe(demande: DemandeReservationGroupe): Promise<ResultatReservation>;
}

/**
 * Le parc d'un jour, pour les offres de groupe : les vélos en état ce
 * jour-là, et les créneaux déjà pris, en minutes depuis minuit.
 */
export interface ParcDuJour {
  date: DateISO;
  /**
   * Les vélos qui peuvent rouler ce jour-là : ni retirés, ni en maintenance,
   * ni déclarés indisponibles à cette date (IndisponibiliteVelo).
   */
  velos: { id: string; nom: string; gamme: GammeVelo }[];
  /**
   * Les créneaux pris ce jour-là, toutes offres confondues : réservations
   * payées, et demandes en attente de paiement depuis moins de 30 minutes.
   * Une réservation à l'heure pleine compte de heureDebut × 60 à heureFin × 60.
   */
  occupations: { veloId: string; debutMinute: number; finMinute: number }[];
}

/**
 * Une réservation d'offre de groupe prête à écrire. Le serveur a déjà fait le
 * calcul (src/lib/offres) avec les réglages et le parc du moment ; le dépôt
 * ne recalcule aucun prix, il revérifie seulement les vélos.
 */
export interface DemandeReservationGroupe {
  offre: CodeOffreGroupe;
  /** Le jour de la sortie, heure du Bénin. */
  date: DateISO;
  /** Départ et retour du groupe, en minutes depuis minuit (au quart d'heure). */
  debutMinute: number;
  finMinute: number;
  /**
   * Les vélos à bloquer : un nombre, toutes gammes confondues (Bike for All,
   * road trip, décision 10), ou le nombre exact de chaque gamme (Gbashi Bike).
   */
  velos: number | Partial<Record<GammeVelo, number>>;
  nombrePersonnes: number;
  /**
   * Ce que paie le groupe, frais de paiement électronique compris. La
   * commission SasPay s'y ajoute au moment de payer, comme ailleurs.
   */
  totalXof: number;
  /** L'instantané du calcul, rangé tel quel dans offreDetails. */
  details: DetailsOffreGroupe;
  client: { prenom: string; nom: string; email: string; telephone: string };
  moyenPaiement: MoyenPaiement;
  cgvAcceptees: boolean;
  message?: string;
  /**
   * Vente au comptoir réglée en espèces : la réservation naît confirmée et
   * payée, comme DemandeReservation.encaissement.
   */
  encaissement?: { par: string; reference?: string };
  /** Road trip : la preuve de réduction validée, consommée dans la même transaction (une par groupe). */
  preuveId?: string;
}

/**
 * Les vélos d'un créneau viennent d'être pris par une autre demande : la
 * transaction a revu le parc et il n'en reste plus assez.
 */
export class CapaciteInsuffisanteError extends Error {
  /** Les vélos encore libres sur le créneau, toutes gammes confondues. */
  readonly velosLibres: number;
  /** Les mêmes, gamme par gamme. */
  readonly parGamme: Record<GammeVelo, number>;
  constructor(
    velosLibres: number,
    parGamme: Record<GammeVelo, number>,
    message = "Ces vélos viennent d'être réservés sur ce créneau.",
  ) {
    super(message);
    this.name = "CapaciteInsuffisanteError";
    this.velosLibres = velosLibres;
    this.parGamme = parGamme;
  }
}

/**
 * La preuve de réduction citée ne peut pas servir à cette réservation (voir
 * `raisonPreuveInutilisable`) : rien n'a été écrit. `raison` reprend les
 * valeurs que la route du devis renvoie au client (`ReponseDevis.preuve`),
 * plus « offre » quand la demande n'est pas un road trip.
 */
export class PreuveReductionInutilisableError extends Error {
  readonly raison: RaisonPreuveInutilisable;
  constructor(raison: RaisonPreuveInutilisable) {
    super(
      {
        inconnue: "Cette preuve de réduction est introuvable.",
        en_attente: "Cette preuve de réduction n'est pas encore vérifiée.",
        refusee: "Cette preuve de réduction n'a pas été acceptée.",
        "deja-utilisee": "Cette preuve de réduction a déjà servi pour une autre réservation.",
        "deja-eue": "Ce client a déjà eu la réduction des abonnés : elle vaut une seule fois par client.",
        offre: "La réduction sur preuve ne vaut que pour le road trip en groupe.",
      }[raison],
    );
    this.name = "PreuveReductionInutilisableError";
    this.raison = raison;
  }
}

/** Erreur métier : le vélo n'est plus libre sur la période demandée. */
export class ConflitDisponibiliteError extends Error {
  constructor(message = "Ce vélo vient d'être réservé sur ces dates.") {
    super(message);
    this.name = "ConflitDisponibiliteError";
  }
}

/**
 * Un identifiant de transaction déjà rattaché à une autre réservation.
 *
 * C'est la protection contre le rejeu : sans elle, un client ayant payé
 * une fois pourrait présenter le même identifiant pour faire confirmer
 * autant de réservations qu'il le souhaite. La contrainte d'unicité sur
 * la référence du fournisseur la rend impossible à contourner, y compris
 * sur deux appels simultanés.
 */
export class TransactionDejaUtiliseeError extends Error {
  constructor(message = "Ce paiement a déjà servi pour une autre réservation.") {
    super(message);
    this.name = "TransactionDejaUtiliseeError";
  }
}

/* ------------------------- Offres de groupe : preuves de réduction (lot 5b) */

/** Une capture reçue pour la réduction du road trip, déjà contrôlée et réencodée. */
export interface NouvellePreuve {
  typeMime: string;
  tailleOctets: number;
  /** Pour écrire au client quand la preuve est vérifiée à la main. */
  email: string;
  telephone: string;
  /** Le fichier rangé hors de la base, dans un stockage privé (« blob:… »). */
  fichierCle?: string;
  /** Ou le fichier lui-même, gardé dans la base (table FichierPreuve). */
  octets?: Uint8Array;
}

/** La décision prise sur une preuve de réduction. */
export interface DecisionPreuve {
  statut: "validee" | "refusee";
  /** « admin (Koffi) », « agent IA » ou « site » : signe la ligne du journal. */
  par: string;
  motif?: string;
  /** Ce que l'agent IA a lu (réseau, compte de Bike Land), jamais le compte du client. */
  verdict?: Record<string, unknown>;
}

/** La clé d'un fichier de preuve gardé dans la base : « base:<id de la preuve> ». */
export const PREFIXE_FICHIER_EN_BASE = "base:";

/** Combien de preuves une liste rend au plus. */
export const LIMITE_PREUVES_MAX = 200;

/** Le nombre de preuves à rendre, borné. */
export function limitePreuves(limite?: number): number {
  const demandee = Math.floor(limite ?? LIMITE_PREUVES_MAX);
  return Math.max(1, Math.min(LIMITE_PREUVES_MAX, Number.isFinite(demandee) ? demandee : LIMITE_PREUVES_MAX));
}

/**
 * Le motif d'une décision, en une ligne courte et propre pour
 * l'administration : sans retour à la ligne, 300 signes au plus.
 */
export function motifDecisionPreuve(motif?: string): string | undefined {
  const ligne = motif?.replace(/\s+/g, " ").trim();
  if (!ligne) return undefined;
  return ligne.length > 300 ? `${ligne.slice(0, 299)}…` : ligne;
}
