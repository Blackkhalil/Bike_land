import { NextResponse } from "next/server";

import { lienDeSuivi } from "@/lib/lien-suivi";
import { confirmerParSasPay } from "@/lib/paiement-confirmation";
import {
  referenceDepuisCharge,
  signatureWebhookValide,
  verifierPaiement,
} from "@/lib/saspay";

/**
 * Notification de paiement envoyée par SasPay.
 *
 * C'est le filet de sécurité du parcours : si le client valide sur son
 * téléphone puis ferme son navigateur, personne ne revient nous dire que
 * l'argent est arrivé. SasPay, lui, nous prévient.
 *
 * Trois protections, dans cet ordre :
 *
 *  1. **Secret obligatoire.** Sans `SASPAY_WEBHOOK_SECRET` configuré chez
 *     nous, la route refuse tout. Un webhook non authentifié est une
 *     porte ouverte, pas une commodité.
 *  2. **Signature HMAC-SHA256 vérifiée sur le corps brut**, avec contrôle
 *     de l'horodatage (cf. `signatureWebhookValide`). C'est ce qui
 *     interdit de rejouer aujourd'hui une notification interceptée hier.
 *  3. **Le contenu de la notification n'est jamais cru.** On n'en retient
 *     que l'identifiant du paiement, puis on redemande à SasPay ce qu'il
 *     en est. Quelqu'un qui devinerait le secret ne pourrait donc
 *     toujours pas fabriquer un paiement.
 *
 * Codes de retour : 200 dès que la situation est tranchée, y compris
 * pour un refus, afin que SasPay cesse de rejouer. Le 500 est réservé
 * aux pannes transitoires, les seules qu'un nouvel essai peut résoudre.
 */
export async function POST(requete: Request) {
  if (!process.env.SASPAY_WEBHOOK_SECRET) {
    console.error(
      "[webhook] SASPAY_WEBHOOK_SECRET absent : notification refusée. " +
        "Tant qu'il n'est pas défini, aucune réservation ne peut être confirmée par cette route.",
    );
    return NextResponse.json({ erreur: "Webhook non configuré." }, { status: 503 });
  }

  // Le corps est lu en texte, et une seule fois : la signature porte sur
  // les octets reçus. Le relire après `json()` donnerait une chaîne
  // re-sérialisée, dont la signature ne correspondrait plus.
  const corpsBrut = await requete.text();

  const controle = signatureWebhookValide({
    corpsBrut,
    signature: requete.headers.get("x-webhook-signature"),
    horodatage: requete.headers.get("x-webhook-timestamp"),
  });
  if (!controle.valide) {
    console.warn(`[webhook] notification rejetée : ${controle.raison}`);
    return NextResponse.json({ erreur: "Signature invalide." }, { status: 401 });
  }

  const enveloppe = (() => {
    try {
      return JSON.parse(corpsBrut) as { event?: string; data?: Record<string, unknown> };
    } catch {
      return null;
    }
  })();

  if (!enveloppe) {
    return NextResponse.json({ erreur: "Corps illisible." }, { status: 400 });
  }

  const evenement = enveloppe.event ?? "";

  // SasPay envoie aussi des événements de retrait et de transfert, qui ne
  // concernent pas les réservations. On les accuse sans rien faire,
  // plutôt que de renvoyer une erreur qui le ferait rejouer en boucle.
  if (!evenement.startsWith("transaction.")) {
    return NextResponse.json({ recu: true, confirme: false, raison: "hors-sujet" });
  }

  const paiementId = enveloppe.data?.id;
  if (typeof paiementId !== "string" || !paiementId) {
    return NextResponse.json({ erreur: "Identifiant de paiement absent." }, { status: 400 });
  }

  const verification = await verifierPaiement(paiementId);

  if (verification.issue === "indisponible") {
    // Seul cas où l'on demande un nouvel essai : l'état est inconnu.
    console.error(`[webhook] vérification impossible (${verification.detail})`);
    return NextResponse.json({ erreur: "Vérification impossible." }, { status: 500 });
  }

  if (verification.issue === "introuvable" || verification.issue === "refusee") {
    console.warn(`[webhook] paiement inconnu de SasPay : ${paiementId}`);
    return NextResponse.json({ recu: true, confirme: false, raison: "introuvable" });
  }

  // Notre référence de réservation voyage dans `metadata`, où nous l'avons
  // mise en poussant le paiement. Si la notification ne la porte pas, on
  // la prend dans la réponse de SasPay à la vérification, qui la renvoie :
  // sans cela, une notification d'un autre format ne confirmerait plus
  // rien, et le client qui a fermé son navigateur aurait payé pour rien.
  const reference = referenceDepuisCharge(enveloppe.data) ?? verification.paiement.reference;
  if (!reference) {
    console.warn(`[webhook] paiement ${paiementId} sans référence de réservation.`);
    return NextResponse.json({ recu: true, confirme: false, raison: "sans-reference" });
  }

  // Un échec ou une annulation n'a rien à confirmer. On le journalise et
  // on accuse réception : la réservation reste en attente de paiement et
  // se libérera d'elle-même au bout du délai du panier.
  if (verification.paiement.statut !== "SUCCESS") {
    console.warn(
      `[webhook] ${reference} : paiement ${paiementId} en ${verification.paiement.statut}.`,
    );
    return NextResponse.json({ recu: true, confirme: false, raison: "non-abouti" });
  }

  // Le lien personnel, reconstitué à partir de la référence : le webhook
  // ne voit jamais passer le client, et n'a donc pas son jeton.
  const resultat = await confirmerParSasPay({
    reference,
    paiement: verification.paiement,
    lienSuivi: await lienDeSuivi(reference),
  });

  const confirme = resultat.issue === "confirmee" || resultat.issue === "deja-confirmee";
  return NextResponse.json({ recu: true, confirme, issue: resultat.issue });
}
