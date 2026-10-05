/**
 * Contenus éditoriaux : itinéraires suggérés, avis clients, FAQ et
 * étapes du parcours de location.
 */

import type { Itineraire } from "@/lib/types";

export const itineraires: Itineraire[] = [
  {
    slug: "route-des-peches-togbin",
    photo: "/images/coen-van-de-broek-OFyh9TpMyM8-unsplash.jpg",
    titre: "La route des Pêches jusqu'à Togbin",
    region: "Fidjrossè → Togbin",
    distanceKm: 30,
    duree: "Environ 3 h",
    niveau: "Facile",
    denivele: 25,
    resume:
      "Le littoral en ligne droite : cocotiers d'un côté, Atlantique de l'autre, et pas une côte du départ à l'arrivée. On roule ensemble jusqu'à la plage de Togbin, on souffle, et on rentre par le même chemin.",
    veloConseille: "VTC",
    teintes: ["#f25c05", "#f2efe9"],
    etapes: [
      {
        jour: "Aller",
        titre: "Fidjrossè → Togbin",
        detail:
          "15 km de piste sableuse tassée le long de l'océan, à allure de groupe. Le coordinateur ouvre la route et personne ne reste derrière.",
      },
      {
        jour: "Pause",
        titre: "La plage de Togbin",
        detail:
          "Arrêt sur le sable : coco frais et eau pour tout le monde. Le temps de se baigner si le cœur vous en dit.",
      },
      {
        jour: "Retour",
        titre: "Togbin → Fidjrossè",
        detail:
          "15 km de retour par le littoral, souvent avec le vent dans le dos en fin de matinée.",
      },
    ],
  },
  {
    slug: "route-des-peches-amazone",
    photo: "/images/hannah-carr-I079C4gOe8s-unsplash.jpg",
    titre: "La route des Pêches jusqu'à l'Amazone",
    region: "Fidjrossè → l'Amazone",
    distanceKm: 18,
    duree: "Environ 2 h",
    niveau: "Facile",
    denivele: 15,
    resume:
      "Le circuit le plus court, celui d'une première sortie. On longe la côte vers le centre de Cotonou jusqu'au pied de la statue de l'Amazone, on prend la photo, et on revient.",
    veloConseille: "VTC",
    teintes: ["#1f6f5c", "#f2efe9"],
    etapes: [
      {
        jour: "Aller",
        titre: "Fidjrossè → l'Amazone",
        detail:
          "9 km le long du littoral puis du boulevard de la Marina, jusqu'à la statue. Terrain plat, roulant, sans difficulté.",
      },
      {
        jour: "Pause",
        titre: "Au pied de l'Amazone",
        detail: "Coco frais et eau, le temps des photos devant le monument.",
      },
      {
        jour: "Retour",
        titre: "L'Amazone → Fidjrossè",
        detail: "9 km de retour par le même littoral, au rythme du groupe.",
      },
    ],
  },
];

// ATTENTION, contenu de démonstration, à remplacer avant l'ouverture.
// Ces avis sont fictifs. Publier des témoignages inventés attribués à des
// personnes nommées est une pratique trompeuse, et sanctionnée comme telle
// dans la plupart des cadres de protection du consommateur. Ils sont ici
// pour donner sa forme à la page, pas pour être mis en ligne tels quels :
// dès les premières sorties, remplacez-les par les retours réels de vos
// clients, avec leur accord.
export const etapesLocation = [
  {
    numero: "01",
    titre: "Choisissez votre vélo",
    detail:
      "Filtrez par type, par taille et par point de départ. Chaque fiche indique l'autonomie conseillée et l'équipement fourni.",
  },
  {
    numero: "02",
    titre: "Réservez vos dates",
    detail:
      "Le calendrier n'affiche que les jours réellement libres pour ce vélo précis. Pas de compte à créer, pas de mot de passe à retenir.",
  },
  {
    numero: "03",
    titre: "Payez en Mobile Money",
    detail:
      "MTN Money ou Moov Money, à la dernière étape seulement. La facture part par email dans la minute.",
  },
  {
    numero: "04",
    titre: "Retrouvez le coordinateur",
    detail:
      "Au départ, un coordinateur vous accueille avec votre vélo réglé à votre taille et votre kit complet. Freins, pression et parcours sont vérifiés ensemble avant de partir.",
  },
  {
    numero: "05",
    titre: "Roulez accompagné, repartez léger",
    detail:
      "Le coordinateur roule avec le groupe et récupère les vélos et les kits à l'arrivée. Rien à rapporter, et aucune caution à récupérer : nous n'en demandons pas.",
  },
] as const;

