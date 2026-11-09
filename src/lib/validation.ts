/**
 * Schémas de validation des entrées publiques.
 *
 * Toutes les données venant du navigateur repassent par ici côté serveur :
 * le formulaire de réservation valide déjà dans le navigateur, mais rien
 * n'empêche d'appeler l'API directement.
 */

import { z } from "zod";

import { optionsLocation } from "@/data/catalogue";
import { creneauOctobreRose, PLACES_MAX_PAR_INSCRIPTION, sortieOctobreRoseDu } from "@/data/octobre-rose";
import {
  CRENEAUX_ROAD_TRIP,
  estSurCommande,
  FERMETURE_COMPTOIR_HEURE,
  FERMETURE_HEURE,
  GRILLE_HORAIRE,
  heuresDepartPossibles,
  OUVERTURE_COMPTOIR_HEURE,
  OUVERTURE_HEURE,
  SORTIES_SUR_COMMANDE,
} from "@/data/offres";
import { ajouterJours, aujourdhui, estDateISOValide } from "./dates";

const dateISO = z
  .string()
  .refine(estDateISOValide, { message: "Date attendue au format AAAA-MM-JJ." });

// Les durées publiées sont les mêmes d'une gamme à l'autre : seul le
// prix change. On prend donc la grille Classique comme référence.
const DUREES_TARIFEES = GRILLE_HORAIRE.CLASSIQUE.map((palier) => palier.heures);

/** Heure de la journée, bornée à l'amplitude d'ouverture de l'atelier. */
const heureOuvrable = z.number().int().min(OUVERTURE_HEURE).max(FERMETURE_HEURE);

// `z.enum` exige au moins une valeur. Aucune option n'etant proposee
// aujourd'hui, le schema n'accepte tout simplement aucune option, et
// reste pret si l'on en rajoute un jour.
const codesOptions = optionsLocation.map((option) => option.code);
const schemaOption =
  codesOptions.length > 0
    ? z.object({
        code: z.enum(codesOptions as [string, ...string[]]),
        quantite: z.number().int().min(1).max(6),
      })
    : z.never();

/** Une gamme de vélos : c'est elle que le client choisit sur le site, et elle fixe le prix. */
const gammeVelo = z.enum(["CLASSIQUE", "PREMIUM", "PRESTIGE"]);

export const schemaDisponibilite = z
  .object({
    // La gamme, depuis que le site fait choisir une gamme et non un vélo ;
    // un vélo précis reste accepté pour une page ouverte avant ce changement.
    veloId: z.string().min(1).optional(),
    gamme: gammeVelo.optional(),
    // Toutes gammes confondues : Padel bike, dont les vélos sont attribués
    // d'office, compte tous les vélos libres.
    toutes: z.literal(true).optional(),
    dateDebut: dateISO,
    dateFin: dateISO,
    // Depuis que la disponibilité se compte à l'heure, une période seule
    // ne suffit plus à répondre : deux sorties peuvent partager la journée.
    // Toute heure de la journée : une sortie réglée dans l'administration
    // (Padel bike, le soir) peut rentrer après 22 h.
    heureDebut: z.number().int().min(0).max(23),
    heureFin: z.number().int().min(1).max(24),
  })
  .refine((valeurs) => valeurs.heureDebut < valeurs.heureFin, {
    message: "L'heure de retour doit suivre l'heure de départ.",
    path: ["heureFin"],
  })
  .refine((valeurs) => Boolean(valeurs.veloId || valeurs.gamme || valeurs.toutes), {
    message: "Gamme manquante.",
    path: ["gamme"],
  });

/** Le client d'une réservation en ligne : le téléphone y reçoit la demande de paiement. */
const clientEnLigne = z.object({
  prenom: z.string().trim().min(2, "Prénom trop court.").max(60),
  nom: z.string().trim().min(2, "Nom trop court.").max(60),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  // Obligatoire depuis SasPay : la demande de paiement est poussée
  // sur ce numéro. Sans lui, il n'y a personne à joindre.
  telephone: z
    .string()
    .trim()
    .regex(/^[+0-9 ().-]{8,20}$/, "Numéro de téléphone invalide.")
    .min(8, "Numéro Mobile Money nécessaire pour payer."),
});

/** Mobile Money uniquement : la carte bancaire n'est plus proposée. */
const moyenEnLigne = z.enum(["MTN_MONEY", "MOOV_MONEY", "CELTIIS_CASH"]);

