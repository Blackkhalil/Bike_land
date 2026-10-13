/**
 * Implémentation PostgreSQL du dépôt, via Prisma (§6.1 du cahier des charges).
 *
 * Elle s'active dès que DATABASE_URL est défini. Le point délicat est la
 * création de réservation : deux clients peuvent cliquer « payer » à la
 * même seconde sur le même vélo. La vérification de disponibilité et
 * l'insertion sont donc faites dans une transaction en niveau
 * `Serializable`, seul niveau qui empêche le « write skew », deux
 * transactions qui lisent chacune « aucun conflit » avant d'écrire.
 */

import { AsyncLocalStorage } from "node:async_hooks";

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
import {
  DUREE_ROAD_TRIP_HEURES,
  EXPIRATION_PANIER_MINUTES,
  FERMETURE_HEURE,
  OUVERTURE_HEURE,
} from "@/data/offres";
import { calculerDevis } from "../tarification";
import {
  genererReference,
  genererToken,
  hacherToken,
  lireToken,
} from "../tokens";
import {
  commissionPour,
  normaliserCode,
  TAUX_REDUCTION_CLIENT,
  verifierCode,
  type CodeParrainage,
} from "../parrainage";
import type {
  AvisClient,
  Client,
  MessageContact,
  Partenaire,
  PointDeRetrait,
  Reservation,
  Velo,
  FormuleFermee,
  JourFerme,
} from "../types";
import {
  ConflitDisponibiliteError,
  resteUneHeureLibre,
  TransactionDejaUtiliseeError,
  type CreneauOccupe,
  type Depot,
  type DemandeReservation,
  type FiltreCatalogue,
  type ResultatReservation,
} from "./contrat";

/**
 * Marges des transactions interactives.
 *
 * Les valeurs par défaut de Prisma (2 s d'attente, 5 s d'exécution) sont
 * calibrées pour une base locale. Ici le pooler ferme les connexions
 * inactives, et la reconnexion consomme à elle seule ce budget.
 */
const DELAI_ATTENTE_MS = 10_000;
const DELAI_TRANSACTION_MS = 20_000;

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
  if (erreur instanceof Prisma.PrismaClientKnownRequestError)
    return erreur.code;
  if (erreur instanceof Prisma.PrismaClientInitializationError)
    return erreur.errorCode ?? null;
  return null;
}

/**
 * Rejoue une opération quand la connexion à la base a lâché.
 *
 * Le pooler de Supabase ferme les connexions inactives. Quand cela tombe
 * pendant une transaction, Prisma lève `P2028`, « transaction not found,
 * obtained before disconnecting », et l'écriture échoue alors qu'aucune
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
/**
 * Marque qu'une reprise est déjà en cours sur la pile d'appels.
 *
 * Sans cela, une méthode qui appelle elle-même `avecRepriseConnexion`
 * se retrouverait rejouée deux fois : cinq essais internes dans chacun
 * des cinq essais externes, soit vingt-cinq tentatives et une vingtaine
 * de secondes d'attente avant de rendre la main. Le garde-fou laisse la
 * boucle la plus externe décider, les appels imbriqués se contentent
 * d'exécuter.
 */
const repriseEnCours = new AsyncLocalStorage<true>();

async function avecRepriseConnexion<T>(
  action: () => Promise<T>,
  essais = 5,
): Promise<T> {
  if (repriseEnCours.getStore()) return action();
  /**
   * Erreurs qu'un nouvel essai peut résoudre.
   *
   * Les P10xx et P2024 sont des pertes de connexion : le pooler ferme les
   * connexions inactives, et le premier appel après une accalmie tombe
   * dessus.
   *
   * **P2034** est d'une autre nature et mérite son mot : PostgreSQL a
   * sérialisé deux transactions concurrentes et en a annulé une. C'est le
   * comportement correct de la base, et le remède prévu est de rejouer.
   * Sans cela, deux clients qui réservent à la même seconde en présentant
   * le même code de parrainage verraient l'un des deux perdre sa réservation,
   * alors qu'il devait simplement l'obtenir au prix plein.
   *
   * Rejouer est sans danger : rien n'a été écrit, et la référence comme le
   * jeton sont calculés avant la transaction, donc inchangés.
   */
  const transitoires = new Set([
    "P1001",
    "P1002",
    "P1017",
    "P2024",
    "P2028",
    "P2034",
  ]);

  for (let tentative = 1; ; tentative += 1) {
    try {
      return await repriseEnCours.run(true, action);
    } catch (erreur) {
      const code = codePrisma(erreur);
      if (!code || !transitoires.has(code) || tentative >= essais) throw erreur;

      console.warn(
        code === "P2034"
          ? `[base] écriture concurrente (P2034), nouvelle tentative ${tentative + 1}/${essais}.`
          : `[base] connexion perdue (${code}), nouvelle tentative ${tentative + 1}/${essais}.`,
      );
      // Attente croissante : 300 ms, puis 600, 900, 1200. Un pic de
      // saturation dure le temps qu'une requête voisine libère sa
      // connexion, quelques centaines de millisecondes.
      await new Promise((resoudre) => setTimeout(resoudre, 300 * tentative));
    }
  }
}

