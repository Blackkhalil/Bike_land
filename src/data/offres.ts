/**
 * Les deux offres de Bike Land.
 *
 * Elles ne se distinguent pas par le vélo mais par l'encadrement, et
 * c'est cet encadrement qui commande tout le reste :
 *
 *  - **Road trip** : on roule en groupe, un coordinateur ouvre la route,
 *    remet les vélos et les kits au départ et les récupère à l'arrivée.
 *    Le matériel ne quitte jamais sa garde, d'où l'absence de caution.
 *
 *  - **Location libre** : le client part seul avec le vélo. Le matériel
 *    sort de notre garde, d'où la caution, la pièce d'identité présentée
 *    au départ et l'engagement signé.
 *
 * La tarification journalière a été retirée : la location libre se
 * facture à l'heure, le road trip au forfait.
 */

import type { CodeOffre } from "@/lib/types";

export type { CodeOffre };

/**
 * Les trois gammes de vélos.
 *
 * Le prix dépend désormais de la machine, et non plus seulement de la
 * formule : c'est le modèle de la plaquette tarifaire de Bike Land. Un
 * VTT tout-suspendu à double frein à disque ne se loue pas au prix d'un
 * VTT rigide à sept vitesses, et le client comprend très bien pourquoi.
 */
export type GammeVelo = "CLASSIQUE" | "PREMIUM" | "PRESTIGE";

export const GAMMES: { code: GammeVelo; nom: string; description: string }[] = [
  {
    code: "CLASSIQUE",
    nom: "Classique",
    description:
      "Le parc de tous les jours : du VTT dame au tout-suspendu, de quoi rouler la route des Pêches sans se poser de question.",
  },
  {
    code: "PREMIUM",
    nom: "Premium",
    description:
      "Des machines de marque (Northpoint, Mongoose, Muddyfox, Raleigh), mieux finies et plus confortables sur la distance.",
  },
  {
    code: "PRESTIGE",
    nom: "Prestige",
    description:
      "Une seule machine, la plus aboutie du parc : cadre acier haute résistance, double frein à disque, jantes bâton magnésium.",
  },
];

/**
 * Tarif du road trip, par personne et par gamme, eau comprise.
 *
 * Les cocos suivent la gamme : une pour le Classique, deux au-dessus.
 * C'est la plaquette qui l'établit, pas une décision technique.
 */
export const PRIX_ROAD_TRIP_XOF: Record<GammeVelo, number> = {
  CLASSIQUE: 2625,
  PREMIUM: 3125,
  PRESTIGE: 3625,
};

/** Nombre de cocos offertes au retour, par gamme. */
export const COCOS_ROAD_TRIP: Record<GammeVelo, number> = {
  CLASSIQUE: 1,
  PREMIUM: 2,
  PRESTIGE: 2,
};

/** Caution de la location libre, rendue à la restitution du vélo. */
export const CAUTION_LOCATION_LIBRE_XOF = 5000;

/**
 * Grille horaire de la location libre, par gamme.
 *
 * De une à quatre heures. Au-delà, il n'y a pas de tarif public, c'est
 * un cas à traiter au téléphone, pas à deviner.
 *
 * Chaque palier porte les 125 F destinés à couvrir les frais de
 * l'agrégateur, exactement comme le road trip : la plaquette annonce
 * 1 000 F l'heure en Classique, le site affiche 1 125 F. Sans cela, le
 * road trip aurait été le seul à porter ces frais, et la location libre
 * les aurait pris sur la marge.
 *
 * Le forfait de quatre heures reste le plus avantageux de chaque ligne.
 */
export const GRILLE_HORAIRE: Record<GammeVelo, { heures: number; prixXof: number }[]> = {
  CLASSIQUE: [
    { heures: 1, prixXof: 1125 },
    { heures: 2, prixXof: 2125 },
    { heures: 3, prixXof: 3125 },
    { heures: 4, prixXof: 3625 },
  ],
  PREMIUM: [
    { heures: 1, prixXof: 1625 },
    { heures: 2, prixXof: 3125 },
    { heures: 3, prixXof: 4625 },
    { heures: 4, prixXof: 5625 },
  ],
  PRESTIGE: [
    { heures: 1, prixXof: 2125 },
    { heures: 2, prixXof: 4125 },
    { heures: 3, prixXof: 6125 },
    { heures: 4, prixXof: 7125 },
  ],
};

export const DUREE_MAX_LOCATION_LIBRE = 4;

/** Le tarif d'entrée, toutes gammes confondues, « à partir de ». */
export const PRIX_MINIMUM_HEURE_XOF = GRILLE_HORAIRE.CLASSIQUE[0].prixXof;
export const PRIX_MINIMUM_ROAD_TRIP_XOF = PRIX_ROAD_TRIP_XOF.CLASSIQUE;

