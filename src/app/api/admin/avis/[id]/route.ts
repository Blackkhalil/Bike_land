import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";

/**
 * Publication ou retrait d'un avis.
 *
 * C'est la relecture : un avis écrit par un client n'apparaît sur la
 * fiche du vélo qu'une fois passé par ici. Le retrait est aussi
 * réversible que la publication, un avis retiré n'est pas effacé, il
 * cesse simplement de paraître.
 *
 * Le texte de l'avis n'est pas modifiable : le corriger reviendrait à
 * faire dire au client ce qu'il n'a pas écrit.
 */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { id } = await params;
  const corps = (await requete.json().catch(() => ({}))) as { publie?: unknown };

  if (typeof corps.publie !== "boolean") {
    return NextResponse.json(
      { erreur: "Champ « publie » attendu, vrai ou faux." },
      { status: 422 },
    );
  }

  const avis = await depot.publierAvis(id, corps.publie);
  if (!avis) {
    return NextResponse.json({ erreur: "Avis introuvable." }, { status: 404 });
  }

  return NextResponse.json({ id: avis.id, publie: avis.publie });
}
