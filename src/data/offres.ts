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

import { DECALAGE_BENIN_MS } from "@/lib/dates";
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
 * Les créneaux du road trip.
 *
 * `actifParDefaut` dit si le créneau est proposé tant que personne n'y a
 * touché. L'exploitant ouvre et ferme ensuite chaque créneau depuis le
 * tableau de bord, sans passer par le code : le dimanche est aujourd'hui
 * fermé parce qu'il est complet, des places ayant été vendues en espèces
 * avant l'ouverture du site, et il se rouvrira d'un clic.
 *
 * La sortie est encadrée : elle part à heure fixe, en groupe, avec un
 * coordinateur. Il n'y a donc rien à choisir d'autre que le jour, d'où
 * l'absence de calendrier sur cette formule, contrairement à la location
 * libre où le client dispose du vélo comme il l'entend.
 *
 * `jourSemaine` suit la convention de JavaScript : 0 = dimanche, 6 = samedi.
 */
export const CRENEAUX_ROAD_TRIP = [
  {
    code: "samedi-matin",
    jourSemaine: 6,
    libelle: "Samedi",
    heureDebut: 8,
    heureFin: 11,
    actifParDefaut: true,
  },
  {
    code: "dimanche-matin",
    jourSemaine: 0,
    libelle: "Dimanche",
    heureDebut: 8,
    heureFin: 11,
    actifParDefaut: false,
  },
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

/*
 * Toute règle qui dépend de l'heure, la fermeture des réservations le soir
 * comme le départ du road trip, se lit à l'heure de Cotonou, sans quoi
 * elle se déclencherait une heure trop tard. Le décalage est défini dans
 * src/lib/dates.ts.
 */

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

/** Ce qu'il faut savoir des réglages pour proposer les départs. */
export interface OuvertureCreneaux {
  /** Codes des créneaux ouverts. */
  creneauxActifs: ReadonlySet<string>;
  joursFermes: readonly { date: string; formule: string }[];
}

/** Les réglages quand personne n'y a touché. */
export const OUVERTURE_PAR_DEFAUT: OuvertureCreneaux = {
  creneauxActifs: new Set(CRENEAUX_ROAD_TRIP.filter((c) => c.actifParDefaut).map((c) => c.code)),
  joursFermes: [],
};

/**
 * Quand la réservation d'un départ de road trip se ferme : le vendredi à
 * 22 h qui précède son week-end, heure du Bénin. Rendu en millisecondes
 * UTC, prêt à comparer avec l'heure courante.
 *
 * L'équipe prépare le week-end le vendredi soir : les vélos, les cocos,
 * le coordinateur. Une sortie réservée le samedi pour le dimanche, ou la
 * nuit pour le matin même, arrivait trop tard pour être préparée. À
 * partir du vendredi 22 h, le site propose donc le week-end suivant.
 */
export function clotureRoadTrip(dateDepart: string): number {
  const minuit = Date.parse(`${dateDepart}T00:00:00Z`);
  const jourSemaine = new Date(minuit).getUTCDay();
  // Jours écoulés depuis le vendredi précédent : 1 pour un samedi, 2 pour
  // un dimanche. Un départ le vendredi même ferme le jour même à 22 h.
  const recul = (jourSemaine - 5 + 7) % 7;
  return (
    minuit -
    recul * 86_400_000 +
    FERMETURE_RESERVATIONS_HEURE * 3_600_000 -
    DECALAGE_BENIN_MS
  );
}

/** Ce jour est-il fermé à cette formule ? */
export function estJourFerme(
  joursFermes: OuvertureCreneaux["joursFermes"],
  date: string,
  formule: "road-trip" | "location-libre",
): boolean {
  return joursFermes.some((j) => j.date === date && (j.formule === formule || j.formule === "toutes"));
}

/**
 * Les départs de road trip à proposer : un par créneau ouvert, à la
 * prochaine date qui n'est ni fermée, ni close parce que le vendredi
 * 22 h qui la précède est passé.
 *
 * Un samedi complet ne fait pas disparaître le road trip du site : on
 * propose le samedi suivant. On cherche jusqu'à douze semaines, au-delà
 * de quoi le créneau n'est simplement pas proposé.
 */
export function creneauxDisponibles(
  maintenant = new Date(),
  ouverture: OuvertureCreneaux = OUVERTURE_PAR_DEFAUT,
) {
  return CRENEAUX_ROAD_TRIP.filter((creneau) => ouverture.creneauxActifs.has(creneau.code)).flatMap(
    (creneau) => {
      let date = prochaineDatePour(creneau.jourSemaine, creneau.heureDebut, maintenant);
      for (let semaine = 0; semaine < 12; semaine += 1) {
        const encoreOuvert = maintenant.getTime() < clotureRoadTrip(date);
        if (encoreOuvert && !estJourFerme(ouverture.joursFermes, date, "road-trip")) {
          return [{ ...creneau, date }];
        }
        date = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
      }
      return [];
    },
  );
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
