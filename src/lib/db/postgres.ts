/**
 * Implémentation PostgreSQL du dépôt, via Prisma (§6.1 du cahier des charges).
 *
 * Elle s'active dès que DATABASE_URL est défini. Le point délicat est la
 * création de réservation : deux clients peuvent cliquer « payer » à la
 * même seconde sur le même vélo. La vérification de disponibilité et
 * l'insertion sont donc faites dans une transaction en niveau
 * `Serializable`, seul niveau qui empêche le « write skew » — deux
 * transactions qui lisent chacune « aucun conflit » avant d'écrire.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import type {
  BikeCategory,
  Bike as BikePrisma,
  Booking as BookingPrisma,
  BookingItem,
  BookingOption,
  Customer,
  Payment,
} from "@prisma/client";

import { nombreDeJours, versISO, type DateISO } from "../dates";
import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { calculerDevis } from "../tarification";
import { genererReference, genererToken, hacherToken, lireToken } from "../tokens";
import type { Client, MessageContact, PointDeRetrait, Reservation, Velo } from "../types";
import {
  ConflitDisponibiliteError,
  TransactionDejaUtiliseeError,
  type Depot,
  type DemandeReservation,
  type FiltreCatalogue,
  type ResultatReservation,
} from "./contrat";

// Un seul client Prisma par processus, y compris à travers les
// rechargements à chaud du serveur de développement.
const clePrisma = Symbol.for("bikeland.prisma");
type PorteurGlobal = typeof globalThis & { [clePrisma]?: PrismaClient };

function client(): PrismaClient {
  const porteur = globalThis as PorteurGlobal;
  porteur[clePrisma] ??= new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return porteur[clePrisma];
}

/** Code d'erreur Prisma, quelle que soit la classe d'erreur levée. */
function codePrisma(erreur: unknown): string | null {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError) return erreur.code;
  if (erreur instanceof Prisma.PrismaClientInitializationError) return erreur.errorCode ?? null;
  return null;
}

/**
 * Rejoue une opération quand la connexion à la base a lâché.
 *
 * Le pooler de Supabase ferme les connexions inactives. Quand cela tombe
 * pendant une transaction, Prisma lève `P2028` — « transaction not found,
 * obtained before disconnecting » — et l'écriture échoue alors qu'aucune
 * règle métier n'a été enfreinte. Sans reprise, un client qui réserve
 * après une période calme reçoit une erreur et perd sa réservation.
 *
 * Seules les pannes de liaison sont rejouées. Un conflit de
 * disponibilité, lui, remonte immédiatement : il ne se résoudra pas en
 * réessayant, et masquer un refus derrière une nouvelle tentative
 * risquerait de réserver deux fois le même vélo.
 *
 * Les tentatives sont espacées un peu plus à chaque fois, le temps que la
 * connexion se rétablisse.
 */
async function avecRepriseConnexion<T>(action: () => Promise<T>, essais = 3): Promise<T> {
  const transitoires = new Set(["P1001", "P1002", "P1017", "P2024", "P2028"]);

  for (let tentative = 1; ; tentative += 1) {
    try {
      return await action();
    } catch (erreur) {
      const code = codePrisma(erreur);
      if (!code || !transitoires.has(code) || tentative >= essais) throw erreur;

      console.warn(
        `[base] connexion perdue (${code}), nouvelle tentative ${tentative + 1}/${essais}.`,
      );
      await new Promise((resoudre) => setTimeout(resoudre, 200 * tentative));
    }
  }
}

/** Teintes du visuel généré, dérivées de la catégorie (aucune photo requise). */
const teintesParCategorie: Record<BikeCategory, [string, string]> = {
  RANDONNEUR: ["#f25c05", "#e0dcd3"],
  GRAVEL: ["#1f6f5c", "#e0dcd3"],
  VAE: ["#f4762f", "#f2efe9"],
  VTC: ["#6b6b6b", "#f2efe9"],
  TANDEM: ["#f25c05", "#e0dcd3"],
};

type BikeAvecAvis = BikePrisma & {
  reviews?: { rating: number }[];
};

