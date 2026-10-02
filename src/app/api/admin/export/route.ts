import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { exporterPdf } from "@/lib/export-pdf";
import {
  construirePeriode,
  exporterCsv,
  type Granularite,
} from "@/lib/statistiques";

/**
 * Export des réservations de la période (§2.3).
 *
 * `?format=csv`, par défaut, pour le comptable et son tableur.
 * `?format=pdf` pour imprimer, envoyer ou classer.
 */
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

  const nomBase = `bikeland-reservations-${periode.debut}-${periode.fin}`;

  if (url.searchParams.get("format") === "pdf") {
    const pdf = await exporterPdf(reservations, periode);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = exporterCsv(reservations);
  const nom = `${nomBase}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