/** Prix d'une location libre pour une gamme et une durée, ou `null` hors grille. */
export function prixLocationLibre(gamme: GammeVelo, heures: number): number | null {
  return GRILLE_HORAIRE[gamme].find((palier) => palier.heures === heures)?.prixXof ?? null;
}

/** Ce que le client doit apporter ou accepter, par offre. */
export const EXIGENCES: Record<CodeOffre, string[]> = {
  "road-trip": [
    "Rien à apporter : casque, antivol et kit sont fournis au départ.",
    "Être présent au point de départ quinze minutes avant l'heure.",
  ],
  "location-libre": [
    "Présenter une pièce d'identité (CIP) au départ. Elle vous est rendue au retour du vélo.",
    "Signer l'engagement de restitution, en ligne puis sur place au départ.",
    `Laisser une caution de ${CAUTION_LOCATION_LIBRE_XOF.toLocaleString("fr-FR")} FCFA, rendue à la restitution du vélo.`,
  ],
};

export const OFFRES: {
  code: CodeOffre;
  nom: string;
  accroche: string;
  description: string;
  cautionXof: number;
}[] = [
  {
    code: "road-trip",
    nom: "Road trip sur la route des Pêches",
    accroche: "Une sortie en groupe, encadrée",
    description:
      "Un de nos deux circuits, roulé ensemble avec un coordinateur qui ouvre la route. Vélo, casque, antivol, kit de réparation, coco frais et eau compris. Aucune caution.",
    cautionXof: 0,
  },
  {
    code: "location-libre",
    nom: "Location libre",
    accroche: "Le vélo pour vous, à l'heure",
    description:
      "Vous prenez le vélo et vous roulez où vous voulez, à votre rythme. De une à cinq heures. Pièce d'identité et engagement signé demandés au départ.",
    cautionXof: CAUTION_LOCATION_LIBRE_XOF,
  },
];

/**
 * Delai au-dela duquel une reservation jamais payee cesse de bloquer le
 * velo.
 *
 * Sans cela, un panier abandonne immobiliserait un velo indefiniment :
 * la reservation reste EN_ATTENTE_PAIEMENT, donc bloquante, et personne
 * ne peut plus reserver ce velo ce jour-la. Trente minutes laissent le
 * temps d'un paiement Mobile Money, y compris avec une mauvaise
 * connexion.
 */
export const EXPIRATION_PANIER_MINUTES = 30;

/* ------------------------------------------------------------------ Horaires */

/**
 * Le créneau du road trip : le samedi matin, et lui seul.
 *
 * La sortie est encadrée : elle part à heure fixe, en groupe, avec un
 * coordinateur. Il n'y a donc rien à choisir d'autre que le jour, d'où
 * l'absence de calendrier sur cette formule, contrairement à la location
 * libre où le client dispose du vélo comme il l'entend.
 *
 * `jourSemaine` suit la convention de JavaScript : 0 = dimanche, 6 = samedi.
 */
export const CRENEAUX_ROAD_TRIP = [
  { code: "samedi-matin", jourSemaine: 6, libelle: "Samedi", heureDebut: 8, heureFin: 11 },
  // Le dimanche a été retiré : le road trip ne part plus que le samedi.
  // Le reste du site suit cette liste, la validation côté serveur
  // comprise : un dimanche envoyé à la main est refusé.
] as const;

export type CodeCreneau = (typeof CRENEAUX_ROAD_TRIP)[number]["code"];

/** Durée d'une sortie encadrée, déduite du créneau lui-même. */
export const DUREE_ROAD_TRIP_HEURES =
  CRENEAUX_ROAD_TRIP[0].heureFin - CRENEAUX_ROAD_TRIP[0].heureDebut;

/** Amplitude d'ouverture de l'atelier, pour la location libre. */
export const OUVERTURE_HEURE = 8;
export const FERMETURE_HEURE = 19;

/**
 * Heures de départ proposées pour une durée donnée.
 *
 * On ne propose que les départs dont le retour tombe avant la fermeture :
 * inutile d'offrir 17 h pour quatre heures de location si l'atelier
 * ferme à 19 h, le client ne pourrait pas rendre le vélo.
 */
export function heuresDepartPossibles(dureeHeures: number): number[] {
  const heures: number[] = [];
  for (let h = OUVERTURE_HEURE; h + dureeHeures <= FERMETURE_HEURE; h += 1) heures.push(h);
  return heures;
}

/** « 8 h » ou « 14 h », les minutes ne servent à rien ici. */
export function formatHeure(heure: number): string {
  return `${heure} h`;
}

/**
 * Prochaine date correspondant à un jour de la semaine, au format ISO.
 *
 * Le créneau du jour même n'est proposé que s'il n'a pas encore commencé :
 * réserver un départ à 8 h alors qu'il est 10 h n'aurait aucun sens.
 */
