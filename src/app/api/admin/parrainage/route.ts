import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { erreursParChamp, schemaNouveauCodeParrainage } from "@/lib/validation";

/** Tous les codes de parrainage, avec leur partenaire et leur compteur. */
export async function GET() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const codes = await depot.listerCodesParrainage();
  return NextResponse.json({ codes });
}

/**
 * Crée un code de parrainage rattaché à un partenaire.
 *
 * Le partenaire est obligatoire, et c'est tout l'intérêt de la
 * fonctionnalité : un code sans partenaire accorderait une réduction sans
 * qu'on sache jamais à qui verser la commission.
 *
 * Aucun taux n'est saisi : réduction client et commission partenaire sont
 * des constantes de politique commerciale (cf. src/lib/parrainage.ts).
 */
export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaNouveauCodeParrainage.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const donnees = analyse.data;

  // Le partenaire doit exister : sans ce contrôle, la contrainte de clé
  // étrangère renverrait une erreur 500 illisible pour l'exploitant.
  const partenaires = await depot.listerPartenaires({ inclureInactifs: true });
  if (!partenaires.some((partenaire) => partenaire.id === donnees.partenaireId)) {
    return NextResponse.json(
      { erreur: "Partenaire introuvable.", champs: { partenaireId: "Partenaire inconnu." } },
      { status: 422 },
    );
  }

  try {
    const code = await depot.creerCodeParrainage({
      code: donnees.code,
      partenaireId: donnees.partenaireId,
      debuteLe: donnees.debuteLe || undefined,
      finitLe: donnees.finitLe || undefined,
      utilisationsMax: donnees.utilisationsMax,
    });
    return NextResponse.json({ code }, { status: 201 });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    if (message.includes("Unique") || message.includes("unique")) {
      return NextResponse.json(
        { erreur: "Ce code existe déjà.", champs: { code: "Code déjà utilisé." } },
        { status: 409 },
      );
    }
    console.error("[admin/parrainage] création impossible", erreur);
    return NextResponse.json({ erreur: "Le code n'a pas pu être créé." }, { status: 500 });
  }
}
