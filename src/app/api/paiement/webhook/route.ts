import { NextResponse } from "next/server";

import { secretWebhookValide, verifierTransaction } from "@/lib/kkiapay";
import { confirmerParKkiapay } from "@/lib/paiement-confirmation";
import { site } from "@/lib/site";

/**
 * Notification de paiement envoyée par KkiaPay.
 *
 * C'est le filet de sécurité du parcours : si le client ferme son
 * navigateur juste après avoir payé, personne ne revient nous dire que
 * l'argent est arrivé. KkiaPay, lui, nous prévient.
 *
 * Trois protections, dans cet ordre :
 *
 *  1. **Secret partagé obligatoire.** KkiaPay ne signe pas ses
 *     notifications : il renvoie dans l'en-tête `x-kkiapay-secret` le
 *     « secret hash » saisi dans son tableau de bord. Sans
 *     `KKIAPAY_WEBHOOK_SECRET` configuré chez nous, la route refuse tout.
 *     Un webhook non authentifié est une porte ouverte, pas une commodité.
 *  2. **Comparaison à temps constant**, faite dans `secretWebhookValide`.
 *  3. **Le contenu de la notification n'est jamais cru.** On n'en retient
 *     que l'identifiant de transaction, puis on redemande à KkiaPay ce
 *     qu'il en est. Quelqu'un qui devinerait le secret ne pourrait donc
 *     toujours pas fabriquer un paiement.
 *
 * Codes de retour : 200 dès que la situation est tranchée — y compris
 * pour un refus — afin que KkiaPay cesse de rejouer. Le 500 est réservé
 * aux pannes transitoires, les seules qu'un nouvel essai peut résoudre.
 */
export async function POST(requete: Request) {
  if (!process.env.KKIAPAY_WEBHOOK_SECRET) {
    console.error(
      "[webhook] KKIAPAY_WEBHOOK_SECRET absent : notification refusée. " +
        "Tant qu'il n'est pas défini, aucune réservation ne peut être confirmée par cette route.",
    );
    return NextResponse.json({ erreur: "Webhook non configuré." }, { status: 503 });
  }

  if (!secretWebhookValide(requete.headers.get("x-kkiapay-secret"))) {
    console.warn("[webhook] secret absent ou invalide : notification ignorée.");
    return NextResponse.json({ erreur: "Secret invalide." }, { status: 401 });
  }

  const corps = (await requete.json().catch(() => null)) as {
    transactionId?: string;
    partnerId?: string;
    isPaymentSucces?: boolean;
    event?: string;
  } | null;

  const transactionId = corps?.transactionId;
  if (!transactionId) {
    return NextResponse.json({ erreur: "Identifiant de transaction absent." }, { status: 400 });
  }

  const verification = await verifierTransaction(transactionId);

  if (verification.issue === "indisponible") {
    // Seul cas où l'on demande un nouvel essai : l'état est inconnu.
    console.error(`[webhook] vérification impossible (${verification.detail})`);
    return NextResponse.json({ erreur: "Vérification impossible." }, { status: 500 });
  }

  if (verification.issue === "introuvable") {
    console.warn(`[webhook] transaction inconnue de KkiaPay : ${transactionId}`);
    return NextResponse.json({ recu: true, confirme: false, raison: "introuvable" });
  }

  // La référence de la réservation voyage dans `partnerId`. On préfère
  // celle que KkiaPay nous renvoie à celle du corps de la notification.
  const reference = verification.transaction.partnerId ?? corps?.partnerId;
  if (!reference) {
    console.warn(`[webhook] transaction ${transactionId} sans référence de réservation.`);
    return NextResponse.json({ recu: true, confirme: false, raison: "sans-reference" });
  }

  // Lien générique, et non personnel : la base ne conserve que le haché
  // du jeton de suivi, impossible de le reconstituer ici. Le client a
  // déjà reçu son lien personnel dans l'accusé de réception.
  const resultat = await confirmerParKkiapay({
    reference,
    transaction: verification.transaction,
    lienSuivi: `${site.url}/reservation/suivi`,
  });

  const confirme = resultat.issue === "confirmee" || resultat.issue === "deja-confirmee";
  return NextResponse.json({
    recu: true,
    confirme,
    issue: resultat.issue,
  });
}
