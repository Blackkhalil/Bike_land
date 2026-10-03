/**
 * Emails transactionnels (§2.1, §6.1).
 *
 * Trois envois : la confirmation avec le lien de suivi, la facture, et le
 * rappel avant le départ. Resend est le fournisseur retenu ; sans clé
 * d'API, les messages sont journalisés dans la console plutôt que perdus,
 * ce qui permet de vérifier leur contenu en développement.
 */

import { site } from "./site";
import { formatCreneau, formatXof, resumeOffre } from "./format";
import type { Reservation } from "./types";

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
  return [
    ["Formule", "Road trip encadré"],
    [
      "Participants",
      `${reservation.nombrePersonnes} personne${reservation.nombrePersonnes > 1 ? "s" : ""}`,
    ],
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
      `Une caution de ${formatXof(reservation.cautionXof)} en espèces, rendue quand vous rapportez le vélo.`,
      "Une pièce d'identité (CIP), qui vous est rendue au retour du vélo.",
      "La signature de l'engagement de restitution, sur place.",
    ];
  }
  return [
    "Rien à apporter : casque, antivol et kit sont fournis au départ.",
    "Aucune caution n'est demandée : un coordinateur encadre la sortie et récupère le vélo à l'arrivée.",
  ];
}

/**
 * Accuse de reception, envoye des l'enregistrement.
 *
 * C'est le SEUL email qui porte le lien de suivi personnel : le jeton
 * n'existe qu'a la creation, et la base n'en stocke que le hache. Le
 * webhook de paiement, qui confirme ensuite, ne peut donc pas le
 * reconstituer, et c'est voulu : une fuite de la base ne doit pas
 * permettre de forger un lien vers une reservation.
 */
