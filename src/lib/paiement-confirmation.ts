/**
 * Le passage d'une réservation à « confirmée », après paiement.
 *
 * Deux chemins mènent ici, et c'est justement pourquoi ce module existe :
 *
 *  - le **navigateur** du client, qui demande périodiquement où en est la
 *    validation sur le téléphone ;
 *  - le **webhook** de SasPay, filet de sécurité si le client ferme son
 *    navigateur avant d'avoir validé.
 *
 * Les deux doivent appliquer exactement les mêmes contrôles. Les écrire
 * deux fois reviendrait, tôt ou tard, à en oublier un d'un côté, et ce
 * côté-là deviendrait la porte d'entrée. Les routes ne font donc que
 * traduire en HTTP l'issue renvoyée ici.
 *
 * Précondition : le paiement a déjà été vérifié auprès de SasPay par
 * l'appelant (`verifierPaiement`). Ce module ne croit jamais un
 * identifiant sur parole.
 */

import { panierExpire } from "@/data/offres";
import { ConflitDisponibiliteError, depot, TransactionDejaUtiliseeError } from "@/lib/db";
import { envoyerConfirmation, envoyerFacture, envoyerNotificationAdmin } from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { controlerPaiement, type PaiementSasPay } from "@/lib/saspay";
import type { Reservation } from "@/lib/types";

export type IssueConfirmation =
  /** Première confirmation : les emails viennent de partir. */
  | { issue: "confirmee"; reservation: Reservation }
  /** Déjà confirmée, rejeu du webhook, ou double retour du navigateur. */
  | { issue: "deja-confirmee"; reservation: Reservation }
  | { issue: "introuvable" }
  | { issue: "annulee"; reservation: Reservation }
  /** Le paiement ne correspond pas à cette réservation. */
  | { issue: "refusee"; raison: string }
  /** Cet identifiant de transaction a déjà servi pour une autre réservation. */
  | { issue: "transaction-deja-utilisee" }
  /** Payé trop tard : le vélo a été repris entre-temps. À rembourser. */
  | { issue: "creneau-perdu"; reservation: Reservation };

