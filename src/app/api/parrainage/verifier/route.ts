import { NextResponse } from "next/server";

import { libelleReduction, MESSAGES_REFUS } from "@/lib/parrainage";
import { depot } from "@/lib/db";
import { erreursParChamp, schemaVerificationParrainage } from "@/lib/validation";

/**
 * Vérifie un code de parrainage et annonce la réduction.
 *
 * Route publique, appelée par le tunnel pour montrer la réduction avant
 * le paiement. Sa réponse n'engage à rien : elle est recalculée à la
 * création de la réservation, dans la transaction qui consomme le quota.
 * Un code épuisé entre l'affichage et la validation n'accordera donc rien.
 *
 * Le montant est envoyé par le navigateur, ce qui est sans danger : il ne
 * sert qu'à calculer un aperçu, jamais à décider d'un prix. Le devis
 * définitif est recalculé côté serveur à partir de la formule et de la
 * durée, pas de ce que le navigateur annonce.
 */
export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const analyse = schemaVerificationParrainage.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Requête invalide.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const { code, montantXof } = analyse.data;
  const verification = await depot.verifierCodeParrainage(code, montantXof);

  if (!verification.valide) {
    // 200 et non 4xx : un code refusé n'est pas une erreur d'appel, c'est
    // une réponse. Le tunnel affiche le message tel quel.
    return NextResponse.json({
      valide: false,
      message: MESSAGES_REFUS[verification.motif],
    });
  }

  return NextResponse.json({
    valide: true,
    code: verification.code.code,
    remiseXof: verification.remiseXof,
    libelle: libelleReduction(),
  });
}
