import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { dependancesOffresGroupe, panne, repondre } from "@/lib/offres-groupe/dependances";
import { vendreAuComptoir } from "@/lib/offres-groupe/service";

/** Les emails suivent la vente : de quoi les attendre sans faire attendre l'écran. */
export const maxDuration = 30;

/**
 * La vente au comptoir des offres de groupe, réglée en espèces (décision 12) :
 * Bike for All, Road trip en groupe et Gbashi Bike, aux mêmes réglages, sans
 * les 125 F du paiement électronique, sans date limite du vendredi ni délai
 * avant le départ, au nom de qui a reçu l'argent. Réservée à
 * l'administration.
 *
 * `action: "devis"` donne le prix sans rien écrire ; sinon la vente est
 * enregistrée, déjà payée, écrite au journal, et le client reçoit sa
 * confirmation, sa facture et son lien de suivi. Le montant que le
 * commercial a vu doit être celui que le serveur trouve (409 sinon), et la
 * même saisie envoyée deux fois n'est enregistrée qu'une fois.
 */
export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ ok: false, code: "FERME", message: "Accès refusé." }, { status: 401 });
  }
  const corps: unknown = await requete.json().catch(() => null);
  try {
    return repondre(await vendreAuComptoir(corps, dependancesOffresGroupe()));
  } catch (e) {
    return panne("vente au comptoir impossible", e);
  }
}
