import { NextResponse } from "next/server";

import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { paniersAbandonnes } from "@/lib/reservations";

/**
 * Efface les paniers abandonnés.
 *
 * Un panier abandonné est une réservation créée puis jamais payée, dont
 * le délai est passé. Elle ne bloque plus aucun vélo, mais elle reste en
 * base, où elle n'apprend rien à personne : ni le client ni l'atelier ne
 * la reverront.
 *
 * L'effacement est volontairement manuel plutôt qu'automatique à chaque
 * visite. Une suppression déclenchée par la navigation d'un visiteur est
 * une écriture imprévisible, qui tombe au pire moment sous la charge, et
 * qui rend les chiffres mouvants d'un rafraîchissement à l'autre.
 * L'exploitant choisit son moment, et voit ce qu'il efface.
 *
 * Rien de payé n'est touché, à aucune condition : le filtre ne retient
 * qu'un état `EN_ATTENTE_PAIEMENT` dont le délai est dépassé.
 */
export async function POST() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const reservations = await depot.listerReservations();
  const aEffacer = paniersAbandonnes(reservations);

  let effaces = 0;
  const echecs: string[] = [];
  for (const panier of aEffacer) {
    try {
      await depot.supprimerReservation(panier.reference);
      effaces += 1;
    } catch (erreur) {
      console.error(`[paniers] ${panier.reference} non effacé`, erreur);
      echecs.push(panier.reference);
    }
  }

  return NextResponse.json({
    effaces,
    echecs,
    delaiMinutes: EXPIRATION_PANIER_MINUTES,
  });
}

/** Combien de paniers attendent d'être effacés. */
export async function GET() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const reservations = await depot.listerReservations();
  return NextResponse.json({ abandonnes: paniersAbandonnes(reservations).length });
}
