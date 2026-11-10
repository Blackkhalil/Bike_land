import { NextResponse } from "next/server";

import { identifiantAppelant } from "@/lib/anti-force-brute";
import { TAILLE_MAX_CAPTURE_OCTETS, type ReponseErreur } from "@/lib/offres-groupe/api";
import { panne, repondre } from "@/lib/offres-groupe/dependances";
import { dependancesPreuves } from "@/lib/offres-groupe/dependances-preuves";
import { recevoirPreuve } from "@/lib/offres-groupe/preuves";

/** Le réencodage, puis l'agent IA quand il est activé (30 secondes au plus). */
export const maxDuration = 60;

/**
 * La capture envoyée depuis le chatbot pour la réduction du road trip en
 * groupe (formulaire multipart : « capture », « telephone », « email »).
 * Limite par adresse et par numéro ; type lu dans le fichier (JPEG, PNG,
 * WebP), 4 Mo au plus ; réencodée sans métadonnées et rangée en privé ;
 * vérifiée par l'agent IA s'il est activé, sinon à la main dans
 * l'administration, qui répond au client par email (décision 21).
 */
export async function POST(requete: Request) {
  // Annoncée trop lourde : refusée avant d'être lue (le reste du formulaire pèse peu).
  const annoncee = Number(requete.headers.get("content-length") ?? 0);
  if (Number.isFinite(annoncee) && annoncee > TAILLE_MAX_CAPTURE_OCTETS + 64 * 1024) {
    const corps: ReponseErreur = {
      ok: false,
      code: "SAISIE",
      message: "Cette image est trop lourde : 4 Mo au plus. Envoyez une capture d'écran, sans la retoucher.",
    };
    return NextResponse.json(corps, { status: 413 });
  }
  const formulaire = await requete.formData().catch(() => null);
  try {
    return repondre(await recevoirPreuve(formulaire, { ip: identifiantAppelant(requete) }, dependancesPreuves()));
  } catch (e) {
    return panne("preuve de réduction non enregistrée", e);
  }
}
