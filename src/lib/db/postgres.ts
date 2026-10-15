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
  BookingOffer,
  BookingOption,
  Customer,
  Payment,
} from "@prisma/client";

import { nombreDeJours, versISO, type DateISO } from "../dates";
import { creneauOctobreRose } from "@/data/octobre-rose";
import {
  DUREE_ROAD_TRIP_HEURES,
  EXPIRATION_PANIER_MINUTES,
  FERMETURE_HEURE,
  OUVERTURE_HEURE,
  panierExpire,
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
  CodeOffre,
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
  messagePlacesManquantes,
  ordreAttribution,
  resteUneHeureLibre,
  TransactionDejaUtiliseeError,
  type CreneauOccupe,
  type Depot,
  type DemandeReservation,
  type FiltreCatalogue,
  type ResultatReservation,
} from "./contrat";

/** L'offre telle que la base la range, et telle que le domaine la nomme. */
const OFFRE_EN_BASE: Record<CodeOffre, BookingOffer> = {
  "road-trip": "ROAD_TRIP",
  "location-libre": "LOCATION_LIBRE",
  "octobre-rose": "OCTOBRE_ROSE",
};
const OFFRE_DU_DOMAINE: Record<BookingOffer, CodeOffre> = {
  ROAD_TRIP: "road-trip",
  LOCATION_LIBRE: "location-libre",
  OCTOBRE_ROSE: "octobre-rose",
};

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
    offre: OFFRE_DU_DOMAINE[booking.offer],
    nombrePersonnes: booking.peopleCount,
    dureeHeures: booking.durationHours ?? undefined,
    clientId: booking.customerId,
    // Le contact saisi pour cette réservation passe avant la fiche client.
    client: {
      ...versClient(booking.customer),
      prenom: booking.contactFirstName ?? booking.customer.firstName,
      nom: booking.contactLastName ?? booking.customer.lastName,
      telephone: booking.contactPhone ?? booking.customer.phone ?? undefined,
    },
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
      encaissePar: paiement.collectedBy ?? undefined,
      montantRenduXof: paiement.refundedXof ?? undefined,
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
 *
 * La transition est conditionnelle et atomique : un depart ne part que
 * d'une reservation CONFIRMEE, un retour que d'une reservation EN_COURS.
 * Lue puis ecrite en deux temps, une annulation au comptoir glissee entre
 * les deux laissait une vente remboursee repartir EN_COURS. Le statut
 * renvoye est celui qui est en base : l'appelant voit si le geste a pris.
 */
