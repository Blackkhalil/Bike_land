/**
 * Emails transactionnels (§2.1, §6.1).
 *
 * Trois envois : la confirmation avec le lien de suivi, la facture, et le
 * rappel avant le départ. Resend est le fournisseur retenu ; sans clé
 * d'API, les messages sont journalisés dans la console plutôt que perdus,
 * ce qui permet de vérifier leur contenu en développement.
 */

import { itineraires } from "@/data/contenus";
import { formatHoraire, sortieDeLaReservation, texteOffertOctobreRose } from "@/data/octobre-rose";
import { formatHeureMinute } from "@/data/reglages";
import { creneauDuDepart, EXIGENCES, exigencesOctobreRose } from "@/data/offres";

import { site } from "./site";
import { numeroDeFacture } from "./facture";
import {
  formatCreneau,
  formatDateAvecJour,
  formatDateComplete,
  formatXof,
  libelleReglement,
  libelleRemise,
  nomDuRoadTrip,
  resumeOffre,
} from "./format";
import { cocosDe, paiementPrincipal } from "./reservations";
import type { Reservation } from "./types";

/** Le rose d'Octobre rose, celui du site (--color-rose-octobre). */
const ROSE = "#e8458b";

/**
 * L'espace insécable de la typographie française : avant « : », « ? »,
 * « ! », et entre un nombre et son unité, « 16 h 30 » ou « 3 vélos ».
 */
const INSECABLE = String.fromCharCode(0xa0);

/** Une réservation de la sortie Octobre rose : ses emails passent au rose. */
function enRose(reservation: Reservation): boolean {
  return reservation.offre === "octobre-rose";
}

