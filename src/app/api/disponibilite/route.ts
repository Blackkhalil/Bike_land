import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { schemaDisponibilite } from "@/lib/validation";

/**
 * Vérifie qu'un vélo est libre sur une période.
 *
 * Appelée par le tunnel de réservation juste avant le paiement, pour
 * afficher un message clair si quelqu'un a réservé entre-temps. La
 * garantie réelle contre la double réservation reste côté écriture.
 */
export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const analyse = schemaDisponibilite.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }

  const { veloId, dateDebut, dateFin } = analyse.data;
  if (dateDebut > dateFin) {
    return NextResponse.json({ erreur: "Période invalide." }, { status: 400 });
  }

  const disponible = await depot.estDisponible(veloId, dateDebut, dateFin);
  return NextResponse.json({ disponible });
}
