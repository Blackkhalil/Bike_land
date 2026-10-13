/**
 * État de la double authentification de l'administration.
 *
 * Trois réponses possibles, et la troisième compte : si la base ne
 * répond pas, on ne sait pas si un code est exigé, et la connexion est
 * refusée plutôt que d'ouvrir l'admin sur le seul mot de passe.
 */

import { depot } from "@/lib/db";
import { dechiffrer } from "@/lib/double-authentification";

export const CLE_SECRET_ACTIF = "totp_secret";
export const CLE_SECRET_EN_ATTENTE = "totp_en_attente";

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
