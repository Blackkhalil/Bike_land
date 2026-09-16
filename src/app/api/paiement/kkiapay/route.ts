import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { verifierTransaction } from "@/lib/kkiapay";
import { confirmerParKkiapay } from "@/lib/paiement-confirmation";
import { fournisseurActif } from "@/lib/paiement";
import { site } from "@/lib/site";
import { erreursParChamp, schemaConfirmationKkiapay } from "@/lib/validation";

/**
 * Retour de la fenêtre de paiement KkiaPay.
 *
 * Quand le client a payé, la fenêtre rend la main au navigateur avec un
 * identifiant de transaction. Le navigateur nous l'envoie ici — mais rien
 * de ce qu'il raconte n'est cru : le serveur redemande à KkiaPay l'état
 * réel de la transaction, et c'est cette réponse-là qui décide.
 *
 * C'est le chemin normal, celui qui permet d'afficher la confirmation
 * dans la seconde. Le webhook couvre le cas où le client ferme son
 * navigateur avant le retour ; les deux aboutissent au même contrôle.
 */
export async function POST(requete: Request) {
  if (fournisseurActif() !== "kkiapay") {
    return NextResponse.json({ erreur: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaConfirmationKkiapay.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Requête invalide.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const { token, transactionId } = analyse.data;

  // Le jeton fait office d'autorisation : seul son porteur peut déclencher
  // la confirmation de cette réservation.
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));
  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }

  const verification = await verifierTransaction(transactionId);

  if (verification.issue === "indisponible") {
    // On ne sait pas si l'argent est passé : surtout ne rien décider. Le
    // webhook prendra le relais, et le client peut recharger sa page.
    console.error(`[paiement] vérification impossible (${verification.detail})`);
    return NextResponse.json(
      {
        erreur:
          "Nous n'avons pas pu joindre KkiaPay pour vérifier votre paiement. " +
          "S'il a été débité, votre réservation sera confirmée automatiquement d'ici quelques minutes.",
      },
      { status: 502 },
    );
  }

  if (verification.issue === "introuvable") {
    return NextResponse.json({ erreur: "Paiement introuvable chez KkiaPay." }, { status: 422 });
  }

  const resultat = await confirmerParKkiapay({
    reference: reservation.reference,
    transaction: verification.transaction,
    lienSuivi: `${site.url}/reservation/${token}`,
  });

  switch (resultat.issue) {
    case "confirmee":
    case "deja-confirmee":
      return NextResponse.json({ confirmee: true, reference: reservation.reference });

    case "refusee":
      return NextResponse.json({ erreur: resultat.raison }, { status: 402 });

    case "transaction-deja-utilisee":
      return NextResponse.json(
        { erreur: "Ce paiement a déjà servi pour une autre réservation." },
        { status: 409 },
      );

    case "creneau-perdu":
      return NextResponse.json(
        {
          erreur:
            `Votre paiement a bien été reçu, mais le vélo a été repris entre-temps. ` +
            `Appelez-nous au ${site.telephone} : nous vous remboursons ou nous vous trouvons un autre vélo.`,
          code: "CRENEAU_PERDU",
        },
        { status: 409 },
      );

    case "annulee":
      return NextResponse.json(
        {
          erreur: `Cette réservation a été annulée. Appelez-nous au ${site.telephone} pour le remboursement.`,
        },
        { status: 409 },
      );

    default:
      return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }
}
