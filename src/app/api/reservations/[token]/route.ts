import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";

type Params = Promise<{ token: string }>;

/** Consultation d'une réservation par son lien de suivi signé. */
export async function GET(_requete: Request, { params }: { params: Params }) {
  const { token } = await params;
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));

  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }
  return NextResponse.json({ reservation });
}

/**
 * Annulation.
 *
 * Le token vaut autorisation : seul son porteur peut annuler. On refuse
 * l'annulation d'une location déjà commencée — le vélo est sorti.
 */
export async function DELETE(_requete: Request, { params }: { params: Params }) {
  const { token } = await params;
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));

  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }
  if (reservation.statut === "ANNULEE") {
    return NextResponse.json({ reservation });
  }
  if (reservation.dateDebut <= aujourdhui()) {
    return NextResponse.json(
      { erreur: "La location a commencé : contactez-nous par téléphone." },
      { status: 409 },
    );
  }

  const annulee = await depot.annulerReservation(reservation.reference);
  return NextResponse.json({ reservation: annulee });
}
