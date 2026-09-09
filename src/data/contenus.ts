/**
 * Contenus éditoriaux : itinéraires suggérés, avis clients, FAQ et
 * étapes du parcours de location.
 */

import type { Avis, Itineraire } from "@/lib/types";

export const itineraires: Itineraire[] = [
  {
    slug: "route-des-peches",
    titre: "La Route des Pêches",
    region: "Cotonou → Ouidah",
    distanceKm: 42,
    duree: "1 à 2 jours",
    niveau: "Facile",
    denivele: 60,
    resume:
      "Le littoral en ligne droite, cocotiers d'un côté et Atlantique de l'autre. Plat du début à la fin, c'est l'itinéraire idéal pour une première sortie ou pour un week-end à deux.",
    veloConseille: "VTC",
    teintes: ["#e2971d", "#f8f2e9"],
    etapes: [
      {
        jour: "Jour 1",
        titre: "Cotonou → Avlékété",
        detail:
          "28 km de piste sableuse tassée le long de l'océan. Arrêt déjeuner chez les pêcheurs d'Avlékété, poisson braisé les pieds dans le sable.",
      },
      {
        jour: "Jour 2",
        titre: "Avlékété → Ouidah",
        detail:
          "14 km jusqu'à la Porte du Non-Retour, puis visite du temple des Pythons et de la forêt sacrée de Kpassè. Restitution du vélo au relais d'Ouidah.",
      },
    ],
  },
  {
    slug: "boucle-atacora",
    titre: "La boucle de l'Atacora",
    region: "Natitingou → Boukoumbé → Tanougou",
    distanceKm: 168,
    duree: "4 jours",
    niveau: "Sportif",
    denivele: 2150,
    resume:
      "Le seul vrai relief du pays. Villages tata somba, cascade de Tanougou, et des descentes que l'on raconte encore des mois plus tard. À faire en gravel ou en vélo électrique.",
    veloConseille: "GRAVEL",
    teintes: ["#4e6630", "#e8eddd"],
    etapes: [
      {
        jour: "Jour 1",
        titre: "Natitingou → Boukoumbé",
        detail:
          "42 km et 700 m de dénivelé sur la route de crête. Nuit chez l'habitant dans une tata somba, l'architecture fortifiée de la région.",
      },
      {
        jour: "Jour 2",
        titre: "Boukoumbé → Koussoukoingou",
        detail: "31 km de piste entre les champs de mil, avec la chaîne de l'Atacora en toile de fond.",
      },
      {
        jour: "Jour 3",
        titre: "Koussoukoingou → cascade de Tanougou",
        detail: "54 km, la plus longue étape. Baignade méritée sous la cascade en fin de journée.",
      },
      {
        jour: "Jour 4",
        titre: "Tanougou → Natitingou",
        detail: "41 km de retour, majoritairement descendants. Restitution à la base Atacora avant 18 h.",
      },
    ],
  },
  {
    slug: "lacs-et-cites-lacustres",
    titre: "Lacs et cités lacustres",
    region: "Cotonou → Ganvié → Abomey-Calavi",
    distanceKm: 58,
    duree: "2 jours",
    niveau: "Facile",
    denivele: 120,
    resume:
      "Un aller-retour vers le lac Nokoué et la cité sur pilotis de Ganvié, avec la traversée en pirogue incluse dans la boucle. Le vélo attend au débarcadère.",
    veloConseille: "VAE",
    teintes: ["#c75c34", "#fdf5f1"],
    etapes: [
      {
        jour: "Jour 1",
        titre: "Cotonou → Abomey-Calavi → Ganvié",
        detail:
          "22 km jusqu'au débarcadère, puis pirogue vers Ganvié. Le vélo reste en consigne gardée au relais.",
      },
      {
        jour: "Jour 2",
        titre: "Retour par la berge nord",
        detail: "36 km de petites routes bordées de palmeraies, loin du trafic de la nationale.",
      },
    ],
  },
  {
    slug: "route-royale-abomey",
    titre: "La route royale d'Abomey",
    region: "Bohicon → Abomey → Zagnanado",
    distanceKm: 112,
    duree: "3 jours",
    niveau: "Intermédiaire",
    denivele: 640,
    resume:
      "Sur les traces du royaume du Dahomey : palais royaux classés à l'UNESCO, ateliers de tisserands et forêt sacrée. Un itinéraire culturel autant que sportif.",
    veloConseille: "RANDONNEUR",
    teintes: ["#90371f", "#f9e6dc"],
    etapes: [
      {
        jour: "Jour 1",
        titre: "Bohicon → Abomey",
        detail: "18 km d'échauffement et l'après-midi entière dans les palais royaux.",
      },
      {
        jour: "Jour 2",
        titre: "Abomey → Zagnanado",
        detail: "62 km de latérite rouge à travers les villages de potières.",
      },
      {
        jour: "Jour 3",
        titre: "Zagnanado → Bohicon",
        detail: "32 km de retour par la vallée de l'Ouémé, sous les fromagers.",
      },
    ],
  },
];