export const faq = [
  {
    categorie: "Réservation",
    questions: [
      {
        question: "Dois-je créer un compte pour réserver ?",
        reponse:
          "Non. Vous choisissez votre vélo et vos dates, puis vous saisissez votre nom, votre email et votre moyen de paiement à la dernière étape. Un lien de suivi personnel vous est envoyé par email : il vous donne accès à votre réservation sans mot de passe.",
      },
      {
        question: "Comment savoir si un vélo est réellement libre ?",
        reponse:
          "La disponibilité est calculée en temps réel sur le parc physique. Un vélo déjà loué sur vos dates n'apparaît pas comme réservable, et deux personnes ne peuvent pas réserver le même vélo aux mêmes dates.",
      },
      {
        question: "Puis-je modifier ou annuler ma réservation ?",
        reponse:
          "Oui, depuis votre lien de suivi. L'annulation est gratuite jusqu'à 72 heures avant le départ, puis 50 % du montant est retenu. Passé l'heure de départ, la location est due.",
      },
      {
        question: "Combien de temps à l'avance faut-il réserver ?",
        reponse:
          "Pour un road trip, la veille suffit souvent, à condition de réserver avant 22 h : le départ du samedi se ferme le vendredi à 22 h, celui du dimanche le samedi à 22 h, et le road trip ne se réserve plus en ligne entre 22 h et 8 h. La location libre se réserve à toute heure, même la nuit. Entre novembre et mars, comptez plutôt trois à quatre jours : le parc est volontairement restreint et les samedis partent vite.",
      },
    ],
  },
  {
    categorie: "Paiement",
    questions: [
      {
        question: "Quels moyens de paiement acceptez-vous ?",
        reponse:
          "Le Mobile Money uniquement : MTN Money et Moov Money. Une demande arrive sur votre téléphone, vous la validez avec votre code habituel. Les paiements passent par SasPay : aucune coordonnée de paiement ne transite par notre site ni n'y est conservée.",
      },
      {
        question: "Une caution est-elle demandée ?",
        reponse:
          "Non, aucune. Toutes nos sorties sont encadrées par un coordinateur qui remet les vélos et les kits au départ et les récupère à l'arrivée : le matériel reste sous notre responsabilité du début à la fin, il n'y a donc rien à bloquer sur votre compte.",
      },
      {
        question: "Quand reçois-je ma facture ?",
        reponse:
          "Elle est générée automatiquement et envoyée par email juste après la validation du paiement. Vous pouvez la retélécharger à tout moment depuis votre lien de suivi.",
      },
    ],
  },
  {
    categorie: "Sur la route",
    questions: [
      {
        question: "Que se passe-t-il en cas de panne ou de crevaison ?",
        reponse:
          "Chaque vélo part avec un kit de réparation et une pompe. Un numéro d'assistance figure sur votre confirmation : nous intervenons dans un rayon de 60 km autour de notre point de départ, sur la route des Pêches, sept jours sur sept.",
      },
      {
        question: "Puis-je rendre le vélo dans une autre ville ?",
        reponse:
          "Pas pour l'instant : nous n'exploitons qu'un seul point de départ, sur la route des Pêches à Cotonou. La restitution dans une autre ville viendra avec l'ouverture de nos road trips longue distance.",
      },
      {
        question: "Les vélos sont-ils adaptés aux enfants ?",
        reponse:
          "Nous proposons des porte-bébés homologués sur demande et deux vélos en taille S conviennent aux adolescents à partir de 1,55 m. Écrivez-nous pour un groupe familial, nous préparons le matériel en amont.",
      },
    ],
  },
  {
    categorie: "Données personnelles",
    questions: [
      {
        question: "Que faites-vous de mes données ?",
        reponse:
          "Nous conservons uniquement ce qui est nécessaire à la location : nom, email, téléphone et historique de réservation. Ces données ne sont ni vendues ni cédées, et vous pouvez demander leur suppression à tout moment, conformément à la loi béninoise sur la protection des données à caractère personnel contrôlée par l'APDP.",
      },
    ],
  },
] as const;

/**
 * Chiffres de la page « À propos ».
 *
 * Chacun doit être vérifiable. Une note moyenne « 4,8 / 5 sur 222
 * locations » y figurait alors qu'aucun avis n'avait jamais été déposé :
 * c'est le genre de chiffre qui se retourne contre celui qui l'affiche
 * le jour où un client demande à les lire. Il a été retiré, et il ne
 * reviendra que calculé sur les avis réels.
 */
export const chiffresCles = [
  { valeur: "11", unite: "vélos", detail: "préparés et suivis un par un" },
  { valeur: "3", unite: "gammes", detail: "Classique, Premium, Prestige" },
  { valeur: "1", unite: "point", detail: "Route des Pêches, Cotonou" },
  { valeur: "1 125", unite: "FCFA", detail: "la première heure, en Classique" },
] as const;