export function prochaineDatePour(
  jourSemaine: number,
  heureDebut: number,
  maintenant = new Date(),
): string {
  // Le jour et l'heure se lisent au Bénin, pas sur l'horloge du serveur,
  // qui tourne en UTC : à 8 h 30 à Cotonou, il n'est que 7 h 30 pour lui,
  // et le départ de 8 h, déjà parti, aurait encore été proposé.
  const ici = heureAuBenin(maintenant);
  let ecart = (jourSemaine - ici.jourSemaine + 7) % 7;
  if (ecart === 0 && ici.heure >= heureDebut) ecart = 7;
  const date = new Date(Date.parse(`${ici.date}T00:00:00Z`) + ecart * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------- L'heure du Bénin */

/**
 * Décalage du Bénin sur UTC : une heure, toute l'année, sans heure d'été.
 *
 * Les serveurs tournent en UTC. Toute règle qui dépend de l'heure, la
 * fermeture des réservations le soir comme le départ du road trip, doit
 * donc être lue à l'heure de Cotonou, sans quoi elle se déclenche une
 * heure trop tard. Le décalage est écrit en dur plutôt que demandé à la
 * base des fuseaux : il ne change jamais, et toutes les plateformes ne
 * livrent pas cette base complète.
 */
const DECALAGE_BENIN_MS = 60 * 60 * 1000;

/** La date, l'heure et le jour de la semaine qu'il est à Cotonou. */
export function heureAuBenin(maintenant = new Date()) {
  const ici = new Date(maintenant.getTime() + DECALAGE_BENIN_MS);
  return {
    date: ici.toISOString().slice(0, 10),
    heure: ici.getUTCHours(),
    minute: ici.getUTCMinutes(),
    /** 0 = dimanche, 6 = samedi. */
    jourSemaine: ici.getUTCDay(),
  };
}

/* ----------------------------------- Les heures de réservation en ligne */

/**
 * La réservation en ligne est ouverte de 8 h à 22 h, heure du Bénin.
 *
 * À partir de 22 h, plus aucune réservation n'est prise, jusqu'au
 * lendemain 8 h, l'heure d'ouverture de l'atelier. L'équipe n'a ainsi
 * jamais à découvrir au réveil une sortie réservée dans la nuit pour le
 * matin même, sans avoir pu préparer le vélo, les cocos ni le
 * coordinateur.
 *
 * La règle est appliquée par le serveur, qui refuse toute réservation
 * hors de ces heures : masquer le bouton ne suffirait pas, une page
 * restée ouverte ou un appel direct passeraient outre. Le site, lui,
 * prévient avant qu'on remplisse quoi que ce soit.
 *
 * Seules les nouvelles réservations sont concernées. Un client qui a
 * réservé à 21 h 50 peut terminer son paiement après 22 h : son vélo est
 * déjà retenu, et le lui refuser n'aurait aucun sens.
 */
export const OUVERTURE_RESERVATIONS_HEURE = 8;
export const FERMETURE_RESERVATIONS_HEURE = 22;

/** La réservation en ligne est-elle ouverte en ce moment ? */
export function reservationsOuvertes(maintenant = new Date()): boolean {
  const { heure } = heureAuBenin(maintenant);
  return heure >= OUVERTURE_RESERVATIONS_HEURE && heure < FERMETURE_RESERVATIONS_HEURE;
}

/** Quand la réservation rouvre, en toutes lettres : « demain à 8 h ». */
export function reouvertureReservations(maintenant = new Date()): string {
  const { heure } = heureAuBenin(maintenant);
  const quand = heure >= FERMETURE_RESERVATIONS_HEURE ? "demain" : "ce matin";
  return `${quand} à ${formatHeure(OUVERTURE_RESERVATIONS_HEURE)}`;
}

/** Le créneau, prêt à afficher : jour, date réelle et horaire. */
export function creneauxDisponibles(maintenant = new Date()) {
  return CRENEAUX_ROAD_TRIP.map((creneau) => ({
    ...creneau,
    date: prochaineDatePour(creneau.jourSemaine, creneau.heureDebut, maintenant),
  }));
}

/**
 * Ce panier a-t-il dépassé son délai de paiement ?
 *
 * Écrit ici, au plus près du délai, et non recopié dans chaque appelant :
 * la page de suivi et la confirmation de paiement doivent répondre
 * exactement la même chose, sans quoi l'une proposerait de payer un vélo
 * que l'autre considère déjà reparti.
 */
export function panierExpire(creeLe: string, maintenant = Date.now()): boolean {
  return maintenant - new Date(creeLe).getTime() > EXPIRATION_PANIER_MINUTES * 60_000;
}
