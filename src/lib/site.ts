/**
 * Constantes d'identité et de contact du site.
 * Centralisées ici : elles apparaissent dans le header, le footer, les
 * emails transactionnels, les métadonnées SEO et les mentions légales.
 */

export const site = {
  nom: "Bike Land",
  baseline: "Louez le vélo, gardez la route",
  description:
    "Location de vélos préparés pour le road trip au Bénin : randonneurs, gravels et vélos à assistance électrique, réservables en ligne en deux minutes, sans créer de compte.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://bikeland.bj",
  email: "bonjour@bikeland.bj",
  telephone: "+229 01 97 00 00 00",
  telephoneLien: "+2290197000000",
  whatsapp: "+2290197000000",
  adresse: {
    ligne: "Carré 1204, Haie Vive",
    ville: "Cotonou",
    pays: "Bénin",
  },
  horaires: "Du lundi au samedi, 8 h – 19 h",
  reseaux: [
    { nom: "Instagram", url: "https://instagram.com/bikeland" },
    { nom: "Facebook", url: "https://facebook.com/bikeland" },
    { nom: "WhatsApp", url: "https://wa.me/2290197000000" },
  ],
} as const;

export const navigationPrincipale = [
  { libelle: "Nos vélos", href: "/velos" },
  { libelle: "Itinéraires", href: "/itineraires" },
  { libelle: "Comment ça marche", href: "/comment-ca-marche" },
  { libelle: "Tarifs", href: "/tarifs" },
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
