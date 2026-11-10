import { panne, repondre } from "@/lib/offres-groupe/dependances";
import { dependancesPreuves } from "@/lib/offres-groupe/dependances-preuves";
import { statutPreuve } from "@/lib/offres-groupe/preuves";

/**
 * Où en est une preuve de réduction restée « en_attente » : le chatbot le
 * redemande quand le client revient. Ne rend que le statut et le message,
 * jamais la capture ni le contact du client.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ preuveId: string }> }) {
  const { preuveId } = await params;
  try {
    return repondre(await statutPreuve(decodeURIComponent(preuveId), dependancesPreuves()));
  } catch (e) {
    return panne("statut de preuve illisible", e);
  }
}