const cgvEnLigne = z.literal(true, {
  errorMap: () => ({ message: "Les conditions générales doivent être acceptées." }),
});

/**
 * Le jour d'une sortie Octobre rose : l'un de ceux de la campagne
 * (src/data/octobre-rose.ts), et aucun autre. C'est le jour qui désigne la
 * sortie, donc son prix, ses horaires et ses places.
 */
const jourDeSortie = dateISO.refine((date) => sortieOctobreRoseDu(date) !== null, {
  message: "Choisissez l'un des jours de la sortie Octobre rose.",
});

/**
 * L'inscription en ligne à Octobre rose : le jour choisi, combien de
 * personnes, et qui paie. Ni vélo ni heure : le serveur prend les horaires
 * de la sortie de ce jour, et attribue les vélos lui-même.
 */
export const schemaInscriptionOctobreRose = z.object({
  offre: z.literal("octobre-rose"),
  date: jourDeSortie,
  nombrePersonnes: z
    .number()
    .int()
    .min(1)
    .max(PLACES_MAX_PAR_INSCRIPTION, `${PLACES_MAX_PAR_INSCRIPTION} personnes au plus par inscription.`),
  client: clientEnLigne,
  moyenPaiement: moyenEnLigne,
  message: z.string().trim().max(1000).optional(),
  cgvAcceptees: cgvEnLigne,
});

/**
 * La réservation en ligne de Padel bike (/padel-bike) : le jour, combien de
 * personnes, et qui paie. Ni heure, ni vélo, ni gamme : la sortie part à
 * l'heure réglée dans l'administration, et le serveur attribue un vélo
 * libre à chacun. L'ouverture, le jour, le délai et le nombre de personnes
 * réglés se vérifient ensuite (src/data/padel-bike.ts).
 */
export const schemaReservationPadel = z.object({
  offre: z.literal("padel-bike"),
  date: dateISO,
  nombrePersonnes: z.number().int().min(1).max(12, "12 personnes au plus par réservation."),
  client: clientEnLigne,
  moyenPaiement: moyenEnLigne,
  message: z.string().trim().max(1000).optional(),
  cgvAcceptees: cgvEnLigne,
});