/** « 3 vélos », « 1 casque » : le nombre et ce qu'il compte, d'un seul tenant. */
function compte(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n}${INSECABLE}${n > 1 ? pluriel : singulier}`;
}

/** « 3 personnes », « 1 personne ». */
function personnes(n: number): string {
  return compte(n, "personne");
}

/** « Référence : BL-4F2K9Q », une ligne de la version texte. */
function champ(libelle: string, valeur: string): string {
  return `${libelle}${INSECABLE}: ${valeur}`;
}

/** « samedi 24 octobre » devient « Samedi 24 octobre », en tête de ligne. */
function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Ce que la sortie Octobre rose de cette réservation a de propre, pour les
 * emails : son jour, le rendez-vous et le départ à la minute près, la
 * tenue, et le circuit, avec le lien vers sa page. La sortie se retrouve
 * par le jour de la réservation : chacun reçoit les heures de son jour, le
 * samedi comme le dimanche. `null` pour une inscription d'une campagne
 * passée (une facture de l'an dernier renvoyée cette année) : l'email s'en
 * tient alors aux heures enregistrées.
 */
function detailsSortie(reservation: Reservation) {
  const sortie = sortieDeLaReservation(reservation);
  if (!sortie) return null;
  // Le circuit de cette sortie-là, pas celui de la première de la liste :
  // un jour ajouté plus tard peut rouler ailleurs. Aucun quand la sortie
  // n'en annonce pas (plusieurs itinéraires) : l'email n'en parle pas.
  const circuit = sortie.itineraire
    ? itineraires.find((itineraire) => itineraire.slug === sortie.itineraire)
    : undefined;
  return {
    /** « samedi 24 octobre », pour les phrases. */
    jour: formatDateAvecJour(sortie.date),
    /** « samedi 24 octobre 2026 », pour la ligne « Date ». */
    date: formatDateComplete(sortie.date),
    rassemblement: formatHoraire(sortie.rassemblement),
    depart: formatHoraire(sortie.depart),
    retour: formatHoraire(sortie.retour),
    tenue: sortie.tenue,
    itineraire: circuit
      ? {
          titre: circuit.titre,
          // Sans la durée habituelle du circuit : celle de la sortie se lit
          // dans ses heures, du départ au retour, juste au-dessus.
          detail: `${circuit.distanceKm}${INSECABLE}km aller-retour, niveau ${circuit.niveau.toLowerCase()}. ${circuit.resume}`,
          url: `${site.url}/itineraires/${circuit.slug}`,
        }
      : undefined,
  };
}

/**
 * La ligne d'Octobre rose sur la facture : « Octobre rose, 3 personnes ×
 * 2 125 FCFA ». Un prix forfaitaire par personne, le même pour tous les
 * vélos.
 */
/**
 * « Vélo : Rubis », ou « Vélos : Rubis, Glacier, Soleil » pour une
 * réservation à plusieurs, un vélo par personne.
 */
function nomsDesVelos(reservation: Reservation): { libelle: string; noms: string } {
  const noms = reservation.lignes.map((ligne) => ligne.veloNom).filter(Boolean);
  return { libelle: noms.length > 1 ? "Vélos" : "Vélo", noms: noms.join(", ") || "non précisé" };
}

function ligneFactureOctobreRose(reservation: Reservation): string {
  const n = reservation.nombrePersonnes;
  const prixUnitaire = Math.round(reservation.sousTotalXof / Math.max(n, 1));
  return `Octobre rose, ${personnes(n)} × ${formatXof(prixUnitaire)}`;
}

interface Message {
  destinataire: string;
  sujet: string;
  html: string;
  texte: string;
  /**
   * Adresse à laquelle répondre, quand elle diffère de la nôtre.
   *
   * Sert aux notifications internes : un message de contact transféré à
   * l'équipe doit se répondre d'un clic au client, pas à nous-mêmes.
   */
  repondreA?: string;
}

/**
 * Transporteur Gmail, créé une seule fois.
 *
 * Gmail impose que l'expéditeur soit le compte authentifié : on ne peut
 * pas écrire « au nom de » quelqu'un d'autre. C'est la contrepartie de
 * cette solution, mais elle évite d'avoir à posséder un domaine, ce que
 * Resend exige pour écrire à autre chose que sa propre adresse.
 */
let transporteurGmail: import("nodemailer").Transporter | null = null;

function gmailConfigure(): { utilisateur: string; motDePasse: string } | null {
  const utilisateur = process.env.GMAIL_USER?.trim();
  // Google affiche le mot de passe d'application par groupes de quatre ;
  // les espaces sont décoratifs et feraient échouer l'authentification.
  const motDePasse = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!utilisateur || !motDePasse) return null;
  return { utilisateur, motDePasse };
}

async function envoyerParGmail(
  message: Message,
  identifiants: { utilisateur: string; motDePasse: string },
): Promise<{ envoye: boolean; raison?: string }> {
  const { default: nodemailer } = await import("nodemailer");

  transporteurGmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: identifiants.utilisateur, pass: identifiants.motDePasse },
    // Délais courts : par défaut, nodemailer attend jusqu'à deux minutes
    // une connexion qui ne vient pas, bien plus que le temps accordé à une
    // route. Un envoi bloqué échoue vite et se dit, au lieu de faire perdre
    // la réponse d'une réservation ou d'une vente déjà enregistrée.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });

  try {
    await transporteurGmail.sendMail({
      from: process.env.EMAIL_EXPEDITEUR?.trim() || `${site.nom} <${identifiants.utilisateur}>`,
      to: message.destinataire,
      subject: message.sujet,
      text: message.texte,
      html: message.html,
      replyTo: message.repondreA || site.email,
    });
    return { envoye: true };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : "erreur inconnue";
    console.error(`[email] Envoi Gmail refusé : ${detail}`);
    // Le transporteur peut être en cause (identifiants changés) : on le
    // jette pour que le prochain envoi en reconstruise un.
    transporteurGmail = null;
    return { envoye: false, raison: detail };
  }
}

export async function envoyer(message: Message): Promise<{ envoye: boolean; raison?: string }> {
  // Gmail d'abord : c'est la voie retenue pour Bike Land, faute de
  // domaine propre. Resend reste branché pour le jour où il y en aura un.
  const gmail = gmailConfigure();
  if (gmail) return envoyerParGmail(message, gmail);

  const cle = process.env.RESEND_API_KEY;

  if (!cle) {
    console.info(
      `[email] Aucun envoi configuré (ni Gmail ni Resend) : message journalisé.\n` +
        `  À : ${message.destinataire}\n  Objet : ${message.sujet}\n${message.texte}`,
    );
    return { envoye: false, raison: "aucun fournisseur configuré" };
  }

  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // `||` et non `??` : dans un fichier .env, une variable laissée vide
      // vaut la chaîne vide et non `undefined`. Un expéditeur vide ferait
      // rejeter l'envoi par Resend au lieu de retomber sur le défaut.
      from: process.env.EMAIL_EXPEDITEUR?.trim() || `${site.nom} <${site.email}>`,
      // L'expéditeur technique appartient à Resend tant que Bike Land n'a
      // pas son propre domaine vérifié : on ne peut pas prouver la
      // possession de gmail.com. Sans cette ligne, répondre à un email de
      // confirmation écrirait dans le vide.
      reply_to: message.repondreA || site.email,
      to: [message.destinataire],
      subject: message.sujet,
      html: message.html,
      text: message.texte,
    }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    console.error(`[email] Envoi refusé (HTTP ${reponse.status}) : ${detail}`);
    return { envoye: false, raison: `HTTP ${reponse.status}` };
  }
  return { envoye: true };
}

/** Ce que la reservation demande au client, selon l'offre choisie. */
function detailsOffre(reservation: Reservation): [string, string][] {
  if (reservation.offre === "location-libre") {
    return [
      ["Formule", "Location libre"],
      ["Durée", `${reservation.dureeHeures} h`],
    ];
  }
  if (reservation.offre === "octobre-rose") {
    return [
      ["Sortie", "Octobre rose"],
      ["Participants", personnes(reservation.nombrePersonnes)],
    ];
  }
  if (reservation.offre === "gbashi-bike" || reservation.offre === "padel-bike") {
    return [
      ["Formule", reservation.offre === "gbashi-bike" ? "Gbashi bike, sortie sur commande" : "Padel bike : à vélo jusqu'au terrain de padel, puis le padel"],
      ["Participants", personnes(reservation.nombrePersonnes)],
    ];
  }
  const nom = nomDuRoadTrip(reservation);
  return [
    ["Formule", nom === "Road trip" ? "Road trip encadré" : `${nom}, road trip encadré`],
    ["Participants", personnes(reservation.nombrePersonnes)],
  ];
}

/**
 * Ce qu'il faut prevoir au depart.
 *
 * La caution de la location libre se remet EN ESPECES au depart et se
 * recupere a la restitution du velo : elle n'est ni prelevee en ligne,
 * ni pre-autorisee sur un compte.
 */
function aPrevoir(reservation: Reservation): string[] {
  if (reservation.offre === "location-libre") {
    return [
      `Une caution de ${formatXof(reservation.cautionXof)} en espèces, rendue quand vous rapportez ${reservation.lignes.length > 1 ? "les vélos" : "le vélo"}.`,
      "Une pièce d'identité (CIP), qui vous est rendue au retour du vélo.",
      "La signature de l'engagement de restitution, sur place.",
    ];
  }
  // Les consignes avec les heures de la sortie de ce jour-là.
  if (reservation.offre === "octobre-rose") return exigencesOctobreRose(sortieDeLaReservation(reservation));
  if (reservation.offre === "gbashi-bike" || reservation.offre === "padel-bike") {
    return [...EXIGENCES[reservation.offre], "Aucune caution n'est demandée : la sortie est encadrée."];
  }
  // Un départ qui demande une tenue (sa consigne) la dit d'abord.
  const consigne = creneauDuDepart(reservation.dateDebut, reservation.heureDebut)?.consigne;
  return [
    ...(consigne ? [consigne] : []),
    "Rien à apporter : casque, antivol et kit sont fournis au départ.",
    "Aucune caution n'est demandée : un coordinateur encadre la sortie et récupère le vélo à l'arrivée.",
  ];
}

/**
 * Accuse de reception, envoye des l'enregistrement.
 *
 * Il porte le lien de suivi personnel, que la confirmation redonne
 * ensuite. La base n'en stocke que le hache : le serveur le reconstitue
 * avec le secret de signature (voir `genererToken`), une fuite de la base
 * seule ne permet donc pas de forger un lien vers une reservation.
 */
export async function envoyerReceptionDemande(reservation: Reservation, lienSuivi: string) {
  const rose = enRose(reservation);
  return envoyer({
    destinataire: reservation.client.email,
    sujet: rose
      ? `Octobre rose : votre inscription ${reservation.reference} est enregistrée`
      : `Votre demande ${reservation.reference} est enregistrée`,
    texte: [
      `Bonjour ${reservation.client.prenom},`,
      "",
      `Votre ${rose ? "inscription à Octobre rose" : "demande"} est enregistrée sous la référence ${reservation.reference}.`,
      "Elle sera confirmée dès réception de votre paiement.",
      "",
      `Conservez ce lien, il est le seul moyen de retrouver votre réservation :`,
      lienSuivi,
      "",
      `L'équipe ${site.nom}, ${site.telephone}`,
    ].join("\n"),
    html: gabarit({
      titre: rose ? "Inscription enregistrée" : "Demande enregistrée",
      intro: `Bonjour ${reservation.client.prenom}, nous confirmons dès réception du paiement.`,
      lignes: [
        ["Référence", reservation.reference],
        ...detailsOffre(reservation),
        ["Date", formatCreneau(reservation)],
        ["Montant à régler", formatXof(reservation.totalXof)],
      ],
      action: { libelle: "Suivre ma demande", url: lienSuivi },
      pied: "Conservez ce lien : il vous est personnel et donne accès à votre réservation sans mot de passe.",
      theme: rose ? "rose" : undefined,
    }),
  });
}

