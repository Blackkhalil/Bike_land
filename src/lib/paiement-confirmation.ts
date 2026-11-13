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
 *
 * Les offres de groupe (lot 5b) passent par la même porte. Seul change ce
 * qui suit un paiement arrivé après les 30 minutes où leurs vélos étaient
 * gardés : le créneau se revérifie au quart d'heure, et s'il n'est plus
 * libre, le remboursement est listé dans l'administration et le client
 * comme Bike Land en sont prévenus (décisions 6 et 7). Les dépendances
 * peuvent être remplacées, pour les tests ; par défaut, les vraies.
 */

import { estOffreGroupe, panierExpire } from "@/data/offres";
import { ConflitDisponibiliteError, depot, TransactionDejaUtiliseeError, type Depot } from "@/lib/db";
import {
  envoyerConfirmation,
  envoyerFacture,
  envoyerNotificationAdmin,
  envoyerRemboursementGroupe,
  envoyerRemboursementGroupeAdmin,
} from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { lienDeSuivi } from "@/lib/lien-suivi";
import { montantARembourser, rembourserPaiementTardif, type DependancesRemboursement } from "@/lib/offres-groupe/paiement";
import { paiementARembourser } from "@/lib/reservations";
import { controlerPaiement, type PaiementSasPay } from "@/lib/saspay";
import { urlDuSite } from "@/lib/site";
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
  /**
   * Payé trop tard : le vélo a été repris entre-temps. À rembourser. Pour une
   * offre de groupe, `remboursementListe` : le remboursement est déjà noté
   * dans l'administration, et le client prévenu par email.
   */
  | { issue: "creneau-perdu"; reservation: Reservation; remboursementListe?: boolean };

/** Ce que la confirmation lit et écrit, et les emails qu'elle envoie. */
export interface DependancesConfirmation {
  depot: Pick<
    Depot,
    | "trouverReservationParReference"
    | "marquerTransactionRecue"
    | "estDisponible"
    | "confirmerPaiement"
    | "parcDuJour"
    | "journaliser"
    | "listerJournal"
  > &
    DependancesRemboursement["depot"];
  emails: {
    confirmation: (reservation: Reservation, lienSuivi: string) => Promise<unknown>;
    facture: (reservation: Reservation, lienSuivi: string) => Promise<unknown>;
    notificationAdmin: (reservation: Reservation) => Promise<unknown>;
    remboursementClient: DependancesRemboursement["emails"]["client"];
    remboursementAdmin: DependancesRemboursement["emails"]["admin"];
  };
  /** Le lien de suivi d'une réservation, refait par le serveur (src/lib/lien-suivi.ts). */
  lienDeSuivi: (reference: string) => Promise<string>;
  /** L'instant présent, en millisecondes. */
  maintenant: () => number;
}

function dependancesParDefaut(): DependancesConfirmation {
  return {
    depot,
    emails: {
      confirmation: envoyerConfirmation,
      facture: (reservation, lienSuivi) => envoyerFacture(reservation, numeroDeFacture(reservation), lienSuivi),
      notificationAdmin: envoyerNotificationAdmin,
      remboursementClient: envoyerRemboursementGroupe,
      remboursementAdmin: envoyerRemboursementGroupeAdmin,
    },
    lienDeSuivi,
    maintenant: () => Date.now(),
  };
}

/** Le type des lignes du journal qui gardent un paiement réussi sans réservation à qui le rattacher. */
export const TYPE_PAIEMENT_SANS_RESERVATION = "paiement-sans-reservation";

/**
 * Un paiement réussi qui ne trouve aucune réservation : sans référence, ou
 * pour une demande déjà effacée (décision 27, 48 heures après son délai). Il
 * n'y a pas de réservation où noter un remboursement : une ligne du journal
 * garde la transaction et son montant, pour que Bike Land le rende. Une
 * seule ligne par transaction, même si SasPay rejoue sa notification.
 */
