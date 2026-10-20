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

import {
  creneauOctobreRose,
  formatHoraire,
  OCTOBRE_ROSE,
  texteOffertOctobreRose,
  type SortieOctobreRose,
} from "@/data/octobre-rose";
import { DECALAGE_BENIN_MS } from "@/lib/dates";
import type { CodeOffre } from "@/lib/types";

export type { CodeOffre };

/** L'espace insécable de la typographie française, avant « : ». */
const INSECABLE = String.fromCharCode(0xa0);

/**
 * Les trois gammes de vélos.
 *
 * Le prix dépend désormais de la machine, et non plus seulement de la
 * formule : c'est le modèle de la plaquette tarifaire de Bike Land. Un
 * VTT tout-suspendu à double frein à disque ne se loue pas au prix d'un
 * VTT rigide à sept vitesses, et le client comprend très bien pourquoi.
 */
export type GammeVelo = "CLASSIQUE" | "PREMIUM" | "PRESTIGE";

export const GAMMES: {
  code: GammeVelo;
  nom: string;
  description: string;
  /** Ce qu'on trouve dans la gamme, en quelques mots. */
  machine: string;
  /** À qui elle s'adresse. */
  pourQui: string;
}[] = [
  {
    code: "CLASSIQUE",
    nom: "Classique",
    description:
      "Le parc de tous les jours : du VTT dame au tout-suspendu, de quoi rouler la route des Pêches sans se poser de question.",
    machine: "Du VTT dame au tout-suspendu",
    pourQui: "Une première sortie, une balade, un budget tenu.",
  },
  {
    code: "PREMIUM",
    nom: "Premium",
    description:
      "Des machines de marque (Northpoint, Mongoose, Muddyfox, Raleigh), mieux finies et plus confortables sur la distance.",
    machine: "Marques reconnues, meilleures finitions",
    pourQui: "Rouler plus longtemps, plus confortablement.",
  },
  {
    code: "PRESTIGE",
    nom: "Prestige",
    description:
      "Une seule machine, la plus aboutie du parc : cadre acier haute résistance, double frein à disque, jantes bâton magnésium.",
    machine: "Acier haute résistance, double disque, jantes bâton",
    pourQui: "La plus belle machine du parc, quand elle est libre.",
  },
];

/**
 * La gamme que les clients prennent le plus : le Premium, d'après
 * l'exploitant. Le site la signale « Le plus pris » partout où les gammes
 * se comparent, et sur chacun de ses vélos au catalogue.
 */
export const GAMME_LA_PLUS_PRISE: GammeVelo = "PREMIUM";

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

/**
 * Les frais du paiement en ligne, compris dans chaque tarif du site : par
 * location libre, et par personne en road trip.
 *
 * La plaquette annonce 1 000 F l'heure en Classique et 2 500 F le road
 * trip ; le site affiche 1 125 F et 2 625 F, ces 125 F couvrant les frais
 * de l'agrégateur Mobile Money. Une vente réglée en espèces au comptoir ne
 * passe pas par lui : elle se fait au prix de la plaquette, sans ces frais.
 * C'est ce que pratique l'exploitant au point de départ.
 */
export const FRAIS_PAIEMENT_EN_LIGNE_XOF = 125;

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
  // Ce qui vaut pour toutes les sorties de la campagne. Une sortie connue
  // donne en plus ses heures : `exigencesOctobreRose(sortie)`.
  "octobre-rose": exigencesOctobreRose(null),
};

/**
 * Ce que le participant doit savoir d'une sortie Octobre rose : la tenue,
 * l'heure du rassemblement, ce qui est fourni et offert. Sans sortie (une
 * inscription d'une campagne passée), les mêmes consignes, sans les heures.
 */