export async function envoyerReceptionDemande(reservation: Reservation, lienSuivi: string) {
  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Votre demande ${reservation.reference} est enregistrée`,
    texte: [
      `Bonjour ${reservation.client.prenom},`,
      "",
      `Votre demande est enregistrée sous la référence ${reservation.reference}.`,
      "Elle sera confirmée dès réception de votre paiement.",
      "",
      `Conservez ce lien, il est le seul moyen de retrouver votre réservation :`,
      lienSuivi,
      "",
      `L'équipe ${site.nom}, ${site.telephone}`,
    ].join("\n"),
    html: gabarit({
      titre: "Demande enregistrée",
      intro: `Bonjour ${reservation.client.prenom}, nous confirmons dès réception du paiement.`,
      lignes: [
        ["Référence", reservation.reference],
        ...detailsOffre(reservation),
        ["Date", formatCreneau(reservation)],
        ["Montant à régler", formatXof(reservation.totalXof)],
      ],
      action: { libelle: "Suivre ma demande", url: lienSuivi },
      pied: "Conservez ce lien : il vous est personnel et donne accès à votre réservation sans mot de passe.",
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

export async function envoyerConfirmation(reservation: Reservation, lienSuivi: string) {
  const velo = reservation.lignes[0];
  const prevoir = aPrevoir(reservation);
  const rendezVous = rendezVousDe(reservation);

  const texte = [
    `Bonjour ${reservation.client.prenom},`,
    "",
    `Votre paiement est reçu, votre réservation est confirmée.`,
    `Référence : ${reservation.reference}`,
    `Vélo : ${velo?.veloNom}`,
    `Date : ${formatCreneau(reservation)}`,
    `Montant réglé : ${formatXof(reservation.totalXof)}`,
    "",
    "À prévoir au départ :",
    ...prevoir.map((ligne) => `  - ${ligne}`),
    "",
    `Où nous trouver : ${rendezVous.lieu}.`,
    rendezVous.indication,
    `Carte : ${rendezVous.carte}`,
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
    sujet: `Votre réservation ${reservation.reference} est confirmée`,
    texte,
    html: gabarit({
      titre: "Réservation confirmée",
      intro: `Bonjour ${reservation.client.prenom}, votre paiement est reçu.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Vélo", velo?.veloNom ?? "non précisé"],
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

export async function envoyerFacture(reservation: Reservation, numeroFacture: string, lienSuivi: string) {
  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Facture ${numeroFacture}, ${site.nom}`,
    texte:
      `Bonjour ${reservation.client.prenom},\n\n` +
      `Voici votre facture ${numeroFacture} d'un montant de ${formatXof(reservation.totalXof)} ` +
      `pour la réservation ${reservation.reference}.\n\n` +
      `Elle est téléchargeable à tout moment depuis ${lienSuivi}.\n`,
    html: gabarit({
      titre: `Facture ${numeroFacture}`,
      intro: `Réservation ${reservation.reference}`,
      lignes: [
        ["Sous-total location", formatXof(reservation.sousTotalXof)],
        ...(reservation.remiseXof > 0
          ? ([["Remise durée", `− ${formatXof(reservation.remiseXof)}`]] as [string, string][])
          : []),
        ...(reservation.optionsXof > 0
          ? ([["Options", formatXof(reservation.optionsXof)]] as [string, string][])
          : []),
        ["Total réglé", formatXof(reservation.totalXof)],
      ],
      action: { libelle: "Télécharger la facture", url: `${lienSuivi}#facture` },
      pied: "Montants exprimés en francs CFA (XOF).",
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
  const lienAdmin = `${site.url}/admin/reservations?reference=${reservation.reference}`;

  // Référence du paiement chez l'agrégateur : c'est elle qu'il faut
  // citer pour retrouver la transaction, réclamer un remboursement ou
  // rapprocher un versement. Sans elle, il faut fouiller.
  const paiement = reservation.paiements.find((ligne) => !ligne.estCaution);
  const referencePaiement = paiement?.referenceFournisseur ?? "non communiquée";

  return envoyer({
    destinataire,
    sujet: `Réservation payée ${reservation.reference} : ${velos}`,
    texte: [
      `Réservation confirmée : le paiement est encaissé.`,
      "",
      `Référence réservation : ${reservation.reference}`,
      `Référence paiement : ${referencePaiement}`,
      "",
      `Client : ${reservation.client.prenom} ${reservation.client.nom}`,
      `Email : ${reservation.client.email}`,
      `Téléphone : ${reservation.client.telephone ?? "non renseigné"}`,
      "",
      `Vélo : ${velos}`,
      `Date : ${formatCreneau(reservation)}`,
      reservation.codeParrainage
        ? `Code de parrainage : ${reservation.codeParrainage}`
        : "",
      `Formule : ${resumeOffre(reservation)}`,
      reservation.cautionXof > 0
        ? `À réclamer au départ : pièce d'identité, engagement signé et caution de ${formatXof(reservation.cautionXof)} en espèces.`
        : `À prévoir : ${reservation.nombrePersonnes} coco${reservation.nombrePersonnes > 1 ? "s" : ""} et ${reservation.nombrePersonnes} eau${reservation.nombrePersonnes > 1 ? "x" : ""}.`,
      `Montant : ${formatXof(reservation.totalXof)}`,
      reservation.message ? `Message du client : ${reservation.message}` : "",
      "",
      `Voir dans l'administration : ${lienAdmin}`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: gabarit({
      titre: "Réservation payée",
      intro: `${reservation.client.prenom} ${reservation.client.nom} vient de réserver et de payer.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Client", `${reservation.client.prenom} ${reservation.client.nom}`],
        ["Email", reservation.client.email],
        ["Téléphone", reservation.client.telephone ?? "non renseigné"],
        ["Vélo", velos],
        ["Départ", formatCreneau(reservation)],
        ["Montant payé", formatXof(reservation.totalXof)],
        ["Référence paiement", referencePaiement],
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
      action: { libelle: "Voir dans l'administration", url: `${site.url}/admin/messages` },
      pied: `« ${message.message} »`,
    }),
  });
}

export async function envoyerAccuseContact(nom: string, email: string) {
  return envoyer({
    destinataire: email,
    sujet: `Nous avons bien reçu votre message, ${site.nom}`,
    texte:
      `Bonjour ${nom},\n\nVotre message est arrivé. Nous répondons sous 24 heures ouvrées.\n` +
      `Pour une demande urgente, appelez-nous au ${site.telephone}.\n`,
    html: gabarit({
      titre: "Message bien reçu",
      intro: `Bonjour ${nom}, nous revenons vers vous sous 24 heures ouvrées.`,
      lignes: [["Urgence", site.telephone]],
      pied: `Route des Pêches, ${site.adresse.ville}`,
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

/** Gabarit HTML commun : tableau simple, compatible avec tous les clients mail. */
function gabarit(contenu: {
  titre: string;
  intro: string;
  lignes: [string, string][];
  action?: { libelle: string; url: string };
  rendezVous?: RendezVous;
  pied?: string;
}): string {
  const lignes = contenu.lignes
    .map(
      ([libelle, valeur]) =>
        `<tr>
           <td style="padding:10px 0;color:#6b6b6b;font-size:14px;border-bottom:1px solid #e0dcd3">${echapper(libelle)}</td>
           <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:600;color:#0e0e0e;border-bottom:1px solid #e0dcd3">${echapper(valeur)}</td>
         </tr>`,
    )
    .join("");

  const action = contenu.action
    ? `<a href="${echapper(contenu.action.url)}" style="display:inline-block;margin-top:28px;background:#f25c05;color:#f2efe9;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px">${echapper(contenu.action.libelle)}</a>`
    : "";

  // Les boutons sont en ligne : côte à côte sur un écran large, ils
  // passent l'un sous l'autre sur un téléphone, sans règle CSS que
  // certaines messageries ignoreraient.
  const rendezVous = contenu.rendezVous
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#f2efe9;border-radius:14px">
        <tr><td style="padding:22px 24px">
          <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;font-weight:700">Où nous trouver</p>
          <p style="margin:10px 0 0;font-size:16px;line-height:1.4;font-weight:700;color:#0e0e0e">${echapper(contenu.rendezVous.lieu)}</p>
          <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#6b6b6b">${echapper(contenu.rendezVous.indication)}</p>
          <a href="${echapper(contenu.rendezVous.carte)}" style="display:inline-block;margin-top:16px;background:#0e0e0e;color:#f2efe9;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">Voir sur la carte</a>
          <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#6b6b6b">Une question, un retard ? Écrivez-nous sur WhatsApp :</p>
          ${contenu.rendezVous.whatsapp
            .map(
              (ligne) =>
                `<a href="${echapper(ligne.lien)}" style="display:inline-block;margin:10px 8px 0 0;border:1px solid #0e0e0e;color:#0e0e0e;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px;white-space:nowrap">${echapper(ligne.numero)}</a>`,
            )
            .join("")}
        </td></tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f2efe9;font-family:Helvetica,Arial,sans-serif;color:#0e0e0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:36px">
        <tr><td>
          <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f25c05;font-weight:700">${site.nom}</p>
          <h1 style="margin:14px 0 0;font-size:26px;line-height:1.15;text-transform:uppercase;letter-spacing:-0.5px">${echapper(contenu.titre)}</h1>
          <p style="margin:14px 0 26px;font-size:15px;line-height:1.6;color:#6b6b6b">${echapper(contenu.intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
          ${action}
          ${rendezVous}
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