export async function noterPaiementSansReservation(
  paiement: Pick<PaiementSasPay, "id" | "statut" | "montantDebiteXof">,
  reference: string | null,
  journal: Pick<Depot, "journaliser" | "listerJournal"> = depot,
): Promise<void> {
  if (paiement.statut !== "SUCCESS") return;
  console.error(
    `[paiement] ${reference ?? "sans référence"} : paiement ${paiement.id} réussi sans réservation à confirmer. Remboursement à faire.`,
  );
  try {
    const deja = await journal.listerJournal({ type: TYPE_PAIEMENT_SANS_RESERVATION, limite: 1000 });
    if (deja.some((ligne) => ligne.details.paiementId === paiement.id)) return;
    await journal.journaliser({
      type: TYPE_PAIEMENT_SANS_RESERVATION,
      ...(reference ? { reference: reference.toUpperCase() } : {}),
      details: { paiementId: paiement.id, montantXof: paiement.montantDebiteXof },
      auteur: "site",
    });
  } catch (erreur) {
    console.error(`[paiement] ${paiement.id} : paiement sans réservation non noté au journal`, erreur);
  }
}

export async function confirmerParSasPay(
  parametres: {
    reference: string;
    paiement: PaiementSasPay;
    /**
     * Lien de suivi mis dans les emails, quand l'appelant l'a (le jeton du
     * navigateur). À défaut, refait par le serveur à partir de la référence
     * de la réservation trouvée, jamais de celle que SasPay renvoie.
     */
    lienSuivi?: string;
  },
  dependances: Partial<DependancesConfirmation> = {},
): Promise<IssueConfirmation> {
  const { reference, paiement } = parametres;
  const d = { ...dependancesParDefaut(), ...dependances };

  const reservation = await d.depot.trouverReservationParReference(reference);
  if (!reservation) {
    // Une demande jamais payée s'efface 48 heures après la fin de son délai
    // de paiement (décision 27). Un paiement réussi qui arriverait encore
    // après ne trouve plus rien à confirmer : le journal dit quoi rendre.
    await noterPaiementSansReservation(paiement, reference, d.depot);
    return { issue: "introuvable" };
  }

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
    await d.depot.marquerTransactionRecue(reference, paiement.id);
    return { issue: "annulee", reservation };
  }

  if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
    // Déjà payée. Si l'identifiant diffère de celui enregistré, le client
    // a payé deux fois : personne ne s'en apercevrait sans cette trace.
    const dejaEnregistre = reservation.paiements.find(
      (paiement) => !paiement.estCaution,
    )?.referenceFournisseur;
    if (dejaEnregistre && dejaEnregistre !== paiement.id && paiement.statut === "SUCCESS") {
      console.error(
        `[paiement] ${reference} : second paiement ${paiement.id} alors que ${dejaEnregistre} est déjà encaissé. Remboursement à faire.`,
      );
      // Deux demandes validées pour la même réservation (une relance depuis
      // la page de suivi, la première encore ouverte sur le téléphone) : le
      // second paiement est listé à rembourser, une seule fois.
      await d.depot.creerRemboursement({
        reference: reservation.reference,
        montantXof: montantARembourser(reservation, paiement),
        motif: `Second paiement ${paiement.id} reçu pour une réservation déjà payée (${dejaEnregistre}).`,
        par: "site",
        cleIdempotence: paiement.id,
      });
    }
    return { issue: "deja-confirmee", reservation };
  }

  const controle = controlerPaiement(paiement, { montantXof: reservation.totalXof });
  if (!controle.valide) {
    console.warn(`[paiement] ${reference} : transaction refusée, ${controle.raison}`);
    // Un paiement réussi mais refusé (montant insuffisant) : l'argent est
    // reçu. Noté sur la demande, il la rend visible « à rembourser » dans
    // l'administration, et il ne pourra confirmer aucune autre réservation.
    if (paiement.statut === "SUCCESS") await d.depot.marquerTransactionRecue(reservation.reference, paiement.id);
    return { issue: "refusee", raison: controle.raison };
  }

  // Une offre de groupe payée trop tard et dont les vélos sont repris : le
  // remboursement est listé, le client et Bike Land prévenus, une seule fois.
  const creneauPerduGroupe = async (): Promise<IssueConfirmation> => {
    await rembourserPaiementTardif(reservation, paiement, {
      depot: d.depot,
      emails: { client: d.emails.remboursementClient, admin: d.emails.remboursementAdmin },
    });
    return { issue: "creneau-perdu", reservation, remboursementListe: true };
  };

  // Une offre de groupe déjà jugée payée trop tard : le remboursement est
  // décidé, et la décision ne se défait plus, même si des vélos se sont
  // libérés depuis (notification renvoyée, suivi rouvert par le chatbot).
  // La transaction notée sur la réservation en est la trace.
  if (estOffreGroupe(reservation.offre) && paiementARembourser(reservation)) return creneauPerduGroupe();

  // Un panier abandonné cesse de bloquer le vélo au bout de 30 minutes.
  // Si le client paie après ce délai, le vélo a pu être repris par
  // quelqu'un d'autre : confirmer ici créerait une double réservation.
  // Ce premier contrôle épargne une transaction ; celui qui fait foi est
  // refait par `confirmerPaiement`, dans la transaction qui confirme. Une
  // offre de groupe n'a que ce dernier : ses vélos repris y sont remplacés
  // par d'autres libres sur tout le créneau, s'il en reste (décision 6).
  if (panierExpire(reservation.creeLe, d.maintenant()) && !estOffreGroupe(reservation.offre)) {
    // Tous les vélos de la réservation : une inscription à Octobre rose en
    // retient un par participant.
    const disponibles = await Promise.all(
      reservation.lignes.map((ligne) =>
        d.depot.estDisponible(
          ligne.veloId,
          reservation.dateDebut,
          reservation.dateFin,
          reservation.heureDebut,
          reservation.heureFin,
        ),
      ),
    );
    const libre = disponibles.length > 0 && disponibles.every(Boolean);
    if (!libre) {
      console.error(
        `[paiement] ${reference} : paiement ${paiement.id} encaissé hors délai, le vélo n'est plus disponible. Remboursement à faire.`,
      );
      await d.depot.marquerTransactionRecue(reference, paiement.id);
      return { issue: "creneau-perdu", reservation };
    }
  }

  let resultat;
  try {
    resultat = await d.depot.confirmerPaiement(reference, paiement.id);
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
      if (estOffreGroupe(reservation.offre)) return creneauPerduGroupe();
      console.error(
        `[paiement] ${reference} : paiement ${paiement.id} encaissé hors délai, le vélo vient d'être repris. Remboursement à faire.`,
      );
      await d.depot.marquerTransactionRecue(reference, paiement.id);
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
      await d.depot.marquerTransactionRecue(reference, paiement.id);
      return { issue: "annulee", reservation: resultat.reservation };
    }
    return { issue: "deja-confirmee", reservation: resultat.reservation };
  }

  // Les emails ne doivent jamais faire échouer une réservation déjà payée
  // et enregistrée : on les tente, on journalise les échecs. Une offre de
  // groupe reçoit les siens (récapitulatif, prix, retard ; ce qu'il faut
  // préparer), par les mêmes fonctions (src/lib/email.ts). Le lien de suivi
  // se refait à partir de la référence de la réservation (`genererToken`).
  const lienSuivi =
    parametres.lienSuivi ??
    (await d.lienDeSuivi(resultat.reservation.reference).catch(() => `${urlDuSite()}/reservation/suivi`));
  await Promise.allSettled([
    d.emails.confirmation(resultat.reservation, lienSuivi),
    d.emails.facture(resultat.reservation, lienSuivi),
    d.emails.notificationAdmin(resultat.reservation),
  ]);

  return { issue: "confirmee", reservation: resultat.reservation };
}
