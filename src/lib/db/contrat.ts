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

import type { DateISO } from "../dates";
import type {
  Client,
  CodeOffre,
  MessageContact,
  MoyenPaiement,
  PointDeRetrait,
  Reservation,
  StatutReservation,
  StatutVelo,
  Velo,
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

export interface DemandeReservation {
  veloId: string;
  offre: CodeOffre;
  nombrePersonnes?: number;
  dureeHeures?: number;
  dateDebut: DateISO;
  dateFin: DateISO;
  options: { code: string; quantite: number }[];
  client: { prenom: string; nom: string; email: string; telephone?: string };
  moyenPaiement: MoyenPaiement;
  message?: string;
  /** Accepte les conditions générales : obligatoire côté serveur aussi. */
  cgvAcceptees: boolean;
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

  /** Périodes déjà réservées pour un vélo, utilisées par le calendrier. */
  periodesIndisponibles(veloId: string): Promise<{ debut: DateISO; fin: DateISO }[]>;
  estDisponible(veloId: string, debut: DateISO, fin: DateISO): Promise<boolean>;

  creerReservation(demande: DemandeReservation): Promise<ResultatReservation>;
  trouverReservationParToken(token: string): Promise<Reservation | null>;
  trouverReservationParReference(reference: string): Promise<Reservation | null>;
  annulerReservation(reference: string): Promise<Reservation | null>;

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
   * EN_ATTENTE_PAIEMENT a CONFIRMEE. Idempotente — un agregateur peut
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
   * Met a jour les champs d'un velo modifiables depuis l'admin.
   *
   * Volontairement restreint au statut : c'est la seule chose qui change
   * en cours d'exploitation. Il n'y a plus de prix par velo — il depend
   * de la formule (cf. src/data/offres.ts) — et le reste se change dans
   * le catalogue.
   */
  majVelo(id: string, champs: { statut?: StatutVelo }): Promise<Velo | null>;

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