/** Où retrouver Bike Land, et comment joindre l'équipe le jour venu. */
interface RendezVous {
  lieu: string;
  indication: string;
  carte: string;
  whatsapp: { numero: string; lien: string }[];
}

/**
 * Le point de départ, tel que l'email de confirmation le donne.
 *
 * Réservé aux clients qui ont payé : les pages publiques ne donnent pas
 * l'adresse. Chaque lien WhatsApp ouvre la conversation sur un premier
 * message déjà écrit, avec la référence : l'équipe sait d'emblée de
 * quelle réservation il s'agit.
 */
function rendezVousDe(reservation: Reservation): RendezVous {
  const message = encodeURIComponent(
    `Bonjour ${site.nom}, je suis ${reservation.client.prenom}, réservation ${reservation.reference}.`,
  );
  return {
    ...site.pointDeDepart,
    whatsapp: site.whatsapp.map((ligne) => ({
      numero: ligne.numero,
      lien: `${ligne.lien}?text=${message}`,
    })),
  };
}

/**
 * La confirmation d'une inscription à Octobre rose, aux couleurs de la
 * campagne.
 *
 * Elle dit tout ce qui sert le jour venu, sans rien à chercher ailleurs : le
 * rendez-vous et le départ à la minute près, la tenue, le point de départ
 * et sa carte, le circuit quand un seul est annoncé, et la facture elle-même, avec
 * son numéro et son règlement. Pas de nom de vélo : le vélo de chacun est
 * remis au rassemblement.
 */
async function envoyerConfirmationOctobreRose(reservation: Reservation, lienSuivi: string) {
  const sortie = detailsSortie(reservation);
  const prevoir = aPrevoir(reservation);
  const rendezVous = rendezVousDe(reservation);
  const n = reservation.nombrePersonnes;
  const places = n > 1 ? `vos ${n} places sont réservées` : "votre place est réservée";
  const facture = numeroDeFacture(reservation);
  const paiement = paiementPrincipal(reservation);
  const reglement = paiement ? libelleReglement(paiement.moyen) : null;

  const lignesSortie: [string, string][] = sortie
    ? [
        ["Date", sortie.jour.charAt(0).toUpperCase() + sortie.jour.slice(1)],
        ["Rassemblement", `${sortie.rassemblement}, au point de départ`],
        ["Départ du groupe", sortie.depart],
        ["Retour", `vers ${sortie.retour}`],
        ["Dress code", sortie.tenue],
        ["Compris", "Vélo et casque"],
        ["Offert à chacun", texteOffertOctobreRose()],
      ]
    : [["Date", formatCreneau(reservation)]];

  const texte = [
    `Bonjour ${reservation.client.prenom},`,
    "",
    `Merci de rouler avec nous pour Octobre rose : votre paiement est reçu, ${places}.`,
    `Bike Land soutient la lutte contre le cancer du sein : d'où ce prix forfaitaire, le même pour tous nos vélos.`,
    "",
    `Référence : ${reservation.reference}`,
    `Participants : ${personnes(n)}`,
    ...lignesSortie.map(([libelle, valeur]) => `${libelle} : ${valeur}`),
    "",
    ...(sortie?.itineraire
      ? [`L'itinéraire : ${sortie.itineraire.titre}.`, sortie.itineraire.detail, sortie.itineraire.url, ""]
      : []),
    "À prévoir :",
    ...prevoir.map((ligne) => `  - ${ligne}`),
    "",
    `Où nous trouver : ${rendezVous.lieu}.`,
    rendezVous.indication,
    `Carte : ${rendezVous.carte}`,
    "",
    `Votre facture ${facture} :`,
    `  ${ligneFactureOctobreRose(reservation)} : ${formatXof(reservation.sousTotalXof)}`,
    `  Total réglé : ${formatXof(reservation.totalXof)}${reglement ? `, ${reglement}` : ""}`,
    `  À télécharger depuis votre lien : ${lienSuivi}#facture`,
    "",
    "Une question, un retard ? Écrivez-nous sur WhatsApp :",
    ...site.whatsapp.map((ligne) => `  ${ligne.numero} : ${ligne.lien}`),
    "",
    `Votre réservation et sa facture, à tout moment :`,
    lienSuivi,
    `Ce lien vous est personnel, gardez-le.`,
    "",
    `À ${sortie ? sortie.jour.split(" ")[0] : "bientôt"}, tout en rose,`,
    `L'équipe ${site.nom}, ${site.telephone}`,
  ].join("\n");

  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Octobre rose : ${places} (${reservation.reference})`,
    texte,
    html: gabarit({
      titre: n > 1 ? "Vos places sont réservées" : "Votre place est réservée",
      intro:
        `Bonjour ${reservation.client.prenom}, merci de rouler avec nous pour Octobre rose ! ` +
        `Votre paiement est reçu. Rendez-vous ${sortie ? `${sortie.jour}, ` : ""}tout en rose.`,
      lignes: [
        ["Référence", reservation.reference],
        ...detailsOffre(reservation),
        ...lignesSortie,
        ["Montant réglé", formatXof(reservation.totalXof)],
      ],
      action: { libelle: "Voir ma réservation", url: lienSuivi },
      itineraire: sortie?.itineraire,
      rendezVous,
      facture: {
        numero: facture,
        lignes: [
          [ligneFactureOctobreRose(reservation), formatXof(reservation.sousTotalXof)],
          ["Total réglé", formatXof(reservation.totalXof)],
          ...(reglement ? ([["Règlement", reglement]] as [string, string][]) : []),
        ],
        url: `${lienSuivi}#facture`,
      },
      pied: `À prévoir : ${prevoir.join(" ")}`,
      theme: "rose",
    }),
  });
}

