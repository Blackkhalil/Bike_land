import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { stockagePreuves } from "@/lib/offres-groupe/stockage-preuves";

/**
 * La capture d'une preuve de réduction, pour l'administration seulement :
 * elle n'a aucune adresse publique (stockage privé), et ne passe que par
 * ici, session exigée. Jamais gardée en cache ; servie comme une image et
 * rien d'autre.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ preuveId: string }> }) {
  if (!(await sessionAdminValide())) return new Response("Accès refusé.", { status: 401 });
  const { preuveId } = await params;
  const preuve = await depot.trouverPreuve(decodeURIComponent(preuveId));
  if (!preuve?.fichierCle) return new Response("Capture introuvable, ou déjà effacée.", { status: 404 });
  const octets = await stockagePreuves({ depot }).lire(preuve);
  if (!octets) return new Response("Capture introuvable, ou déjà effacée.", { status: 404 });
  return new Response(new Blob([new Uint8Array(octets)], { type: preuve.typeMime }), {
    headers: {
      "Content-Type": preuve.typeMime,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
