/**
 * Contenu du catalogue : parc de vélos, points de départ, options et
 * règles de tarification.
 *
 * Ce fichier alimente le mode démo (site navigable sans base de données)
 * et sert de jeu de départ au `prisma/seed.ts` pour l'installation réelle.
 */

import type { OptionLocation, PointDeRetrait, Velo } from "@/lib/types";

export const pointsDeRetrait: PointDeRetrait[] = [
  {
    id: "pt-cotonou",
    nom: "Atelier Route des Pêches",
    ville: "Cotonou",
    adresse: "Route des Pêches, Fidjrossè, Cotonou",
    horaires: "Actuellement 2 créneaux de sortie par semaine — horaires confirmés par téléphone",
    actif: true,
  },
  // Points « à venir » avec l'ouverture des road trips longue distance :
  // conservés en base (historique, seed) mais masqués du site tant qu'ils
  // ne sont pas réellement exploités, plutôt que supprimés.
  {
    id: "pt-ouidah",
    nom: "Relais Route des Pêches",
    ville: "Ouidah",
    adresse: "Boulevard de la Plage, face au marché de Kpassè",
    horaires: "Tous les jours, 8 h – 18 h",
    actif: false,
  },
  {
    id: "pt-natitingou",
    nom: "Base Atacora",
    ville: "Natitingou",
    adresse: "Quartier Yimporima, route de Boukoumbé",
    horaires: "Lun – sam, 7 h 30 – 18 h",
    actif: false,
  },
];

/** Équipement livré avec chaque vélo, quel que soit le modèle. */
const equipementCommun = [
  "Un coordinateur qui encadre la sortie",
  "Casque à votre taille",
  "Antivol U + câble",
  "Kit de réparation et pompe",
  "Porte-bidon et gourde 750 ml",
  "Eau de coco offerte au départ",
];

