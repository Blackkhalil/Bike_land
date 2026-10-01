import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { erreursParChamp, schemaNouveauPartenaire } from "@/lib/validation";

/** Les partenaires enregistrés, actifs comme inactifs. */
export async function GET() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const partenaires = await depot.listerPartenaires({ inclureInactifs: true });
  return NextResponse.json({ partenaires });
}

/**
 * Enregistre un partenaire.
 *
 * Le nom est unique : c'est lui qui identifie le partenaire dans les
 * statistiques, et deux « Hôtel du Lac » rendraient les chiffres
 * inexploitables.
 */
export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaNouveauPartenaire.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  try {
    const partenaire = await depot.creerPartenaire({
      nom: analyse.data.nom,
      contact: analyse.data.contact || undefined,
      notes: analyse.data.notes || undefined,
    });
    return NextResponse.json({ partenaire }, { status: 201 });
  } catch (erreur) {
    // La contrainte d'unicité du nom remonte ici.
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("Unique") || message.includes("unique")) {
      return NextResponse.json(
        { erreur: "Un partenaire porte déjà ce nom.", champs: { nom: "Nom déjà pris." } },
        { status: 409 },
      );
    }
    console.error("[admin/partenaires] création impossible", erreur);
    return NextResponse.json(
      { erreur: "Le partenaire n'a pas pu être enregistré." },
      { status: 500 },
    );
  }
}