export async function envoyerConfirmation(reservation: Reservation, lienSuivi: string) {
  if (enRose(reservation)) return envoyerConfirmationOctobreRose(reservation, lienSuivi);
  const velos = nomsDesVelos(reservation);
  const prevoir = aPrevoir(reservation);
  const rendezVous = rendezVousDe(reservation);

  // Le lieu d'abord, juste après la salutation : le client le trouve sans
  // chercher, et n'a plus à écrire pour le redemander.
  const texte = [
    `Bonjour ${reservation.client.prenom},`,
    "",
    `Votre paiement est reçu, votre réservation est confirmée.`,
    "",
    `Où nous trouver : ${rendezVous.lieu}.`,
    rendezVous.indication,
    `Carte : ${rendezVous.carte}`,
    "",
    `Référence : ${reservation.reference}`,
    `${velos.libelle} : ${velos.noms}`,
    `Date : ${formatCreneau(reservation)}`,
    `Montant réglé : ${formatXof(reservation.totalXof)}`,
    "",
    "À prévoir au départ :",
    ...prevoir.map((ligne) => `  - ${ligne}`),
    "",
    "Une question, un retard ? Écrivez-nous sur WhatsApp :",
    ...site.whatsapp.map((ligne) => `  ${ligne.numero} : ${ligne.lien}`),
    "",
    `Votre réservation, votre facture et son annulation éventuelle :`,
    lienSuivi,
    `Ce lien vous est personnel, gardez-le.`,
    "",
    `À bientôt sur la route,`,
    `L'équipe ${site.nom}, ${site.telephone}`,
  ].join("\n");

  return envoyer({
    destinataire: reservation.client.email,
    // Le lieu jusque dans l'objet : il se lit dans la liste des messages.
    sujet: `Réservation ${reservation.reference} confirmée : rendez-vous à ${rendezVous.lieu}`,
    texte,
    html: gabarit({
      titre: "Réservation confirmée",
      intro: `Bonjour ${reservation.client.prenom}, votre paiement est reçu.`,
      lignes: [
        ["Référence", reservation.reference],
        [velos.libelle, velos.noms],
        ...detailsOffre(reservation),
        ["Date", formatCreneau(reservation)],
        ["Montant réglé", formatXof(reservation.totalXof)],
        ...(reservation.cautionXof > 0
          ? ([
              [
                "Caution",
                `${formatXof(reservation.cautionXof)} en espèces au départ, rendue au retour du vélo`,
              ],
            ] as [string, string][])
          : []),
      ],
      // Sans ce bouton, la version HTML de la confirmation ne contenait
      // aucun lien : le client qui la rouvrait pour retrouver sa
      // réservation n'avait rien à cliquer. C'est pourtant l'email vers
      // lequel il revient, bien plus que vers celui de la demande.
      action: { libelle: "Voir ma réservation", url: lienSuivi },
      rendezVous,
      pied: `À prévoir au départ : ${prevoir.join(" ")}`,
    }),
  });
}

/**
 * Rappel envoyé la veille de la sortie.
 *
 * Il redonne ce qui sert le jour même, et rien d'autre : l'heure, ce
 * qu'il faut apporter, où nous trouver et comment nous joindre. Le road
 * trip part en groupe à heure fixe, d'où l'heure de rendez-vous, un quart
 * d'heure avant le départ.
 */
/** Le rappel de la veille d'Octobre rose : le rendez-vous, la tenue, le lieu. */
async function envoyerRappelOctobreRose(reservation: Reservation, lienSuivi: string) {
  const sortie = detailsSortie(reservation);
  const prevoir = aPrevoir(reservation);
  const rendezVous = rendezVousDe(reservation);
  const lignesSortie: [string, string][] = sortie
    ? [
        ["Rassemblement", `${sortie.rassemblement}, au point de départ`],
        ["Départ du groupe", sortie.depart],
        ["Retour", `vers ${sortie.retour}`],
        ["Dress code", sortie.tenue],
      ]
    : [["Date", formatCreneau(reservation)]];

  return envoyer({
    destinataire: reservation.client.email,
    sujet: sortie
      ? `C'est demain : Octobre rose, rassemblement à ${sortie.rassemblement}`
      : `C'est demain : Octobre rose`,
    texte: [
      `Bonjour ${reservation.client.prenom},`,
      "",
      `Octobre rose, c'est demain ! On roule ensemble, tout en rose.`,
      `Référence : ${reservation.reference}`,
      `Participants : ${personnes(reservation.nombrePersonnes)}`,
      ...lignesSortie.map(([libelle, valeur]) => `${libelle} : ${valeur}`),
      "",
      "À prévoir :",
      ...prevoir.map((ligne) => `  - ${ligne}`),
      "",
      `Où nous trouver : ${rendezVous.lieu}.`,
      rendezVous.indication,
      `Carte : ${rendezVous.carte}`,
      ...(sortie?.itineraire ? ["", `L'itinéraire : ${sortie.itineraire.titre}, ${sortie.itineraire.url}`] : []),
      "",
      "Un empêchement, un retard ? Écrivez-nous sur WhatsApp :",
      ...site.whatsapp.map((ligne) => `  ${ligne.numero} : ${ligne.lien}`),
      "",
      "Votre réservation :",
      lienSuivi,
      "",
      `À demain, tout en rose,`,
      `L'équipe ${site.nom}, ${site.telephone}`,
    ].join("\n"),
    html: gabarit({
      titre: "C'est demain",
      intro: `Bonjour ${reservation.client.prenom}, Octobre rose, c'est demain ! Voici l'essentiel pour être au rendez-vous, tout en rose.`,
      lignes: [
        ["Référence", reservation.reference],
        ...detailsOffre(reservation),
        ...lignesSortie,
      ],
      action: { libelle: "Voir ma réservation", url: lienSuivi },
      itineraire: sortie?.itineraire,
      rendezVous,
      pied: `À prévoir : ${prevoir.join(" ")}`,
      theme: "rose",
    }),
  });
}

