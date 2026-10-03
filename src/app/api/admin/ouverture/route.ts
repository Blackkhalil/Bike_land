import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CRENEAUX_ROAD_TRIP, heureAuBenin } from "@/data/offres";
import { sessionAdminValide } from "@/lib/admin";
import { estDateISOValide } from "@/lib/dates";
import { depot } from "@/lib/db";

/**
 * Ouvrir ou fermer la réservation, depuis le tableau de bord.
 *
 * Trois gestes : ouvrir ou fermer un créneau de road trip pour toutes les
 * semaines, fermer un jour précis quand il est complet, et le rouvrir.
 *
 * Les fiches des vélos sont mises en cache. Après chaque changement, on
 * demande à Next de les reconstruire à la prochaine visite : sans cela,
 * un départ fermé resterait proposé jusqu'à une minute de plus.
 */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("creneau"),
    code: z.enum(CRENEAUX_ROAD_TRIP.map((c) => c.code) as [string, ...string[]]),
    actif: z.boolean(),
  }),
  z.object({
    action: z.literal("fermer"),
    date: z.string().refine(estDateISOValide, "Date attendue au format AAAA-MM-JJ."),
    formule: z.enum(["road-trip", "location-libre", "toutes"]),
    motif: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("rouvrir"),
    id: z.string().min(1).max(60),
  }),
]);

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: analyse.error.errors[0]?.message ?? "Demande invalide." },
      { status: 422 },
    );
  }
  const demande = analyse.data;

  try {
    if (demande.action === "creneau") {
      await depot.reglerCreneau(demande.code, demande.actif);
    } else if (demande.action === "fermer") {
      // Fermer un jour passé n'aurait aucun effet, et l'encombrerait.
      if (demande.date < heureAuBenin().date) {
        return NextResponse.json({ erreur: "Ce jour est déjà passé." }, { status: 422 });
      }
      await depot.fermerJour({
        date: demande.date,
        formule: demande.formule,
        motif: demande.motif || undefined,
      });
    } else {
      const rouvert = await depot.rouvrirJour(demande.id);
      if (!rouvert) {
        return NextResponse.json({ erreur: "Ce jour n'était plus fermé." }, { status: 404 });
      }
    }
  } catch (erreur) {
    console.error("[ouverture] réglage impossible", erreur);
    return NextResponse.json(
      { erreur: "Le réglage n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  revalidatePath("/velos/[slug]", "page");
  return NextResponse.json({ ok: true });
}
