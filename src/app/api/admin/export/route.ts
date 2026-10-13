import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { exporterPdf } from "@/lib/export-pdf";
import { construireRapport, exporterRapportCsv } from "@/lib/rapport";
import { estDateISOValide } from "@/lib/dates";
import { construirePeriode, exporterCsv, type Granularite } from "@/lib/statistiques";

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

  // Tout ce que montre le tableau de bord, assemblé une fois pour les
  // deux formats. Les statistiques portent sur l'ensemble des
  // réservations, comme à l'écran : la comparaison avec la période
  // précédente et les douze derniers mois en ont besoin.
  const [reservations, velos, clients, codes, partenaires] = await Promise.all([
    depot.listerReservations(),
    depot.listerVelos(),
    depot.listerClients(),
    depot.listerCodesParrainage(),
    depot.statistiquesPartenaires(),
  ]);
  // `?semaine=AAAA-MM-JJ` : le bilan de la semaine (lundi à dimanche) qui
  // contient ce jour, depuis la page Bilan. Sans lui, la période en cours.
  const semaine = url.searchParams.get("semaine");
  const periode =
    semaine && estDateISOValide(semaine)
      ? { ...construirePeriode("semaine", semaine), libelle: "La semaine" }
      : undefined;

  const rapport = construireRapport({ reservations, velos, clients, granularite, codes, partenaires, periode });
  const nomBase = `bikeland-${periode ? "bilan-semaine" : "tableau-de-bord"}-${rapport.statistiques.periode.debut}-${rapport.statistiques.periode.fin}`;

  if (url.searchParams.get("format") === "pdf") {
    const pdf = await exporterPdf(rapport);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = exporterRapportCsv(rapport, exporterCsv(rapport.detail));
  const nom = `${nomBase}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
