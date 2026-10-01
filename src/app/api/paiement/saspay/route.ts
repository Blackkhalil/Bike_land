import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { fournisseurActif } from "@/lib/paiement";
import { confirmerParSasPay } from "@/lib/paiement-confirmation";
import { verifierPaiement } from "@/lib/saspay";
import { site } from "@/lib/site";
import { erreursParChamp, schemaSuiviPaiement } from "@/lib/validation";

/**
 * « Où en est mon paiement ? »
 *
 * La demande a été poussée sur le téléphone du client ; il la valide avec
 * son code Mobile Money, et personne ne sait quand. Le navigateur appelle
 * donc cette route régulièrement, et c'est SasPay qui répond, jamais le
 * navigateur, qui pourrait prétendre n'importe quoi.
 *
 * Trois réponses possibles :
 *  - `en-attente` : le client n'a pas encore validé. On réessaie.
 *  - `confirmee`  : c'est payé, la réservation est confirmée, les emails
 *                   sont partis.
 *  - une erreur   : le paiement a échoué, ou quelque chose ne colle pas.
 *
 * Le webhook fait exactement le même travail de son côté : il couvre le
 * cas du client qui ferme son navigateur avant d'avoir validé. Les deux
 * passent par `confirmerParSasPay`, donc par les mêmes contrôles.
 */
export async function POST(requete: Request) {
  if (fournisseurActif() !== "saspay") {
    return NextResponse.json({ erreur: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaSuiviPaiement.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Requête invalide.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const { token, paiementId } = analyse.data;

  // Le jeton fait office d'autorisation : seul son porteur peut interroger
  // le paiement de cette réservation.
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));
  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }

  // Déjà confirmée par le webhook pendant que le navigateur interrogeait :
  // c'est le cas normal quand la notification arrive avant notre appel.
  if (reservation.statut !== "EN_ATTENTE_PAIEMENT" && reservation.statut !== "ANNULEE") {
    return NextResponse.json({ etat: "confirmee", reference: reservation.reference });
  }

  const verification = await verifierPaiement(paiementId);

  if (verification.issue === "indisponible") {
    // On ne sait pas si l'argent est passé : surtout ne rien décider. Le
    // webhook prendra le relais, et le client peut recharger sa page.
    console.error(`[paiement] vérification impossible (${verification.detail})`);
    return NextResponse.json(
      {
        erreur:
          "Nous n'avons pas pu joindre SasPay pour vérifier votre paiement. " +
          "S'il a été débité, votre réservation sera confirmée automatiquement d'ici quelques minutes.",
      },
      { status: 502 },
    );
  }

  if (verification.issue === "introuvable" || verification.issue === "refusee") {
    return NextResponse.json({ erreur: "Paiement introuvable chez SasPay." }, { status: 422 });
  }

  const { paiement } = verification;

  // Le client n'a pas encore validé sur son téléphone : on le dit, et le
  // navigateur redemandera. Surtout ne pas traiter cela comme un échec,
  // composer son code Mobile Money prend parfois une minute.
  if (paiement.statut === "PENDING") {
    return NextResponse.json({ etat: "en-attente" });
  }

  if (paiement.statut !== "SUCCESS") {
    return NextResponse.json(
      {
        etat: "echoue",
        erreur:
          paiement.statut === "CANCELLED"
            ? "Vous avez refusé la demande sur votre téléphone. Aucun montant n'a été prélevé."
            : "Le paiement n'a pas abouti. Vérifiez votre solde, puis réessayez.",
      },
      { status: 402 },
    );
  }

  const resultat = await confirmerParSasPay({
    reference: reservation.reference,
    paiement,
    lienSuivi: `${site.url}/reservation/${token}`,
  });

  switch (resultat.issue) {
    case "confirmee":
    case "deja-confirmee":
      return NextResponse.json({ etat: "confirmee", reference: reservation.reference });

    case "refusee":
      return NextResponse.json({ etat: "echoue", erreur: resultat.raison }, { status: 402 });

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
