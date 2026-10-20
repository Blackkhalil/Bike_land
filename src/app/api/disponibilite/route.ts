import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { schemaDisponibilite } from "@/lib/validation";

/**
 * Vérifie qu'un vélo est libre sur un créneau.
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

  const { veloId, dateDebut, dateFin, heureDebut, heureFin } = analyse.data;
  if (dateDebut > dateFin) {
    return NextResponse.json({ erreur: "Période invalide." }, { status: 400 });
  }

  try {
    // Avec le nombre de vélos de sa gamme libres sur le même créneau : c'est
    // le plafond du nombre de personnes, ou de vélos, que le tunnel propose.
    const [disponible, velo, libres] = await Promise.all([
      depot.estDisponible(veloId, dateDebut, dateFin, heureDebut, heureFin),
      depot.trouverVeloParId(veloId),
      depot.velosLibres(dateDebut, heureDebut, heureFin),
    ]);
    const libresGamme = velo ? libres.filter((autre) => autre.gamme === velo.gamme).length : 0;
    return NextResponse.json({ disponible, libresGamme });
  } catch (erreur) {
    // La base n'a pas répondu, même après les reprises. On ne prétend
    // surtout pas que le vélo est libre : l'appelant doit savoir que la
    // question est restée sans réponse, et réessayer.
    console.error("[disponibilite] vérification impossible", erreur);
    return NextResponse.json(
      { erreur: "Vérification impossible pour le moment. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}
