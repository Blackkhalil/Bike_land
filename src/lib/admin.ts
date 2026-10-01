/**
 * Accès à l'espace d'exploitation.
 *
 * Un seul mot de passe partagé : l'exploitant et le coordinateur de
 * sortie sont la même personne. Un système de rôles séparés a été écrit
 * puis retiré, il n'apportait que de la complexité tant qu'une seule
 * personne tient les deux casquettes. Si un jour quelqu'un est recruté
 * pour encadrer les sorties, c'est ici qu'il faudra rouvrir le sujet :
 * un coordinateur n'a pas à voir le chiffre d'affaires ni la base
 * clients complète, ce que la page APDP du site promet d'ailleurs.
 *
 * Le cookie ne contient pas le mot de passe mais une signature
 * horodatée, ce qui permet de le faire expirer sans base de sessions.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const NOM_COOKIE = "bikeland_admin";
const DUREE_SESSION_MS = 12 * 60 * 60 * 1000; // 12 heures

function secret(): string {
  return (
    process.env.BOOKING_TOKEN_SECRET ??
    process.env.ADMIN_PASSWORD ??
    "bike-land-admin-developpement"
  );
}

/**
 * Mode d'accès courant.
 * - `protege`   : un mot de passe est défini, la connexion est demandée.
 * - `ouvert`    : pas de mot de passe, mais on est en développement local.
 * - `verrouille`: pas de mot de passe en production, l'accès est refusé,
 *                 pour ne pas exposer les données clients par omission.
 */
export function modeAcces(): "protege" | "ouvert" | "verrouille" {
  if (process.env.ADMIN_PASSWORD) return "protege";
  return process.env.NODE_ENV === "production" ? "verrouille" : "ouvert";
}

export function creerJeton(): string {
  const expiration = Date.now() + DUREE_SESSION_MS;
  const signature = createHmac("sha256", secret()).update(String(expiration)).digest("base64url");
  return `${expiration}.${signature}`;
}

export function jetonValide(jeton: string | undefined): boolean {
  if (!jeton) return false;
  const [expirationBrute, signature] = jeton.split(".");
  const expiration = Number(expirationBrute);
  if (!Number.isFinite(expiration) || expiration < Date.now()) return false;

  const attendue = createHmac("sha256", secret()).update(expirationBrute).digest("base64url");
  const a = Buffer.from(signature ?? "");
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Comparaison à temps constant : `===` laisse fuir le préfixe commun. */
function egalConstant(saisi: string, attendu: string): boolean {
  const a = Buffer.from(saisi);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function motDePasseCorrect(saisi: string): boolean {
  const attendu = process.env.ADMIN_PASSWORD;
  if (!attendu) return false;
  return egalConstant(saisi, attendu);
}

/** Vrai quand l'adresse de l'exploitant est configurée. */
export function emailAdminConfigure(): boolean {
  return Boolean(process.env.ADMIN_EMAIL);
}

/**
 * Contrôle des identifiants de l'exploitant : adresse **et** mot de passe.
 *
 * Demander l'adresse en plus du mot de passe ajoute une seconde chose à
 * connaître, et surtout rend les tentatives aveugles beaucoup plus
 * coûteuses : deviner un mot de passe ne suffit plus.
 *
 * Tant que `ADMIN_EMAIL` n'est pas défini, l'adresse saisie n'est pas
 * vérifiée, sinon la première mise en service enfermerait l'exploitant
 * dehors. Ce cas est signalé sur la page de connexion et dans le journal
 * du serveur, pour qu'il ne passe pas inaperçu.
 */
export function identifiantsCorrects(email: string, motDePasse: string): boolean {
  if (!motDePasseCorrect(motDePasse)) return false;

  const attendu = process.env.ADMIN_EMAIL;
  if (!attendu) {
    console.warn(
      "[admin] ADMIN_EMAIL n'est pas défini : l'adresse saisie à la connexion n'est pas vérifiée.",
    );
    return true;
  }

  return egalConstant(email.trim().toLowerCase(), attendu.trim().toLowerCase());
}

/** Vrai si la requête courante a le droit d'entrer dans /admin. */
export async function sessionAdminValide(): Promise<boolean> {
  const mode = modeAcces();
  if (mode === "verrouille") return false;
  if (mode === "ouvert") return true;

  const magasin = await cookies();
  return jetonValide(magasin.get(NOM_COOKIE)?.value);
}
