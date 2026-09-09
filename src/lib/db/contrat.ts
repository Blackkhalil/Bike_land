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
  MessageContact,
  MoyenPaiement,
  PointDeRetrait,
  Reservation,
  StatutReservation,
  Velo,
} from "../types";

export interface FiltreCatalogue {
  categories?: string[];
  tailles?: string[];
  pointDeRetraitId?: string;
  prixMaxXof?: number;
  dateDebut?: DateISO;
  dateFin?: DateISO;
}

export interface DemandeReservation {
  veloId: string;
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
