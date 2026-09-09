/**
 * Emails transactionnels (§2.1, §6.1).
 *
 * Trois envois : la confirmation avec le lien de suivi, la facture, et le
 * rappel avant le départ. Resend est le fournisseur retenu ; sans clé
 * d'API, les messages sont journalisés dans la console plutôt que perdus,
 * ce qui permet de vérifier leur contenu en développement.
 */

import { site } from "./site";
import { formatDate, formatXof } from "./format";
import type { Reservation } from "./types";

interface Message {
  destinataire: string;
  sujet: string;
  html: string;
  texte: string;
}

export async function envoyer(message: Message): Promise<{ envoye: boolean; raison?: string }> {
  const cle = process.env.RESEND_API_KEY;

  if (!cle) {
    console.info(
      `[email] Aucune clé RESEND_API_KEY : message non envoyé.\n` +
        `  À : ${message.destinataire}\n  Objet : ${message.sujet}\n${message.texte}`,
    );
    return { envoye: false, raison: "RESEND_API_KEY absente" };
  }

  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_EXPEDITEUR ?? `${site.nom} <${site.email}>`,
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

export async function envoyerConfirmation(reservation: Reservation, lienSuivi: string) {
  const velo = reservation.lignes[0];
  const sujet = `Votre réservation ${reservation.reference} est confirmée`;

  const texte = [
    `Bonjour ${reservation.client.prenom},`,
    "",
    `Votre réservation est confirmée. Référence : ${reservation.reference}.`,
    `Vélo : ${velo?.veloNom}`,
    `Du ${formatDate(reservation.dateDebut)} au ${formatDate(reservation.dateFin)} (${reservation.jours} jours)`,
    `Montant réglé : ${formatXof(reservation.totalXof)}`,
    reservation.cautionXof > 0
      ? `Caution pré-autorisée : ${formatXof(reservation.cautionXof)}, libérée sous 48 h après le retour.`
      : "Assurance sérénité souscrite : aucune caution retenue.",
    "",
    `Suivre ou modifier votre réservation : ${lienSuivi}`,
    "",
    `À bientôt sur la route,`,
    `L'équipe ${site.nom} — ${site.telephone}`,
  ].join("\n");

  return envoyer({
    destinataire: reservation.client.email,
    sujet,
    texte,
    html: gabarit({
      titre: "Réservation confirmée",
      intro: `Bonjour ${reservation.client.prenom}, votre vélo vous attend.`,
      lignes: [
        ["Référence", reservation.reference],
        ["Vélo", velo?.veloNom ?? "—"],
        ["Départ", formatDate(reservation.dateDebut)],
        ["Retour", formatDate(reservation.dateFin)],
        ["Durée", `${reservation.jours} jour${reservation.jours > 1 ? "s" : ""}`],
        ["Montant réglé", formatXof(reservation.totalXof)],
        ...(reservation.cautionXof > 0
          ? ([["Caution", `${formatXof(reservation.cautionXof)} (libérée sous 48 h)`]] as [string, string][])
          : []),
      ],
      action: { libelle: "Suivre ma réservation", url: lienSuivi },
      pied: "Ce lien vous est personnel : il donne accès à votre réservation sans mot de passe.",
    }),
  });
}

export async function envoyerFacture(reservation: Reservation, numeroFacture: string, lienSuivi: string) {
  return envoyer({
    destinataire: reservation.client.email,
    sujet: `Facture ${numeroFacture} — ${site.nom}`,
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

export async function envoyerAccuseContact(nom: string, email: string) {
  return envoyer({
    destinataire: email,
    sujet: `Nous avons bien reçu votre message — ${site.nom}`,
    texte:
      `Bonjour ${nom},\n\nVotre message est arrivé. Nous répondons sous 24 heures ouvrées.\n` +
      `Pour une demande urgente, appelez-nous au ${site.telephone}.\n`,
    html: gabarit({
      titre: "Message bien reçu",
      intro: `Bonjour ${nom}, nous revenons vers vous sous 24 heures ouvrées.`,
      lignes: [["Urgence", site.telephone]],
      pied: `${site.adresse.ligne}, ${site.adresse.ville}`,
    }),
  });
}

/** Gabarit HTML commun : tableau simple, compatible avec tous les clients mail. */
function gabarit(contenu: {
  titre: string;
  intro: string;
  lignes: [string, string][];
  action?: { libelle: string; url: string };
  pied?: string;
}): string {
  const lignes = contenu.lignes
    .map(
      ([libelle, valeur]) =>
        `<tr>
           <td style="padding:10px 0;color:#6b6058;font-size:14px;border-bottom:1px solid #f0e5d6">${libelle}</td>
           <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:600;color:#1c1714;border-bottom:1px solid #f0e5d6">${valeur}</td>
         </tr>`,
    )
    .join("");

  const action = contenu.action
    ? `<a href="${contenu.action.url}" style="display:inline-block;margin-top:28px;background:#b04726;color:#fdfbf7;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px">${contenu.action.libelle}</a>`
    : "";

  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#fdfbf7;font-family:Helvetica,Arial,sans-serif;color:#1c1714">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:36px">
        <tr><td>
          <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b04726;font-weight:700">${site.nom}</p>
          <h1 style="margin:14px 0 0;font-size:26px;line-height:1.15;text-transform:uppercase;letter-spacing:-0.5px">${contenu.titre}</h1>
          <p style="margin:14px 0 26px;font-size:15px;line-height:1.6;color:#6b6058">${contenu.intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
          ${action}
          ${contenu.pied ? `<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#6b6058">${contenu.pied}</p>` : ""}
        </td></tr>
      </table>
      <p style="max-width:520px;margin:20px auto 0;font-size:12px;color:#6b6058;text-align:center">
        ${site.nom} · ${site.adresse.ligne}, ${site.adresse.ville}, ${site.adresse.pays} · ${site.telephone}
      </p>
    </td></tr>
  </table>
</body></html>`;
}
