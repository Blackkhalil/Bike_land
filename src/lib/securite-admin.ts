/**
 * État de la double authentification de l'administration.
 *
 * Trois réponses possibles, et la troisième compte : si la base ne
 * répond pas, ou si le secret enregistré ne se déchiffre plus, on ne sait
 * pas si un code est exigé, et la connexion est refusée plutôt que
 * d'ouvrir l'admin sur le seul mot de passe.
 */

import { depot } from "@/lib/db";
import { dechiffrer, pasDuCode } from "@/lib/double-authentification";

export const CLE_SECRET_ACTIF = "totp_secret";
export const CLE_SECRET_EN_ATTENTE = "totp_en_attente";
const CLE_DERNIER_PAS = "totp_dernier_pas";

/**
 * Les essais de code, comptés en base, communs à tous les serveurs, et
 * chaque essai compté AVANT d'être examiné : en mémoire, chaque nouvelle
 * instance de Vercel repartait de zéro, et des essais simultanés passaient
 * tous avant d'être comptés. Une fois le plafond passé, plus aucun code
 * n'est accepté pendant le reste du quart d'heure.
 *
 * Deux compteurs. Celui de la connexion : dix essais. Celui de la page
 * Sécurité, à part : une session volée qui y épuiserait ses essais ne doit
 * pas pouvoir bloquer la connexion de l'exploitant. Cinq essais seulement
 * là, pour que les deux réunis ne laissent pas deviner un code beaucoup
 * plus vite qu'avant.
 */
export interface CompteurCodes {
  cle: string;
  max: number;
}
export const CODES_CONNEXION: CompteurCodes = { cle: "codes-double-authentification", max: 10 };
export const CODES_PAGE_SECURITE: CompteurCodes = { cle: "codes-page-securite", max: 5 };
const FENETRE_SECONDES = 15 * 60;

/**
 * Vérifie un code de l'application : juste, jamais servi, essais non
 * épuisés. Un code accepté note son pas de temps, de façon atomique, pour
 * qu'il ne serve pas une seconde fois pendant ses trente secondes.
 */
export async function verifierCode(
  secret: string,
  saisi: string,
  compteur: CompteurCodes = CODES_CONNEXION,
): Promise<"accepte" | "refuse" | "bloque"> {
  const essais = await depot.compterEssai(compteur.cle, FENETRE_SECONDES);
  if (essais > compteur.max) {
    // Une seule ligne par quart d'heure : c'est le signe que quelqu'un
    // essaie des codes, et le seul que l'exploitant verra dans le journal.
    if (essais === compteur.max + 1) {
      console.warn(`[securite] ${compteur.cle} : trop de codes faux, plus aucun accepté pendant un quart d'heure.`);
    }
    return "bloque";
  }

  const pas = pasDuCode(secret, saisi);
  if (pas === null || !(await depot.avancerParametreAdmin(CLE_DERNIER_PAS, pas))) return "refuse";

  await depot.effacerCompteur(compteur.cle);
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
    // La clé du serveur (ADMIN_SESSION_SECRET) a changé depuis
    // l'activation. Plutôt que d'ouvrir l'admin sans code, on refuse :
    // remettre l'ancienne clé, ou effacer la ligne `totp_secret` de la
    // table ParametreAdmin pour repartir sans double authentification.
    console.error("[securite] secret de double authentification indéchiffrable : clé du serveur changée ?");
    return { etat: "indeterminee" };
  }
  return { etat: "active", secret };
}
