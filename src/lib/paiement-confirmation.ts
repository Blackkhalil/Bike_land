/**
 * Le passage d'une réservation à « confirmée », après paiement.
 *
 * Deux chemins mènent ici, et c'est justement pourquoi ce module existe :
 *
 *  - le **navigateur** du client, quand la fenêtre KkiaPay lui rend la
 *    main avec un identifiant de transaction ;
 *  - le **webhook** de KkiaPay, filet de sécurité si le client ferme son
 *    navigateur avant le retour.
 *
 * Les deux doivent appliquer exactement les mêmes contrôles. Les écrire
 * deux fois reviendrait, tôt ou tard, à en oublier un d'un côté — et ce
 * côté-là deviendrait la porte d'entrée. Les routes ne font donc que
 * traduire en HTTP l'issue renvoyée ici.
 *
 * Précondition : la transaction a déjà été vérifiée auprès de KkiaPay par
 * l'appelant (`verifierTransaction`). Ce module ne croit jamais un
 * identifiant sur parole.
 */

import { panierExpire } from "@/data/offres";
import { depot, TransactionDejaUtiliseeError } from "@/lib/db";
import { envoyerConfirmation, envoyerFacture, envoyerNotificationAdmin } from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { controlerTransaction, type TransactionKkiapay } from "@/lib/kkiapay";
import type { Reservation } from "@/lib/types";

export type IssueConfirmation =
  /** Première confirmation : les emails viennent de partir. */
  | { issue: "confirmee"; reservation: Reservation }
  /** Déjà confirmée — rejeu du webhook, ou double retour du navigateur. */
  | { issue: "deja-confirmee"; reservation: Reservation }
  | { issue: "introuvable" }
  | { issue: "annulee"; reservation: Reservation }
  /** Le paiement ne correspond pas à cette réservation. */
  | { issue: "refusee"; raison: string }
  /** Cet identifiant de transaction a déjà servi pour une autre réservation. */
  | { issue: "transaction-deja-utilisee" }
  /** Payé trop tard : le vélo a été repris entre-temps. À rembourser. */
  | { issue: "creneau-perdu"; reservation: Reservation };

export async function confirmerParKkiapay(parametres: {
  reference: string;
  transaction: TransactionKkiapay;
  /** Lien de suivi mis dans les emails : personnel si connu, générique sinon. */
  lienSuivi: string;
}): Promise<IssueConfirmation> {
  const { reference, transaction, lienSuivi } = parametres;

  const reservation = await depot.trouverReservationParReference(reference);
  if (!reservation) return { issue: "introuvable" };

  if (reservation.statut === "ANNULEE") {
    console.error(
      `[paiement] ${reference} : paiement ${transaction.transactionId} reçu sur une réservation annulée. Remboursement à faire.`,
    );
    return { issue: "annulee", reservation };
  }

  if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
    // Déjà payée. Si l'identifiant diffère de celui enregistré, le client
    // a payé deux fois : personne ne s'en apercevrait sans cette trace.
    const dejaEnregistre = reservation.paiements.find(
      (paiement) => !paiement.estCaution,
    )?.referenceFournisseur;
    if (dejaEnregistre && dejaEnregistre !== transaction.transactionId) {
      console.error(
        `[paiement] ${reference} : second paiement ${transaction.transactionId} alors que ${dejaEnregistre} est déjà encaissé. Remboursement à faire.`,
      );
    }
    return { issue: "deja-confirmee", reservation };
  }

  const controle = controlerTransaction(transaction, {
    reference,
    montantXof: reservation.totalXof,
  });
  if (!controle.valide) {
    console.warn(`[paiement] ${reference} : transaction refusée — ${controle.raison}`);
    return { issue: "refusee", raison: controle.raison };
  }

  // Un panier abandonné cesse de bloquer le vélo au bout de 30 minutes.
  // Si le client paie après ce délai, le vélo a pu être repris par
  // quelqu'un d'autre : confirmer ici créerait une double réservation.
  if (panierExpire(reservation.creeLe)) {
    const ligne = reservation.lignes[0];
    const libre =
      ligne &&
      (await depot.estDisponible(ligne.veloId, reservation.dateDebut, reservation.dateFin));
    if (!libre) {
      console.error(
        `[paiement] ${reference} : paiement ${transaction.transactionId} encaissé hors délai, le vélo n'est plus disponible. Remboursement à faire.`,
      );
      return { issue: "creneau-perdu", reservation };
    }
  }

  let resultat;
  try {
    resultat = await depot.confirmerPaiement(reference, transaction.transactionId);
  } catch (erreur) {
    if (erreur instanceof TransactionDejaUtiliseeError) {
      console.warn(
        `[paiement] ${reference} : la transaction ${transaction.transactionId} a déjà servi ailleurs.`,
      );
      return { issue: "transaction-deja-utilisee" };
    }
    throw erreur;
  }

  if (!resultat) return { issue: "introuvable" };
  if (resultat.dejaConfirmee) return { issue: "deja-confirmee", reservation: resultat.reservation };

  // Les emails ne doivent jamais faire échouer une réservation déjà payée
  // et enregistrée : on les tente, on journalise les échecs.
  await Promise.allSettled([
    envoyerConfirmation(resultat.reservation, lienSuivi),
    envoyerFacture(resultat.reservation, numeroDeFacture(resultat.reservation), lienSuivi),
    envoyerNotificationAdmin(resultat.reservation),
  ]);

  return { issue: "confirmee", reservation: resultat.reservation };
}