export function exigencesOctobreRose(sortie: SortieOctobreRose | null): string[] {
  const tenue = sortie?.tenue ?? OCTOBRE_ROSE.sorties[0]?.tenue ?? "Tout le monde en rose";
  return [
    `Dress code${INSECABLE}: ${tenue.charAt(0).toLowerCase()}${tenue.slice(1)}.`,
    sortie
      ? `Être au point de départ à ${formatHoraire(sortie.rassemblement)}, l'heure du rassemblement${INSECABLE}: ` +
        `le groupe part à ${formatHoraire(sortie.depart)}, à l'heure.`
      : `Être au point de départ à l'heure du rassemblement${INSECABLE}: le groupe part à l'heure.`,
    `Rien d'autre à apporter${INSECABLE}: vélo et casque sont fournis, sans caution. ` +
      `Offerts à chacun${INSECABLE}: ${texteOffertOctobreRose()}.`,
  ];
}

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
      "Vous prenez le vélo et vous roulez où vous voulez, à votre rythme. De une à quatre heures. Pièce d'identité et engagement signé demandés au départ.",
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
 *
 * `produit` nomme le créneau quand il est vendu sous son propre nom : le
 * road trip du dimanche est Gbashi bike, avec une séance de sport devant
 * la plage à l'arrivée (voir src/data/produits.ts). Même réservation et
 * même prix que le road trip ; le nom s'affiche à côté du jour.
 * `consigne` s'ajoute alors à ce qu'il faut prévoir, dans le formulaire
 * comme dans les emails.
 */
export const CRENEAUX_ROAD_TRIP = [
  {
    code: "samedi-matin",
    jourSemaine: 6,
    libelle: "Samedi",
    produit: null,
    consigne: null,
    heureDebut: 8,
    heureFin: 11,
    actifParDefaut: true,
  },
  {
    code: "dimanche-matin",
    jourSemaine: 0,
    libelle: "Dimanche",
    produit: "Gbashi bike",
    consigne: "Venir en tenue de sport : à l'arrivée, séance d'exercices et de poids devant la plage.",
    heureDebut: 8,
    heureFin: 11,
    actifParDefaut: false,
  },
] as const;

export type CodeCreneau = (typeof CRENEAUX_ROAD_TRIP)[number]["code"];

/** Le créneau encadré qui part ce jour de la semaine, quelle que soit la date. */
export function creneauDuJour(date: string) {
  const jourSemaine = new Date(`${date}T12:00:00Z`).getUTCDay();
  return CRENEAUX_ROAD_TRIP.find((c) => c.jourSemaine === jourSemaine);
}

/** Le créneau encadré d'un départ : le jour de la semaine et l'heure suffisent. */
export function creneauDuDepart(date: string, heureDebut: number) {
  const creneau = creneauDuJour(date);
  return creneau?.heureDebut === heureDebut ? creneau : undefined;
}

/** Durée d'une sortie encadrée, déduite du créneau lui-même. */
export const DUREE_ROAD_TRIP_HEURES =
  CRENEAUX_ROAD_TRIP[0].heureFin - CRENEAUX_ROAD_TRIP[0].heureDebut;

/** Amplitude d'ouverture de l'atelier, pour la location libre. */
export const OUVERTURE_HEURE = 8;
export const FERMETURE_HEURE = 19;

/**
 * Les heures de la location libre vendue au comptoir, en espèces.
 *
 * Plus larges qu'en ligne : au comptoir, l'exploitant tape lui-même l'heure
 * de départ qu'il veut, à l'heure pleine, et la location libre s'y prend
 * jusqu'à 22 h, le vélo rentré à 22 h au plus tard. La réservation en
 * ligne garde les horaires de l'atelier (OUVERTURE_HEURE, FERMETURE_HEURE).
 */
export const OUVERTURE_COMPTOIR_HEURE = 0;
export const FERMETURE_COMPTOIR_HEURE = 22;

/**
 * Heures de départ proposées pour une durée donnée, et pour un jour
 * quand on le connaît.
 *
 * On ne propose que les départs dont le retour tombe avant la fermeture :
 * inutile d'offrir 17 h pour quatre heures de location si l'atelier
 * ferme à 19 h, le client ne pourrait pas rendre le vélo.
 *
 * Le jour connu, les règles de `motifHoraireLocation` s'ajoutent : pas de
 * location libre pendant le road trip du week-end ni pendant une sortie
 * Octobre rose, ni sur une heure déjà passée le jour même.
 */