export async function envoyerRappel(reservation: Reservation, lienSuivi: string) {
  if (enRose(reservation)) return envoyerRappelOctobreRose(reservation, lienSuivi);
  const velos = nomsDesVelos(reservation);
  const prevoir = aPrevoir(reservation);
  const rendezVous = rendezVousDe(reservation);
  const roadTrip = reservation.offre === "road-trip";
  const arrivee = `${reservation.heureDebut - 1} h 45`;

  const texte = [
    `Bonjour ${reservation.client.prenom},`,
    "",
    `Votre sortie ${site.nom}, c'est demain.`,
    "",
    `Où nous trouver : ${rendezVous.lieu}.`,
    rendezVous.indication,
    `Carte : ${rendezVous.carte}`,
    "",
    `Référence : ${reservation.reference}`,
    `${velos.libelle} : ${velos.noms}`,
    `Date : ${formatCreneau(reservation)}`,
    ...(roadTrip
      ? [`Rendez-vous à ${arrivee}, un quart d'heure avant le départ : le groupe part à l'heure.`]
      : []),
    "",
    "À prévoir au départ :",
    ...prevoir.map((ligne) => `  - ${ligne}`),
    "",
    "Un empêchement, un retard ? Écrivez-nous sur WhatsApp :",
    ...site.whatsapp.map((ligne) => `  ${ligne.numero} : ${ligne.lien}`),
    "",
    "Votre réservation :",
    lienSuivi,
    "",
    `À demain sur la route,`,
    `L'équipe ${site.nom}, ${site.telephone}`,
  ].join("\n");

  return envoyer({
    destinataire: reservation.client.email,
    sujet: `C'est demain : départ à ${reservation.horaire ? formatHeureMinute(reservation.horaire.depart) : `${reservation.heureDebut} h`} de ${rendezVous.lieu}`,
    texte,
    html: gabarit({
      titre: "C'est demain",
      intro: `Bonjour ${reservation.client.prenom}, votre sortie approche. Voici l'essentiel pour demain.`,
      lignes: [
        ["Référence", reservation.reference],
        [velos.libelle, velos.noms],
        ...detailsOffre(reservation),
        ["Date", formatCreneau(reservation)],
        ...(roadTrip
          ? ([["Rendez-vous", `${arrivee}, un quart d'heure avant le départ`]] as [string, string][])
          : []),
      ],
      action: { libelle: "Voir ma réservation", url: lienSuivi },
      rendezVous,
      pied: `À prévoir au départ : ${prevoir.join(" ")}`,
    }),
  });
}

export async function envoyerFacture(reservation: Reservation, numeroFacture: string, lienSuivi: string) {
  // Le règlement figure sur la facture : un client qui a payé en espèces au
  // comptoir doit pouvoir la produire comme reçu.
  const paiement = paiementPrincipal(reservation);
  const reglement = paiement ? libelleReglement(paiement.moyen) : null;
  // Le lieu aussi, en tête : un client qui n'ouvre que la facture le trouve
  // là, sans les numéros WhatsApp, que donne la confirmation.
  const rendezVous = rendezVousDe(reservation);
  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Facture ${numeroFacture}, ${site.nom}`,
    texte:
      `Bonjour ${reservation.client.prenom},\n\n` +
      `Voici votre facture ${numeroFacture} d'un montant de ${formatXof(reservation.totalXof)} ` +
      `pour la réservation ${reservation.reference}` +
      `${reglement ? `, réglée ${paiement?.moyen === "ESPECES" ? "en espèces" : `par ${reglement}`}` : ""}.\n\n` +
      `Elle est téléchargeable à tout moment depuis ${lienSuivi}.\n\n` +
      `Où nous trouver : ${rendezVous.lieu}.\n${rendezVous.indication}\nCarte : ${rendezVous.carte}\n`,
    html: gabarit({
      titre: `Facture ${numeroFacture}`,
      intro: `Réservation ${reservation.reference}`,
      rendezVous: { ...rendezVous, whatsapp: [] },
      lignes: [
        ["Sous-total location", formatXof(reservation.sousTotalXof)],
        ...(reservation.remiseXof > 0
          ? ([[libelleRemise(reservation), `− ${formatXof(reservation.remiseXof)}`]] as [string, string][])
          : []),
        ...(reservation.optionsXof > 0
          ? ([["Options", formatXof(reservation.optionsXof)]] as [string, string][])
          : []),
        ["Total réglé", formatXof(reservation.totalXof)],
        ...(reglement ? ([["Règlement", reglement]] as [string, string][]) : []),
      ],
      action: { libelle: "Télécharger la facture", url: `${lienSuivi}#facture` },
      pied: "Montants exprimés en francs CFA (XOF).",
      theme: enRose(reservation) ? "rose" : undefined,
    }),
  });
}

/**
 * Notification à l'exploitant : un vélo vient d'être réservé.
 *
 * Destinataire configurable (plusieurs personnes consultent parfois la
 * même boîte que le contact public) ; à défaut, on retombe sur l'adresse
 * publique du site plutôt que de rester silencieux.
 */
