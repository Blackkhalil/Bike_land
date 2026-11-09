/**
 * Les affiches de Bike Land, fournies par l'exploitant, montrées sur la
 * page Nos produits (public/images/produits/).
 *
 * Ce sont des affiches et non des photos : leur texte fait partie de
 * l'image. La description de chacune le reprend donc, pour qui ne la voit
 * pas. Les fichiers d'origine, plus lourds, restent hors du site
 * (public/images/Gbashi bike et Roadtrip, non publiés) : ceux-ci sont
 * recompressés pour le téléphone.
 */

import type { Affiche } from "@/components/GalerieAffiches";

/** Gbashi bike : le dimanche, du vélo jusqu'à la plage, puis la séance de sport. */
export const AFFICHES_GBASHI: Affiche[] = [
  ["Le dimanche, on Gbashi ! Une participante montre ses biceps sur la plage", "Du vélo, de la muscu et la mer juste en face"],
  ["Le Gbashi bike, c'est quoi ? Le groupe et ses vélos sur la plage", "On pédale jusqu'au bord de mer pour faire de la muscu en plein air"],
  ["On pédale pour s'échauffer, étape 1 : une cycliste sur la route des Pêches", "Direction le bord de mer, tous ensemble"],
  ["Viens profiter avec tes potes : des participants et leurs vélos sur le sable", "Le spot est prêt, la séance peut commencer"],
  ["La pause coco, étape 2 : des participants boivent un coco frais à l'ombre", "On recharge les batteries avant l'effort"],
  ["Place à la muscu, on Gbashi ! Étape 3 : un sportif soulève des haltères devant les vélos", "Ta salle de sport, c'est la plage"],
  ["Chacun son exercice : une participante soulève deux haltères", "Bras, jambes, dos : tout le corps y passe"],
  ["Des coachs pour te guider : un coach accompagne un participant sur la plage", "Chaque mouvement est montré et corrigé sur place"],
  ["On se donne à fond : un sportif concentré pendant l'effort", "Et les vélos attendent juste à côté"],
  ["Ouvert à tous les niveaux : une participante soulève des haltères sur le sable", "Débutant ou confirmé, chacun à son rythme"],
  ["Retour au point de départ, étape 4 : le groupe reprend la route", "À vélo, les muscles chauds et le sourire en plus"],
  ["Fier de son dimanche ! Un participant pose avec son vélo", "Du vélo, de la muscu, et l'envie de revenir"],
].map(([scene, legende], index) => ({
  src: `/images/produits/gbashi/${String(index + 1).padStart(2, "0")}.jpg`,
  alt: `Affiche Gbashi bike. ${scene}. ${legende}.`,
}));

/**
 * Padel bike : l'affiche du concept, puis le terrain de padel. Des images
 * tirées des vidéos de l'exploitant (public/images/Padel Bike, non
 * publié) : seule la première porte du texte.
 */
export const AFFICHES_PADEL: Affiche[] = [
  {
    src: "/images/produits/padel/01.jpg",
    alt:
      "Affiche Padel bike, devant le terrain de padel. Le concept est simple : on démarre à vélo pour " +
      "s'échauffer, on arrive au lieu de padel et on joue pendant 3 heures. Participation : 3 500 F par " +
      "personne. Vous pouvez commencer vos réservations.",
  },
  { src: "/images/produits/padel/02.jpg", alt: "Un joueur sert sur la piste rouge, près du filet." },
  { src: "/images/produits/padel/03.jpg", alt: "Deux raquettes de padel et un tube de balles sur le gazon vert." },
  { src: "/images/produits/padel/04.jpg", alt: "Un échange de padel sur la piste rouge, la balle en jeu." },
  { src: "/images/produits/padel/05.jpg", alt: "Une piste de padel verte, entourée de vitres et de grillage." },
];

/** Le road trip : la sortie encadrée sur la route des Pêches. */
export const AFFICHES_ROAD_TRIP: Affiche[] = [
  ["Ce week-end, on roule ? Road trip : un cycliste casqué sur la route des Pêches", "Samedi et dimanche matin, sur la côte de Fidjrossè"],
  ["Le road trip, c'est quoi ? Un groupe de cyclistes s'arrête au bord de la route", "Une sortie relax à vélo pour faire du sport, avec de la bonne ambiance"],
  ["Pas besoin d'être sportif, ouvert à tous : un cycliste souriant", "Débutant ou habitué, on roule ensemble, sans course"],
  ["Cheveux au vent : une cycliste sur la route en bord de mer", "Profite du vent et des vagues en faisant une promenade de santé"],
  ["Tu viens comme tu es, vélo et casque fournis : un cycliste casqué en pleine route", "Travaille tes jambes en pédalant, du sport sans pression"],
  ["La mer à deux coups de pédale, Fidjrossè : la plage et l'océan", "Une pause pour contempler la mer de plus près"],
  ["Eau et coco compris : le groupe fait une pause sous les cocotiers", "On souffle, on papote, on repart"],
  ["Réserve ton trip avec tes amis : un groupe de cyclistes sur la route", "Bike Land"],
].map(([scene, legende], index) => ({
  src: `/images/produits/road-trip/${String(index + 1).padStart(2, "0")}.jpg`,
  alt: `Affiche road trip. ${scene}. ${legende}.`,
}));