export const schemaReservation = z
  .object({
    // Le client choisit une gamme, et le serveur lui attribue des vélos
    // libres de cette gamme. Un vélo précis reste accepté : un tunnel ouvert
    // avant ce changement l'envoie encore.
    veloId: z.string().min(1).optional(),
    gamme: gammeVelo.optional(),
    offre: z.enum(["road-trip", "location-libre"]),
    nombrePersonnes: z.number().int().min(1).max(12).default(1),
    // La durée n'est acceptée que si elle figure dans la grille
    // publiée : aucun tarif ne doit pouvoir être inventé par l'appelant.
    dureeHeures: z
      .number()
      .int()
      .refine((h) => DUREES_TARIFEES.includes(h), {
        message: "Durée non proposée.",
      })
      .optional(),
    dateDebut: dateISO,
    dateFin: dateISO,
    // Heure de départ : imposée par le créneau en road trip, choisie par
    // le client en location libre. Les deux cas sont vérifiés plus bas.
    heureDebut: heureOuvrable,
    options: z.array(schemaOption).max(8).default([]),
    /**
     * Code de parrainage saisi par le client.
     *
     * Jamais cru sur parole : la réduction est recalculée côté serveur
     * dans la transaction qui crée la réservation. Un code inconnu ou
     * épuisé ne fait pas échouer la réservation, il n'accorde simplement
     * rien, un refus à cette étape ferait perdre le vélo pour une faute
     * de frappe.
     */
    codeParrainage: z.string().trim().max(32).optional().or(z.literal("")),
    client: clientEnLigne,
    moyenPaiement: moyenEnLigne,
    message: z.string().trim().max(1000).optional(),
    cgvAcceptees: cgvEnLigne,
  })
  .refine(
    (valeurs) =>
      valeurs.offre === "road-trip"
        ? valeurs.dureeHeures === undefined
        : valeurs.dureeHeures !== undefined,
    {
      message:
        "La location libre exige une durée ; le road trip n'en prend pas.",
      path: ["dureeHeures"],
    },
  )
  .refine(
    (valeurs) => {
      if (valeurs.offre !== "road-trip") return true;
      // Le road trip est encadré : il ne part qu'aux créneaux publiés,
      // et seulement les jours où le coordinateur ouvre la route.
      const jourSemaine = new Date(`${valeurs.dateDebut}T12:00:00`).getDay();
      return CRENEAUX_ROAD_TRIP.some(
        (creneau) =>
          creneau.jourSemaine === jourSemaine && creneau.heureDebut === valeurs.heureDebut,
      );
    },
    {
      message: "Le road trip ne part qu'aux créneaux proposés.",
      path: ["heureDebut"],
    },
  )
  .refine(
    (valeurs) => {
      if (valeurs.offre !== "location-libre" || valeurs.dureeHeures === undefined) return true;
      // On refuse un départ hors des heures proposées : après 20 h, ou
      // dont le retour tomberait après 22 h, le vélo ne serait pas rendu.
      return heuresDepartPossibles(valeurs.dureeHeures).includes(valeurs.heureDebut);
    },
    {
      message: "Cette heure de départ n'est pas proposée : départs de 8 h à 20 h, vélo rendu à 22 h au plus tard.",
      path: ["heureDebut"],
    },
  )
  .refine((valeurs) => Boolean(valeurs.veloId || valeurs.gamme), {
    message: "Choisissez une gamme de vélo.",
    path: ["gamme"],
  })
  .refine((valeurs) => valeurs.dateDebut <= valeurs.dateFin, {
    message: "La date de retour doit suivre la date de départ.",
    path: ["dateFin"],
  })
  // Toute sortie tient dans la journée : le tunnel envoie toujours le même
  // jour. Une fin le lendemain, envoyée à la main, aurait payé une location
  // d'un jour en retenant le vélo deux, et échappé aux règles horaires du
  // second (road trip du week-end, sortie Octobre rose).
  .refine((valeurs) => valeurs.dateFin === valeurs.dateDebut, {
    message: "Une sortie se fait dans la journée.",
    path: ["dateFin"],
  })
  .refine(
    (valeurs) => {
      // Une location ne peut pas démarrer dans le passé. Le jour se lit
      // au Bénin : la location libre se réservant aussi la nuit, juste
      // après minuit l'horloge du serveur, en UTC, est encore à la veille.
      return valeurs.dateDebut >= aujourdhui();
    },
    { message: "La date de départ est déjà passée.", path: ["dateDebut"] },
  )
  .refine(
    (valeurs) => {
      // Garde-fou : au-delà de 60 jours, le tarif se négocie de vive voix.
      const jours =
        (Date.parse(`${valeurs.dateFin}T00:00:00Z`) - Date.parse(`${valeurs.dateDebut}T00:00:00Z`)) /
          86_400_000 +
        1;
      return jours <= 60;
    },
    { message: "Au-delà de 60 jours, contactez-nous directement.", path: ["dateFin"] },
  );

/**
 * « Où en est mon paiement ? », envoyé par le navigateur du client.
 *
 * Le jeton prouve que l'appelant détient bien le lien personnel de la
 * réservation ; l'identifiant du paiement, lui, n'est cru sur parole à
 * aucun moment, il est revérifié auprès de SasPay.
 */
export const schemaSuiviPaiement = z.object({
  token: z.string().trim().min(10).max(500),
  paiementId: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[A-Za-z0-9_-]+$/, "Identifiant de paiement invalide."),
});