/** Teintes du visuel généré, dérivées de la catégorie (aucune photo requise). */
const teintesParCategorie: Record<BikeCategory, [string, string]> = {
  VTT: ["#1c1b19", "#e0dcd3"],
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
  const note = avis.length
    ? avis.reduce((total, a) => total + a.rating, 0) / avis.length
    : 0;

  return {
    id: bike.id,
    slug: bike.slug,
    nom: bike.name,
    gamme: bike.tier,
    // La vidéo prime sur la photo quand elle existe : douze secondes de
    // tour complet valent mieux qu'un cliché fixe pour juger d'une machine.
    video: bike.videoUrl ?? undefined,
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
  promoUsage?: {
    promoCode: string;
    discountXof: number;
    commissionXof: number;
  } | null;
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
    heureDebut: booking.startHour,
    heureFin: booking.endHour,
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
    // Le code de parrainage utilisé : lu pour l'affichage en admin, jamais
    // recalculer quoi que ce soit, le montant de la remise est figé sur
    // la réservation.
    codeParrainage: booking.promoUsage?.promoCode,
    commissionParrainageXof: booking.promoUsage?.commissionXof,
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
  promoUsage: {
    select: { promoCode: true, discountXof: true, commissionXof: true },
  },
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
 * Filtre repérant les réservations qui bloquent un créneau donné.
 *
 * Les jours doivent se recouvrir **et** les heures aussi. Sans le second
 * contrôle, un client parti à 8 h immobiliserait le vélo jusqu'au soir
 * alors qu'il le rend à 11 h.
 *
 * Les bornes sont strictes : un retour à 11 h et un départ à 11 h ne se
 * gênent pas, le vélo étant rendu avant d'être repris.
 */
function conflitHoraire(
  veloId: string,
  debut: DateISO,
  fin: DateISO,
  heureDebut: number,
  heureFin: number,
): Prisma.BookingItemWhereInput {
  return {
    bikeId: veloId,
    booking: bookingBloquant(),
    startDate: { lte: new Date(`${fin}T00:00:00Z`) },
    endDate: { gte: new Date(`${debut}T00:00:00Z`) },
    startHour: { lt: heureFin },
    endHour: { gt: heureDebut },
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

const depotDirect: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    const where: Prisma.BikeWhereInput = filtre?.inclureRetires
      ? {}
      : { status: { not: "RETIRE" } };
    if (filtre?.pointDeRetraitId) where.pickupPointId = filtre.pointDeRetraitId;

    // Un vélo à l'atelier ne se propose pas, quelle que soit la date.
    if (filtre?.dateDebut && filtre?.dateFin && !filtre.inclureRetires) {
      where.status = { notIn: ["RETIRE", "MAINTENANCE"] };
    }

    const bikes = await client().bike.findMany({
      where,
      include: {
        reviews: { where: { isPublished: true }, select: { rating: true } },
      },
      orderBy: { name: "asc" },
    });

    if (!filtre?.dateDebut || !filtre?.dateFin) return bikes.map(versVelo);

    // Le filtre par date se termine en mémoire : depuis que la
    // disponibilité se compte à l'heure, « libre ce jour-là » veut dire
    // « il reste au moins une heure », ce qu'aucune clause SQL simple
    // n'exprime. Le parc tient sur une poignée de vélos : une requête
    // sur les lignes de la période suffit.
    const lignes = await client().bookingItem.findMany({
      where: {
        booking: bookingBloquant(),
        startDate: { lte: new Date(`${filtre.dateFin}T00:00:00Z`) },
        endDate: { gte: new Date(`${filtre.dateDebut}T00:00:00Z`) },
      },
      select: {
        bikeId: true,
        startDate: true,
        endDate: true,
        startHour: true,
        endHour: true,
      },
    });

    const prisParVelo = new Map<string, CreneauOccupe[]>();
    for (const ligne of lignes) {
      const creneaux = prisParVelo.get(ligne.bikeId) ?? [];
      creneaux.push({
        debut: versISO(ligne.startDate),
        fin: versISO(ligne.endDate),
        heureDebut: ligne.startHour,
        heureFin: ligne.endHour,
      });
      prisParVelo.set(ligne.bikeId, creneaux);
    }

    return bikes
      .filter((bike) =>
        resteUneHeureLibre(
          prisParVelo.get(bike.id) ?? [],
          filtre.dateDebut!,
          filtre.dateFin!,
          OUVERTURE_HEURE,
          FERMETURE_HEURE,
        ),
      )
      .map(versVelo);
  },

  async trouverVeloParSlug(slug: string) {
    // Les lectures publiques passent aussi par la reprise : une connexion
    // fermée par le pooler faisait tomber la page en erreur 500 alors
    // qu'un simple nouvel essai suffit.
    const bike = await avecRepriseConnexion(() =>
      client().bike.findUnique({
        where: { slug },
        include: {
          reviews: { where: { isPublished: true }, select: { rating: true } },
        },
      }),
    );
    return bike ? versVelo(bike) : null;
  },

  async trouverVeloParId(id: string) {
    const bike = await avecRepriseConnexion(() =>
      client().bike.findUnique({
        where: { id },
        include: {
          reviews: { where: { isPublished: true }, select: { rating: true } },
        },
      }),
    );
    return bike ? versVelo(bike) : null;
  },

  async listerPointsDeRetrait(): Promise<PointDeRetrait[]> {
    const points = await avecRepriseConnexion(() =>
      client().pickupPoint.findMany({
        where: { isActive: true },
        orderBy: { city: "asc" },
      }),
    );
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
    const lignes = await avecRepriseConnexion(() =>
      client().bookingItem.findMany({
        where: { bikeId: veloId, booking: bookingBloquant() },
        select: {
          startDate: true,
          endDate: true,
          startHour: true,
          endHour: true,
        },
        orderBy: [{ startDate: "asc" }, { startHour: "asc" }],
      }),
    );
    return lignes.map((ligne) => ({
      debut: versISO(ligne.startDate),
      fin: versISO(ligne.endDate),
      heureDebut: ligne.startHour,
      heureFin: ligne.endHour,
    }));
  },

  async estDisponible(
    veloId: string,
    debut: DateISO,
    fin: DateISO,
    heureDebut: number,
    heureFin: number,
  ) {
    const bike = await client().bike.findUnique({
      where: { id: veloId },
      select: { status: true },
    });
    if (!bike || bike.status === "RETIRE" || bike.status === "MAINTENANCE")
      return false;

    const conflit = await client().bookingItem.findFirst({
      where: conflitHoraire(veloId, debut, fin, heureDebut, heureFin),
      select: { id: true },
    });
    return conflit === null;
  },

  async creerReservation(
    demande: DemandeReservation,
  ): Promise<ResultatReservation> {
    const bike = await client().bike.findUnique({
      where: { id: demande.veloId },
    });
    if (!bike) throw new Error("Vélo introuvable.");

    // Devis sans remise d'abord : c'est sur son total que le code de parrainage
    // s'applique, et c'est lui qu'on compare au montant plafond.
    const devisBrut = calculerDevis({
      offre: demande.offre,
      // La gamme vient du vélo lu en base, jamais de l'appelant : c'est
      // elle qui fixe le prix, et la laisser passer par le navigateur
      // reviendrait à laisser choisir son tarif.
      gamme: bike.tier,
      nombrePersonnes: demande.nombrePersonnes,
      dureeHeures: demande.dureeHeures,
      options: demande.options,
    });

    const codeSaisi = demande.codeParrainage
      ? normaliserCode(demande.codeParrainage)
      : null;

    const reference = genererReference();
    const token = genererToken(reference);
    const debut = new Date(`${demande.dateDebut}T00:00:00Z`);
    const fin = new Date(`${demande.dateFin}T00:00:00Z`);

    // L'heure de fin se déduit de la formule : le road trip dure le temps
    // de son créneau, la location libre le nombre d'heures choisi.
    const heureFin =
      demande.offre === "road-trip"
        ? demande.heureDebut + DUREE_ROAD_TRIP_HEURES
        : demande.heureDebut + (devisBrut.dureeHeures ?? 1);
    const email = demande.client.email.trim().toLowerCase();

    const booking = await avecRepriseConnexion(() =>
      client().$transaction(
        async (tx) => {
          // Relecture du conflit *à l'intérieur* de la transaction : c'est
          // elle que le niveau Serializable protège d'une écriture concurrente.
          const conflit = await tx.bookingItem.findFirst({
            where: conflitHoraire(
              bike.id,
              demande.dateDebut,
              demande.dateFin,
              demande.heureDebut,
              heureFin,
            ),
            select: { id: true },
          });
          if (conflit) throw new ConflitDisponibiliteError();

          // Le code de parrainage est revérifié et consommé **ici**, dans la même
          // transaction que l'écriture. Le vérifier avant reviendrait à
          // laisser deux clients simultanés franchir le même dernier
          // quota : chacun lirait « il reste une utilisation ».
          //
          // `updateMany` conditionné sur le compteur relu fait office de
          // verrou optimiste : s'il ne touche aucune ligne, quelqu'un est
          // passé entre-temps et le code n'est pas accordé.
          let remise: { code: string; montantXof: number } | undefined;
          if (codeSaisi) {
            const ligne = await tx.promoCode.findUnique({
              where: { code: codeSaisi },
              include: {
                partner: { select: { id: true, name: true, isActive: true } },
              },
            });

            // Un partenariat désactivé retire toute valeur à ses codes,
            // sans qu'on ait à les désactiver un par un.
            const utilisable =
              ligne && ligne.partner.isActive
                ? versCodeParrainage(ligne)
                : null;
            const controle = verifierCode(utilisable, devisBrut.totalXof);

            if (controle.valide && controle.remiseXof > 0) {
              const consomme = await tx.promoCode.updateMany({
                where: { code: codeSaisi, useCount: ligne!.useCount },
                data: { useCount: { increment: 1 } },
              });
              if (consomme.count === 1) {
                remise = { code: codeSaisi, montantXof: controle.remiseXof };
              }
            }
          }

          // Le devis définitif, remise comprise. Recalculé et non corrigé :
          // c'est `calculerDevis` qui décide des montants, partout.
          const devis = remise
            ? calculerDevis({
                offre: demande.offre,
                gamme: bike.tier,
                nombrePersonnes: demande.nombrePersonnes,
                dureeHeures: demande.dureeHeures,
                options: demande.options,
                remise,
              })
            : devisBrut;

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
              ...(demande.client.telephone
                ? { phone: demande.client.telephone.trim() }
                : {}),
            },
          });

          return tx.booking.create({
            data: {
              reference,
              // Voir demo.ts : la reservation nait en attente, seul le
              // paiement verifie la confirme.
              status: "EN_ATTENTE_PAIEMENT",
              offer:
                demande.offre === "road-trip" ? "ROAD_TRIP" : "LOCATION_LIBRE",
              peopleCount: devis.nombrePersonnes,
              durationHours: devis.dureeHeures,
              customerId: customer.id,
              pickupPointId: bike.pickupPointId,
              startDate: debut,
              endDate: fin,
              startHour: demande.heureDebut,
              endHour: heureFin,
              days: nombreDeJours(demande.dateDebut, demande.dateFin),
              subtotalXof: devis.sousTotalXof,
              optionsXof: devis.optionsXof,
              discountXof: devis.remiseXof,
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
                    startHour: demande.heureDebut,
                    endHour: heureFin,
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
              // L'utilisation du code : c'est elle qui rattache ce client
              // au partenaire, et le montant y est figé car la valeur du
              // code peut changer par la suite.
              ...(remise
                ? {
                    promoUsage: {
                      create: {
                        promoCode: remise.code,
                        discountXof: remise.montantXof,
                        // Figée au taux du jour : recalculer une commission
                        // de l'an dernier avec le taux d'aujourd'hui
                        // fausserait l'historique des versements.
                        commissionXof: commissionPour(devis.totalXof),
                      },
                    },
                  }
                : {}),
              // Une seule ligne de paiement : celle réglée en ligne, encore
              // à l'état INITIE tant que SasPay n'a rien confirmé.
              //
              // La caution de la location libre n'en crée aucune, et c'est
              // volontaire : elle est remise en espèces au coordinateur au
              // départ, puis rendue au retour. L'enregistrer ici comme
              // « encaissée » ferait apparaître en comptabilité un argent
              // qui n'est jamais passé par la plateforme.
              payments: {
                create: [
                  {
                    provider:
                      demande.moyenPaiement === "ESPECES"
                        ? "ESPECES"
                        : "SASPAY",
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
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          // Le pooler Supabase ferme les connexions inactives : le premier
          // appel après une accalmie passe d'abord par une reconnexion, qui
          // mange à elle seule les 5 secondes accordées par défaut. Le
          // client voyait alors une erreur sur une réservation parfaitement
          // valable. Ces délais laissent la place à cette reconnexion sans
          // rien changer au verrouillage.
          maxWait: DELAI_ATTENTE_MS,
          timeout: DELAI_TRANSACTION_MS,
        },
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
    return client().$transaction(
      async (tx) => {
        const booking = await tx.booking.update({
          where: { reference: reference.toUpperCase() },
          data: { status: "ANNULEE", cancelledAt: new Date() },
          include: inclusionReservation,
        });

        // Le code de parrainage retourne au pot : son quota avait été
        // réservé à la création, il n'a plus lieu d'être retenu. Sans
        // cela, une poignée d'annulations épuiserait un code que
        // personne n'a réellement utilisé.
        //
        // Seuls les usages encore en attente sont libérés : un usage
        // déjà validé correspond à un paiement encaissé, et le rendre
        // effacerait un client que le partenaire a bel et bien apporté.
        const libere = await tx.promoUsage.updateMany({
          where: { bookingId: booking.id, status: "EN_ATTENTE" },
          data: { status: "ANNULE" },
        });

        if (libere.count === 1) {
          const usage = await tx.promoUsage.findUnique({
            where: { bookingId: booking.id },
            select: { promoCode: true },
          });
          if (usage) {
            await tx.promoCode.update({
              where: { code: usage.promoCode },
              data: { useCount: { decrement: 1 } },
            });
          }
        }

        return versReservation(booking);
      },
      { maxWait: DELAI_ATTENTE_MS, timeout: DELAI_TRANSACTION_MS },
    );
  },

  async supprimerReservation(reference: string) {
    return client().$transaction(
      async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { reference: reference.toUpperCase() },
          include: { payments: true, promoUsage: true },
        });
        if (!booking) return false;

        // Garde-fou, et il n'est pas décoratif : une réservation qui a
        // encaissé est une pièce comptable. Elle s'annule, se rembourse,
        // mais ne s'efface pas, sans quoi un contrôle trouverait un trou
        // dans la suite des factures.
        const aEncaisse = booking.payments.some(
          (paiement) => !paiement.isDeposit && paiement.status === "REUSSI",
        );
        if (aEncaisse || booking.status !== "EN_ATTENTE_PAIEMENT") return false;

        // Le quota du code de parrainage revient au pot, comme à
        // l'annulation : il avait été retenu à la création.
        if (booking.promoUsage && booking.promoUsage.status === "EN_ATTENTE") {
          await tx.promoCode.update({
            where: { code: booking.promoUsage.promoCode },
            data: { useCount: { decrement: 1 } },
          });
        }

        await tx.promoUsage.deleteMany({ where: { bookingId: booking.id } });
        await tx.payment.deleteMany({ where: { bookingId: booking.id } });
        await tx.bookingOption.deleteMany({ where: { bookingId: booking.id } });
        await tx.bookingItem.deleteMany({ where: { bookingId: booking.id } });
        await tx.review.deleteMany({ where: { bookingId: booking.id } });
        await tx.booking.delete({ where: { id: booking.id } });
        return true;
      },
      { maxWait: DELAI_ATTENTE_MS, timeout: DELAI_TRANSACTION_MS },
    );
  },

  async listerRappelsAEnvoyer(date: DateISO) {
    const bookings = await client().booking.findMany({
      where: {
        status: "CONFIRMEE",
        startDate: new Date(`${date}T00:00:00Z`),
        reminderSentAt: null,
      },
      include: inclusionReservation,
      orderBy: { startHour: "asc" },
    });
    return bookings.map(versReservation);
  },

  async retenirRappel(reservationId: string) {
    // Conditionnel : seul l'appel qui trouve encore le champ vide l'écrit.
    const { count } = await client().booking.updateMany({
      where: { id: reservationId, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    return count === 1;
  },

  async libererRappel(reservationId: string) {
    await client().booking.updateMany({
      where: { id: reservationId },
      data: { reminderSentAt: null },
    });
  },

  async listerReservations(options) {
    const where: Prisma.BookingWhereInput = {};
    if (options?.statut) where.status = options.statut;
    if (options?.depuis)
      where.endDate = { gte: new Date(`${options.depuis}T00:00:00Z`) };
    if (options?.jusqua)
      where.startDate = { lte: new Date(`${options.jusqua}T00:00:00Z`) };

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
   * Deux appels peuvent arriver en même temps, le navigateur du client
   * et le webhook de SasPay signalent le même paiement. La transition
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
      return await client().$transaction(
        async (tx) => {
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
                ...(referenceTransaction
                  ? { providerReference: referenceTransaction }
                  : {}),
              },
            });

            // Le code de parrainage n'est acquis au partenaire qu'ici,
            // dans la transaction qui confirme le paiement. Le compter à
            // la création aurait crédité le partenaire de clients qui
            // n'ont jamais payé.
            //
            // Le filtre sur EN_ATTENTE interdit le double comptage : un
            // webhook rejoué ne trouve plus rien à valider. Et comme
            // `passage.count === 1` ne vaut que pour le premier appel,
            // deux notifications simultanées ne valident qu'une fois.
            await tx.promoUsage.updateMany({
              where: { bookingId: existante.id, status: "EN_ATTENTE" },
              data: { status: "VALIDE", validatedAt: new Date() },
            });
          }

          const booking = await tx.booking.findUnique({
            where: { id: existante.id },
            include: inclusionReservation,
          });
          if (!booking) return null;

          return {
            reservation: versReservation(booking),
            dejaConfirmee: passage.count === 0,
          };
        },
        // Même raison qu'à la création : la reconnexion au pooler ne doit
        // pas consommer à elle seule le budget de la transaction.
        { maxWait: DELAI_ATTENTE_MS, timeout: DELAI_TRANSACTION_MS },
      );
    } catch (erreur) {
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === "P2002"
      ) {
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

  async creerVelo(champs) {
    // Le slug est l'adresse publique du vélo : il se déduit du nom et
    // se suffixe en cas de doublon, plutôt que d'échouer sur la
    // contrainte d'unicité au visage de l'exploitant.
    const base = slugifier(champs.nom);
    const voisins = await client().bike.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const pris = new Set(voisins.map((bike) => bike.slug));
    let slug = base;
    for (let suffixe = 2; pris.has(slug); suffixe += 1)
      slug = `${base}-${suffixe}`;

    const bike = await client().bike.create({
      data: {
        slug,
        name: champs.nom,
        category: champs.categorie,
        tier: champs.gamme,
        size: champs.taille,
        status: "DISPONIBLE",
        shortPitch: champs.accroche,
        description: champs.description,
        weightKg: champs.poidsKg,
        gearCount: champs.vitesses,
        maxLoadKg: champs.chargeMaxKg,
        suggestedRangeKm: champs.autonomieConseilleeKm,
        includedEquipment: champs.equipementInclus,
        heroImageUrl: champs.photo ?? null,
        videoUrl: champs.video ?? null,
        ...(champs.pointDeRetraitId
          ? { pickupPointId: champs.pointDeRetraitId }
          : {}),
      },
      include: {
        reviews: { where: { isPublished: true }, select: { rating: true } },
      },
    });
    return versVelo(bike);
  },

  async majVelo(id, champs) {
    const donnees: Prisma.BikeUpdateInput = {};
    if (champs.statut !== undefined) donnees.status = champs.statut;
    if (champs.gamme !== undefined) donnees.tier = champs.gamme;
    if (Object.keys(donnees).length === 0) return this.trouverVeloParId(id);

    const bike = await client().bike.update({
      where: { id },
      data: donnees,
      include: {
        reviews: { where: { isPublished: true }, select: { rating: true } },
      },
    });
    return versVelo(bike);
  },

  async listerClients() {
    const customers = await client().customer.findMany({
      orderBy: { createdAt: "desc" },
    });
    return customers.map(versClient);
  },

  /* ------------------------------------------------ Parrainage partenaires */

  async verifierCodeParrainage(code, montantXof) {
    const normalise = normaliserCode(code);
    const ligne = await client().promoCode.findUnique({
      where: { code: normalise },
      include: {
        partner: { select: { id: true, name: true, isActive: true } },
      },
    });
    // Un partenariat désactivé retire toute valeur à ses codes.
    const utilisable =
      ligne && ligne.partner.isActive ? versCodeParrainage(ligne) : null;
    return verifierCode(utilisable, montantXof);
  },

  async listerPartenaires(options) {
    const partners = await client().partner.findMany({
      where: options?.inclureInactifs ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    return partners.map(versPartenaire);
  },

  async creerPartenaire(champs) {
    const partner = await client().partner.create({
      data: {
        name: champs.nom.trim(),
        contact: champs.contact?.trim() || null,
        notes: champs.notes?.trim() || null,
      },
    });
    return versPartenaire(partner);
  },

  async majPartenaire(id, champs) {
    const partner = await client()
      .partner.update({
        where: { id },
        data: {
          ...(champs.actif !== undefined ? { isActive: champs.actif } : {}),
        },
      })
      .catch(() => null);
    return partner ? versPartenaire(partner) : null;
  },

  async listerCodesParrainage() {
    const codes = await client().promoCode.findMany({
      include: { partner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return codes.map(versCodeParrainage);
  },

  async creerCodeParrainage(champs) {
    const code = await client().promoCode.create({
      data: {
        code: normaliserCode(champs.code),
        partnerId: champs.partenaireId,
        // Colonnes historiques : la valeur ne sert plus à calculer, les
        // taux sont des constantes (cf. src/lib/parrainage.ts). On y écrit
        // le taux du jour pour que la base reste lisible telle quelle.
        kind: "POURCENTAGE",
        value: Math.round(TAUX_REDUCTION_CLIENT * 100),
        startsAt: champs.debuteLe ? new Date(champs.debuteLe) : null,
        endsAt: champs.finitLe ? new Date(`${champs.finitLe}T23:59:59`) : null,
        maxUses: champs.utilisationsMax ?? null,
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    return versCodeParrainage(code);
  },

  async majCodeParrainage(code, champs) {
    const ligne = await client()
      .promoCode.update({
        where: { code: normaliserCode(code) },
        data: {
          ...(champs.actif !== undefined ? { isActive: champs.actif } : {}),
        },
        include: { partner: { select: { id: true, name: true } } },
      })
      .catch(() => null);
    return ligne ? versCodeParrainage(ligne) : null;
  },

  async lireOuverture() {
    try {
      const [creneaux, jours] = await Promise.all([
        client().creneauReglage.findMany(),
        client().jourFerme.findMany({ orderBy: [{ date: "asc" }, { formule: "asc" }] }),
      ]);
      return {
        creneaux: Object.fromEntries(creneaux.map((c) => [c.code, c.actif])),
        joursFermes: jours.map(versJourFerme),
      };
    } catch (erreur) {
      // Tables pas encore créées (P2021) : la réservation reste ouverte
      // selon les valeurs par défaut. Faire tomber tout le tunnel parce
      // qu'un réglage facultatif manque serait bien pire.
      if (codePrisma(erreur) === "P2021") {
        console.error("[ouverture] tables absentes : valeurs par défaut appliquées.");
        return { creneaux: {}, joursFermes: [] };
      }
      throw erreur;
    }
  },

  async reglerCreneau(code, actif) {
    await client().creneauReglage.upsert({
      where: { code },
      create: { code, actif },
      update: { actif },
    });
  },

  async fermerJour({ date, formule, motif }) {
    const jour = await client().jourFerme.upsert({
      where: { date_formule: { date: new Date(`${date}T00:00:00Z`), formule } },
      create: { date: new Date(`${date}T00:00:00Z`), formule, motif: motif || null },
      update: { motif: motif || null },
    });
    return versJourFerme(jour);
  },

  async rouvrirJour(id) {
    return client()
      .jourFerme.delete({ where: { id } })
      .then(() => true)
      .catch(() => false);
  },

  async supprimerPartenaire(id) {
    const partner = await client().partner.findUnique({
      where: { id },
      select: { _count: { select: { promoCodes: true } } },
    });
    if (!partner) return { supprime: false };

    const parEtat = await client().promoUsage.groupBy({
      by: ["status"],
      where: { promo: { partnerId: id } },
      _count: true,
    });
    const nombre = (etat: string) => parEtat.find((g) => g.status === etat)?._count ?? 0;
    if (nombre("VALIDE") > 0) return { supprime: false, raison: "commissions" as const };
    if (nombre("EN_ATTENTE") > 0) return { supprime: false, raison: "en-attente" as const };

    // La cascade du schéma emporte les codes et leurs utilisations
    // annulées, qui n'engagent plus personne.
    const supprime = await client()
      .partner.delete({ where: { id } })
      .then(() => true)
      .catch(() => false);
    return { supprime, codes: partner._count.promoCodes };
  },

  async supprimerCodeParrainage(code) {
    const normalise = normaliserCode(code);
    const utilisations = await client().promoUsage.count({
      where: { promoCode: normalise },
    });
    // Effacer un code déjà utilisé effacerait en cascade ses utilisations,
    // et donc la seule trace de ce que le partenaire a apporté.
    if (utilisations > 0)
      return { supprime: false, raison: "deja-utilise" as const };

    const supprime = await client()
      .promoCode.delete({ where: { code: normalise } })
      .then(() => true)
      .catch(() => false);
    return { supprime };
  },

  async statistiquesPartenaires() {
    const partners = await client().partner.findMany({
      orderBy: { name: "asc" },
      include: {
        promoCodes: {
          select: {
            code: true,
            usages: {
              // Seuls les usages validés comptent : un code appliqué sur
              // une réservation jamais payée ne rapporte rien au
              // partenaire, et ne doit pas gonfler son tableau.
              where: { status: "VALIDE" },
              select: {
                discountXof: true,
                commissionXof: true,
                createdAt: true,
                booking: { select: { totalXof: true, status: true } },
              },
            },
          },
        },
      },
    });

    return partners.map((partner) => {
      const utilisations = partner.promoCodes.flatMap((code) => code.usages);
      // Les réservations annulées ne comptent pas : le partenaire n'a pas
      // apporté un client qui s'est décommandé.
      const retenues = utilisations.filter(
        (usage) => usage.booking.status !== "ANNULEE",
      );
      const derniere = utilisations
        .map((usage) => usage.createdAt.toISOString())
        .sort()
        .at(-1);

      return {
        partenaire: versPartenaire(partner),
        codes: partner.promoCodes.map((code) => code.code),
        utilisations: retenues.length,
        reductionsAccordeesXof: retenues.reduce(
          (total, usage) => total + usage.discountXof,
          0,
        ),
        chiffreAffairesXof: retenues.reduce(
          (total, usage) => total + usage.booking.totalXof,
          0,
        ),
        commissionDueXof: retenues.reduce(
          (total, usage) => total + usage.commissionXof,
          0,
        ),
        derniereUtilisation: derniere,
      };
    });
  },

  /* ------------------------------------------------------- Avis clients */

  async enregistrerAvis(entree) {
    const booking = await client().booking.findUnique({
      where: { reference: entree.reference.toUpperCase() },
      include: {
        customer: true,
        items: {
          include: { bike: { select: { id: true, name: true } } },
          take: 1,
        },
        review: true,
      },
    });
    // On ne note que ce qu'on a vécu : la sortie doit être terminée.
    if (!booking || booking.status !== "TERMINEE") return null;

    const ligne = booking.items[0];
    if (!ligne) return null;

    // `upsert` plutôt que `create` : un second envoi corrige le premier.
    // Il repasse en relecture, puisque le texte a changé.
    const review = await client().review.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        bikeId: ligne.bikeId,
        customerId: booking.customerId,
        rating: entree.note,
        title: entree.titre ?? null,
        comment: entree.commentaire ?? null,
      },
      update: {
        rating: entree.note,
        title: entree.titre ?? null,
        comment: entree.commentaire ?? null,
        isPublished: false,
      },
    });

    return versAvis(
      review,
      booking.reference,
      booking.customer,
      ligne.bike.name,
    );
  },

  async trouverAvisParReference(reference) {
    const booking = await client().booking.findUnique({
      where: { reference: reference.toUpperCase() },
      include: {
        customer: true,
        items: { include: { bike: { select: { name: true } } }, take: 1 },
        review: true,
      },
    });
    if (!booking?.review) return null;
    return versAvis(
      booking.review,
      booking.reference,
      booking.customer,
      booking.items[0]?.bike.name ?? "",
    );
  },

  async listerAvis(filtre) {
    const reviews = await client().review.findMany({
      where: {
        ...(filtre?.publiesSeulement ? { isPublished: true } : {}),
        ...(filtre?.veloId ? { bikeId: filtre.veloId } : {}),
      },
      include: {
        customer: true,
        booking: { select: { reference: true } },
        bike: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((review) =>
      versAvis(
        review,
        review.booking.reference,
        review.customer,
        review.bike.name,
      ),
    );
  },

  async publierAvis(id, publie) {
    const review = await client()
      .review.update({
        where: { id },
        data: { isPublished: publie },
        include: {
          customer: true,
          booking: { select: { reference: true } },
          bike: { select: { name: true } },
        },
      })
      .catch(() => null);
    if (!review) return null;
    return versAvis(
      review,
      review.booking.reference,
      review.customer,
      review.bike.name,
    );
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
    const messages = await client().contactMessage.findMany({
      orderBy: { createdAt: "desc" },
    });
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

/**
 * Le dépôt réellement exporté : chaque méthode passe par la reprise de
 * connexion.
 *
 * La protection était auparavant posée appel par appel, et six méthodes
 * seulement en bénéficiaient. Les autres laissaient remonter une perte de
 * connexion du pooler, qui est pourtant courante et sans gravité : une
 * vérification de disponibilité s'est ainsi soldée par une erreur 500
 * pendant les tests, alors qu'un simple nouvel essai suffisait.
 *
 * L'envelopper ici règle le problème pour toute méthode présente comme
 * pour toute méthode ajoutée plus tard, sans qu'il faille y penser.
 */
export const depotPostgres: Depot = Object.fromEntries(
  Object.entries(depotDirect).map(([nom, valeur]) => [
    nom,
    typeof valeur === "function"
      ? (...arguments_: unknown[]) =>
          avecRepriseConnexion(() =>
            (valeur as (...a: unknown[]) => Promise<unknown>).apply(depotDirect, arguments_),
          )
      : valeur,
  ]),
) as Depot;

/** « Vélo de ville N°3 » devient « velo-de-ville-n-3 ». */
function slugifier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Traduit un avis de la base vers le domaine.
 *
 * Le nom de famille est réduit à son initiale : un avis paraît sur le
 * site public, et il n'a pas à y désigner quelqu'un précisément.
 */
function versAvis(
  review: {
    id: string;
    bikeId: string;
    rating: number;
    title: string | null;
    comment: string | null;
    isPublished: boolean;
    createdAt: Date;
  },
  reference: string,
  customer: { firstName: string; lastName: string },
  veloNom: string,
): AvisClient {
  return {
    id: review.id,
    veloId: review.bikeId,
    veloNom,
    reference,
    auteur: `${customer.firstName} ${customer.lastName.slice(0, 1)}.`,
    note: review.rating,
    titre: review.title ?? undefined,
    commentaire: review.comment ?? undefined,
    publie: review.isPublished,
    creeLe: review.createdAt.toISOString(),
  };
}

/** Traduit un partenaire de la base vers le domaine. */
function versPartenaire(partner: {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
}): Partenaire {
  return {
    id: partner.id,
    nom: partner.name,
    contact: partner.contact ?? undefined,
    notes: partner.notes ?? undefined,
    actif: partner.isActive,
    creeLe: partner.createdAt.toISOString(),
  };
}

/** Traduit un code de parrainage de la base vers le domaine. */
function versCodeParrainage(ligne: {
  code: string;
  partnerId: string;
  partner?: { id: string; name: string };
  kind: string;
  value: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: Date;
}): CodeParrainage {
  return {
    code: ligne.code,
    partenaireId: ligne.partnerId,
    partenaireNom: ligne.partner?.name ?? "",
    debuteLe: ligne.startsAt?.toISOString(),
    finitLe: ligne.endsAt?.toISOString(),
    utilisationsMax: ligne.maxUses ?? undefined,
    utilisations: ligne.useCount,
    actif: ligne.isActive,
    creeLe: ligne.createdAt.toISOString(),
  };
}

function versJourFerme(jour: {
  id: string;
  date: Date;
  formule: string;
  motif: string | null;
  createdAt: Date;
}): JourFerme {
  return {
    id: jour.id,
    date: jour.date.toISOString().slice(0, 10),
    formule: jour.formule as FormuleFermee,
    motif: jour.motif ?? undefined,
    creeLe: jour.createdAt.toISOString(),
  };
}
