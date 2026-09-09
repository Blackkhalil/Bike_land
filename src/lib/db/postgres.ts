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
import { calculerDevis } from "../tarification";
import { genererReference, genererToken, hacherToken, lireToken } from "../tokens";
import type { Client, MessageContact, PointDeRetrait, Reservation, Velo } from "../types";
import {
  ConflitDisponibiliteError,
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

/** Teintes du visuel généré, dérivées de la catégorie (aucune photo requise). */
const teintesParCategorie: Record<BikeCategory, [string, string]> = {
  RANDONNEUR: ["#c75c34", "#f0e5d6"],
  GRAVEL: ["#4e6630", "#e8eddd"],
  VAE: ["#e2971d", "#fdf5f1"],
  VTC: ["#b89b73", "#f8f2e9"],
  TANDEM: ["#c07813", "#f0e5d6"],
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
    prixJourXof: bike.dailyPriceXof,
    cautionXof: bike.depositXof,
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

/** Statuts qui immobilisent un vélo : une réservation annulée le libère. */
const STATUTS_BLOQUANTS = ["EN_ATTENTE_PAIEMENT", "CONFIRMEE", "EN_COURS", "TERMINEE"] as const;

export const depotPostgres: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    const where: Prisma.BikeWhereInput = { status: { not: "RETIRE" } };
    if (filtre?.categories?.length) where.category = { in: filtre.categories as BikeCategory[] };
    if (filtre?.tailles?.length) where.size = { in: filtre.tailles as ("S" | "M" | "L" | "XL")[] };
    if (filtre?.pointDeRetraitId) where.pickupPointId = filtre.pointDeRetraitId;
    if (filtre?.prixMaxXof) where.dailyPriceXof = { lte: filtre.prixMaxXof };

    if (filtre?.dateDebut && filtre?.dateFin) {
      // Un vélo est retenu s'il n'a aucune ligne de réservation active
      // qui chevauche la période demandée.
      where.bookingItems = {
        none: {
          booking: { status: { in: [...STATUTS_BLOQUANTS] } },
          startDate: { lte: new Date(`${filtre.dateFin}T00:00:00Z`) },
          endDate: { gte: new Date(`${filtre.dateDebut}T00:00:00Z`) },
        },
      };
    }

    const bikes = await client().bike.findMany({
      where,
      include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
      orderBy: { dailyPriceXof: "asc" },
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
      where: { bikeId: veloId, booking: { status: { in: [...STATUTS_BLOQUANTS] } } },
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
        booking: { status: { in: [...STATUTS_BLOQUANTS] } },
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

    const devis = calculerDevis(
      { prixJourXof: bike.dailyPriceXof, cautionXof: bike.depositXof },
      demande.dateDebut,
      demande.dateFin,
      demande.options,
    );

    const reference = genererReference();
    const token = genererToken(reference);
    const debut = new Date(`${demande.dateDebut}T00:00:00Z`);
    const fin = new Date(`${demande.dateFin}T00:00:00Z`);
    const email = demande.client.email.trim().toLowerCase();

    const booking = await client().$transaction(
      async (tx) => {
        // Relecture du conflit *à l'intérieur* de la transaction : c'est
        // elle que le niveau Serializable protège d'une écriture concurrente.
        const conflit = await tx.bookingItem.findFirst({
          where: {
            bikeId: bike.id,
            booking: { status: { in: [...STATUTS_BLOQUANTS] } },
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
            status: "CONFIRMEE",
            customerId: customer.id,
            pickupPointId: bike.pickupPointId,
            startDate: debut,
            endDate: fin,
            days: nombreDeJours(demande.dateDebut, demande.dateFin),
            subtotalXof: devis.sousTotalXof,
            optionsXof: devis.optionsXof,
            discountXof: devis.remiseXof,
            depositXof: devis.cautionXof,
            totalXof: devis.totalXof,
            accessTokenHash: hacherToken(token),
            notes: demande.message,
            confirmedAt: new Date(),
            items: {
              create: [
                {
                  bikeId: bike.id,
                  startDate: debut,
                  endDate: fin,
                  unitPriceXof: bike.dailyPriceXof,
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
            payments: {
              create: [
                {
                  provider: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "FEDAPAY",
                  method: demande.moyenPaiement,
                  status: "REUSSI",
                  amountXof: devis.totalXof,
                  isDeposit: false,
                },
                ...(devis.cautionXof > 0
                  ? [
                      {
                        provider: "FEDAPAY" as const,
                        method: demande.moyenPaiement,
                        status: "REUSSI" as const,
                        amountXof: devis.cautionXof,
                        isDeposit: true,
                      },
                    ]
                  : []),
              ],
            },
          },
          include: inclusionReservation,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
