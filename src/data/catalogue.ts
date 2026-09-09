/**
 * Contenu du catalogue : parc de vélos, points de retrait, options et
 * règles de tarification.
 *
 * Ce fichier alimente le mode démo (site navigable sans base de données)
 * et sert de jeu de départ au `prisma/seed.ts` pour l'installation réelle.
 */

import type { OptionLocation, PointDeRetrait, ReglePrix, Velo } from "@/lib/types";

export const pointsDeRetrait: PointDeRetrait[] = [
  {
    id: "pt-cotonou",
    nom: "Atelier Haie Vive",
    ville: "Cotonou",
    adresse: "Carré 1204, rue 12.34, Haie Vive",
    horaires: "Lun – sam, 8 h – 19 h",
    actif: true,
  },
  {
    id: "pt-ouidah",
    nom: "Relais Route des Pêches",
    ville: "Ouidah",
    adresse: "Boulevard de la Plage, face au marché de Kpassè",
    horaires: "Tous les jours, 8 h – 18 h",
    actif: true,
  },
  {
    id: "pt-natitingou",
    nom: "Base Atacora",
    ville: "Natitingou",
    adresse: "Quartier Yimporima, route de Boukoumbé",
    horaires: "Lun – sam, 7 h 30 – 18 h",
    actif: true,
  },
];

/** Équipement livré avec chaque vélo, quel que soit le modèle. */
const equipementCommun = [
  "Casque à votre taille",
  "Antivol U + câble",
  "Kit de réparation et pompe",
  "Porte-bidon et gourde 750 ml",
];

