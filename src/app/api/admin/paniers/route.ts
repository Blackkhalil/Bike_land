import { NextResponse } from "next/server";

import { EXPIRATION_PANIER_MINUTES } from "@/data/offres";
import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { rafraichirSitePublic } from "@/lib/rafraichir";
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
 * qu'un état `EN_ATTENTE_PAIEMENT` dont le délai est dépassé, et sans
 * paiement reçu hors délai (celui-là est à rembourser, pas à effacer).
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
      // Le dépôt refuse d'effacer ce qui porte un paiement : un refus n'est
      // pas un effacement, il ne se compte pas comme tel.
      if (await depot.supprimerReservation(panier.reference)) effaces += 1;
      else echecs.push(panier.reference);
    } catch (erreur) {
      console.error(`[paniers] ${panier.reference} non effacé`, erreur);
      echecs.push(panier.reference);
    }
  }

  // Un panier effacé libère son vélo : le calendrier public doit le voir.
  if (effaces > 0) await rafraichirSitePublic();
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
