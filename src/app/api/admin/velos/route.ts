import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { erreursParChamp, schemaNouveauVelo } from "@/lib/validation";

/**
 * Ajout d'un vélo au parc, depuis l'espace d'exploitation.
 *
 * Le vélo naît DISPONIBLE et apparaît aussitôt sur le site public : c'est
 * l'intérêt de l'écran, ne pas avoir à toucher au code pour mettre une
 * machine en location.
 *
 * Il n'y a délibérément pas de route de suppression. Effacer un vélo
 * orphelinerait les réservations passées, et donc les factures déjà
 * envoyées. Sortir une machine du parc se fait en la passant en RETIRE
 * (PATCH sur /api/admin/velos/[id]) : elle disparaît du site public, son
 * histoire reste lisible.
 */
export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaNouveauVelo.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const donnees = analyse.data;

  try {
    const velo = await depot.creerVelo({
      nom: donnees.nom,
      categorie: donnees.categorie,
      gamme: donnees.gamme,
      taille: donnees.taille,
      accroche: donnees.accroche,
      description: donnees.description,
      poidsKg: donnees.poidsKg,
      vitesses: donnees.vitesses,
      chargeMaxKg: donnees.chargeMaxKg,
      autonomieConseilleeKm: donnees.autonomieConseilleeKm,
      // Saisi en une ligne séparée par des virgules : c'est ce que
      // l'exploitant a sous les yeux en déballant le vélo.
      equipementInclus: donnees.equipementInclus
        .split(",")
        .map((element) => element.trim())
        .filter(Boolean),
      pointDeRetraitId: donnees.pointDeRetraitId || undefined,
      photo: donnees.photo || undefined,
    });

    return NextResponse.json({ id: velo.id, slug: velo.slug, nom: velo.nom }, { status: 201 });
  } catch (erreur) {
    console.error("[admin/velos] création impossible", erreur);
    return NextResponse.json(
      { erreur: "Le vélo n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
