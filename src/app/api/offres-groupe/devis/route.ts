import { identifiantAppelant } from "@/lib/anti-force-brute";
import { dependancesOffresGroupe, panne, repondre } from "@/lib/offres-groupe/dependances";
import { devisOffreGroupe } from "@/lib/offres-groupe/service";

/**
 * Le devis d'une offre de groupe, pour le chatbot : le prix calculé par le
 * moteur identique au tableur, avec les réglages et les vélos libres du
 * moment, ou le refus motivé et le créneau libre le plus proche (200 dans
 * les deux cas). Rien n'est écrit. Interrupteur coupé : 403 ; réglages
 * illisibles : 503, jamais un prix par défaut.
 *
 * Le canal est « en-ligne », fixé ici : frais de paiement électronique, date
 * limite du vendredi et délai minimum avant le départ. La réduction du road
 * trip ne vient que d'une preuve que le serveur retrouve validée.
 */
export async function POST(requete: Request) {
  const corps: unknown = await requete.json().catch(() => null);
  try {
    return repondre(await devisOffreGroupe(corps, dependancesOffresGroupe(), { ip: identifiantAppelant(requete) }));
  } catch (e) {
    return panne("devis impossible", e);
  }
}
