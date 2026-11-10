/**
 * Le paiement des offres de groupe, quand il arrive tard (lot 5b).
 *
 * Une demande garde ses vélos 30 minutes pendant le paiement (décision 5).
 * Un paiement qui arrive après ce délai est confirmé si les vélos de la
 * réservation sont encore libres sur son créneau ; sinon il est remboursé :
 * le remboursement est listé dans l'administration, le client et Bike Land
 * sont prévenus par email (décisions 6 et 7). La confirmation commune
 * (src/lib/paiement-confirmation.ts), du webhook SasPay comme du suivi du
 * navigateur, appelle ce module pour les offres de groupe seulement.
 */

import { velosLibresSurCreneau, type CreneauMinutes } from "@/lib/disponibilite";
import type { Depot } from "@/lib/db/contrat";
import type { PaiementSasPay } from "@/lib/saspay";
import { fraisEncaissement } from "@/lib/tarifs-paiement";
import type { Remboursement, Reservation } from "@/lib/types";

/** Le créneau d'une réservation en minutes : ses minutes exactes (offres de groupe), sinon ses heures pleines. */
function minutesDeLaReservation(
  reservation: Pick<Reservation, "minuteDebut" | "minuteFin" | "heureDebut" | "heureFin">,
): CreneauMinutes {
  return reservation.minuteDebut !== undefined && reservation.minuteFin !== undefined
    ? { debutMinute: reservation.minuteDebut, finMinute: reservation.minuteFin }
    : { debutMinute: reservation.heureDebut * 60, finMinute: reservation.heureFin * 60 };
}

/**
 * Les vélos attribués à cette réservation sont-ils encore libres sur son
 * créneau, au quart d'heure ? Le parc du jour (lot 3) compte les réservations
 * payées et les demandes de moins de 30 minutes ; on y retire les créneaux de
 * celle-ci, puis on regarde ses vélos. Le dépôt refait ce contrôle dans la
 * transaction qui confirme : c'est lui qui fait foi.
 */
export async function creneauGroupeEncoreLibre(reservation: Reservation, depot: Pick<Depot, "parcDuJour">): Promise<boolean> {
  const creneau = minutesDeLaReservation(reservation);
  const parc = await depot.parcDuJour(reservation.dateDebut);
  // ParcDuJour ne dit pas à qui est chaque créneau : on retire, vélo par
  // vélo, une occupation exactement égale à celle de cette réservation. Une
  // autre réservation du même vélo aux mêmes minutes garde la sienne, et compte.
  const occupations = [...parc.occupations];
  for (const ligne of reservation.lignes) {
    const index = occupations.findIndex(
      (o) => o.veloId === ligne.veloId && o.debutMinute === creneau.debutMinute && o.finMinute === creneau.finMinute,
    );
    if (index >= 0) occupations.splice(index, 1);
  }
  const libres = new Set(velosLibresSurCreneau({ ...parc, occupations }, creneau).ids);
  return reservation.lignes.length > 0 && reservation.lignes.every((ligne) => libres.has(ligne.veloId));
}

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