function versVelo(bike: BikeAvecAvis): Velo {
  const avis = bike.reviews ?? [];
  const note = avis.length ? avis.reduce((total, a) => total + a.rating, 0) / avis.length : 0;

  return {
    id: bike.id,
    slug: bike.slug,
    nom: bike.name,
    categorie: bike.category,
    taille: bike.size,
    statut: bike.status,
    accroche: bike.shortPitch,
    description: bike.description,
    // Sans cette ligne, aucune photo ne remonte de la base : les vélos
    // s'affichaient avec leur illustration de repli alors que le fichier
    // existait bel et bien dans `public/`.
    photo: bike.heroImageUrl ?? undefined,
    poidsKg: bike.weightKg,
    vitesses: bike.gearCount,
    chargeMaxKg: bike.maxLoadKg,
    autonomieConseilleeKm: bike.suggestedRangeKm,
    autonomieAssistanceKm: bike.assistanceRangeKm ?? undefined,
    moteurWatts: bike.motorWatts ?? undefined,
    batterieWh: bike.batteryWh ?? undefined,
    equipementInclus: bike.includedEquipment,
    pointDeRetraitId: bike.pickupPointId ?? "",
    noteMoyenne: Number(note.toFixed(1)),
    nombreAvis: avis.length,
    teintes: teintesParCategorie[bike.category],
  };
}

type BookingComplet = BookingPrisma & {
  customer: Customer;
  items: (BookingItem & { bike: Pick<BikePrisma, "name" | "slug"> })[];
  options: BookingOption[];
  payments: Payment[];
  review?: { rating: number } | null;
};

function versReservation(booking: BookingComplet): Reservation {
  return {
    id: booking.id,
    reference: booking.reference,
    statut: booking.status,
    offre: booking.offer === "ROAD_TRIP" ? "road-trip" : "location-libre",
    nombrePersonnes: booking.peopleCount,
    dureeHeures: booking.durationHours ?? undefined,
    clientId: booking.customerId,
    client: versClient(booking.customer),
    pointDeRetraitId: booking.pickupPointId ?? "",
    dateDebut: versISO(booking.startDate),
    dateFin: versISO(booking.endDate),
    jours: booking.days,
    lignes: booking.items.map((item) => ({
      veloId: item.bikeId,
      veloNom: item.bike.name,
      veloSlug: item.bike.slug,
      prixUnitaireXof: item.unitPriceXof,
      totalLigneXof: item.lineTotalXof,
    })),
    options: booking.options.map((option) => ({
      code: option.code,
      libelle: option.label,
      prixXof: option.priceXof,
      quantite: option.quantity,
    })),
    sousTotalXof: booking.subtotalXof,
    optionsXof: booking.optionsXof,
    remiseXof: booking.discountXof,
    cautionXof: booking.depositXof,
    totalXof: booking.totalXof,
    paiements: booking.payments.map((paiement) => ({
      id: paiement.id,
      fournisseur: paiement.provider,
      moyen: paiement.method,
      statut: paiement.status,
      montantXof: paiement.amountXof,
      referenceFournisseur: paiement.providerReference ?? undefined,
      estCaution: paiement.isDeposit,
      rembourseLe: paiement.refundedAt?.toISOString(),
      creeLe: paiement.createdAt.toISOString(),
    })),
    message: booking.notes ?? undefined,
    creeLe: booking.createdAt.toISOString(),
    confirmeLe: booking.confirmedAt?.toISOString(),
    annuleLe: booking.cancelledAt?.toISOString(),
    note: booking.review?.rating,
  };
}

function versClient(customer: Customer): Client {
  return {
    id: customer.id,
    email: customer.email,
    prenom: customer.firstName,
    nom: customer.lastName,
    telephone: customer.phone ?? undefined,
    creeLe: customer.createdAt.toISOString(),
  };
}

const inclusionReservation = {
  customer: true,
  items: { include: { bike: { select: { name: true, slug: true } } } },
  options: true,
  payments: true,
  review: { select: { rating: true } },
} satisfies Prisma.BookingInclude;

/**
 * Une reservation bloque le velo si elle est dans un statut bloquant ET
 * qu'elle n'est pas un panier abandonne : une reservation jamais payee
 * cesse de reserver le velo passe le delai d'expiration.
 */
