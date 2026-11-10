import { identifiantAppelant } from "@/lib/anti-force-brute";
import { dependancesOffresGroupe, panne, repondre } from "@/lib/offres-groupe/dependances";
import { reserverOffreGroupe } from "@/lib/offres-groupe/service";

/** L'encaissement attend SasPay jusqu'à 20 secondes ; les emails suivent. */
export const maxDuration = 30;

/**
 * La réservation d'une offre de groupe, à la fin de la discussion du
 * chatbot (décision 23) : tout est recalculé ici, la réservation est écrite
 * (ses vélos lui sont retenus 30 minutes, décision 5), puis la demande de
 * paiement part sur le téléphone du client, comme pour le tunnel.
 *
 * Le navigateur ne fixe ni le prix, ni la réduction, ni le canal : le total
 * qu'il envoie sert seulement à voir s'il a affiché un autre montant (409,
 * avec le nouveau devis). Les vélos pris entre-temps : 409, avec le créneau
 * libre le plus proche. Un refus du moteur : 422.
 */
export async function POST(requete: Request) {
  const corps: unknown = await requete.json().catch(() => null);
  try {
    return repondre(await reserverOffreGroupe(corps, { ip: identifiantAppelant(requete) }, dependancesOffresGroupe()));
  } catch (e) {
    return panne("réservation impossible", e);
  }
}
