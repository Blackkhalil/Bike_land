import { NextResponse } from "next/server";
import { z } from "zod";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { auteurAdmin } from "@/lib/journal";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";

/**
 * Noter qu'un remboursement est fait, depuis la page Remboursements.
 *
 * Le responsable rend l'argent lui-même, sur SasPay ou en Mobile Money,
 * sous 48 h (décisions du responsable n° 6 et 7), puis le note ici avec son
 * prénom. La note est sous condition : un second clic, ou deux personnes en
 * même temps, ne comptent pas le remboursement deux fois. Elle s'écrit au
 * journal.
 */
const schema = z.object({
  action: z.literal("fait"),
  id: z.string().min(1).max(80),
  prenom: schemaPrenom,
});

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null), { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    const champs = champsEnErreur(analyse.error);
    return NextResponse.json({ erreur: Object.values(champs)[0] ?? "Demande invalide.", champs }, { status: 422 });
  }

  try {
    const remboursement = await depot.marquerRemboursementFait(analyse.data.id, auteurAdmin(analyse.data.prenom));
    if (!remboursement) {
      return NextResponse.json(
        { erreur: "Ce remboursement est introuvable, ou déjà noté comme fait." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, remboursement });
  } catch (erreur) {
    console.error("[admin/remboursements] enregistrement impossible", erreur);
    return NextResponse.json(
      { erreur: "L'enregistrement n'a pas pu se faire. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
