/**
 * État de la double authentification de l'administration.
 *
 * Trois réponses possibles, et la troisième compte : si la base ne
 * répond pas, on ne sait pas si un code est exigé, et la connexion est
 * refusée plutôt que d'ouvrir l'admin sur le seul mot de passe.
 */

import { depot } from "@/lib/db";
import { dechiffrer, pasDuCode } from "@/lib/double-authentification";

export const CLE_SECRET_ACTIF = "totp_secret";
export const CLE_SECRET_EN_ATTENTE = "totp_en_attente";
const CLE_DERNIER_PAS = "totp_dernier_pas";
const CLE_ESSAIS = "totp_essais";

/**
 * Dix codes faux en quinze minutes, et plus aucun code n'est accepté
 * pendant quinze minutes. Le compteur est en base, donc commun à tous
 * les serveurs : en mémoire, chaque nouvelle instance de Vercel repartait
 * de zéro, et un million de combinaisons devenaient essayables.
 */
const MAX_ESSAIS = 10;
const FENETRE_MS = 15 * 60 * 1000;

async function lireEssais(): Promise<{ echecs: number; expireLe: number }> {
  try {
    const essais = JSON.parse((await depot.lireParametreAdmin(CLE_ESSAIS)) ?? "null");
    if (essais && typeof essais.echecs === "number" && essais.expireLe > Date.now()) return essais;
  } catch {
    // Valeur illisible : on repart d'une ardoise vide.
  }
  return { echecs: 0, expireLe: 0 };
}

/**
 * Vérifie un code de l'application : juste, jamais servi, essais non
 * épuisés. Un code accepté note son pas de temps, pour qu'il ne serve pas
 * une seconde fois pendant ses trente secondes de validité.
 */
export async function verifierCode(secret: string, saisi: string): Promise<"accepte" | "refuse" | "bloque"> {
  const essais = await lireEssais();
  if (essais.echecs >= MAX_ESSAIS) return "bloque";

  const pas = pasDuCode(secret, saisi);
  const dernier = Number((await depot.lireParametreAdmin(CLE_DERNIER_PAS)) ?? "-1");
  if (pas === null || pas <= dernier) {
    await depot.ecrireParametreAdmin(
      CLE_ESSAIS,
      JSON.stringify({ echecs: essais.echecs + 1, expireLe: Date.now() + FENETRE_MS }),
    );
    return "refuse";
  }

  await depot.ecrireParametreAdmin(CLE_DERNIER_PAS, String(pas));
  await depot.effacerParametreAdmin(CLE_ESSAIS);
  return "accepte";
}

export type EtatDoubleAuthentification =
  | { etat: "inactive" }
  | { etat: "active"; secret: string }
  | { etat: "indeterminee" };

export async function etatDoubleAuthentification(): Promise<EtatDoubleAuthentification> {
  let enregistre: string | null;
  try {
    enregistre = await depot.lireParametreAdmin(CLE_SECRET_ACTIF);
  } catch (erreur) {
    // Table pas encore créée : la double authentification n'a jamais pu
    // être activée.
    if ((erreur as { code?: string }).code === "P2021") return { etat: "inactive" };
    console.error("[securite] état de la double authentification illisible", erreur);
    return { etat: "indeterminee" };
  }
  if (!enregistre) return { etat: "inactive" };

  const secret = dechiffrer(enregistre);
  if (!secret) {
    // Mot de passe d'administration changé depuis l'activation : l'ancien
    // secret ne se déchiffre plus. Elle est à réactiver depuis Sécurité.
    console.error("[securite] secret de double authentification indéchiffrable : à réactiver.");
    return { etat: "inactive" };
  }
  return { etat: "active", secret };
}