async function changerStatutReservation(
  reference: string,
  statut: "EN_COURS" | "TERMINEE",
): Promise<Reservation | null> {
  const cible = reference.toUpperCase();
  await client().booking.updateMany({
    where: { reference: cible, status: statut === "EN_COURS" ? "CONFIRMEE" : "EN_COURS" },
    data: { status: statut },
  });
  const booking = await client().booking.findUnique({
    where: { reference: cible },
    include: inclusionReservation,
  });
  return booking ? versReservation(booking) : null;
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

  async velosLibres(date: DateISO, heureDebut: number, heureFin: number) {
    const jour = new Date(`${date}T00:00:00Z`);
    const [bikes, pris] = await avecRepriseConnexion(() =>
      Promise.all([
        client().bike.findMany({
          where: { status: { notIn: ["RETIRE", "MAINTENANCE"] } },
          include: { reviews: { where: { isPublished: true }, select: { rating: true } } },
        }),
        client().bookingItem.findMany({
          where: {
            booking: bookingBloquant(),
            startDate: { lte: jour },
            endDate: { gte: jour },
            startHour: { lt: heureFin },
            endHour: { gt: heureDebut },
          },
          select: { bikeId: true },
        }),
      ]),
    );
    const occupes = new Set(pris.map((ligne) => ligne.bikeId));
    return ordreAttribution(bikes.filter((bike) => !occupes.has(bike.id)).map(versVelo));
  },

  async creerReservation(
    demande: DemandeReservation,
  ): Promise<ResultatReservation> {
    // Octobre rose ne se réserve pas sur un vélo choisi : les vélos sont
    // attribués plus bas, dans la transaction, un par participant.
    const octobreRose = demande.offre === "octobre-rose";
    const creneauSortie = octobreRose ? creneauOctobreRose() : null;
    if (octobreRose) {
      if (!creneauSortie) throw new Error("La sortie Octobre rose n'est pas fixée.");
      if (demande.dateDebut !== creneauSortie.date || demande.heureDebut !== creneauSortie.heureDebut) {
        throw new Error("Une inscription à Octobre rose porte sur le jour et l'heure de la sortie.");
      }
    }
    const bike =
      octobreRose || !demande.veloId
        ? null
        : await client().bike.findUnique({ where: { id: demande.veloId } });
    if (!octobreRose && !bike) throw new Error("Vélo introuvable.");

    // Une vente au comptoir ne se règle qu'en espèces : sans ce contrôle,
    // une réservation pourrait naître payée par un Mobile Money qui n'a
    // jamais eu lieu.
    const encaissement = demande.encaissement;
    if (encaissement && demande.moyenPaiement !== "ESPECES") {
      throw new Error("Une vente encaissée au comptoir se règle en espèces.");
    }

    // Devis sans remise d'abord : c'est sur son total que le code de parrainage
    // s'applique, et c'est lui qu'on compare au montant plafond.
    const devisBrut = calculerDevis({
      offre: demande.offre,
      // La gamme vient du vélo lu en base, jamais de l'appelant : c'est
      // elle qui fixe le prix, et la laisser passer par le navigateur
      // reviendrait à laisser choisir son tarif. Octobre rose n'en a pas
      // besoin, son prix ne dépend pas du vélo.
      gamme: bike?.tier,
      nombrePersonnes: demande.nombrePersonnes,
      dureeHeures: demande.dureeHeures,
      options: demande.options,
      // Le prix de la plaquette ne vaut que pour une vente encaissée au
      // comptoir, que seule l'administration peut saisir.
      especes: Boolean(encaissement),
    });

    // Pas de code de parrainage sur Octobre rose : son prix est déjà réduit.
    const codeSaisi =
      demande.codeParrainage && !octobreRose
        ? normaliserCode(demande.codeParrainage)
        : null;

    const reference = genererReference();
    const token = genererToken(reference);
    const debut = new Date(`${demande.dateDebut}T00:00:00Z`);
    const fin = new Date(`${demande.dateFin}T00:00:00Z`);

    // L'heure de fin se déduit de la formule : le road trip dure le temps
    // de son créneau, Octobre rose jusqu'au retour des vélos, la location
    // libre le nombre d'heures choisi.
    const heureFin = creneauSortie
      ? creneauSortie.heureFin
      : demande.offre === "road-trip"
        ? demande.heureDebut + DUREE_ROAD_TRIP_HEURES
        : demande.heureDebut + (devisBrut.dureeHeures ?? 1);
    const email = demande.client.email.trim().toLowerCase();

    const booking = await avecRepriseConnexion(() =>
      client().$transaction(
        async (tx) => {
          // Relecture du conflit *à l'intérieur* de la transaction : c'est
          // elle que le niveau Serializable protège d'une écriture concurrente.
          //
          // Pour Octobre rose, c'est ici que les vélos sont attribués : les
          // vélos en état, moins ceux déjà pris sur le créneau, dans l'ordre
          // d'attribution. Deux inscriptions simultanées lisent les mêmes
          // lignes : PostgreSQL en annule une (P2034), qui, rejouée, voit
          // les vélos pris par l'autre.
          let velosAttribues: { id: string; pickupPointId: string | null }[];
          if (octobreRose) {
            const enEtat = await tx.bike.findMany({
              where: { status: { notIn: ["RETIRE", "MAINTENANCE"] } },
              select: { id: true, name: true, tier: true, pickupPointId: true },
            });
            const pris = await tx.bookingItem.findMany({
              where: {
                booking: bookingBloquant(),
                startDate: { lte: fin },
                endDate: { gte: debut },
                startHour: { lt: heureFin },
                endHour: { gt: demande.heureDebut },
              },
              select: { bikeId: true },
            });
            const occupes = new Set(pris.map((ligne) => ligne.bikeId));
            const libres = ordreAttribution(
              enEtat
                .filter((velo) => !occupes.has(velo.id))
                .map((velo) => ({ ...velo, gamme: velo.tier, nom: velo.name })),
            );
            if (libres.length < devisBrut.nombrePersonnes) {
              throw new ConflitDisponibiliteError(
                messagePlacesManquantes(devisBrut.nombrePersonnes, libres.length, Boolean(encaissement)),
              );
            }
            velosAttribues = libres.slice(0, devisBrut.nombrePersonnes);
          } else {
            const conflit = await tx.bookingItem.findFirst({
              where: conflitHoraire(
                bike!.id,
                demande.dateDebut,
                demande.dateFin,
                demande.heureDebut,
                heureFin,
              ),
              select: { id: true },
            });
            if (conflit) throw new ConflitDisponibiliteError();
            velosAttribues = [bike!];
          }

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
                gamme: bike?.tier,
                nombrePersonnes: demande.nombrePersonnes,
                dureeHeures: demande.dureeHeures,
                options: demande.options,
                especes: Boolean(encaissement),
                remise,
              })
            : devisBrut;

          // Le client est créé au fil de l'eau, sans compte (§2.2). Une
          // fiche existante n'est jamais réécrite, pas même pour compléter
          // un téléphone manquant : n'importe qui peut réserver avec
          // l'adresse d'un autre, et y aurait laissé son propre numéro, que
          // l'équipe aurait ensuite appelé en croyant joindre le client. Ce
          // que la personne a saisi est gardé sur la réservation elle-même
          // (contact*).
          const prenom = demande.client.prenom.trim();
          const nom = demande.client.nom.trim();
          const telephone = demande.client.telephone?.trim() || undefined;
          // `upsert` sans rien à mettre à jour : deux réservations
          // simultanées d'un nouveau client ne se heurtent pas à l'unicité
          // de l'adresse.
          const customer = await tx.customer.upsert({
            where: { email },
            create: { email, firstName: prenom, lastName: nom, phone: telephone },
            update: {},
          });

          return tx.booking.create({
            data: {
              reference,
              // Voir demo.ts : la reservation nait en attente, seul le
              // paiement verifie la confirme. Sauf la vente au comptoir :
              // l'argent est deja encaisse, elle nait confirmee.
              status: encaissement ? "CONFIRMEE" : "EN_ATTENTE_PAIEMENT",
              confirmedAt: encaissement ? new Date() : undefined,
              offer: OFFRE_EN_BASE[demande.offre],
              peopleCount: devis.nombrePersonnes,
              durationHours: devis.dureeHeures,
              customerId: customer.id,
              contactFirstName: prenom,
              contactLastName: nom,
              contactPhone: telephone,
              pickupPointId: velosAttribues[0].pickupPointId,
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
              // Une ligne par vélo. Pour Octobre rose, un vélo par
              // participant, chacun au prix d'une place ; ailleurs, le vélo
              // choisi porte toute la location.
              items: {
                create: velosAttribues.map((velo) => {
                  const prixLigne = octobreRose
                    ? Math.round(devis.sousTotalXof / velosAttribues.length)
                    : devis.sousTotalXof;
                  return {
                    bikeId: velo.id,
                    startDate: debut,
                    endDate: fin,
                    startHour: demande.heureDebut,
                    endHour: heureFin,
                    unitPriceXof: prixLigne,
                    lineTotalXof: prixLigne,
                  };
                }),
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
                        // Payée au comptoir : le client est acquis au
                        // partenaire tout de suite, comme à la confirmation
                        // d'un paiement en ligne.
                        ...(encaissement
                          ? { status: "VALIDE" as const, validatedAt: new Date() }
                          : {}),
                      },
                    },
                  }
                : {}),
              // Une seule ligne de paiement : celle réglée en ligne, encore
              // à l'état INITIE tant que SasPay n'a rien confirmé, ou celle
              // des espèces reçues au comptoir, réussie d'emblée et signée
              // du nom de qui les a reçues.
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
                    status: encaissement ? "REUSSI" : "INITIE",
                    amountXof: devis.totalXof,
                    isDeposit: false,
                    collectedBy: encaissement?.par,
                    providerReference: encaissement?.reference,
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
    ).catch((erreur: unknown) => {
      // La référence d'une saisie au comptoir déjà rangée : la même vente
      // revient une seconde fois. Rien n'a été écrit par cet appel-ci.
      if (
        encaissement?.reference &&
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === "P2002" &&
        String(erreur.meta?.target ?? "").includes("providerReference")
      ) {
        throw new TransactionDejaUtiliseeError("Cette vente est déjà enregistrée.");
      }
      throw erreur;
    });

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

  async trouverReservationParPaiement(referencePaiement: string) {
    const paiement = await client().payment.findUnique({
      where: { providerReference: referencePaiement },
      select: { booking: { include: inclusionReservation } },
    });
    return paiement ? versReservation(paiement.booking) : null;
  },

  async annulerReservation(reference: string, options?: { rembourseAuComptoir?: boolean }) {
    return client().$transaction(
      async (tx) => {
        const cible = reference.toUpperCase();
        const comptoir = Boolean(options?.rembourseAuComptoir);

        // Transition sous condition : seul l'appel qui annule réellement
        // renvoie la réservation. Un appel concurrent, ou sur une réservation
        // déjà annulée, partie ou terminée, renvoie null et n'a rien écrit :
        // ni seconde annulation, ni second remboursement, ni email en double.
        // Une vente au comptoir ne s'annule que tant que le vélo n'est pas
        // parti, pour qu'un départ noté au même instant ne soit pas défait.
        const passage = await tx.booking.updateMany({
          where: {
            reference: cible,
            status: comptoir ? "CONFIRMEE" : { in: ["EN_ATTENTE_PAIEMENT", "CONFIRMEE"] },
          },
          data: { status: "ANNULEE", cancelledAt: new Date() },
        });
        if (passage.count === 0) return null;

        if (comptoir) {
          // L'argent est rendu sur-le-champ, en entier : le paiement passe à
          // REMBOURSE, daté, avec le montant rendu.
          const paiements = await tx.payment.findMany({
            where: { booking: { reference: cible }, isDeposit: false, method: "ESPECES", status: "REUSSI" },
            select: { id: true, amountXof: true },
          });
          for (const paiement of paiements) {
            await tx.payment.update({
              where: { id: paiement.id },
              data: { status: "REMBOURSE", refundedAt: new Date(), refundedXof: paiement.amountXof },
            });
          }
        }

        const booking = await tx.booking.findUniqueOrThrow({
          where: { reference: cible },
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
        // Sauf la vente au comptoir annulée et remboursée sur-le-champ :
        // c'était une erreur de saisie, personne n'a été apporté.
        const libere = await tx.promoUsage.updateMany({
          where: { bookingId: booking.id, status: comptoir ? { in: ["EN_ATTENTE", "VALIDE"] } : "EN_ATTENTE" },
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

  async noterRemboursementEspeces(reference: string, montantXof: number) {
    const cible = reference.toUpperCase();
    // Sous condition, lui aussi : un second clic ne rend pas l'argent une
    // seconde fois.
    const { count } = await client().payment.updateMany({
      where: {
        booking: { reference: cible, status: "ANNULEE" },
        isDeposit: false,
        method: "ESPECES",
        status: "REUSSI",
      },
      data: { status: "REMBOURSE", refundedAt: new Date(), refundedXof: montantXof },
    });
    if (count === 0) return null;
    const booking = await client().booking.findUnique({ where: { reference: cible }, include: inclusionReservation });
    return booking ? versReservation(booking) : null;
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
        // dans la suite des factures. Un identifiant de transaction noté
        // compte aussi : c'est un paiement reçu hors délai, à rembourser,
        // et cet identifiant ne doit pas redevenir utilisable ailleurs.
        const aEncaisse = booking.payments.some(
          (paiement) =>
            !paiement.isDeposit &&
            (paiement.status === "REUSSI" || paiement.providerReference !== null),
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
      return await avecRepriseConnexion(() => client().$transaction(
        async (tx) => {
          const existante = await tx.booking.findUnique({
            where: { reference },
            select: {
              id: true,
              status: true,
              createdAt: true,
              items: {
                select: { bikeId: true, startDate: true, endDate: true, startHour: true, endHour: true },
              },
            },
          });
          if (!existante) return null;

          // Un panier expiré ne bloquait plus le vélo : quelqu'un a pu le
          // reprendre pendant que ce client payait. Le contrôle qui fait foi
          // est ici, dans la transaction qui confirme, en isolation
          // sérialisable comme la création : une réservation du même
          // créneau ne peut pas se glisser entre lui et la confirmation.
          if (
            existante.status === "EN_ATTENTE_PAIEMENT" &&
            panierExpire(existante.createdAt.toISOString())
          ) {
            for (const ligne of existante.items) {
              const conflit = await tx.bookingItem.findFirst({
                where: {
                  ...conflitHoraire(
                    ligne.bikeId,
                    versISO(ligne.startDate),
                    versISO(ligne.endDate),
                    ligne.startHour,
                    ligne.endHour,
                  ),
                  bookingId: { not: existante.id },
                },
                select: { id: true },
              });
              if (conflit) throw new ConflitDisponibiliteError();
            }
          }

          const passage = await tx.booking.updateMany({
            where: { id: existante.id, status: "EN_ATTENTE_PAIEMENT" },
            data: { status: "CONFIRMEE", confirmedAt: new Date() },
          });

          if (passage.count === 1) {
            // Une transaction déjà notée sur ce paiement, et une autre qui
            // le confirme : la première serait effacée sans trace. Elle peut
            // être un premier paiement à rembourser ; le journal la garde.
            if (referenceTransaction) {
              const autre = await tx.payment.findFirst({
                where: {
                  bookingId: existante.id,
                  isDeposit: false,
                  providerReference: { not: null },
                  NOT: { providerReference: referenceTransaction },
                },
                select: { providerReference: true },
              });
              if (autre) {
                console.warn(
                  `[paiement] ${reference} : la transaction ${referenceTransaction} remplace ${autre.providerReference}, déjà notée sur ce paiement. Vérifiez un double paiement.`,
                );
              }
            }
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
        {
          // Comme à la création : une confirmation et une réservation
          // concurrentes du même créneau ne peuvent pas réussir toutes les
          // deux. PostgreSQL en annule une, que `avecRepriseConnexion`
          // rejoue (P2034) ; rejouée, elle voit l'autre.
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          // Même raison qu'à la création : la reconnexion au pooler ne doit
          // pas consommer à elle seule le budget de la transaction.
          maxWait: DELAI_ATTENTE_MS,
          timeout: DELAI_TRANSACTION_MS,
        },
      ));
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

  async lireParametreAdmin(cle: string) {
    const ligne = await client().parametreAdmin.findUnique({ where: { cle } });
    return ligne?.valeur ?? null;
  },

  async ecrireParametreAdmin(cle: string, valeur: string) {
    await client().parametreAdmin.upsert({
      where: { cle },
      create: { cle, valeur },
      update: { valeur },
    });
  },

  async effacerParametreAdmin(cle: string) {
    await client().parametreAdmin.deleteMany({ where: { cle } });
  },

  async avancerParametreAdmin(cle: string, valeur: number) {
    // Une seule requête : l'insertion, ou la mise à jour à condition que la
    // nouvelle valeur dépasse l'ancienne. Deux requêtes simultanées avec le
    // même code ne peuvent donc pas réussir toutes les deux.
    const lignes = await client().$queryRaw<{ cle: string }[]>`
      INSERT INTO "ParametreAdmin" ("cle", "valeur", "updatedAt")
      VALUES (${cle}, ${String(valeur)}, NOW())
      ON CONFLICT ("cle") DO UPDATE SET "valeur" = EXCLUDED."valeur", "updatedAt" = NOW()
      WHERE "ParametreAdmin"."valeur" ~ '^-?[0-9]+$'
        AND "ParametreAdmin"."valeur"::bigint < EXCLUDED."valeur"::bigint
      RETURNING "cle"`;
    return lignes.length === 1;
  },

  async compterEssai(cle: string, fenetreSecondes: number) {
    const lignes = await client().$queryRaw<{ nombre: number }[]>`
      INSERT INTO "CompteurEssais" ("cle", "nombre", "expireLe")
      VALUES (${cle}, 1, NOW() + make_interval(secs => ${fenetreSecondes}))
      ON CONFLICT ("cle") DO UPDATE SET
        "nombre" = CASE WHEN "CompteurEssais"."expireLe" < NOW() THEN 1 ELSE "CompteurEssais"."nombre" + 1 END,
        "expireLe" = CASE WHEN "CompteurEssais"."expireLe" < NOW()
          THEN NOW() + make_interval(secs => ${fenetreSecondes}) ELSE "CompteurEssais"."expireLe" END
      RETURNING "nombre"`;
    return Number(lignes[0]?.nombre ?? 1);
  },

  async effacerCompteur(cle: string) {
    await client().compteurEssais.deleteMany({ where: { cle } });
  },

  async marquerTransactionRecue(reference: string, referenceTransaction: string) {
    const booking = await client().booking.findUnique({
      where: { reference: reference.toUpperCase() },
      select: { id: true },
    });
    if (!booking) return;
    try {
      await client().payment.updateMany({
        where: { bookingId: booking.id, isDeposit: false, providerReference: null },
        data: { providerReference: referenceTransaction },
      });
    } catch (erreur) {
      // Déjà notée sur une autre réservation : elle est donc déjà bloquée.
      if (!(erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002")) throw erreur;
    }
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
      auteurDeLaReservation(booking),
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
      auteurDeLaReservation(booking),
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
        booking: { select: { reference: true, contactFirstName: true, contactLastName: true } },
        bike: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((review) =>
      versAvis(
        review,
        review.booking.reference,
        auteurDeLaReservation({ ...review.booking, customer: review.customer }),
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
          booking: { select: { reference: true, contactFirstName: true, contactLastName: true } },
          bike: { select: { name: true } },
        },
      })
      .catch(() => null);
    if (!review) return null;
    return versAvis(
      review,
      review.booking.reference,
      auteurDeLaReservation({ ...review.booking, customer: review.customer }),
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
 * Le nom sous lequel un avis paraît : celui saisi pour la réservation
 * notée, et non celui de la fiche client. La fiche garde le nom de la
 * toute première réservation faite avec cette adresse, qui pouvait être
 * celle de quelqu'un d'autre : l'avis aurait paru sous son nom.
 */
function auteurDeLaReservation(booking: {
  contactFirstName: string | null;
  contactLastName: string | null;
  customer: { firstName: string; lastName: string };
}): { firstName: string; lastName: string } {
  return {
    firstName: booking.contactFirstName ?? booking.customer.firstName,
    lastName: booking.contactLastName ?? booking.customer.lastName,
  };
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
