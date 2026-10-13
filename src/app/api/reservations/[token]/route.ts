import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";
import { envoyerAnnulationAdmin } from "@/lib/email";
import { montantARendre, paiementPrincipal } from "@/lib/reservations";

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
 * l'annulation d'une location déjà commencée, le vélo est sorti.
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
  if (!annulee) {
    // Rien n'a été annulé par cet appel : déjà annulée entre-temps (second
    // clic, ou vente annulée au comptoir au même instant), ou partie. On
    // renvoie l'état réel, sans prévenir personne.
    const actuelle = await depot.trouverReservationParReference(reservation.reference);
    return NextResponse.json({ reservation: actuelle });
  }

  // Une réservation payée laisse de l'argent à rendre : le gérant en est
  // prévenu tout de suite, avec le montant dû selon les CGV et le moyen
  // par lequel le rendre. L'email ne doit pas faire échouer l'annulation.
  if (reservation.statut === "CONFIRMEE" && paiementPrincipal(annulee)?.statut === "REUSSI") {
    await Promise.allSettled([envoyerAnnulationAdmin(annulee, montantARendre(annulee, aujourdhui()))]);
  }
  return NextResponse.json({ reservation: annulee });
}
