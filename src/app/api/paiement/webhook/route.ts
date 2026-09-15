import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { envoyerConfirmation, envoyerFacture, envoyerNotificationAdmin } from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { site } from "@/lib/site";

/**
 * Notification de paiement de l'agrégateur.
 *
 * C'est la SEULE porte par laquelle une réservation passe de
 * « en attente de paiement » à « confirmée ». Le navigateur du client ne
 * peut pas confirmer sa propre réservation : sans cela, il suffirait
 * d'appeler l'API pour obtenir un vélo sans payer.
 *
 * Trois protections, dans cet ordre :
 *
 *  1. **Signature obligatoire.** Sans `FEDAPAY_WEBHOOK_SECRET`, la route
 *     refuse tout. Un webhook non signé est une porte ouverte, pas une
 *     commodité de développement.
 *  2. **Comparaison à temps constant.** Comparer deux signatures avec
 *     `===` laisse fuir leur préfixe commun par le temps de réponse.
 *  3. **Idempotence.** Un agrégateur rejoue ses notifications jusqu'à
 *     obtenir un 200 : la deuxième passe ne doit ni re-confirmer, ni
 *     renvoyer un second email au client.
 */

/** Extrait la signature de l'en-tête, quel que soit son format. */
function signatureRecue(entetes: Headers): string | null {
  const brut =
    entetes.get("x-fedapay-signature") ??
    entetes.get("x-signature") ??
    entetes.get("signature");
  if (!brut) return null;

  // FedaPay envoie « t=<horodatage>,s=<signature> » ; d'autres n'envoient
  // que la signature nue.
  const partie = brut
    .split(",")
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau.startsWith("s="));
  return partie ? partie.slice(2) : brut.trim();
}

function signatureValide(corpsBrut: string, recue: string, secret: string): boolean {
  const attendue = createHmac("sha256", secret).update(corpsBrut).digest("hex");
  const a = Buffer.from(recue);
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(requete: Request) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[webhook] FEDAPAY_WEBHOOK_SECRET absent : notification refusée. " +
        "Tant qu'il n'est pas défini, aucune réservation ne peut être confirmée par cette route.",
    );
    return NextResponse.json({ erreur: "Webhook non configuré." }, { status: 503 });
  }

  // Le corps est lu en texte : la signature porte sur les octets reçus,
  // pas sur un objet re-sérialisé, dont l'ordre des clés pourrait différer.
  const corpsBrut = await requete.text();
  const recue = signatureRecue(requete.headers);

  if (!recue || !signatureValide(corpsBrut, recue, secret)) {
    console.warn("[webhook] Signature absente ou invalide : notification ignorée.");
    return NextResponse.json({ erreur: "Signature invalide." }, { status: 401 });
  }

  let charge: {
    entity?: { reference?: string; status?: string; id?: number | string };
    name?: string;
  };
  try {
    charge = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ erreur: "Corps illisible." }, { status: 400 });
  }

  const reference = charge.entity?.reference;
  const statut = charge.entity?.status;

  if (!reference) {
    return NextResponse.json({ erreur: "Référence absente." }, { status: 400 });
  }

  // Seul un paiement effectivement abouti confirme la réservation. Tout
  // autre statut est acquitté (pour que l'agrégateur cesse de rejouer)
  // mais ne change rien.
  if (statut !== "approved" && statut !== "transferred") {
    return NextResponse.json({ recu: true, confirme: false, statut });
  }

  const resultat = await depot.confirmerPaiement(reference, String(charge.entity?.id ?? ""));
  if (!resultat) {
    // 200 volontaire : une référence inconnue ne se résoudra jamais, il
    // ne sert à rien que l'agrégateur rejoue indéfiniment.
    console.warn(`[webhook] Référence inconnue : ${reference}`);
    return NextResponse.json({ recu: true, confirme: false, raison: "introuvable" });
  }

  if (resultat.dejaConfirmee) {
    return NextResponse.json({ recu: true, confirme: true, deja: true });
  }

  // Les emails partent ici, et non à la création : avant le paiement, il
  // n'y a rien à confirmer. Ils ne doivent jamais faire échouer
  // l'acquittement, sinon l'agrégateur rejouerait sans fin.
  const { reservation } = resultat;
  // Page de suivi generique, et non un lien personnel : le jeton n'existe
  // qu'a la creation et la base n'en garde que le hache. Le client a deja
  // recu son lien dans l'accuse de reception.
  const lienSuivi = `${site.url}/reservation/suivi`;
  await Promise.allSettled([
    envoyerConfirmation(reservation, lienSuivi),
    envoyerFacture(reservation, numeroDeFacture(reservation), lienSuivi),
    envoyerNotificationAdmin(reservation),
  ]);

  return NextResponse.json({ recu: true, confirme: true });
}