export async function confirmerParSasPay(parametres: {
  reference: string;
  paiement: PaiementSasPay;
  /** Lien de suivi mis dans les emails : personnel si connu, générique sinon. */
  lienSuivi: string;
}): Promise<IssueConfirmation> {
  const { reference, paiement, lienSuivi } = parametres;

  const reservation = await depot.trouverReservationParReference(reference);
  if (!reservation) return { issue: "introuvable" };

  // Un paiement ne confirme que la réservation pour laquelle il a été
  // poussé. Sans ce contrôle, le navigateur pouvait présenter le paiement
  // d'une autre de ses réservations, par exemple d'une réservation
  // annulée, remboursée ensuite, pour en confirmer une nouvelle. SasPay
  // renvoie bien la référence (relevé le 13 octobre 2026) ; si elle venait
  // à manquer, le contrôle ne pourrait plus se faire, et on veut le savoir.
  if (!paiement.reference) {
    console.warn(
      `[paiement] ${reference} : le paiement ${paiement.id} ne dit pas à quelle réservation il appartient ; lien non contrôlé.`,
    );
  } else if (paiement.reference.toUpperCase() !== reservation.reference.toUpperCase()) {
    console.warn(
      `[paiement] ${reference} : le paiement ${paiement.id} appartient à la réservation ${paiement.reference}.`,
    );
    return { issue: "refusee", raison: "Ce paiement appartient à une autre réservation." };
  }

  if (reservation.statut === "ANNULEE") {
    console.error(
      `[paiement] ${reference} : paiement ${paiement.id} reçu sur une réservation annulée. Remboursement à faire.`,
    );
    // Noté sur la réservation annulée : il ne pourra plus en confirmer une
    // autre, l'identifiant d'un paiement étant unique en base.
    await depot.marquerTransactionRecue(reference, paiement.id);
    return { issue: "annulee", reservation };
  }

  if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
    // Déjà payée. Si l'identifiant diffère de celui enregistré, le client
    // a payé deux fois : personne ne s'en apercevrait sans cette trace.
    const dejaEnregistre = reservation.paiements.find(
      (paiement) => !paiement.estCaution,
    )?.referenceFournisseur;
    if (dejaEnregistre && dejaEnregistre !== paiement.id) {
      console.error(
        `[paiement] ${reference} : second paiement ${paiement.id} alors que ${dejaEnregistre} est déjà encaissé. Remboursement à faire.`,
      );
    }
    return { issue: "deja-confirmee", reservation };
  }

  const controle = controlerPaiement(paiement, { montantXof: reservation.totalXof });
  if (!controle.valide) {
    console.warn(`[paiement] ${reference} : transaction refusée, ${controle.raison}`);
    return { issue: "refusee", raison: controle.raison };
  }

  // Un panier abandonné cesse de bloquer le vélo au bout de 30 minutes.
  // Si le client paie après ce délai, le vélo a pu être repris par
  // quelqu'un d'autre : confirmer ici créerait une double réservation.
  // Ce premier contrôle épargne une transaction ; celui qui fait foi est
  // refait par `confirmerPaiement`, dans la transaction qui confirme.
  if (panierExpire(reservation.creeLe)) {
    const ligne = reservation.lignes[0];
    const libre =
      ligne &&
      (await depot.estDisponible(
        ligne.veloId,
        reservation.dateDebut,
        reservation.dateFin,
        reservation.heureDebut,
        reservation.heureFin,
      ));
    if (!libre) {
      console.error(
        `[paiement] ${reference} : paiement ${paiement.id} encaissé hors délai, le vélo n'est plus disponible. Remboursement à faire.`,
      );
      await depot.marquerTransactionRecue(reference, paiement.id);
      return { issue: "creneau-perdu", reservation };
    }
  }

  let resultat;
  try {
    resultat = await depot.confirmerPaiement(reference, paiement.id);
  } catch (erreur) {
    if (erreur instanceof TransactionDejaUtiliseeError) {
      console.warn(
        `[paiement] ${reference} : le paiement ${paiement.id} a déjà servi ailleurs.`,
      );
      return { issue: "transaction-deja-utilisee" };
    }
    // Le vélo d'un panier expiré a été repris entre le contrôle ci-dessus
    // et la confirmation : la transaction l'a vu, et n'a rien confirmé.
    if (erreur instanceof ConflitDisponibiliteError) {
      console.error(
        `[paiement] ${reference} : paiement ${paiement.id} encaissé hors délai, le vélo vient d'être repris. Remboursement à faire.`,
      );
      await depot.marquerTransactionRecue(reference, paiement.id);
      return { issue: "creneau-perdu", reservation };
    }
    throw erreur;
  }

  if (!resultat) return { issue: "introuvable" };
  if (resultat.dejaConfirmee) {
    // Annulée entre la première lecture et la confirmation : le paiement
    // est arrivé sur une réservation annulée, comme plus haut.
    if (resultat.reservation.statut === "ANNULEE") {
      console.error(
        `[paiement] ${reference} : paiement ${paiement.id} reçu au moment même de l'annulation. Remboursement à faire.`,
      );
      await depot.marquerTransactionRecue(reference, paiement.id);
      return { issue: "annulee", reservation: resultat.reservation };
    }
    return { issue: "deja-confirmee", reservation: resultat.reservation };
  }

  // Les emails ne doivent jamais faire échouer une réservation déjà payée
  // et enregistrée : on les tente, on journalise les échecs.
  await Promise.allSettled([
    envoyerConfirmation(resultat.reservation, lienSuivi),
    envoyerFacture(resultat.reservation, numeroDeFacture(resultat.reservation), lienSuivi),
    envoyerNotificationAdmin(resultat.reservation),
  ]);

  return { issue: "confirmee", reservation: resultat.reservation };
}
