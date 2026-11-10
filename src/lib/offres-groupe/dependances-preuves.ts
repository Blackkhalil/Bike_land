/**
 * Les vraies dépendances des preuves de réduction (preuves.ts) : le dépôt,
 * le stockage privé des captures, l'interrupteur, les réglages, sharp,
 * l'agent IA quand une clé est réglée, l'email de décision au client et
 * l'email qui prévient Bike Land qu'une capture attend (décision 24). À
 * part de dependances.ts : les routes du devis et de la réservation n'ont
 * besoin ni de sharp ni du client de l'agent IA.
 */

import { analyserCaptureReduction } from "@/lib/agent-ia/capture";
import { agentIaActif } from "@/lib/agent-ia/client";
import { depot } from "@/lib/db";
import { envoyerAlertePreuve, envoyerDecisionPreuve } from "@/lib/email";
import { lireOuverture, offresGroupeActives } from "@/lib/ouverture";
import { lireReglagesOffres } from "@/lib/reglages-offres";
import { urlDuSite } from "@/lib/site";

import { reencoderCapture, type DependancesPreuves } from "./preuves";
import { stockagePreuves } from "./stockage-preuves";

export function dependancesPreuves(): DependancesPreuves {
  return {
    depot,
    stockage: stockagePreuves({ depot }),
    lireOuverture: async () => ({ offresGroupeActives: offresGroupeActives(await lireOuverture()) }),
    lireReglages: lireReglagesOffres,
    // Décision 21 : sans clé, pas d'agent, chaque capture est vérifiée à la main.
    analyser: agentIaActif() ? (entree) => analyserCaptureReduction(entree) : null,
    reencoder: reencoderCapture,
    maintenant: () => Date.now(),
    emailDecision: envoyerDecisionPreuve,
    alerterBikeLand: envoyerAlertePreuve,
    urlSite: urlDuSite,
  };
}
