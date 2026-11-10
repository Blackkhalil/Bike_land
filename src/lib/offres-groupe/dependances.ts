/**
 * Les vraies dépendances du service des offres de groupe (service.ts) : le
 * dépôt (la base, ou la démonstration sans DATABASE_URL), l'horloge, les
 * réglages enregistrés, l'interrupteur du tableau de bord, l'encaissement
 * SasPay (ou la démonstration hors ligne) et les emails. Seules les routes
 * les utilisent ; les tests passent les leurs.
 */

import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { envoyerConfirmation, envoyerFacture, envoyerNotificationAdmin, envoyerReceptionDemande } from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { lireOuverture, offresGroupeActives } from "@/lib/ouverture";
import { encaisser, fournisseurActif } from "@/lib/paiement";
import { lireReglagesOffres } from "@/lib/reglages-offres";
import { site, urlDuSite } from "@/lib/site";

import type { ReponseErreur } from "./api";
import type { DependancesOffresGroupe, Reponse } from "./service";

export function dependancesOffresGroupe(): DependancesOffresGroupe {
  return {
    depot,
    maintenant: () => Date.now(),
    lireReglages: lireReglagesOffres,
    lireOuverture: async () => {
      const ouverture = await lireOuverture();
      return { offresGroupeActives: offresGroupeActives(ouverture), joursFermes: ouverture.joursFermes };
    },
    fournisseur: fournisseurActif,
    encaisser,
    emails: {
      reception: envoyerReceptionDemande,
      confirmation: envoyerConfirmation,
      facture: (reservation, lienSuivi) => envoyerFacture(reservation, numeroDeFacture(reservation), lienSuivi),
      alerteAdmin: envoyerNotificationAdmin,
    },
    urlSite: urlDuSite,
  };
}

/** La réponse du service, en HTTP. */
export function repondre<T>(reponse: Reponse<T>): NextResponse {
  return NextResponse.json(reponse.corps, { status: reponse.statut });
}

/** Une panne imprévue (base injoignable…) : journalisée, et dite simplement au client. */
export function panne(contexte: string, e: unknown): NextResponse {
  console.error(`[offres-groupe] ${contexte}`, e);
  const corps: ReponseErreur = {
    ok: false,
    code: "SERVEUR",
    message: `Un souci technique nous empêche de répondre. Réessayez dans un instant, ou appelez-nous au ${site.telephone}.`,
  };
  return NextResponse.json(corps, { status: 500 });
}