function bookingBloquant(): Prisma.BookingWhereInput {
  const limite = new Date(Date.now() - EXPIRATION_PANIER_MINUTES * 60_000);
  return {
    OR: [
      { status: { in: ["CONFIRMEE", "EN_COURS", "TERMINEE"] } },
      { status: "EN_ATTENTE_PAIEMENT", createdAt: { gte: limite } },
    ],
  };
}

/**
 * Change le statut d'une reservation par sa reference.
 *
 * Une reservation annulee n'est jamais reactivee par un clic sur la
 * fiche du jour : le coordinateur constate un depart ou un retour, il
 * n'annule pas une annulation.
 */
async function changerStatutReservation(
  reference: string,
  statut: "EN_COURS" | "TERMINEE",
): Promise<Reservation | null> {
  const existante = await client().booking.findUnique({
    where: { reference },
    select: { id: true, status: true },
  });
  if (!existante) return null;
  if (existante.status === "ANNULEE") {
    const inchangee = await client().booking.findUnique({
      where: { id: existante.id },
      include: inclusionReservation,
    });
    return inchangee ? versReservation(inchangee) : null;
  }

  const booking = await client().booking.update({
    where: { id: existante.id },
    data: { status: statut },
    include: inclusionReservation,
  });
  return versReservation(booking);
}