export function heuresDepartPossibles(
  dureeHeures: number,
  date?: string,
  maintenant: Date | number = new Date(),
): number[] {
  const heures: number[] = [];
  for (let h = OUVERTURE_HEURE; h + dureeHeures <= FERMETURE_HEURE; h += 1) {
    if (date && motifHoraireLocation(date, h, dureeHeures, maintenant)) continue;
    heures.push(h);
  }
  return heures;
}

/**
 * Les road trips qui partent ce jour-là : 8 h - 11 h le samedi et le
 * dimanche.
 *
 * Ils comptent que leur créneau soit ouvert ou non à la réservation en
 * ligne : un dimanche fermé parce que complet, ses places vendues en
 * espèces, part quand même, et les vélos avec lui.
 */
export function roadTripsDuJour(date: string) {
  const jourSemaine = new Date(`${date}T12:00:00Z`).getUTCDay();
  return CRENEAUX_ROAD_TRIP.filter((creneau) => creneau.jourSemaine === jourSemaine);
}

/**
 * Pourquoi ce départ n'est pas proposé en location libre, ou `null` s'il
 * l'est. Le tunnel s'en sert pour n'afficher que les bonnes heures, le
 * serveur pour refuser les autres.
 *
 *  - Le week-end, de 8 h à 11 h, les vélos sont sur la route avec le
 *    groupe du road trip : aucune location libre ne peut empiéter sur
 *    ces heures. Elle commence donc à 11 h le samedi et le dimanche.
 *  - Le jour d'une sortie Octobre rose, de même pendant la sortie, du
 *    rassemblement au retour des vélos (voir `creneauOctobreRose`) : de
 *    16 h à 18 h ce jour-là. Les autres heures et les autres jours restent
 *    ouverts.
 *  - Le jour même, seules les heures à venir restent : à 15 h, un départ
 *    à 9 h n'a plus de sens, et le client l'aurait payé pour rien.
 */
