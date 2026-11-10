/**
 * Ce que les pages publiques ont besoin de savoir des offres de groupe,
 * côté serveur : se vendent-elles en ligne en ce moment, avec quels réglages,
 * sur quel parc. Le chatbot, le bouton de la page Nos produits, le road trip
 * et Gbashi Bike remplacés (décision 1) et les conditions générales s'y
 * fient tous.
 *
 * Module du serveur : il lit la base (interrupteur, réglages, parc) et une
 * variable d'environnement du serveur (la clé de l'agent IA). Il ne lève
 * jamais : une base qui ne répond pas, ou des réglages illisibles, comptent
 * comme « fermé », et la page s'affiche comme interrupteur coupé. Jamais de
 * vente aux valeurs par défaut quand les réglages ne se lisent plus.
 */

import { cache } from "react";

import type { OuvertureCreneaux } from "@/data/offres";
import type { ReglagesOffres } from "@/data/reglages-offres";
import { depot } from "@/lib/db";
import { lireOuverture, offresGroupeActives } from "@/lib/ouverture";
import { lireReglagesOffres } from "@/lib/reglages-offres";

import type { FaitsChat } from "./conversation";

/**
 * Les réglages des offres de groupe quand elles se vendent en ligne :
 * interrupteur ouvert et réglages lisibles. `null` sinon, ou si la base ne
 * répond pas. `ouverture` évite une seconde lecture à une page qui l'a déjà.
 */
export async function offresGroupeEnVente(ouverture?: OuvertureCreneaux): Promise<{ reglages: ReglagesOffres } | null> {
  try {
    const [reglees, lecture] = await Promise.all([ouverture ?? lireOuverture(), lireReglagesOffres()]);
    if (!offresGroupeActives(reglees) || lecture.source === "illisible") return null;
    return { reglages: lecture.reglages };
  } catch (erreur) {
    console.error("[offres-groupe] interrupteur ou réglages illisibles : les offres de groupe restent cachées", erreur);
    return null;
  }
}

/**
 * Ce que le chatbot reçoit du serveur : les réglages et le parc en état,
 * toutes gammes et gamme par gamme. `null` quand les offres de groupe ne se
 * vendent pas en ligne : la bulle n'est alors pas rendue du tout. Une seule
 * lecture par rendu de page.
 */
export const faitsDuChat = cache(async (): Promise<FaitsChat | null> => {
  const vente = await offresGroupeEnVente();
  if (!vente) return null;
  try {
    const velos = await depot.listerVelos();
    const parGamme: FaitsChat["parGamme"] = { CLASSIQUE: 0, PREMIUM: 0, PRESTIGE: 0 };
    let velosEnEtat = 0;
    for (const velo of velos) {
      if (velo.statut === "MAINTENANCE" || velo.statut === "RETIRE") continue;
      parGamme[velo.gamme] += 1;
      velosEnEtat += 1;
    }
    return { reglages: vente.reglages, velosEnEtat, parGamme };
  } catch (erreur) {
    console.error("[offres-groupe] parc illisible : le chatbot reste caché", erreur);
    return null;
  }
});

/**
 * L'agent IA est-il activé ? Seulement si la clé ANTHROPIC_API_KEY est
 * posée sur le serveur (décision 21 : pas au lancement). Lue ici, jamais
 * envoyée au navigateur : seules les pages du serveur l'appellent.
 */
export function agentIaActif(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
