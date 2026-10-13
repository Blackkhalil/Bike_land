/**
 * Constantes d'identité et de contact du site.
 * Centralisées ici : elles apparaissent dans le header, le footer, les
 * emails transactionnels, les métadonnées SEO et les mentions légales.
 */

export const site = {
  nom: "Bike Land",
  baseline: "Louez le vélo, gardez la route",
  description:
    "Location de vélos sur la route des Pêches à Cotonou : randonneurs, gravels, VTC et tandem, réservables en ligne en deux minutes, sans créer de compte. Les road trips à travers le Bénin arrivent bientôt.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://bikeland.bj",
  /**
   * Adresse de l'administration. Elle a son propre projet Vercel, séparé
   * du site public (voir src/lib/deploiement.ts) ; tant que ce projet
   * n'existe pas, c'est l'adresse du site.
   */
  urlAdmin: process.env.NEXT_PUBLIC_ADMIN_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://bikeland.bj",
  email: "bikeland06@gmail.com",
  telephone: "+229 01 59 68 81 03",
  telephoneLien: "+2290159688103",
  /**
   * Les deux lignes WhatsApp de l'équipe, tenues toutes les deux.
   *
   * L'email de confirmation les donne ensemble ; le pied de page renvoie
   * à la seconde (voir `reseaux`).
   */
  whatsapp: [
    { numero: "+229 01 59 68 81 03", lien: "https://wa.me/2290159688103" },
    { numero: "+229 01 91 00 22 01", lien: "https://wa.me/2290191002201" },
  ],
  adresse: {
    // L'adresse précise a été retirée du site sur demande. Seules la
    // ville et le pays subsistent, ils restent nécessaires aux mentions
    // légales et à la facturation.
    ville: "Cotonou",
    pays: "Bénin",
  },
  /**
   * Le point de départ, donné aux seuls clients qui ont payé.
   *
   * Les pages publiques ne l'affichent pas : c'est l'email de
   * confirmation qui le porte. `carte` est l'épingle Google Maps de
   * l'atelier, partagée par Bike Land (6,3511 N, 2,3534 E).
   */
  pointDeDepart: {
    lieu: "Fidjrossè Plage, Cotonou",
    indication: "Dans la von juste avant la station JNP.",
    carte: "https://maps.app.goo.gl/tkfdXyVonxogwVek8",
  },
  horaires: "Du lundi au samedi, 8 h - 19 h",
  /**
   * Immatriculations légales, à renseigner dès leur attribution.
   *
   * Elles figurent ici et nulle part ailleurs : les mentions légales les
   * affichent dès qu'elles sont remplies, et annoncent simplement
   * qu'elles sont en attente le reste du temps. Il n'y a donc aucun
   * fichier de code à toucher pour les publier, et aucun risque de
   * laisser une note de développeur en ligne.
   *
   * Les publier est une obligation pour une activité commerciale au
   * Bénin : à remplir avant de communiquer sur le site.
   */
  immatriculation: {
    /** Registre du commerce et du crédit mobilier. */
    rccm: "",
    /** Identifiant fiscal unique. */
    ifu: "",
  },
  /**
   * Comptes réellement ouverts, et eux seuls.
   *
   * Facebook a été retiré plutôt que laissé inerte : une icône qui ne
   * mène nulle part fait douter du reste de la page, et rien n'oblige à
   * afficher un réseau sur lequel on n'est pas.
   */
  reseaux: [
    { nom: "Instagram", url: "https://instagram.com/bikeland_bj" },
    { nom: "WhatsApp", url: "https://wa.me/2290191002201" },
  ],
} as const;

export const navigationPrincipale = [
  { libelle: "Nos vélos", href: "/velos" },
  { libelle: "Itinéraires", href: "/itineraires" },
  { libelle: "Comment ça marche", href: "/comment-ca-marche" },
] as const;

export const navigationSecondaire = [
  { libelle: "À propos", href: "/a-propos" },
  { libelle: "Contact & FAQ", href: "/contact" },
  { libelle: "Suivre ma réservation", href: "/reservation/suivi" },
] as const;

export const navigationLegale = [
  { libelle: "Mentions légales", href: "/mentions-legales" },
  { libelle: "Conditions générales de vente", href: "/cgv" },
  { libelle: "Protection des données", href: "/donnees-personnelles" },
] as const;
