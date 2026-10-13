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
import type { GammeVelo } from "@/data/offres";
import type { CodeParrainage, VerificationParrainage } from "../parrainage";
import type {
  AvisClient,
  CategorieVelo,
  Client,
  CodeOffre,
  MessageContact,
  MoyenPaiement,
  Partenaire,
  PointDeRetrait,
  Reservation,
  StatistiquesPartenaire,
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
  veloId: string;
  offre: CodeOffre;
  nombrePersonnes?: number;
  dureeHeures?: number;
  dateDebut: DateISO;
  dateFin: DateISO;
  /** Heure de départ. Imposée par le créneau en road trip, choisie sinon. */
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

  creerReservation(demande: DemandeReservation): Promise<ResultatReservation>;
  trouverReservationParToken(token: string): Promise<Reservation | null>;
  trouverReservationParReference(reference: string): Promise<Reservation | null>;
  annulerReservation(reference: string): Promise<Reservation | null>;

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