export const avisClients: Avis[] = [
  {
    id: "avis-1",
    veloId: "velo-atacora",
    auteur: "Mariam A.",
    ville: "Porto-Novo",
    note: 5,
    titre: "Quatre jours sans une seule ampoule aux mains",
    commentaire:
      "Le vélo était réglé à ma taille avant même mon arrivée — j'avais donné mon gabarit à la réservation. Les sacoches ont tenu sous l'orage entre Bohicon et Abomey.",
    date: "2026-07-18",
  },
  {
    id: "avis-2",
    veloId: "velo-ganvie",
    auteur: "Thomas R.",
    ville: "Lyon, France",
    note: 5,
    titre: "L'électrique a sauvé le voyage de ma compagne",
    commentaire:
      "Nous n'avons pas le même niveau. Avec le Ganvié, nous avons enfin roulé ensemble. Batterie rendue à 40 % après 62 km avec du vent de face.",
    date: "2026-06-02",
  },
  {
    id: "avis-3",
    veloId: "velo-pendjari",
    auteur: "Koffi D.",
    ville: "Natitingou",
    note: 5,
    titre: "Une crevaison, un appel, trente minutes",
    commentaire:
      "Crevaison à 20 km de Boukoumbé un dimanche. Coup de fil, quelqu'un est venu avec une roue de rechange. C'est ce genre de chose qui fait la différence.",
    date: "2026-05-24",
  },
  {
    id: "avis-4",
    veloId: "velo-cotonou",
    auteur: "Aïcha B.",
    ville: "Cotonou",
    note: 4,
    titre: "Simple et rapide",
    commentaire:
      "Réservation faite depuis mon téléphone en cinq minutes, payée en MTN Money, facture reçue par mail dans la foulée. Le panier avant est un peu petit, c'est mon seul reproche.",
    date: "2026-08-11",
  },
  {
    id: "avis-5",
    veloId: "velo-tandem",
    auteur: "Élodie et Marc",
    ville: "Bruxelles, Belgique",
    note: 5,
    titre: "Le tandem, la meilleure idée du voyage",
    commentaire:
      "On a roulé de Cotonou à Ouidah en riant tout du long. Prise en main immédiate, même sans expérience du tandem.",
    date: "2026-04-09",
  },
  {
    id: "avis-6",
    veloId: "velo-abomey",
    auteur: "Sylvain K.",
    ville: "Parakou",
    note: 5,
    titre: "La courroie, plus jamais de chaîne",
    commentaire:
      "Trois jours de latérite, zéro entretien, pantalon impeccable. Je vais finir par acheter le même.",
    date: "2026-03-27",
  },
];

export const etapesLocation = [
  {
    numero: "01",
    titre: "Choisissez votre vélo",
    detail:
      "Filtrez par type, par taille et par point de retrait. Chaque fiche indique l'autonomie conseillée et l'équipement fourni.",
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
      "MTN Money, Moov Money ou carte bancaire, à la dernière étape seulement. La facture part par email dans la minute.",
  },
  {
    numero: "04",
    titre: "Récupérez et roulez",
    detail:
      "Le vélo vous attend réglé à votre taille. On vérifie ensemble les freins, la pression et l'itinéraire avant le départ.",
  },
  {
    numero: "05",
    titre: "Restituez où vous voulez",
    detail:
      "Au même point ou dans une autre ville, avec l'option transfert. La caution est libérée dans les 48 heures.",
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
          "En basse saison, la veille suffit souvent. Entre novembre et mars, et pour les vélos électriques, comptez une à deux semaines : le parc est limité et ces modèles partent vite.",
      },
    ],
  },
  {
    categorie: "Paiement et caution",
    questions: [
      {
        question: "Quels moyens de paiement acceptez-vous ?",
        reponse:
          "MTN Money et Moov Money pour le Mobile Money, ainsi que les cartes Visa et Mastercard. Les paiements passent par un agrégateur béninois (FedaPay ou KkiaPay) : aucune coordonnée bancaire ne transite par notre site.",
      },
      {
        question: "Une caution est-elle demandée ?",
        reponse:
          "Oui, entre 40 000 et 150 000 FCFA selon le vélo. Elle est pré-autorisée au moment de la réservation et libérée dans les 48 heures suivant la restitution. L'option assurance sérénité la remplace entièrement.",
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
          "Chaque vélo part avec un kit de réparation et une pompe. Un numéro d'assistance figure sur votre confirmation : nous intervenons dans un rayon de 60 km autour de nos trois points de retrait, sept jours sur sept.",
      },
      {
        question: "Puis-je rendre le vélo dans une autre ville ?",
        reponse:
          "Oui, entre Cotonou, Ouidah et Natitingou, avec l'option transfert à 12 000 FCFA. Choisissez-la à l'étape des options de votre réservation.",
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

export const chiffresCles = [
  { valeur: "9", unite: "vélos", detail: "préparés et suivis un par un" },
  { valeur: "3", unite: "points", detail: "Cotonou, Ouidah, Natitingou" },
  { valeur: "48 h", unite: "", detail: "pour la libération de la caution" },
  { valeur: "4,8", unite: "/ 5", detail: "sur 222 locations" },
] as const;
