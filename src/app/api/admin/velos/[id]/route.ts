import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import type { GammeVelo } from "@/data/offres";
import type { StatutVelo } from "@/lib/types";

/** Statuts qu'un exploitant peut poser depuis l'interface. */
const STATUTS_MODIFIABLES: StatutVelo[] = ["DISPONIBLE", "MAINTENANCE", "RETIRE"];

/** Les trois gammes de la grille tarifaire. */
const GAMMES_VALIDES: GammeVelo[] = ["CLASSIQUE", "PREMIUM", "PRESTIGE"];

/**
 * Mise à jour d'un vélo depuis l'espace d'exploitation.
 *
 * Deux champs, et ce sont les deux qui bougent en cours d'exploitation :
 *
 *  - le **statut**, quand la machine part à l'atelier ou revient ;
 *  - la **gamme**, qui commande son tarif.
 *
 * Changer la gamme change ce que paieront les prochains clients, rien
 * de plus. Les réservations déjà prises gardent le montant inscrit
 * dessus : il a été payé, il ne se recalcule pas.
 *
 * Le reste de la fiche (géométrie, équipement) relève du catalogue.
 * `EN_LOCATION` n'est pas proposé : ce statut se déduit des réservations
 * en cours, il ne se pose pas à la main.
 */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { id } = await params;
  const corps = (await requete.json().catch(() => ({}))) as {
    statut?: unknown;
    gamme?: unknown;
  };

  const champs: { statut?: StatutVelo; gamme?: GammeVelo } = {};

  if (corps.statut !== undefined) {
    if (
      typeof corps.statut !== "string" ||
      !STATUTS_MODIFIABLES.includes(corps.statut as StatutVelo)
    ) {
      return NextResponse.json(
        { erreur: "Statut invalide : attendu DISPONIBLE, MAINTENANCE ou RETIRE." },
        { status: 422 },
      );
    }
    champs.statut = corps.statut as StatutVelo;
  }

  if (corps.gamme !== undefined) {
    if (typeof corps.gamme !== "string" || !GAMMES_VALIDES.includes(corps.gamme as GammeVelo)) {
      return NextResponse.json(
        { erreur: "Gamme invalide : attendu CLASSIQUE, PREMIUM ou PRESTIGE." },
        { status: 422 },
      );
    }
    champs.gamme = corps.gamme as GammeVelo;
  }

  if (Object.keys(champs).length === 0) {
    return NextResponse.json({ erreur: "Aucun champ à modifier." }, { status: 422 });
  }

  const velo = await depot.majVelo(id, champs);
  if (!velo) {
    return NextResponse.json({ erreur: "Vélo introuvable." }, { status: 404 });
  }

  await rafraichirSitePublic();
  return NextResponse.json({ id: velo.id, statut: velo.statut, gamme: velo.gamme });
}
