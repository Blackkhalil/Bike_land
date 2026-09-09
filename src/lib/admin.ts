/**
 * Accès à l'espace d'administration.
 *
 * Le cahier des charges ne décrit pas d'utilisateurs multiples côté
 * exploitant : un mot de passe partagé, défini par variable
 * d'environnement, est proportionné au besoin. Le cookie déposé ne
 * contient pas le mot de passe mais une signature horodatée, ce qui
 * permet de le faire expirer sans base de sessions.
 *
 * Si un jour plusieurs comptes sont nécessaires (plusieurs points de
 * retrait, plusieurs gestionnaires), c'est ici qu'il faudra brancher une
 * vraie table d'utilisateurs.
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
 * - `verrouille`: pas de mot de passe en production — l'accès est refusé,
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

export function motDePasseCorrect(saisi: string): boolean {
  const attendu = process.env.ADMIN_PASSWORD;
  if (!attendu) return false;
  const a = Buffer.from(saisi);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vrai si la requête courante a le droit d'entrer dans /admin. */
export async function sessionAdminValide(): Promise<boolean> {
  const mode = modeAcces();
  if (mode === "verrouille") return false;
  if (mode === "ouvert") return true;

  const magasin = await cookies();
  return jetonValide(magasin.get(NOM_COOKIE)?.value);
}
