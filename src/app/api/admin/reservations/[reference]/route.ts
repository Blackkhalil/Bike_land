import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";

/**
 * Constat de départ et de retour, déclenché depuis la fiche du jour.
 *
 * On enregistre ce qui s'est réellement passé, pas ce que les dates
 * laissaient prévoir : une réservation dont la date de départ est passée
 * mais dont le client n'est jamais venu ne doit pas compter comme un
 * vélo sorti.
 */
export async function PATCH(
  requete: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { reference } = await params;
  const corps = (await requete.json().catch(() => ({}))) as { action?: string };

  if (corps.action !== "depart" && corps.action !== "retour") {
    return NextResponse.json(
      { erreur: "Action inconnue : attendu « depart » ou « retour »." },
      { status: 422 },
    );
  }

  const reservation =
    corps.action === "depart"
      ? await depot.marquerDepart(reference)
      : await depot.marquerRetour(reference);

  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }

  return NextResponse.json({ reference: reservation.reference, statut: reservation.statut });
}
