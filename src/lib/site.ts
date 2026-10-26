/**
 * Constantes d'identité et de contact du site.
 * Centralisées ici : elles apparaissent dans le header, le footer, les
 * emails transactionnels, les métadonnées SEO et les mentions légales.
 */

export const site = {
  nom: "Bike Land",
  baseline: "Louez le vélo, gardez la route",
  /**
   * La description par défaut, pour Google et les aperçus de liens : 120 à
   * 158 caractères (voir src/lib/seo.ts).
   */
  description:
    "Location de vélos à Cotonou et road trips encadrés le week-end sur la route des Pêches. Réservation en ligne, paiement Mobile Money, sans compte à créer.",
  // Repli sur l'adresse réelle du site, et non sur un domaine que Bike
  // Land ne possède pas : un lien d'email ou un secret de revalidation ne
  // doit jamais partir vers un tiers parce qu'une variable manque.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://bike-land.vercel.app",
  /**
   * Adresse de l'administration, qui a son propre projet Vercel (voir
   * src/lib/deploiement.ts). Lue dans ADMIN_URL, variable du serveur et
   * non NEXT_PUBLIC_ : elle ne sert qu'aux emails, et ne doit pas se
   * retrouver dans le JavaScript que télécharge chaque visiteur du site.
   */
  urlAdmin: process.env.ADMIN_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://bike-land.vercel.app",
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
  horaires: "Du lundi au samedi, 8 h - 22 h",
  /**
   * Les horaires pour les données structurées lues par Google : tous les
   * jours, car le dimanche se réserve aussi (Gbashi bike à 8 h, location
   * libre à partir de 11 h, voir src/data/offres.ts).
   */
  horairesOuverture: {
    jours: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    ouverture: "08:00",
    fermeture: "22:00",
  },
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
  /**
   * Validation du site dans Google Search Console : la valeur `content` de
   * la balise « google-site-verification » que Search Console donne au
   * gérant (méthode « Balise HTML »). Publique par nature, puisqu'elle
   * figure dans chaque page. Vide, aucune balise n'est posée.
   */
  verificationGoogle: "fKEB8MeH42AnSPXJl4wrT2zh0L7f_Q8lznFoqcLOKpw" as string,
} as const;

/**
 * Une discussion WhatsApp avec l'équipe, message déjà écrit.
 *
 * Sur la seconde ligne, celle que le site public donne partout (voir
 * `reseaux`). À ouvrir dans un nouvel onglet, comme le pied de page.
 */
export function lienWhatsApp(message: string): string {
  return `${site.whatsapp[1].lien}?text=${encodeURIComponent(message)}`;
}

export const navigationPrincipale = [
  { libelle: "Nos produits", href: "/produits" },
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
