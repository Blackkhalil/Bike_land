/**
 * Accès à une réservation sans authentification (§2.1, §6.1).
 *
 * Le client reçoit par email un lien contenant un token signé. Le token
 * porte la référence de la réservation et une signature HMAC ; la base ne
 * stocke que le hachage du token, jamais le token lui-même, une fuite de
 * la base ne permet donc pas de fabriquer un lien de suivi valide.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secret de signature, choisi une fois par processus.
 *
 * - `BOOKING_TOKEN_SECRET` renseigné : c'est lui, en toutes circonstances.
 * - Mode démonstration (aucun DATABASE_URL) : les réservations vivent en
 *   mémoire et disparaissent avec le processus, donc un secret tiré au
 *   hasard au démarrage est à la fois suffisant et plus sûr qu'une valeur
 *   écrite en clair dans le dépôt.
 * - Base de données réelle sans secret : refus. Les liens survivraient au
 *   redémarrage alors que la clé qui les signe changerait, et une valeur
 *   par défaut publiée permettrait de forger un lien vers n'importe quelle
 *   réservation.
 */
const cleSecret = Symbol.for("bikeland.secret.tokens");
type PorteurGlobal = typeof globalThis & { [cleSecret]?: string };

function secret(): string {
  const valeur = process.env.BOOKING_TOKEN_SECRET;
  if (valeur && valeur.length >= 16) return valeur;

  if (process.env.DATABASE_URL) {
    throw new Error(
      "BOOKING_TOKEN_SECRET doit être défini (au moins 16 caractères) dès qu'une base de " +
        "données est configurée : sans lui, les liens de suivi ne survivraient pas à un " +
        "redémarrage et pourraient être forgés.",
    );
  }

  const porteur = globalThis as PorteurGlobal;
  porteur[cleSecret] ??= randomBytes(32).toString("hex");
  return porteur[cleSecret];
}

/** Référence lisible communiquée au client : BL-4F2K9Q. */
export function genererReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1
  let suffixe = "";
  const octets = randomBytes(6);
  for (const octet of octets) suffixe += alphabet[octet % alphabet.length];
  return `BL-${suffixe}`;
}

/**
 * Le jeton de suivi d'une réservation, déduit de sa référence et du
 * secret.
 *
 * Le serveur peut ainsi le reconstituer à tout moment, en particulier
 * dans le webhook de paiement, qui confirme une réservation sans avoir vu
 * passer le client. Tiré au hasard, il ne pouvait l'être : l'email de
 * confirmation parti du webhook ne donnait que la page générique de
 * suivi, où le client devait recoller le lien du premier email.
 *
 * La base n'en garde toujours que le hachage : une fuite de la base ne
 * permet pas de fabriquer un lien, il faut aussi le secret.
 */
export function genererToken(reference: string): string {
  const partie = signer(`suivi:${reference}`).slice(0, 24);
  const signature = signer(`${reference}.${partie}`);
  return `${reference}.${partie}.${signature}`;
}

export function hacherToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Vérifie la signature et retourne la référence portée par le token.
 * Retourne `null` si le token est malformé ou si la signature ne
 * correspond pas.
 */
export function lireToken(token: string): string | null {
  const parties = token.split(".");
  if (parties.length !== 3) return null;
  const [reference, aleatoire, signature] = parties;
  const attendue = signer(`${reference}.${aleatoire}`);
  if (!comparaisonConstante(signature, attendue)) return null;
  return reference;
}

function signer(charge: string): string {
  return createHmac("sha256", secret()).update(charge).digest("base64url");
}

function comparaisonConstante(a: string, b: string): boolean {
  const tamponA = Buffer.from(a);
  const tamponB = Buffer.from(b);
  if (tamponA.length !== tamponB.length) return false;
  return timingSafeEqual(tamponA, tamponB);
}