export const depotPostgres: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    const where: Prisma.BikeWhereInput = filtre?.inclureRetires ? {} : { status: { not: "RETIRE" } };
    if (filtre?.pointDeRetraitId) where.pickupPointId = filtre.pointDeRetraitId;

    if (filtre?.dateDebut && filtre?.dateFin) {
      // Un vélo est retenu s'il n'a aucune ligne de réservation active
      // qui chevauche la période demandée.
      where.bookingItems = {
        none: {
          booking: bookingBloquant(),
          startDate: { lte: new Date(`${filtre.dateFin}T00:00:00Z`) },
          endDate: { gte: new Date(`${filtre.dateDebut}T00:00:00Z`) },
        },
      };
    }

    const bikes = await client().bike.findMany({
      where,
      include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
      orderBy: { name: "asc" },
    });
    return bikes.map(versVelo);
  },

  async trouverVeloParSlug(slug: string) {
    const bike = await client().bike.findUnique({
      where: { slug },
      include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
    });
    return bike ? versVelo(bike) : null;
  },

  async trouverVeloParId(id: string) {
    const bike = await client().bike.findUnique({
      where: { id },
      include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
    });
    return bike ? versVelo(bike) : null;
  },

  async listerPointsDeRetrait(): Promise<PointDeRetrait[]> {
    const points = await client().pickupPoint.findMany({ where: { isActive: true }, orderBy: { city: "asc" } });
    return points.map((point) => ({
      id: point.id,
      nom: point.name,
      ville: point.city,
      adresse: point.address,
      horaires: point.openingHours ?? "",
      actif: point.isActive,
    }));
  },

  async periodesIndisponibles(veloId: string) {
    const lignes = await client().bookingItem.findMany({
      where: { bikeId: veloId, booking: bookingBloquant() },
      select: { startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    });
    return lignes.map((ligne) => ({ debut: versISO(ligne.startDate), fin: versISO(ligne.endDate) }));
  },

  async estDisponible(veloId: string, debut: DateISO, fin: DateISO) {
    const bike = await client().bike.findUnique({ where: { id: veloId }, select: { status: true } });
    if (!bike || bike.status === "RETIRE" || bike.status === "MAINTENANCE") return false;

    const conflit = await client().bookingItem.findFirst({
      where: {
        bikeId: veloId,
        booking: bookingBloquant(),
        startDate: { lte: new Date(`${fin}T00:00:00Z`) },
        endDate: { gte: new Date(`${debut}T00:00:00Z`) },
      },
      select: { id: true },
    });
    return conflit === null;
  },

  async creerReservation(demande: DemandeReservation): Promise<ResultatReservation> {
    const bike = await client().bike.findUnique({ where: { id: demande.veloId } });
    if (!bike) throw new Error("Vélo introuvable.");

    const devis = calculerDevis({
      offre: demande.offre,
      nombrePersonnes: demande.nombrePersonnes,
      dureeHeures: demande.dureeHeures,
      options: demande.options,
    });

    const reference = genererReference();
    const token = genererToken(reference);
    const debut = new Date(`${demande.dateDebut}T00:00:00Z`);
    const fin = new Date(`${demande.dateFin}T00:00:00Z`);
    const email = demande.client.email.trim().toLowerCase();

    const booking = await avecRepriseConnexion(() =>
      client().$transaction(
      async (tx) => {
        // Relecture du conflit *à l'intérieur* de la transaction : c'est
        // elle que le niveau Serializable protège d'une écriture concurrente.
        const conflit = await tx.bookingItem.findFirst({
          where: {
            bikeId: bike.id,
            booking: bookingBloquant(),
            startDate: { lte: fin },
            endDate: { gte: debut },
          },
          select: { id: true },
        });
        if (conflit) throw new ConflitDisponibiliteError();

        // Le client est créé au fil de l'eau, sans compte (§2.2).
        const customer = await tx.customer.upsert({
          where: { email },
          create: {
            email,
            firstName: demande.client.prenom.trim(),
            lastName: demande.client.nom.trim(),
            phone: demande.client.telephone?.trim(),
          },
          update: {
            firstName: demande.client.prenom.trim(),
            lastName: demande.client.nom.trim(),
            ...(demande.client.telephone ? { phone: demande.client.telephone.trim() } : {}),
          },
        });

        return tx.booking.create({
          data: {
            reference,
            // Voir demo.ts : la reservation nait en attente, seul le
            // paiement verifie la confirme.
            status: "EN_ATTENTE_PAIEMENT",
            offer: demande.offre === "road-trip" ? "ROAD_TRIP" : "LOCATION_LIBRE",
            peopleCount: devis.nombrePersonnes,
            durationHours: devis.dureeHeures,
            customerId: customer.id,
            pickupPointId: bike.pickupPointId,
            startDate: debut,
            endDate: fin,
            days: nombreDeJours(demande.dateDebut, demande.dateFin),
            subtotalXof: devis.sousTotalXof,
            optionsXof: devis.optionsXof,
            discountXof: 0,
            depositXof: devis.cautionXof,
            totalXof: devis.totalXof,
            accessTokenHash: hacherToken(token),
            notes: demande.message,
            items: {
              create: [
                {
                  bikeId: bike.id,
                  startDate: debut,
                  endDate: fin,
                  unitPriceXof: devis.sousTotalXof,
                  lineTotalXof: devis.sousTotalXof,
                },
              ],
            },
            options: {
              create: devis.optionsDetaillees.map((ligne) => ({
                code: ligne.option.code,
                label: ligne.option.libelle,
                priceXof: ligne.montantXof,
                quantity: ligne.quantite,
              })),
            },
            // Une seule ligne de paiement : celle réglée en ligne, encore
            // à l'état INITIE tant que KkiaPay n'a rien confirmé.
            //
            // La caution de la location libre n'en crée aucune, et c'est
            // volontaire : elle est remise en espèces au coordinateur au
            // départ, puis rendue au retour. L'enregistrer ici comme
            // « encaissée » ferait apparaître en comptabilité un argent
            // qui n'est jamais passé par la plateforme.
            payments: {
              create: [
                {
                  provider: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "KKIAPAY",
                  method: demande.moyenPaiement,
                  status: "INITIE",
                  amountXof: devis.totalXof,
                  isDeposit: false,
                },
              ],
            },
          },
          include: inclusionReservation,
        });
      },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    return { reservation: versReservation(booking), token };
  },

  async trouverReservationParToken(token: string) {
    const reference = lireToken(token);
    if (!reference) return null;

    const booking = await client().booking.findUnique({
      where: { reference },
      include: inclusionReservation,
    });
    if (!booking || booking.accessTokenHash !== hacherToken(token)) return null;
    return versReservation(booking);
  },

  async trouverReservationParReference(reference: string) {
    const booking = await client().booking.findUnique({
      where: { reference: reference.toUpperCase() },
      include: inclusionReservation,
    });
    return booking ? versReservation(booking) : null;
  },

  async annulerReservation(reference: string) {
    const booking = await client().booking.update({
      where: { reference: reference.toUpperCase() },
      data: { status: "ANNULEE", cancelledAt: new Date() },
      include: inclusionReservation,
    });
    return versReservation(booking);
  },

  async listerReservations(options) {
    const where: Prisma.BookingWhereInput = {};
    if (options?.statut) where.status = options.statut;
    if (options?.depuis) where.endDate = { gte: new Date(`${options.depuis}T00:00:00Z`) };
    if (options?.jusqua) where.startDate = { lte: new Date(`${options.jusqua}T00:00:00Z`) };

    const bookings = await client().booking.findMany({
      where,
      include: inclusionReservation,
      orderBy: { startDate: "desc" },
    });
    return bookings.map(versReservation);
  },

  /**
   * Fait passer une réservation payée en CONFIRMEE.
   *
   * Deux appels peuvent arriver en même temps — le navigateur du client
   * et le webhook de KkiaPay signalent le même paiement. La transition
   * est donc **conditionnelle** : `updateMany` filtre sur le statut de
   * départ, et seul l'appel qui modifie réellement une ligne considère
   * avoir confirmé. Le second se voit répondre `dejaConfirmee`, et aucun
   * second email ne part.
   *
   * L'unicité de `providerReference` en base interdit par ailleurs qu'un
   * même identifiant de transaction serve à deux réservations : la
   * violation remonte ici en `TransactionDejaUtiliseeError`.
   */
  async confirmerPaiement(reference: string, referenceTransaction?: string) {
    try {
      return await client().$transaction(async (tx) => {
        const existante = await tx.booking.findUnique({
          where: { reference },
          select: { id: true },
        });
        if (!existante) return null;

        const passage = await tx.booking.updateMany({
          where: { id: existante.id, status: "EN_ATTENTE_PAIEMENT" },
          data: { status: "CONFIRMEE", confirmedAt: new Date() },
        });

        if (passage.count === 1) {
          await tx.payment.updateMany({
            where: { bookingId: existante.id, isDeposit: false },
            data: {
              status: "REUSSI",
              ...(referenceTransaction ? { providerReference: referenceTransaction } : {}),
            },
          });
        }

        const booking = await tx.booking.findUnique({
          where: { id: existante.id },
          include: inclusionReservation,
        });
        if (!booking) return null;

        return { reservation: versReservation(booking), dejaConfirmee: passage.count === 0 };
      });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
        throw new TransactionDejaUtiliseeError();
      }
      throw erreur;
    }
  },

  async marquerDepart(reference: string) {
    return changerStatutReservation(reference, "EN_COURS");
  },

  async marquerRetour(reference: string) {
    return changerStatutReservation(reference, "TERMINEE");
  },

  async majVelo(id, champs) {
    const donnees: Prisma.BikeUpdateInput = {};
    if (champs.statut !== undefined) donnees.status = champs.statut;
    if (Object.keys(donnees).length === 0) return this.trouverVeloParId(id);

    const bike = await client().bike.update({
      where: { id },
      data: donnees,
      include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
    });
    return versVelo(bike);
  },

  async listerClients() {
    const customers = await client().customer.findMany({ orderBy: { createdAt: "desc" } });
    return customers.map(versClient);
  },

  async enregistrerMessageContact(message): Promise<MessageContact> {
    const enregistre = await client().contactMessage.create({
      data: {
        name: message.nom,
        email: message.email,
        subject: message.sujet,
        message: message.message,
      },
    });
    return {
      id: enregistre.id,
      nom: enregistre.name,
      email: enregistre.email,
      sujet: enregistre.subject,
      message: enregistre.message,
      creeLe: enregistre.createdAt.toISOString(),
      traiteLe: enregistre.handledAt?.toISOString(),
    };
  },

  async listerMessagesContact(): Promise<MessageContact[]> {
    const messages = await client().contactMessage.findMany({ orderBy: { createdAt: "desc" } });
    return messages.map((message) => ({
      id: message.id,
      nom: message.name,
      email: message.email,
      sujet: message.subject,
      message: message.message,
      creeLe: message.createdAt.toISOString(),
      traiteLe: message.handledAt?.toISOString(),
    }));
  },
};