export async function envoyerNotificationAdmin(reservation: Reservation) {
  const destinataire = process.env.ADMIN_EMAIL || site.email;
  const velos = reservation.lignes.map((ligne) => ligne.veloNom).join(", ") || "non précisé";
  const contact = reservation.client.telephone || reservation.client.email;
  const lienAdmin = `${site.urlAdmin}/admin/reservations?reference=${reservation.reference}`;

  // Référence du paiement chez l'agrégateur : c'est elle qu'il faut
  // citer pour retrouver la transaction, réclamer un remboursement ou
  // rapprocher un versement. Sans elle, il faut fouiller.
  const paiement = paiementPrincipal(reservation);
  const referencePaiement = paiement?.referenceFournisseur ?? "non communiquée";

  // Une vente au comptoir : l'argent est dans la caisse, et ce qui compte
  // pour le gérant, c'est qui l'a reçu. Chaque vente en espèces lui arrive
  // ainsi au moment où elle est saisie, sans qu'il ait à ouvrir l'admin.
  const especes = paiement?.moyen === "ESPECES";
  const encaissePar = paiement?.encaissePar ?? "non renseigné";
  // Octobre rose : ce que l'équipe retient, c'est le nombre de places.
  const objet = enRose(reservation)
    ? `Octobre rose, ${reservation.nombrePersonnes} place${reservation.nombrePersonnes > 1 ? "s" : ""}`
    : velos;
  const n = reservation.nombrePersonnes;
  // Road trip : deux cocos par personne, comme le devis les promet au client.
  const cocos = cocosDe(reservation);
  const aPreparer =
    reservation.cautionXof > 0
      ? `À réclamer au départ : pièce d'identité, engagement signé et caution de ${formatXof(reservation.cautionXof)} en espèces.`
      : enRose(reservation)
        ? `À préparer : ${n} vélo${n > 1 ? "s" : ""} (${velos}), ${n} casque${n > 1 ? "s" : ""}, et à offrir ${texteOffertOctobreRose(n)} pour la sortie Octobre rose.`
        : reservation.offre === "padel-bike"
          ? // Padel bike ne promet ni eau ni coco : les vélos et les casques.
            `À préparer : ${n} vélo${n > 1 ? "s" : ""} (${velos}) et ${n} casque${n > 1 ? "s" : ""}, pour Padel bike.`
          : `À prévoir : ${cocos} coco${cocos > 1 ? "s" : ""} et ${n} eau${n > 1 ? "x" : ""}.`;

  return envoyer({
    destinataire,
    sujet: especes
      ? `Vente en espèces ${reservation.reference} : ${formatXof(reservation.totalXof)}, ${encaissePar}`
      : `Réservation payée ${reservation.reference} : ${objet}`,
    texte: [
      especes
        ? `Vente au comptoir : ${formatXof(reservation.totalXof)} reçus en espèces par ${encaissePar}.`
        : `Réservation confirmée : le paiement est encaissé.`,
      "",
      `Référence réservation : ${reservation.reference}`,
      especes ? `Encaissé par : ${encaissePar}` : `Référence paiement : ${referencePaiement}`,
      "",
      `Client : ${reservation.client.prenom} ${reservation.client.nom}`,
      `Email : ${reservation.client.email}`,
      `Téléphone : ${reservation.client.telephone ?? "non renseigné"}`,
      "",
      `${reservation.lignes.length > 1 ? "Vélos" : "Vélo"} : ${velos}`,
      `Date : ${formatCreneau(reservation)}`,
      reservation.codeParrainage
        ? `Code de parrainage : ${reservation.codeParrainage}`
        : "",
      `Formule : ${resumeOffre(reservation)}`,
      aPreparer,
      `Montant : ${formatXof(reservation.totalXof)}`,
      reservation.message ? `Message du client : ${reservation.message}` : "",
      "",
      `Voir dans l'administration : ${lienAdmin}`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: gabarit({
      titre: especes ? "Vente en espèces" : "Réservation payée",
      intro: especes
        ? `${encaissePar} a encaissé ${formatXof(reservation.totalXof)} en espèces pour ${reservation.client.prenom} ${reservation.client.nom}.`
        : `${reservation.client.prenom} ${reservation.client.nom} vient de réserver et de payer.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Client", `${reservation.client.prenom} ${reservation.client.nom}`],
        ["Email", reservation.client.email],
        ["Téléphone", reservation.client.telephone ?? "non renseigné"],
        [enRose(reservation) ? "Vélos attribués" : "Vélo", velos],
        ["Départ", formatCreneau(reservation)],
        ["Montant payé", formatXof(reservation.totalXof)],
        especes ? ["Encaissé par", encaissePar] : ["Référence paiement", referencePaiement],
        ...(reservation.codeParrainage
          ? ([["Code de parrainage", reservation.codeParrainage]] as [string, string][])
          : []),
      ],
      action: { libelle: "Voir la réservation", url: lienAdmin },
      pied: reservation.message ? `Message du client : « ${reservation.message} »` : undefined,
    }),
  });
}

/**
 * Prévient le gérant qu'une réservation payée vient d'être annulée.
 *
 * Personne n'en était averti : le client annulait depuis son lien de
 * suivi, et l'argent à rendre ne se voyait qu'en ouvrant l'admin. Le
 * montant suit l'article 5 des CGV (`montantARendre`), et le moyen dit par
 * où le rendre : en espèces au comptoir, ou par Mobile Money.
 *
 * Une vente au comptoir annulée depuis l'administration le dit aussi :
 * l'argent est rendu sur-le-champ, mais le gérant suit chaque sortie de
 * caisse, comme chaque entrée.
 */
export async function envoyerAnnulationAdmin(
  reservation: Reservation,
  aRendreXof: number,
  origine: "client" | "comptoir" = "client",
) {
  const destinataire = process.env.ADMIN_EMAIL || site.email;
  const paiement = paiementPrincipal(reservation);
  const especes = paiement?.moyen === "ESPECES";
  const lienAdmin = `${site.urlAdmin}/admin/reservations?reference=${reservation.reference}`;
  const encaissement = paiement?.encaissePar ? ` (vente encaissée par ${paiement.encaissePar})` : "";
  const commentRendre = especes ? `en espèces, au comptoir${encaissement}` : "par Mobile Money";
  const comptoir = origine === "comptoir";
  const constat = comptoir
    ? `La vente en espèces ${reservation.reference} a été annulée depuis l'administration : ${formatXof(aRendreXof)} rendus sur-le-champ${encaissement}.`
    : `${reservation.client.prenom} ${reservation.client.nom} a annulé sa réservation ${reservation.reference}.`;

  return envoyer({
    destinataire,
    sujet: comptoir
      ? `Vente en espèces annulée ${reservation.reference} : ${formatXof(aRendreXof)} rendus`
      : `Annulation ${reservation.reference} : ${formatXof(aRendreXof)} à rendre`,
    texte: [
      constat,
      "",
      `Client : ${reservation.client.prenom} ${reservation.client.nom}`,
      `Payé : ${formatXof(reservation.totalXof)}`,
      comptoir ? `Rendu : ${formatXof(aRendreXof)}` : `À rendre : ${formatXof(aRendreXof)}, ${commentRendre}`,
      `Départ prévu : ${formatCreneau(reservation)}`,
      `Téléphone : ${reservation.client.telephone ?? "non renseigné"}`,
      `Email : ${reservation.client.email}`,
      "",
      `Voir dans l'administration : ${lienAdmin}`,
    ].join("\n"),
    html: gabarit({
      titre: comptoir ? "Vente en espèces annulée" : "Réservation annulée",
      intro: comptoir
        ? constat
        : `${reservation.client.prenom} ${reservation.client.nom} a annulé sa réservation : ${formatXof(aRendreXof)} à lui rendre.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Client", `${reservation.client.prenom} ${reservation.client.nom}`],
        ["Payé", formatXof(reservation.totalXof)],
        comptoir ? ["Rendu", formatXof(aRendreXof)] : ["À rendre", `${formatXof(aRendreXof)}, ${commentRendre}`],
        ["Départ prévu", formatCreneau(reservation)],
        ["Téléphone", reservation.client.telephone ?? "non renseigné"],
        ["Email", reservation.client.email],
      ],
      action: { libelle: "Voir la réservation", url: lienAdmin },
      pied: comptoir
        ? undefined
        : "Selon les CGV : tout est rendu jusqu'à 72 heures avant le départ, la moitié ensuite.",
    }),
  });
}

/**
 * Prévient le client que sa vente au comptoir a été annulée par Bike Land
 * (erreur de saisie, ou renoncement sur place), et que son argent lui a été
 * rendu. Il avait reçu une confirmation et une facture : sans cet email,
 * il garderait une facture pour une location qui n'existe plus.
 */
export async function envoyerAnnulationComptoir(reservation: Reservation) {
  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Votre réservation ${reservation.reference} est annulée`,
    texte: [
      `Bonjour ${reservation.client.prenom},`,
      "",
      `Votre réservation ${reservation.reference} (${formatCreneau(reservation)}) est annulée.`,
      `Les ${formatXof(reservation.totalXof)} réglés en espèces vous ont été rendus au comptoir.`,
      "La facture correspondante est annulée.",
      "",
      `Une question ? Appelez-nous au ${site.telephone}.`,
      "",
      `L'équipe ${site.nom}`,
    ].join("\n"),
    html: gabarit({
      titre: "Réservation annulée",
      intro: `Bonjour ${reservation.client.prenom}, votre réservation est annulée et votre argent vous a été rendu.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Date prévue", formatCreneau(reservation)],
        ["Rendu en espèces", formatXof(reservation.totalXof)],
      ],
      pied: `La facture correspondante est annulée. Une question ? ${site.telephone}.`,
    }),
  });
}

/**
 * Prévient l'équipe qu'un message vient d'arriver.
 *
 * Le client recevait son accusé de réception, mais personne chez Bike Land
 * n'était averti : il fallait penser à ouvrir l'administration. Un
 * message de contact est une demande commerciale, il doit arriver là où
 * on lit son courrier.
 *
 * `repondreA` porte l'adresse du client : répondre à cet email écrit
 * directement a la personne, sans avoir a recopier quoi que ce soit.
 */
export async function envoyerMessageContactAdmin(message: {
  nom: string;
  email: string;
  sujet: string;
  message: string;
}) {
  const destinataire = process.env.ADMIN_EMAIL || site.email;

  return envoyer({
    destinataire,
    repondreA: message.email,
    sujet: `Message de ${message.nom} : ${message.sujet}`,
    texte: [
      "Nouveau message reçu depuis le formulaire de contact.",
      "",
      `De : ${message.nom} <${message.email}>`,
      `Sujet : ${message.sujet}`,
      "",
      message.message,
      "",
      "Répondez directement à cet email : votre réponse partira vers le client.",
    ].join("\n"),
    html: gabarit({
      titre: "Nouveau message de contact",
      intro: `${message.nom} vous a écrit depuis le site.`,
      lignes: [
        ["De", message.nom],
        ["Email", message.email],
        ["Sujet", message.sujet],
      ],
      action: { libelle: "Voir dans l'administration", url: `${site.urlAdmin}/admin/messages` },
      pied: `« ${message.message} »`,
    }),
  });
}

/**
 * L'accusé de réception du formulaire de contact.
 *
 * Il part vers l'adresse saisie, que rien ne vérifie : il ne reprend donc
 * rien de ce que le visiteur a écrit, pas même son nom. Sans cela, le
 * formulaire servait à faire envoyer, depuis la boîte de Bike Land, un
 * texte choisi par n'importe qui à l'adresse de n'importe qui.
 */
export async function envoyerAccuseContact(email: string) {
  return envoyer({
    destinataire: email,
    sujet: `Nous avons bien reçu votre message, ${site.nom}`,
    texte:
      `Bonjour,\n\nVotre message est arrivé. Nous répondons sous 24 heures ouvrées.\n` +
      `Pour une demande urgente, appelez-nous au ${site.telephone}.\n`,
    html: gabarit({
      titre: "Message bien reçu",
      intro: "Bonjour, nous revenons vers vous sous 24 heures ouvrées.",
      lignes: [["Urgence", site.telephone]],
      pied: `Route des Pêches, ${site.adresse.ville}`,
    }),
  });
}

/**
 * Prévient l'équipe, une seule fois par jour, que le formulaire de contact
 * a atteint son plafond de notifications : les messages suivants restent
 * lisibles dans l'administration, mais n'arrivent plus par email.
 */
export async function envoyerAlertePlafondContact() {
  const destinataire = process.env.ADMIN_EMAIL || site.email;
  const lien = `${site.urlAdmin}/admin/messages`;
  return envoyer({
    destinataire,
    sujet: "Formulaire de contact : plafond du jour atteint",
    texte: [
      "Le formulaire de contact a reçu beaucoup de messages aujourd'hui.",
      "Les suivants n'envoient plus d'email : ils restent lisibles dans l'administration.",
      "",
      lien,
    ].join("\n"),
    html: gabarit({
      titre: "Plafond du formulaire atteint",
      intro:
        "Le formulaire de contact a reçu beaucoup de messages aujourd'hui. Les suivants n'envoient plus d'email : ils restent lisibles dans l'administration.",
      lignes: [],
      action: { libelle: "Voir les messages", url: lien },
    }),
  });
}

/**
 * Neutralise le HTML d'un texte inséré dans un email.
 *
 * Le prénom, le nom, le sujet et les messages viennent des formulaires du
 * site. Sans cet échappement, un visiteur pouvait glisser un lien ou un
 * faux bouton dans un email parti de la boîte de Bike Land, et le faire
 * envoyer à une adresse qui n'était pas la sienne. Tout ce que le gabarit
 * affiche passe donc par ici, adresses des liens comprises.
 */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gabarit HTML commun : tableau simple, compatible avec tous les clients mail.
 *
 * `theme: "rose"` habille l'email aux couleurs d'Octobre rose : bandeau
 * rose en tête, nom et bouton en rose. `itineraire` et `facture` ajoutent
 * leur encadré, pour l'email qui doit tout dire d'un coup.
 *
 * `rendezVous` place le lieu tout en haut, sous la salutation, et dans la
 * ligne d'aperçu de la boîte de réception ; ses numéros WhatsApp, s'il en
 * porte, vont plus bas, pour une question ou un retard.
 */
function gabarit(contenu: {
  titre: string;
  intro: string;
  lignes: [string, string][];
  action?: { libelle: string; url: string };
  rendezVous?: RendezVous;
  itineraire?: { titre: string; detail: string; url: string };
  facture?: { numero: string; lignes: [string, string][]; url: string };
  pied?: string;
  theme?: "rose";
}): string {
  const rose = contenu.theme === "rose";
  // Sur le rose, le texte du bouton est noir : le blanc n'y serait pas
  // assez lisible (contraste insuffisant), le noir l'est largement.
  const accent = rose ? ROSE : "#f25c05";
  const texteBouton = rose ? "#0e0e0e" : "#f2efe9";

  const tableau = (lignesTableau: [string, string][]) =>
    lignesTableau
      .map(
        ([libelle, valeur]) =>
          `<tr>
           <td style="padding:10px 12px 10px 0;color:#6b6b6b;font-size:14px;border-bottom:1px solid #e0dcd3">${echapper(libelle)}</td>
           <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:600;color:#0e0e0e;border-bottom:1px solid #e0dcd3">${echapper(valeur)}</td>
         </tr>`,
      )
      .join("");
  const lignes = tableau(contenu.lignes);

  const action = contenu.action
    ? `<a href="${echapper(contenu.action.url)}" style="display:inline-block;margin-top:28px;background:${accent};color:${texteBouton};text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px">${echapper(contenu.action.libelle)}</a>`
    : "";

  const bandeau = rose
    ? `<tr><td style="background:${ROSE};border-radius:20px 20px 0 0;padding:22px 36px">
          <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:#0e0e0e">&#127872; Octobre rose</p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#0e0e0e">${echapper(site.nom)} roule pour la lutte contre le cancer du sein.</p>
        </td></tr>`
    : "";

  const itineraire = contenu.itineraire
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border:2px solid ${accent};border-radius:14px">
        <tr><td style="padding:22px 24px">
          <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;font-weight:700">L'itinéraire</p>
          <p style="margin:10px 0 0;font-size:16px;line-height:1.4;font-weight:700;color:#0e0e0e">${echapper(contenu.itineraire.titre)}</p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:#6b6b6b">${echapper(contenu.itineraire.detail)}</p>
          <a href="${echapper(contenu.itineraire.url)}" style="display:inline-block;margin-top:16px;border:1px solid #0e0e0e;color:#0e0e0e;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px">Voir l'itinéraire</a>
        </td></tr>
      </table>`
    : "";

  const facture = contenu.facture
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#f2efe9;border-radius:14px">
        <tr><td style="padding:22px 24px">
          <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;font-weight:700">Votre facture ${echapper(contenu.facture.numero)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${tableau(contenu.facture.lignes)}</table>
          <a href="${echapper(contenu.facture.url)}" style="display:inline-block;margin-top:16px;color:#0e0e0e;font-weight:600;font-size:14px">Télécharger la facture</a>
        </td></tr>
      </table>`
    : "";

  // Le lieu du rendez-vous, tout en haut, sous la salutation : le client le
  // voit dès qu'il ouvre l'email, sans rien faire défiler, et n'a plus à
  // écrire pour le redemander (demande du gérant, novembre 2026). Encadré
  // à la couleur de la marque pour qu'on ne le manque pas.
  const lieu = contenu.rendezVous
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;background:#f2efe9;border:2px solid ${accent};border-radius:14px">
        <tr><td style="padding:20px 24px">
          <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;font-weight:700">&#128205; Où nous trouver</p>
          <p style="margin:10px 0 0;font-size:18px;line-height:1.35;font-weight:700;color:#0e0e0e">${echapper(contenu.rendezVous.lieu)}</p>
          <p style="margin:4px 0 0;font-size:15px;line-height:1.55;color:#0e0e0e">${echapper(contenu.rendezVous.indication)}</p>
          <a href="${echapper(contenu.rendezVous.carte)}" style="display:inline-block;margin-top:16px;background:#0e0e0e;color:#f2efe9;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:15px">Voir sur la carte</a>
        </td></tr>
      </table>`
    : "";

  // Les numéros pour une question ou un retard, plus bas. Les boutons sont
  // en ligne : côte à côte sur un écran large, ils passent l'un sous
  // l'autre sur un téléphone, sans règle CSS que certaines messageries
  // ignoreraient.
  const contacts =
    contenu.rendezVous && contenu.rendezVous.whatsapp.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#f2efe9;border-radius:14px">
        <tr><td style="padding:22px 24px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b6b6b">Une question, un retard ? Écrivez-nous sur WhatsApp :</p>
          ${contenu.rendezVous.whatsapp
            .map(
              (ligne) =>
                `<a href="${echapper(ligne.lien)}" style="display:inline-block;margin:10px 8px 0 0;border:1px solid #0e0e0e;color:#0e0e0e;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px;white-space:nowrap">${echapper(ligne.numero)}</a>`,
            )
            .join("")}
        </td></tr>
      </table>`
      : "";

  // La ligne d'aperçu que Gmail et les téléphones montrent sous l'objet,
  // dans la liste des messages : le lieu s'y lit avant même d'ouvrir.
  const apercu = contenu.rendezVous
    ? `Rendez-vous : ${contenu.rendezVous.lieu}. ${contenu.rendezVous.indication}`
    : "";

  // Le nom de la marque : orange d'ordinaire ; sur l'email rose, en noir
  // sous le bandeau, le rose sur blanc étant trop pâle pour un texte si fin.
  const couleurMarque = rose ? "#0e0e0e" : "#f25c05";

  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:${rose ? "#fbe3ee" : "#f2efe9"};font-family:Helvetica,Arial,sans-serif;color:#0e0e0e">
  ${apercu ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${echapper(apercu)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px">
        ${bandeau}
        <tr><td style="padding:36px">
          <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${couleurMarque};font-weight:700">${site.nom}</p>
          <h1 style="margin:14px 0 0;font-size:26px;line-height:1.15;text-transform:uppercase;letter-spacing:-0.5px">${echapper(contenu.titre)}</h1>
          <p style="margin:14px 0 26px;font-size:15px;line-height:1.6;color:#6b6b6b">${echapper(contenu.intro)}</p>
          ${lieu}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
          ${action}
          ${itineraire}
          ${contacts}
          ${facture}
          ${contenu.pied ? `<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b">${echapper(contenu.pied)}</p>` : ""}
        </td></tr>
      </table>
      <p style="max-width:520px;margin:20px auto 0;font-size:12px;color:#6b6b6b;text-align:center">
        ${site.nom} · ${site.adresse.ville}, ${site.adresse.pays} · ${site.telephone}
      </p>
    </td></tr>
  </table>
</body></html>`;
}