export const velos: Velo[] = [
  {
    id: "velo-atacora",
    slug: "atacora-randonneur",
    photo: "/images/hannah-carr-I079C4gOe8s-unsplash.jpg",
    nom: "Atacora",
    categorie: "RANDONNEUR",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Le vélo de voyage qui avale les longues journées",
    description:
      "Cadre acier chromoly, géométrie confortable et porte-bagages avant et arrière : l'Atacora est pensé pour les itinérances de plusieurs jours, chargé de sacoches, sur bitume comme sur latérite tassée. Sa position de conduite redressée épargne le dos sur les étapes de six heures.",
    poidsKg: 14.8,
    vitesses: 27,
    chargeMaxKg: 140,
    autonomieConseilleeKm: 95,
    equipementInclus: [...equipementCommun, "Deux sacoches arrière étanches 20 L", "Éclairage avant et arrière"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.8,
    nombreAvis: 34,
    teintes: ["#f25c05", "#e0dcd3"],
  },
  {
    id: "velo-oueme",
    slug: "oueme-randonneur",
    photo: "/images/coen-van-de-broek-OFyh9TpMyM8-unsplash.jpg",
    nom: "Ouémé",
    categorie: "RANDONNEUR",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Même ADN que l'Atacora, en taille médium",
    description:
      "La version M de notre randonneur maison, montée avec un cintre papillon pour multiplier les positions de main. Idéale pour les gabarits de 1,62 m à 1,76 m qui partent une semaine sur les pistes du Sud.",
    poidsKg: 14.2,
    vitesses: 27,
    chargeMaxKg: 130,
    autonomieConseilleeKm: 90,
    equipementInclus: [...equipementCommun, "Deux sacoches arrière étanches 20 L", "Cintre papillon"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.7,
    nombreAvis: 21,
    teintes: ["#c44a04", "#f2efe9"],
  },
  {
    id: "velo-pendjari",
    slug: "pendjari-gravel",
    nom: "Pendjari",
    categorie: "GRAVEL",
    taille: "L",
    accroche: "Rapide sur route, à l'aise sur la piste",
    description:
      "Un gravel en aluminium hydroformé, pneus de 45 mm et cintre flare : le compromis exact entre la vitesse d'un vélo de route et la tolérance d'un VTT. C'est le vélo que nous prenons nous-mêmes pour rejoindre la Pendjari depuis Natitingou.",
    poidsKg: 10.4,
    vitesses: 22,
    chargeMaxKg: 115,
    autonomieConseilleeKm: 130,
    equipementInclus: [...equipementCommun, "Sacoche de cadre 6 L", "Compteur GPS"],
    statut: "DISPONIBLE",
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.9,
    nombreAvis: 27,
    teintes: ["#1f6f5c", "#e0dcd3"],
  },
  {
    id: "velo-tanougou",
    slug: "tanougou-gravel",
    photo: "/images/kirsten-frank-EWdxx8m1uh4-unsplash.jpg",
    nom: "Tanougou",
    categorie: "GRAVEL",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le gravel taille M, monté tubeless",
    description:
      "Monté en tubeless pour encaisser les épines et les pistes caillouteuses sans crevaison. Transmission mono-plateau, simple à gérer quand on découvre le gravel : une seule manette, onze développements.",
    poidsKg: 10.1,
    vitesses: 11,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 120,
    equipementInclus: [...equipementCommun, "Sacoche de cadre 6 L", "Mèches tubeless de secours"],
    // Réaffecté à Cotonou : contrairement au Pendjari, sa description ne
    // dépend pas géographiquement de Natitingou.
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.6,
    nombreAvis: 18,
    teintes: ["#268a72", "#f2efe9"],
  },
  {
    id: "velo-cotonou",
    slug: "cotonou-vtc",
    photo: "/images/micke-lindstrom-Vz4O-jhHvfk-unsplash.jpg",
    nom: "Cotonou",
    categorie: "VTC",
    taille: "S",
    statut: "DISPONIBLE",
    accroche: "Le polyvalent pour la ville et les premiers kilomètres",
    description:
      "Cadre bas, garde-boue intégraux et panier avant : le vélo à prendre pour une première journée d'exploration, du marché Dantokpa à la Route des Pêches. Simple, léger, increvable.",
    poidsKg: 13.1,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 55,
    equipementInclus: [...equipementCommun, "Panier avant", "Garde-boue intégraux"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.5,
    nombreAvis: 29,
    teintes: ["#6b6b6b", "#f2efe9"],
  },
  {
    id: "velo-abomey",
    slug: "abomey-vtc",
    photo: "/images/streetsh-vZAk_n9Plfc-unsplash.jpg",
    nom: "Abomey",
    categorie: "VTC",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Confortable, increvable, sans entretien",
    description:
      "Moyeu à vitesses intégrées et courroie au lieu d'une chaîne : rien à graisser, rien à dérailler. Le vélo que nous conseillons aux groupes qui veulent rouler sans se soucier de la mécanique.",
    poidsKg: 13.9,
    vitesses: 8,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 60,
    equipementInclus: [...equipementCommun, "Transmission par courroie", "Béquille double"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.6,
    nombreAvis: 23,
    teintes: ["#6b6b6b", "#e0dcd3"],
  },
  {
    id: "velo-tandem",
    slug: "tandem-route-des-peches",
    nom: "Tandem Route des Pêches",
    categorie: "TANDEM",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Deux personnes, un seul vélo, beaucoup de souvenirs",
    description:
      "Un tandem robuste pour rouler à deux au même rythme. Très demandé sur la piste littorale entre Cotonou et Ouidah : plat, roulant, et personne ne se retrouve à attendre l'autre au sommet d'une côte.",
    poidsKg: 22.4,
    vitesses: 24,
    chargeMaxKg: 190,
    autonomieConseilleeKm: 75,
    equipementInclus: [...equipementCommun, "Deuxième casque", "Porte-bagages renforcé"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.7,
    nombreAvis: 12,
    teintes: ["#f25c05", "#f2efe9"],
  },
];

/**
 * Options payantes : volontairement aucune.
 *
 * Le prix ne doit avoir que deux formes possibles — le forfait du road
 * trip et la grille horaire de la location libre. Les anciennes options
 * (sacoches, compteur GPS, assurance, transfert) introduisaient des
 * montants en dehors de ces deux grilles et ont ete retirees.
 *
 * La plomberie est conservee (modele Prisma, champ `options` du devis) :
 * rajouter une option se fait en ajoutant une entree ici, sans toucher
 * au reste du code.
 */
export const optionsLocation: OptionLocation[] = [];




export const libellesCategorie: Record<Velo["categorie"], string> = {
  RANDONNEUR: "Randonneur",
  GRAVEL: "Gravel",
  VAE: "Assistance électrique",
  VTC: "Tout chemin",
  TANDEM: "Tandem",
};

export const libellesTaille: Record<Velo["taille"], string> = {
  S: "S — 1,55 à 1,68 m",
  M: "M — 1,65 à 1,78 m",
  L: "L — 1,75 à 1,88 m",
  XL: "XL — 1,86 à 1,98 m",
};

export const libellesStatut: Record<Velo["statut"], string> = {
  DISPONIBLE: "Disponible",
  EN_LOCATION: "En location",
  MAINTENANCE: "En entretien",
  RETIRE: "Retiré du parc",
};
