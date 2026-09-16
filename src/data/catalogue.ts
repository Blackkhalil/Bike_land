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
    photo: "/images/IMG_6168.PNG",
    nom: "Atacora",
    categorie: "RANDONNEUR",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Le tout-suspendu noir, confortable sur les pistes défoncées",
    description:
      "VTT tout-suspendu : une suspension à l'avant et une à l'arrière, qui encaissent les nids-de-poule et les racines de la piste littorale sans vous secouer. Freins à disque aux deux roues, pneus larges à crampons, garde-boue avant et arrière pour rouler après la pluie. C'est le vélo à prendre si le confort passe avant tout.",
    poidsKg: 16.5,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 40,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.8,
    nombreAvis: 34,
    teintes: ["#f25c05", "#e0dcd3"],
  },
  {
    id: "velo-oueme",
    slug: "oueme-randonneur",
    photo: "/images/IMG_6169.PNG",
    nom: "Ouémé",
    categorie: "RANDONNEUR",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Bordeaux et noir, nerveux et simple à vivre",
    description:
      "VTT semi-rigide : suspension à l'avant seulement, cadre rigide à l'arrière. Résultat, il avance mieux que le tout-suspendu dès que la piste est roulante, et il demande moins d'entretien. Garde-boue aux deux roues, béquille, poignées vertes pour le reconnaître de loin.",
    poidsKg: 14.5,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant", "Béquille"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.7,
    nombreAvis: 21,
    teintes: ["#c44a04", "#f2efe9"],
  },
  {
    id: "velo-pendjari",
    slug: "pendjari-gravel",
    photo: "/images/IMG_6170.PNG",
    nom: "Pendjari",
    categorie: "GRAVEL",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Rouge et jaune, celui qu'on repère sur toutes les photos",
    description:
      "VTT tout-suspendu, en rouge et jaune : impossible à confondre, et c'est souvent celui qu'on réserve pour les photos de sortie. Suspension avant et arrière, freins à disque, pneus à crampons larges. Aussi confortable que l'Atacora, avec une position un peu plus relevée.",
    poidsKg: 16.8,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 40,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.9,
    nombreAvis: 27,
    teintes: ["#1f6f5c", "#e0dcd3"],
  },
  {
    id: "velo-tanougou",
    slug: "tanougou-gravel",
    photo: "/images/IMG_6171.PNG",
    nom: "Tanougou",
    categorie: "GRAVEL",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le jaune, taille moyenne, tout-suspendu",
    description:
      "Même châssis tout-suspendu que le Pendjari, en jaune et en taille moyenne : il convient aux gabarits autour d'1,70 m. Suspension aux deux extrémités, freins à disque, garde-boue et béquille. Le bon choix pour une première sortie sur la route des Pêches.",
    poidsKg: 16.2,
    vitesses: 21,
    chargeMaxKg: 105,
    autonomieConseilleeKm: 40,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Béquille"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.6,
    nombreAvis: 18,
    teintes: ["#268a72", "#f2efe9"],
  },
  {
    id: "velo-cotonou",
    slug: "cotonou-vtc",
    photo: "/images/IMG_6172.PNG",
    nom: "Cotonou",
    categorie: "VTC",
    taille: "S",
    statut: "DISPONIBLE",
    accroche: "Noir et bleu, léger, parfait pour débuter",
    description:
      "VTT semi-rigide léger, en noir et bleu. Sans suspension arrière, il est plus facile à relancer et plus simple à entretenir : c'est le vélo que nous conseillons pour une première heure de location libre. Garde-boue aux deux roues, porte-bidon sur le cadre.",
    poidsKg: 14.0,
    vitesses: 21,
    chargeMaxKg: 100,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant", "Porte-bidon sur le cadre"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.5,
    nombreAvis: 29,
    teintes: ["#6b6b6b", "#f2efe9"],
  },
  {
    id: "velo-abomey",
    slug: "abomey-vtc",
    photo: "/images/IMG_6173.PNG",
    nom: "Abomey",
    categorie: "VTC",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Semi-rigide, guidon large, freins à disque",
    description:
      "VTT semi-rigide à guidon large, qui donne une conduite stable et rassurante quand on n'a pas roulé depuis longtemps. Freins à disque aux deux roues, suspension avant, pneus à crampons. Un vélo sans histoire, taillé pour les sorties en groupe.",
    poidsKg: 14.8,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 4.6,
    nombreAvis: 23,
    teintes: ["#6b6b6b", "#e0dcd3"],
  },
  {
    id: "velo-tandem",
    slug: "tandem-route-des-peches",
    photo: "/images/IMG_6174.PNG",
    nom: "Fidjrossè",
    categorie: "VTC",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Noir et vert, le plus grand du parc",
    description:
      "VTT semi-rigide en grande taille, noir et vert : celui qu'on sort pour les gabarits à partir d'1,80 m. Suspension avant, garde-boue intégraux, triple plateau pour les portions sableuses. Selle large et position redressée, confortable sur la durée.",
    poidsKg: 15.4,
    vitesses: 21,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant", "Garde-boue intégraux"],
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
