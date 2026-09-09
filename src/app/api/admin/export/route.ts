import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import {
  construirePeriode,
  exporterCsv,
  type Granularite,
} from "@/lib/statistiques";

/** Export comptable des réservations de la période (§2.3). */
export async function GET(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const url = new URL(requete.url);
  const demandee = url.searchParams.get("periode") ?? "mois";
  const granularites: Granularite[] = ["jour", "semaine", "mois", "annee"];
  const granularite = granularites.includes(demandee as Granularite)
    ? (demandee as Granularite)
    : "mois";

  const periode = construirePeriode(granularite);
  const reservations = await depot.listerReservations({
    depuis: periode.debut,
    jusqua: periode.fin,
  });

  const csv = exporterCsv(reservations);
  const nom = `bikeland-reservations-${periode.debut}-${periode.fin}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
