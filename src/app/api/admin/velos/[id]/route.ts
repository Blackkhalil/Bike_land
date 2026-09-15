import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import type { StatutVelo } from "@/lib/types";

/** Statuts qu'un exploitant peut poser depuis l'interface. */
const STATUTS_MODIFIABLES: StatutVelo[] = ["DISPONIBLE", "MAINTENANCE", "RETIRE"];

/**
 * Mise à jour d'un vélo depuis l'espace d'exploitation.
 *
 * Volontairement limité au statut : c'est la seule chose qui change en
 * cours d'exploitation. Le prix ne dépend plus du vélo mais de la
 * formule choisie, et le reste (géométrie, équipement) relève du
 * catalogue.
 *
 * `EN_LOCATION` n'est pas proposé : ce statut se déduit des
 * réservations en cours, il ne se pose pas à la main.
 */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { id } = await params;
  const corps = (await requete.json().catch(() => ({}))) as { statut?: unknown };

  // Seul le statut est modifiable : le prix ne depend plus du velo mais
  // de la formule (cf. src/data/offres.ts).
  const champs: { statut?: StatutVelo } = {};

  if (corps.statut !== undefined) {
    if (typeof corps.statut !== "string" || !STATUTS_MODIFIABLES.includes(corps.statut as StatutVelo)) {
      return NextResponse.json(
        { erreur: "Statut invalide : attendu DISPONIBLE, MAINTENANCE ou RETIRE." },
        { status: 422 },
      );
    }
    champs.statut = corps.statut as StatutVelo;
  }

  if (Object.keys(champs).length === 0) {
    return NextResponse.json({ erreur: "Aucun champ à modifier." }, { status: 422 });
  }

  const velo = await depot.majVelo(id, champs);
  if (!velo) {
    return NextResponse.json({ erreur: "Vélo introuvable." }, { status: 404 });
  }

  return NextResponse.json({ id: velo.id, statut: velo.statut });
}