export const velos: Velo[] = [
  {
    id: "velo-atacora",
    slug: "atacora-randonneur",
    nom: "Atacora",
    categorie: "RANDONNEUR",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Le vélo de voyage qui avale les longues journées",
    description:
      "Cadre acier chromoly, géométrie confortable et porte-bagages avant et arrière : l'Atacora est pensé pour les itinérances de plusieurs jours, chargé de sacoches, sur bitume comme sur latérite tassée. Sa position de conduite redressée épargne le dos sur les étapes de six heures.",
    prixJourXof: 9500,
    cautionXof: 60000,
    poidsKg: 14.8,
    vitesses: 27,
    chargeMaxKg: 140,
    autonomieConseilleeKm: 95,
    equipementInclus: [...equipementCommun, "Deux sacoches arrière étanches 20 L", "Éclairage avant et arrière"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.8,
    nombreAvis: 34,
    teintes: ["#c75c34", "#f0e5d6"],
  },
  {
    id: "velo-oueme",
    slug: "oueme-randonneur",
    nom: "Ouémé",
    categorie: "RANDONNEUR",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Même ADN que l'Atacora, en taille médium",
    description:
      "La version M de notre randonneur maison, montée avec un cintre papillon pour multiplier les positions de main. Idéale pour les gabarits de 1,62 m à 1,76 m qui partent une semaine sur les pistes du Sud.",
    prixJourXof: 9000,
    cautionXof: 60000,
    poidsKg: 14.2,
    vitesses: 27,
    chargeMaxKg: 130,
    autonomieConseilleeKm: 90,
    equipementInclus: [...equipementCommun, "Deux sacoches arrière étanches 20 L", "Cintre papillon"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.7,
    nombreAvis: 21,
    teintes: ["#b04726", "#f8f2e9"],
  },
  {
    id: "velo-pendjari",
    slug: "pendjari-gravel",
    nom: "Pendjari",
    categorie: "GRAVEL",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Rapide sur route, à l'aise sur la piste",
    description:
      "Un gravel en aluminium hydroformé, pneus de 45 mm et cintre flare : le compromis exact entre la vitesse d'un vélo de route et la tolérance d'un VTT. C'est le vélo que nous prenons nous-mêmes pour rejoindre la Pendjari depuis Natitingou.",
    prixJourXof: 11000,
    cautionXof: 80000,
    poidsKg: 10.4,
    vitesses: 22,
    chargeMaxKg: 115,
    autonomieConseilleeKm: 130,
    equipementInclus: [...equipementCommun, "Sacoche de cadre 6 L", "Compteur GPS"],
    pointDeRetraitId: "pt-natitingou",
    noteMoyenne: 4.9,
    nombreAvis: 27,
    teintes: ["#4e6630", "#e8eddd"],
  },
  {
    id: "velo-tanougou",
    slug: "tanougou-gravel",
    nom: "Tanougou",
    categorie: "GRAVEL",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le gravel taille M, monté tubeless",
    description:
      "Monté en tubeless pour encaisser les épines et les pistes caillouteuses sans crevaison. Transmission mono-plateau, simple à gérer quand on découvre le gravel : une seule manette, onze développements.",
    prixJourXof: 11000,
    cautionXof: 80000,
    poidsKg: 10.1,
    vitesses: 11,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 120,
    equipementInclus: [...equipementCommun, "Sacoche de cadre 6 L", "Mèches tubeless de secours"],
    pointDeRetraitId: "pt-natitingou",
    noteMoyenne: 4.6,
    nombreAvis: 18,
    teintes: ["#67813f", "#f5f7f0"],
  },
  {
    id: "velo-ganvie",
    slug: "ganvie-electrique",
    nom: "Ganvié",
    categorie: "VAE",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "750 W d'assistance, 80 km d'autonomie réelle",
    description:
      "Notre vélo à assistance électrique le plus polyvalent. Moteur pédalier 750 W, batterie 630 Wh amovible et console couleur : de quoi enchaîner les kilomètres même avec du vent de face sur la côte, ou emmener quelqu'un qui ne roule pas souvent sans le laisser derrière.",
    prixJourXof: 16500,
    cautionXof: 150000,
    poidsKg: 24.6,
    vitesses: 10,
    chargeMaxKg: 150,
    autonomieConseilleeKm: 80,
    autonomieAssistanceKm: 80,
    moteurWatts: 750,
    batterieWh: 630,
    equipementInclus: [
      ...equipementCommun,
      "Chargeur rapide 4 h",
      "Console couleur avec autonomie restante",
      "Deuxième batterie sur demande",
    ],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.9,
    nombreAvis: 42,
    teintes: ["#e2971d", "#fdf5f1"],
  },
  {
    id: "velo-somba",
    slug: "somba-electrique",
    nom: "Somba",
    categorie: "VAE",
    taille: "L",
    statut: "MAINTENANCE",
    accroche: "Le VAE des reliefs de l'Atacora",
    description:
      "Développements courts et couple élevé pour grimper vers Boukoumbé sans souffrir. Freins hydrauliques quatre pistons, pneus 2,2 pouces : il descend aussi bien qu'il monte.",
    prixJourXof: 17500,
    cautionXof: 150000,
    poidsKg: 25.8,
    vitesses: 12,
    chargeMaxKg: 150,
    autonomieConseilleeKm: 70,
    autonomieAssistanceKm: 70,
    moteurWatts: 750,
    batterieWh: 720,
    equipementInclus: [...equipementCommun, "Chargeur rapide 4 h", "Sacoches latérales 2 × 25 L"],
    pointDeRetraitId: "pt-natitingou",
    noteMoyenne: 4.8,
    nombreAvis: 16,
    teintes: ["#90371f", "#f9e6dc"],
  },
  {
    id: "velo-cotonou",
    slug: "cotonou-vtc",
    nom: "Cotonou",
    categorie: "VTC",
    taille: "S",
    statut: "DISPONIBLE",
    accroche: "Le polyvalent pour la ville et les premiers kilomètres",
    description:
      "Cadre bas, garde-boue intégraux et panier avant : le vélo à prendre pour une première journée d'exploration, du marché Dantokpa à la Route des Pêches. Simple, léger, increvable.",
    prixJourXof: 7000,
    cautionXof: 40000,
    poidsKg: 13.1,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 55,
    equipementInclus: [...equipementCommun, "Panier avant", "Garde-boue intégraux"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.5,
    nombreAvis: 29,
    teintes: ["#d0b998", "#fdfbf7"],
  },
  {
    id: "velo-abomey",
    slug: "abomey-vtc",
    nom: "Abomey",
    categorie: "VTC",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Confortable, increvable, sans entretien",
    description:
      "Moyeu à vitesses intégrées et courroie au lieu d'une chaîne : rien à graisser, rien à dérailler. Le vélo que nous conseillons aux groupes qui veulent rouler sans se soucier de la mécanique.",
    prixJourXof: 7500,
    cautionXof: 40000,
    poidsKg: 13.9,
    vitesses: 8,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 60,
    equipementInclus: [...equipementCommun, "Transmission par courroie", "Béquille double"],
    pointDeRetraitId: "pt-ouidah",
    noteMoyenne: 4.6,
    nombreAvis: 23,
    teintes: ["#b89b73", "#f8f2e9"],
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
    prixJourXof: 15000,
    cautionXof: 100000,
    poidsKg: 22.4,
    vitesses: 24,
    chargeMaxKg: 190,
    autonomieConseilleeKm: 75,
    equipementInclus: [...equipementCommun, "Deuxième casque", "Porte-bagages renforcé"],
    pointDeRetraitId: "pt-ouidah",
    noteMoyenne: 4.7,
    nombreAvis: 12,
    teintes: ["#c07813", "#f0e5d6"],
  },
];

export const optionsLocation: OptionLocation[] = [
  {
    code: "sacoches",
    libelle: "Paire de sacoches étanches 20 L",
    description: "En plus de celles déjà montées, pour partir chargé sur plusieurs jours.",
    prixXof: 1500,
    unite: "jour",
    quantifiable: false,
  },
  {
    code: "assurance",
    libelle: "Assurance sérénité",
    description: "Casse, vol avec effraction et assistance dépannage : la caution n'est plus engagée.",
    prixXof: 2500,
    unite: "jour",
    quantifiable: false,
  },
  {
    code: "gps",
    libelle: "Compteur GPS avec traces préchargées",
    description: "Nos itinéraires déjà chargés dans l'appareil, avec les points d'eau.",
    prixXof: 2000,
    unite: "jour",
    quantifiable: false,
  },
  {
    code: "transfert",
    libelle: "Transfert du vélo vers un autre point",
    description: "Vous partez de Cotonou et rendez le vélo à Ouidah ou Natitingou.",
    prixXof: 12000,
    unite: "location",
    quantifiable: false,
  },
  {
    code: "accompagnement",
    libelle: "Guide accompagnateur",
    description: "Un guide cycliste qui connaît les pistes, à la journée.",
    prixXof: 25000,
    unite: "jour",
    quantifiable: true,
  },
];

/**
 * Remises appliquées automatiquement selon la durée (§2.2).
 * La règle retenue est celle dont la plage contient le nombre de jours ;
 * elles ne se cumulent pas.
 */
export const reglesPrix: ReglePrix[] = [
  { id: "rp-court", libelle: "Location courte", minJours: 1, maxJours: 2, remisePourcent: 0 },
  { id: "rp-weekend", libelle: "Forfait 3 jours et plus", minJours: 3, maxJours: 6, remisePourcent: 8 },
  { id: "rp-semaine", libelle: "Forfait semaine", minJours: 7, maxJours: 13, remisePourcent: 15 },
  { id: "rp-grand-raid", libelle: "Forfait grand raid", minJours: 14, maxJours: null, remisePourcent: 22 },
];

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
