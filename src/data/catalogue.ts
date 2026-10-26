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
    horaires: "Tous les jours, 8 h - 22 h",
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
    horaires: "Tous les jours, 8 h - 18 h",
    actif: false,
  },
  {
    id: "pt-natitingou",
    nom: "Base Atacora",
    ville: "Natitingou",
    adresse: "Quartier Yimporima, route de Boukoumbé",
    horaires: "Lun - sam, 7 h 30 - 18 h",
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

/**
 * Le parc, tel que les vidéos produit le décrivent.
 *
 * Chaque vélo porte sa présentation filmée, et c'est elle qui fait foi :
 * les caractéristiques ci-dessous, suspension, freinage, vitesses,
 * roues, coloris, sont relevées sur la fiche technique affichée dans la
 * vidéo, pas inventées.
 *
 * **Trois champs restent à confirmer** : `poidsKg`, `chargeMaxKg` et
 * `autonomieConseilleeKm`. Les vidéos ne les donnent pas. Les valeurs
 * portées ici sont celles, courantes, d'un VTT de ce type ; elles sont
 * plausibles mais non mesurées.
 *
 * ── Répartition en gammes ────────────────────────────────────────────
 *
 * Elle est donnée par l'exploitant, et suit le nom des fichiers vidéo :
 *
 *  - **Classique** : les six machines de la série `bikeland_0X`.
 *  - **Premium** : les quatre `prenium-*`.
 *  - **Prestige** : une seule, la N° 1 à double frein à disque, jantes
 *    bâton magnésium et cadre acier haute résistance.
 *
 * L'équipement seul aurait suggéré un autre découpage, Soleil, Flamme
 * et Onyx sont tout-suspendus à freins à disque. C'est la décision
 * commerciale qui tranche, pas la fiche technique.
 *
 * Si cette répartition ne correspond pas à votre intention commerciale,
 * c'est le champ `gamme` de chaque vélo qu'il faut changer, rien
 * d'autre : les prix en découlent (cf. src/data/offres.ts).
 */
export const velos: Velo[] = [
  /* ─────────────────────────────────────────────────────── Classique */
  {
    id: "velo-emeraude",
    slug: "emeraude",
    video: "/images/bikeland_01_emeraude.mp4",
    photo: "/images/affiches/bikeland_01_emeraude.jpg",
    nom: "Émeraude",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le VTT dame, vert et noir, à cadre surbaissé",
    description:
      "Un VTT dame à fourche rigide et cadre surbaissé : on l'enjambe sans lever la jambe, ce qui change tout en jupe ou en pagne. Vingt et une vitesses pour négocier les faux plats de la route des Pêches, freinage V-Brake sur jante, roues de 26 pouces. Le vélo à prendre pour une première sortie.",
    poidsKg: 15,
    vitesses: 21,
    chargeMaxKg: 100,
    autonomieConseilleeKm: 30,
    equipementInclus: [...equipementCommun, "Cadre surbaissé", "Fourche rigide"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#1f7a52", "#e0dcd3"],
  },
  {
    id: "velo-rubis",
    slug: "rubis",
    video: "/images/bikeland_02_rubis.mp4",
    photo: "/images/affiches/bikeland_02_rubis.jpg",
    nom: "Rubis",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le semi-rigide noir et bordeaux, souple à l'avant",
    description:
      "Semi-rigide : une fourche suspendue à l'avant, un cadre rigide à l'arrière. C'est le bon compromis pour la piste littorale : assez souple pour encaisser les nids-de-poule, assez ferme pour ne pas pomper au pédalage. Vingt et une vitesses, freinage V-Brake, roues de 26 pouces.",
    poidsKg: 15.5,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 35,
    equipementInclus: [...equipementCommun, "Fourche suspendue avant"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#7a1f2e", "#e0dcd3"],
  },
  {
    id: "velo-glacier",
    slug: "glacier",
    video: "/images/bikeland_04_glacier.mp4",
    photo: "/images/affiches/bikeland_04_glacier.jpg",
    nom: "Glacier",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "S",
    statut: "DISPONIBLE",
    accroche: "Le petit format en 24 pouces, pour les gabarits légers",
    description:
      "Le seul vélo du parc en roues de 24 pouces : plus maniable, plus bas, taillé pour les gabarits légers et les adolescents. Cadre entièrement rigide et sept vitesses, de quoi rouler simplement, sans rien à régler. Freinage V-Brake sur jante.",
    poidsKg: 13,
    vitesses: 7,
    chargeMaxKg: 85,
    autonomieConseilleeKm: 25,
    equipementInclus: [...equipementCommun, "Roues 24 pouces", "Cadre rigide"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#2f6fb5", "#e0dcd3"],
  },

  /* ───────────────────────────────────────────────────────── Premium */
  {
    id: "velo-soleil",
    slug: "soleil",
    video: "/images/bikeland_03_soleil.mp4",
    photo: "/images/affiches/bikeland_03_soleil.jpg",
    nom: "Soleil",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le tout-suspendu jaune, freins à disque",
    description:
      "Tout-suspendu : une suspension à l'avant, une à l'arrière. La piste défoncée cesse d'être une épreuve. Freins à disque aux deux roues, qui mordent même après la pluie, là où un patin glisse. Vingt et une vitesses, roues de 26 pouces. Jaune, difficile à manquer.",
    poidsKg: 16.5,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#e8a317", "#e0dcd3"],
  },
  {
    id: "velo-flamme",
    slug: "flamme",
    video: "/images/bikeland_05_flamme.mp4",
    photo: "/images/affiches/bikeland_05_flamme.jpg",
    nom: "Flamme",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Le tout-suspendu rouge et jaune, freins à disque",
    description:
      "Même architecture que le Soleil, double suspension et freins à disque, dans une livrée rouge et jaune. Vingt et une vitesses, roues de 26 pouces. Le vélo du groupe qu'on repère de loin sur la piste.",
    poidsKg: 16.5,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#c8301f", "#e0dcd3"],
  },
  {
    id: "velo-onyx",
    slug: "onyx",
    video: "/images/bikeland_06_onyx.mp4",
    photo: "/images/affiches/bikeland_06_onyx.jpg",
    nom: "Onyx",
    categorie: "VTT",
    gamme: "CLASSIQUE",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Le tout-suspendu noir intégral, freins à disque",
    description:
      "Noir intégral, du cadre aux jantes. Tout-suspendu, freins à disque aux deux roues, vingt et une vitesses, roues de 26 pouces. Le plus sobre du parc, et le plus grand : à prendre si vous dépassez 1,80 m.",
    poidsKg: 17,
    vitesses: 21,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#1c1b19", "#e0dcd3"],
  },

  /* ──────────────────────────────────────────────────────── Prestige */
  {
    id: "velo-prestige-01",
    slug: "prestige-jantes-baton",
    video: "/images/bikeland-prestige.mp4",
    photo: "/images/affiches/bikeland-prestige.jpg",
    nom: "Prestige N° 1",
    categorie: "VTT",
    gamme: "PRESTIGE",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Jantes bâton, double frein à disque, cadre acier haute résistance",
    description:
      "Le haut du parc. Cadre en acier haute résistance, suspension avant et arrière, double frein à disque, et des jantes bâton en magnésium à six branches qui ne se voilent pas. Pneus KENDA tout-terrain, vingt et une vitesses, roues de 26 pouces. Noir et rouge.",
    poidsKg: 18,
    vitesses: 21,
    chargeMaxKg: 130,
    autonomieConseilleeKm: 60,
    equipementInclus: [
      ...equipementCommun,
      "Jantes bâton magnésium 6 branches",
      "Double frein à disque",
      "Pneus KENDA tout-terrain",
    ],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#c8301f", "#1c1b19"],
  },
  {
    id: "velo-prestige-northpoint",
    slug: "prestige-northpoint",
    video: "/images/prenium-v02_northpoint.mp4",
    photo: "/images/affiches/prenium-v02_northpoint.jpg",
    nom: "Northpoint",
    categorie: "VTT",
    gamme: "PREMIUM",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Semi-rigide noir et bleu, freins à disque",
    description:
      "Semi-rigide à fourche suspendue et freins à disque aux deux roues : le vélo qui va vite sans vous secouer, là où le tout-suspendu absorbe une partie de votre pédalage. Vingt et une vitesses, roues de 26 pouces, noir et bleu.",
    poidsKg: 15.5,
    vitesses: 21,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 55,
    equipementInclus: [...equipementCommun, "Fourche suspendue avant", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#2f6fb5", "#1c1b19"],
  },
  {
    id: "velo-prestige-mongoose",
    slug: "prestige-mongoose",
    video: "/images/prenium-v03_mongoose.mp4",
    photo: "/images/affiches/prenium-v03_mongoose.jpg",
    nom: "Mongoose",
    categorie: "VTT",
    gamme: "PREMIUM",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Tout-suspendu blanc et noir",
    description:
      "Tout-suspendu blanc et noir, vingt et une vitesses, roues de 26 pouces. Freinage V-Brake sur jante. À garder en tête si vous roulez après une averse : le patin mord moins qu'un disque sur une jante mouillée.",
    poidsKg: 17,
    vitesses: 21,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 50,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#f4f2ed", "#1c1b19"],
  },
  {
    id: "velo-prestige-muddyfox",
    slug: "prestige-muddyfox",
    video: "/images/prenium-v04_muddyfox.mp4",
    photo: "/images/affiches/prenium-v04_muddyfox.jpg",
    nom: "Muddyfox",
    categorie: "VTT",
    gamme: "PREMIUM",
    taille: "L",
    statut: "DISPONIBLE",
    accroche: "Tout-suspendu noir et bleu, freins à disque",
    description:
      "Tout-suspendu et freins à disque aux deux roues : la combinaison la plus sûre du parc pour la piste littorale, pluie comprise. Vingt et une vitesses, roues de 26 pouces, noir et bleu.",
    poidsKg: 17,
    vitesses: 21,
    chargeMaxKg: 120,
    autonomieConseilleeKm: 55,
    equipementInclus: [...equipementCommun, "Suspension avant et arrière", "Freins à disque"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#2f6fb5", "#1c1b19"],
  },
  {
    id: "velo-prestige-raleigh",
    slug: "prestige-raleigh",
    video: "/images/prenium-v05_raleigh.mp4",
    photo: "/images/affiches/prenium-v05_raleigh.jpg",
    nom: "Raleigh",
    categorie: "VTT",
    gamme: "PREMIUM",
    taille: "M",
    statut: "DISPONIBLE",
    accroche: "Semi-rigide noir et bleu de la marque anglaise Raleigh",
    description:
      "Semi-rigide à fourche suspendue, vingt et une vitesses, roues de 26 pouces. Freinage V-Brake sur jante. Noir et bleu, signé Raleigh, l'une des plus vieilles marques de cycles au monde.",
    poidsKg: 15,
    vitesses: 21,
    chargeMaxKg: 110,
    autonomieConseilleeKm: 45,
    equipementInclus: [...equipementCommun, "Fourche suspendue avant"],
    pointDeRetraitId: "pt-cotonou",
    noteMoyenne: 0,
    nombreAvis: 0,
    teintes: ["#2f6fb5", "#e0dcd3"],
  },
];

export const optionsLocation: OptionLocation[] = [];




export const libellesCategorie: Record<Velo["categorie"], string> = {
  VTT: "VTT",
  RANDONNEUR: "Randonneur",
  GRAVEL: "Gravel",
  VAE: "Assistance électrique",
  VTC: "Tout chemin",
  TANDEM: "Tandem",
};

export const libellesTaille: Record<Velo["taille"], string> = {
  S: "S : 1,55 à 1,68 m",
  M: "M : 1,65 à 1,78 m",
  L: "L : 1,75 à 1,88 m",
  XL: "XL : 1,86 à 1,98 m",
};

export const libellesStatut: Record<Velo["statut"], string> = {
  DISPONIBLE: "Disponible",
  EN_LOCATION: "En location",
  MAINTENANCE: "En entretien",
  RETIRE: "Retiré du parc",
};
