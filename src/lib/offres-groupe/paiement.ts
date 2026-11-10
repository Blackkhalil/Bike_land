/**
 * Le paiement des offres de groupe, quand il arrive tard (lot 5b).
 *
 * Une demande garde ses vélos 30 minutes pendant le paiement (décision 5).
 * Un paiement qui arrive après ce délai est confirmé s'il reste assez de
 * vélos libres sur son créneau (le dépôt remplace ceux repris entre-temps,
 * dans la transaction qui confirme) ; sinon il est remboursé :
 * le remboursement est listé dans l'administration, le client et Bike Land
 * sont prévenus par email (décisions 6 et 7). La confirmation commune
 * (src/lib/paiement-confirmation.ts), du webhook SasPay comme du suivi du
 * navigateur, appelle ce module pour les offres de groupe seulement.
 */

import type { Depot } from "@/lib/db/contrat";
import type { PaiementSasPay } from "@/lib/saspay";
import { fraisEncaissement } from "@/lib/tarifs-paiement";
import type { Remboursement, Reservation } from "@/lib/types";

/** Ce dont le remboursement d'un paiement tardif a besoin. */
export interface DependancesRemboursement {
  depot: Pick<Depot, "marquerTransactionRecue" | "compterEssai"> & {
    /**
     * `cleIdempotence` : l'identifiant de la transaction reçue, qui désigne
     * à coup sûr ce remboursement (le lot 3 l'ajoute au dépôt, unique en base).
     * Sans lui, le dépôt reconnaît déjà la même demande à son motif, qui cite
     * la transaction.
     */
    creerRemboursement(champs: {
      reference: string;
      montantXof: number;
      motif: string;
      par?: string;
      cleIdempotence?: string;
    }): Promise<Remboursement | null>;
  };
  emails: {
    client: (reservation: Reservation, montantXof: number) => Promise<unknown>;
    admin: (reservation: Reservation, montantXof: number, transaction: string) => Promise<unknown>;
  };
}

/** Une seule fois les emails d'un même paiement tardif, même rejoué des mois après. */
const FENETRE_EMAILS_SECONDES = 400 * 24 * 60 * 60;

/** Ce qui est à rendre : ce que le téléphone a réellement payé, commission comprise. */
export function montantARembourser(reservation: Pick<Reservation, "totalXof">, paiement: Pick<PaiementSasPay, "montantDebiteXof">): number {
  return paiement.montantDebiteXof > 0
    ? paiement.montantDebiteXof
    : reservation.totalXof + fraisEncaissement(reservation.totalXof);
}

/**
 * Payé trop tard, vélos repris : le paiement est noté sur la réservation (il
 * ne pourra confirmer aucune autre réservation), le remboursement listé dans
 * l'administration, et le client comme Bike Land prévenus. Tout cela une
 * seule fois, même si SasPay rejoue sa notification ou si le navigateur et
 * le webhook arrivent ensemble : le remboursement est désigné par la
 * transaction, et les emails gardés par un compteur commun à tous les
 * serveurs.
 */
export async function rembourserPaiementTardif(
  reservation: Reservation,
  paiement: Pick<PaiementSasPay, "id" | "montantDebiteXof">,
  deps: DependancesRemboursement,
): Promise<Remboursement | null> {
  await deps.depot.marquerTransactionRecue(reservation.reference, paiement.id);
  const montantXof = montantARembourser(reservation, paiement);
  const remboursement = await deps.depot.creerRemboursement({
    reference: reservation.reference,
    montantXof,
    motif: `Paiement ${paiement.id} reçu après les 30 minutes de la demande : les vélos avaient été réservés par un autre groupe.`,
    par: "site",
    cleIdempotence: paiement.id,
  });
  console.error(
    `[paiement] ${reservation.reference} : paiement ${paiement.id} reçu hors délai, vélos repris. Remboursement de ${montantXof} F listé dans l'administration.`,
  );

  let premiereFois = false;
  try {
    premiereFois = (await deps.depot.compterEssai(`remboursement-tardif:${paiement.id}`, FENETRE_EMAILS_SECONDES)) === 1;
  } catch (e) {
    // Compteur injoignable : mieux vaut ne pas écrire deux fois. Le
    // remboursement reste listé, et l'administration le voit.
    console.error(`[paiement] ${reservation.reference} : compteur injoignable, emails du remboursement non envoyés`, e);
  }
  if (premiereFois) {
    await Promise.allSettled([
      deps.emails.client(reservation, montantXof),
      deps.emails.admin(reservation, montantXof, paiement.id),
    ]);
  }
  return remboursement;
}
