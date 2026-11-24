/**
 * Le compteur des réservations refusées faute de vélo.
 *
 * Quand un client demande un créneau complet, le site répond 409 et ne
 * gardait aucune trace : impossible de savoir combien de ventes le parc
 * a laissé passer, ni sur quelle gamme. Chaque refus écrit désormais une
 * ligne au journal (`reservation-refusee`), avec le jour, la gamme et le
 * créneau demandés.
 *
 * Aucune donnée du client n'y entre : ni nom, ni email, ni téléphone. La
 * ligne compte une demande, pas une personne.
 *
 * L'écriture ne doit jamais changer la réponse faite au client : un journal
 * injoignable se note dans la console, et le refus part quand même.
 */

import { depot } from "@/lib/db";
import type { NouvelEvenement } from "@/lib/db/contrat";

/** Le type de la ligne au journal. */
export const TYPE_REFUS = "reservation-refusee";

/** Pourquoi la demande n'a pas pu être servie. */
export type CodeRefus =
  /** Le départ ou le jour est fermé, ou plus aucun vélo n'est libre. */
  | "COMPLET"
  /** Plus aucun vélo de la gamme, ou le vélo choisi n'est plus libre. */
  | "INDISPONIBLE"
  /** Il reste des vélos, mais moins que de personnes. */
  | "PLACES";

export interface Refus {
  code: CodeRefus;
  /** La formule demandée : « location-libre », « road-trip », « padel-bike »… */
  offre: string;
  /** La gamme demandée, quand la formule en fait choisir une. */
  gamme?: string;
  /** Le jour demandé, AAAA-MM-JJ. */
  date: string;
  /** Le créneau demandé, en heures pleines. */
  heureDebut?: number;
  heureFin?: number;
  /** Combien de personnes, ou de vélos en location libre. */
  personnes: number;
  /** Combien de vélos restaient libres, quand on le sait. */
  places?: number;
}

/** La ligne à écrire : seulement ce qui est connu, rien du client. */
export function evenementDeRefus(refus: Refus): NouvelEvenement {
  const details: Record<string, unknown> = {
    code: refus.code,
    offre: refus.offre,
    date: refus.date,
    personnes: refus.personnes,
  };
  if (refus.gamme) details.gamme = refus.gamme;
  if (refus.heureDebut !== undefined) details.heureDebut = refus.heureDebut;
  if (refus.heureFin !== undefined) details.heureFin = refus.heureFin;
  if (refus.places !== undefined) details.places = refus.places;
  return { type: TYPE_REFUS, details, auteur: "site" };
}

/** Écrit le refus au journal, sans jamais faire échouer la réponse. */
export async function journaliserRefus(refus: Refus): Promise<void> {
  try {
    await depot.journaliser(evenementDeRefus(refus));
  } catch (erreur) {
    console.error("[refus] réservation refusée, journal non écrit", erreur);
  }
}