export function motifHoraireLocation(
  date: string,
  heureDebut: number,
  dureeHeures: number,
  maintenant: Date | number = new Date(),
): string | null {
  const roadTrip = roadTripsDuJour(date).find(
    (creneau) => heureDebut < creneau.heureFin && heureDebut + dureeHeures > creneau.heureDebut,
  );
  if (roadTrip) {
    return (
      `Le ${roadTrip.libelle.toLowerCase()}, de ${formatHeure(roadTrip.heureDebut)} à ` +
      `${formatHeure(roadTrip.heureFin)}, les vélos sont en road trip : la location libre ` +
      `ne peut pas empiéter sur ces heures.`
    );
  }
  // Chaque sortie bloque son seul jour : toutes sont parcourues, ouvrir un
  // jour de plus ne demande rien d'autre que de l'ajouter à la liste.
  const sortie = OCTOBRE_ROSE.sorties.find((candidate) => {
    const creneau = creneauOctobreRose(candidate);
    return (
      creneau.date === date &&
      heureDebut < creneau.heureFin &&
      heureDebut + dureeHeures > creneau.heureDebut
    );
  });
  if (sortie) {
    const creneau = creneauOctobreRose(sortie);
    return (
      `Ce jour-là, de ${formatHeure(creneau.heureDebut)} à ${formatHeure(creneau.heureFin)}, ` +
      `les vélos sont à la sortie Octobre rose (départ ${formatHoraire(sortie.depart)})${INSECABLE}: ` +
      `la location libre ne peut pas empiéter sur ces heures.`
    );
  }
  const ici = heureAuBenin(new Date(maintenant));
  // La date se compare au jour du Bénin : réservée de nuit, juste après
  // minuit, une location de la veille passerait sinon pour celle du jour.
  if (date < ici.date) {
    return "Cette date est déjà passée. Choisissez un autre jour.";
  }
  if (date === ici.date && heureDebut <= ici.heure) {
    return "Cette heure de départ est déjà passée. Choisissez un départ plus tard dans la journée, ou un autre jour.";
  }
  return null;
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
 * La réservation en ligne du road trip est ouverte de 8 h à 22 h, heure
 * du Bénin.
 *
 * À partir de 22 h, plus aucun road trip ne se réserve, jusqu'au
 * lendemain 8 h. Avec la clôture de chaque départ la veille à 22 h (voir
 * `clotureRoadTrip`), l'équipe n'a jamais à découvrir au réveil une
 * sortie réservée dans la nuit pour le matin même, sans avoir pu préparer
 * les vélos, les cocos ni le coordinateur.
 *
 * La location libre, elle, se réserve à toute heure, la nuit comprise :
 * le client choisit son vélo et son heure, et seules les heures à venir
 * lui sont proposées. Rien n'est donc à préparer en urgence.
 *
 * La règle est appliquée par le serveur, qui refuse un road trip hors de
 * ces heures : masquer le bouton ne suffirait pas, une page restée
 * ouverte ou un appel direct passeraient outre. Le site, lui, prévient
 * avant qu'on remplisse quoi que ce soit.
 *
 * Seules les nouvelles réservations sont concernées. Un client qui a
 * réservé à 21 h 50 peut terminer son paiement après 22 h : son vélo est
 * déjà retenu, et le lui refuser n'aurait aucun sens.
 */
export const OUVERTURE_RESERVATIONS_HEURE = 8;
export const FERMETURE_RESERVATIONS_HEURE = 22;

/** La réservation en ligne du road trip est-elle ouverte en ce moment ? */
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
 * Quand la réservation d'un départ de road trip se ferme : la veille à
 * 22 h, heure du Bénin. Le road trip du samedi se ferme le vendredi à
 * 22 h, celui du dimanche le samedi à 22 h, et ainsi chaque semaine,
 * sans que personne ait à y toucher. Rendu en millisecondes UTC, prêt à
 * comparer avec l'heure courante.
 *
 * L'équipe prépare la sortie la veille au soir : les vélos, les cocos,
 * le coordinateur. Une réservation prise dans la nuit pour le matin même
 * arriverait trop tard pour être préparée. Passé la veille 22 h, le site
 * propose le même départ la semaine suivante.
 */
export function clotureRoadTrip(dateDepart: string): number {
  const minuit = Date.parse(`${dateDepart}T00:00:00Z`);
  return minuit - 86_400_000 + FERMETURE_RESERVATIONS_HEURE * 3_600_000 - DECALAGE_BENIN_MS;
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
 * prochaine date qui n'est ni fermée, ni close parce que sa veille 22 h
 * est passée.
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
 * Les départs que l'exploitant a fermés, affichés « Sold out » plutôt que
 * de disparaître du site.
 *
 * Pour chaque créneau, son prochain départ encore dans les délais (avant
 * la veille 22 h), s'il est fermé : le créneau entier depuis le tableau de
 * bord, ou ce jour-là seulement. Fermer, c'est dire que c'est complet ; le
 * client voit la sortie, pleine, au lieu de la croire supprimée. Le
 * suivant, s'il est ouvert, reste proposé par `creneauxDisponibles`.
 *
 * Un départ dont la réservation est close (la veille 22 h passée) n'y
 * figure pas : il n'est pas complet, il est parti.
 */
export function departsComplets(
  maintenant = new Date(),
  ouverture: OuvertureCreneaux = OUVERTURE_PAR_DEFAUT,
) {
  return CRENEAUX_ROAD_TRIP.flatMap((creneau) => {
    let date = prochaineDatePour(creneau.jourSemaine, creneau.heureDebut, maintenant);
    if (maintenant.getTime() >= clotureRoadTrip(date)) {
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    }
    const ferme =
      !ouverture.creneauxActifs.has(creneau.code) ||
      estJourFerme(ouverture.joursFermes, date, "road-trip");
    return ferme ? [{ ...creneau, date }] : [];
  });
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