export const schemaContact = z.object({
  nom: z.string().trim().min(2, "Nom trop court.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  sujet: z.string().trim().min(3, "Sujet trop court.").max(120),
  message: z.string().trim().min(10, "Message trop court.").max(2000),
  /**
   * Champ piège invisible : rempli, c'est un robot. Accepté ici quel qu'il
   * soit, et écarté par la route sans rien enregistrer : refusé à la
   * validation, il aurait appris au robot quel champ laisser vide.
   */
  siteWeb: z.string().optional(),
});

export type EntreeReservation = z.infer<typeof schemaReservation>;
export type EntreeContact = z.infer<typeof schemaContact>;

/* ------------------------------------------------- Ventes au comptoir */

/**
 * Une vente au comptoir : la formule, le vélo et le créneau.
 *
 * Mêmes garde-fous que la réservation en ligne sur tout ce qui fait le
 * prix (durée de la grille, créneau du road trip, jour de la sortie
 * Octobre rose) : c'est `calculerDevis` qui décide du montant, partout.
 *
 * Ce qui ne règle que la réservation en ligne ne s'applique pas : le
 * client est devant le commercial, l'argent à la main. Le road trip se
 * vend donc encore après sa clôture de la veille à 22 h, ou un dimanche
 * fermé en ligne parce que presque complet, et une location libre peut
 * partir dans l'heure qui a commencé, ou être saisie après coup dans la
 * journée. Elle part à l'heure pleine que tape le commercial, et rentre à
 * 22 h au plus tard (OUVERTURE_COMPTOIR_HEURE, FERMETURE_COMPTOIR_HEURE).
 *
 * Octobre rose se vend sans vélo choisi : les vélos sont attribués d'office,
 * un par participant, comme en ligne. `date` est le jour de la sortie
 * choisie, `heureDebut` l'heure pleine de son rassemblement
 * (`creneauOctobreRose(sortie).heureDebut`).
 *
 * Gbashi bike et Padel bike, sorties sur commande, partent au jour et à
 * l'heure pleine convenus avec le client, et rentrent avant 22 h
 * (SORTIES_SUR_COMMANDE). Gbashi bike se vend sur un vélo choisi, dont la
 * gamme fixe le prix ; Padel bike sans vélo choisi, ses vélos attribués
 * d'office. Pas de code de parrainage sur ces prix annoncés.
 */
const champsComptoir = z.object({
  veloId: z.string().optional(),
  offre: z.enum(["road-trip", "location-libre", "octobre-rose", "gbashi-bike", "padel-bike"]),
  nombrePersonnes: z.number().int().min(1).max(12).default(1),
  dureeHeures: z
    .number()
    .int()
    .refine((h) => DUREES_TARIFEES.includes(h), { message: "Durée non proposée." })
    .optional(),
  date: dateISO,
  heureDebut: z
    .number()
    .int()
    .min(OUVERTURE_COMPTOIR_HEURE, `Départ à partir de ${OUVERTURE_COMPTOIR_HEURE} h.`)
    .max(FERMETURE_COMPTOIR_HEURE - 1, `Départ avant ${FERMETURE_COMPTOIR_HEURE} h.`),
  codeParrainage: z.string().trim().max(32).optional().or(z.literal("")),
});

function reglesComptoir(valeurs: z.infer<typeof champsComptoir>, contexte: z.RefinementCtx) {
  const signaler = (chemin: string, message: string) =>
    contexte.addIssue({ code: z.ZodIssueCode.custom, message, path: [chemin] });

  const locationLibre = valeurs.offre === "location-libre";
  if (locationLibre ? valeurs.dureeHeures === undefined : valeurs.dureeHeures !== undefined) {
    signaler("dureeHeures", "La location libre exige une durée ; les sorties encadrées n'en prennent pas.");
  }
  if (valeurs.offre !== "octobre-rose" && valeurs.offre !== "padel-bike" && !valeurs.veloId) {
    signaler("veloId", "Choisissez un vélo.");
  }
  if (estSurCommande(valeurs.offre) && valeurs.codeParrainage) {
    signaler("codeParrainage", "Pas de code de parrainage sur une sortie sur commande : son prix est celui annoncé.");
  }
  if (valeurs.offre === "road-trip") {
    const jourSemaine = new Date(`${valeurs.date}T12:00:00Z`).getUTCDay();
    const creneau = CRENEAUX_ROAD_TRIP.some(
      (c) => c.jourSemaine === jourSemaine && c.heureDebut === valeurs.heureDebut,
    );
    if (!creneau) signaler("date", "Le road trip part le samedi et le dimanche, à 8 h.");
  } else if (valeurs.offre === "octobre-rose") {
    // Le jour désigne la sortie : un jour sans sortie n'a ni prix ni vélos.
    const sortie = sortieOctobreRoseDu(valeurs.date);
    if (!sortie) signaler("date", "Choisissez l'un des jours de la sortie Octobre rose.");
    else if (valeurs.heureDebut !== creneauOctobreRose(sortie).heureDebut) {
      signaler("heureDebut", "Octobre rose se vend pour l'heure de la sortie de ce jour.");
    }
  } else if (valeurs.offre === "padel-bike") {
    // Padel bike part à l'heure réglée dans l'administration, que le
    // serveur lit lui-même : rien à vérifier de l'heure saisie.
  } else if (estSurCommande(valeurs.offre)) {
    // Partie à l'heure convenue, la sortie rentre avant la fermeture.
    const duree = SORTIES_SUR_COMMANDE[valeurs.offre].dureeHeures;
    if (valeurs.heureDebut + duree > FERMETURE_COMPTOIR_HEURE) {
      signaler(
        "heureDebut",
        `La sortie dure ${duree} h et rentrerait après ${FERMETURE_COMPTOIR_HEURE} h : partez au plus tard à ${FERMETURE_COMPTOIR_HEURE - duree} h.`,
      );
    }
  } else if (
    valeurs.dureeHeures !== undefined &&
    valeurs.heureDebut + valeurs.dureeHeures > FERMETURE_COMPTOIR_HEURE
  ) {
    signaler(
      "heureDebut",
      `Le vélo rentrerait après ${FERMETURE_COMPTOIR_HEURE} h : partez plus tôt, ou louez moins longtemps.`,
    );
  }

  // Le jour se lit au Bénin, comme partout ailleurs.
  const jour = aujourdhui();
  if (valeurs.date < jour) signaler("date", "Cette date est passée.");
  else if (valeurs.date > ajouterJours(jour, 60)) signaler("date", "Au-delà de 60 jours, la vente n'est pas prise.");
}

/** Le devis d'une vente au comptoir, avant de l'encaisser. */
export const schemaDevisComptoir = champsComptoir.superRefine(reglesComptoir);

export const schemaVenteComptoir = champsComptoir
  .extend({
    client: z.object({
      prenom: z.string().trim().min(2, "Prénom trop court.").max(60),
      nom: z.string().trim().min(2, "Nom trop court.").max(60),
      // La facture part à cette adresse : sans elle, pas de facture.
      email: z.string().trim().toLowerCase().email("Adresse email invalide."),
      // Facultatif au comptoir : on ne pousse aucun paiement sur ce numéro.
      telephone: z
        .string()
        .trim()
        .regex(/^[+0-9 ().-]{8,20}$/, "Numéro de téléphone invalide.")
        .optional()
        .or(z.literal("")),
    }),
    /**
     * Qui a reçu l'argent. Lettres, chiffres, espaces, points, apostrophes
     * et tirets : il figure dans l'objet de l'email envoyé au gérant.
     */
    encaissePar: z
      .string()
      .trim()
      .min(2, "Indiquez qui a reçu l'argent.")
      .max(40, "Nom trop long.")
      .regex(/^[\p{L}\p{N} .'’-]+$/u, "Lettres, chiffres, espaces et tirets seulement."),
    /**
     * Le montant affiché au commercial, donc celui qu'il a encaissé. Le
     * serveur refuse d'enregistrer un autre montant que celui-là.
     */
    montantAttenduXof: z.number().int().min(0).max(5_000_000),
    /** Identifiant de la saisie : une vente envoyée deux fois n'est enregistrée qu'une fois. */
    cleVente: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Saisie invalide : rechargez la page."),
    cgvAcceptees: z.literal(true, {
      errorMap: () => ({ message: "Le client doit accepter les conditions générales." }),
    }),
  })
  .superRefine(reglesComptoir);

export type EntreeDevisComptoir = z.infer<typeof schemaDevisComptoir>;
export type EntreeVenteComptoir = z.infer<typeof schemaVenteComptoir>;

/** Met une erreur Zod en forme pour l'affichage champ par champ. */
export function erreursParChamp(erreur: z.ZodError): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const probleme of erreur.errors) {
    const chemin = probleme.path.join(".");
    if (!resultat[chemin]) resultat[chemin] = probleme.message;
  }
  return resultat;
}

/**
 * Une photo ou une vidéo de vélo : un fichier du site (`/images/…`) ou un
 * fichier déposé depuis l'admin dans le dossier velos/ du stockage Blob de
 * Bike Land (même hôte que dans next.config.ts). Aucune autre adresse, et
 * l'adresse entière est contrôlée, sans paramètre ni fragment : le site
 * n'affiche pas d'image venue d'un domaine qu'il ne contrôle pas.
 */
const fichierDuParc = z
  .string()
  .trim()
  .max(500)
  .regex(
    /^(\/images\/[\w./-]+|https:\/\/plbf2xjc382kgpsz\.public\.blob\.vercel-storage\.com\/velos\/[\w.-]+)$/,
    "Fichier non reconnu.",
  );

/**
 * Un vélo ajouté au parc depuis l'espace d'exploitation.
 *
 * Les bornes ne sont pas décoratives : une charge maximale de 5 kg ou un
 * poids de 300 kg trahit une faute de frappe, et cette fiche est lue par
 * le client pour savoir si le vélo le portera.
 */
export const schemaNouveauVelo = z.object({
  nom: z.string().trim().min(3, "Nom trop court.").max(80),
  categorie: z.enum(["VTT", "RANDONNEUR", "GRAVEL", "VAE", "VTC", "TANDEM"]),
  /** La gamme fixe le tarif : elle ne peut pas être laissée au hasard. */
  gamme: z.enum(["CLASSIQUE", "PREMIUM", "PRESTIGE"]),
  taille: z.enum(["S", "M", "L", "XL"]),
  accroche: z.string().trim().min(10, "Accroche trop courte.").max(140),
  description: z.string().trim().min(30, "Description trop courte.").max(1200),
  poidsKg: z.number().min(5, "Poids invalide.").max(60),
  vitesses: z.number().int().min(1).max(30),
  chargeMaxKg: z.number().int().min(60, "Charge maximale invalide.").max(250),
  autonomieConseilleeKm: z.number().int().min(5).max(300),
  equipementInclus: z.string().trim().max(400).default(""),
  pointDeRetraitId: z.string().trim().max(60).optional().or(z.literal("")),
  photo: fichierDuParc.optional().or(z.literal("")),
  video: fichierDuParc.optional().or(z.literal("")),
});

export type EntreeNouveauVelo = z.infer<typeof schemaNouveauVelo>;

/**
 * Avis d'un client sur sa sortie.
 *
 * La note suffit : demander un texte obligatoire ferait taire ceux qui
 * n'ont rien de particulier à dire, et ce sont souvent les sorties qui
 * se sont bien passées.
 */
export const schemaAvis = z.object({
  note: z.number().int().min(1, "Note attendue entre 1 et 5.").max(5),
  titre: z.string().trim().max(80).optional().or(z.literal("")),
  commentaire: z.string().trim().max(800).optional().or(z.literal("")),
});

export type EntreeAvis = z.infer<typeof schemaAvis>;

/* --------------------------------------------- Parrainage partenaires */

/** Un code tel que le client le saisit, avant normalisation. */
const codeParrainageSaisi = z
  .string()
  .trim()
  .min(3, "Code trop court.")
  .max(32, "Code trop long.")
  .regex(/^[A-Za-z0-9 _-]+$/, "Un code ne contient que lettres, chiffres et tirets.");

export const schemaVerificationParrainage = z.object({
  code: codeParrainageSaisi,
  /**
   * Montant sur lequel calculer l'aperçu.
   *
   * Sans danger : il ne sert qu'à afficher une remise estimée. Le devis
   * définitif est recalculé côté serveur à partir de la formule et de la
   * durée, jamais de ce que le navigateur annonce.
   */
  montantXof: z.number().int().min(0).max(5_000_000),
});

export const schemaNouveauPartenaire = z.object({
  nom: z.string().trim().min(2, "Nom trop court.").max(80),
  contact: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});

/**
 * Un code de parrainage créé depuis l'espace d'exploitation.
 *
 * Ni taux de réduction ni commission à saisir : ce sont des constantes de
 * politique commerciale (cf. src/lib/parrainage.ts), les mêmes pour tous
 * les partenaires.
 */
export const schemaNouveauCodeParrainage = z
  .object({
    code: codeParrainageSaisi,
    partenaireId: z.string().trim().min(1, "Partenaire manquant."),
    debuteLe: dateISO.optional().or(z.literal("")),
    finitLe: dateISO.optional().or(z.literal("")),
    utilisationsMax: z.number().int().min(1).max(10_000).optional(),
  })
  .refine(
    (valeurs) => !valeurs.debuteLe || !valeurs.finitLe || valeurs.debuteLe <= valeurs.finitLe,
    { message: "La fin de validité doit suivre le début.", path: ["finitLe"] },
  );

export type EntreeNouveauCodeParrainage = z.infer<typeof schemaNouveauCodeParrainage>;
