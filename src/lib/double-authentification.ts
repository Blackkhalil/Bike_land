/**
 * Double authentification de l'administration : un code à six chiffres,
 * renouvelé toutes les trente secondes par une application comme Google
 * Authenticator, demandé en plus du mot de passe.
 *
 * C'est le standard TOTP (RFC 6238), que toutes ces applications
 * comprennent. Un mot de passe volé ne suffit plus : il faut aussi le
 * téléphone de l'exploitant.
 *
 * Le secret partagé avec l'application est tiré au hasard sur le serveur,
 * montré une seule fois sous forme de QR code, puis rangé en base chiffré
 * (AES-256-GCM) avec une clé que seul le serveur détient : une fuite de
 * la base seule ne le révèle pas.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { roleDuDeploiement } from "@/lib/deploiement";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PAS_SECONDES = 30;
const CHIFFRES = 6;

function versBase32(octets: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = "";
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

function depuisBase32(texte: string): Buffer {
  const propre = texte.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const caractere of propre) {
    const index = ALPHABET.indexOf(caractere);
    if (index === -1) throw new Error("secret illisible");
    valeur = (valeur << 5) | index;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

/** Un nouveau secret de 160 bits, en base32 comme l'attendent les applications. */
export function nouveauSecret(): string {
  return versBase32(randomBytes(20));
}

function codeAuPas(secret: Buffer, pas: number): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const empreinte = createHmac("sha1", secret).update(compteur).digest();
  const decalage = empreinte[empreinte.length - 1] & 15;
  const nombre = (empreinte.readUInt32BE(decalage) & 0x7fffffff) % 10 ** CHIFFRES;
  return String(nombre).padStart(CHIFFRES, "0");
}

/**
 * Le pas de temps auquel correspond le code saisi, ou `null` s'il n'est
 * pas celui de l'application.
 *
 * Un pas de trente secondes de tolérance de part et d'autre : l'heure du
 * téléphone n'est jamais tout à fait celle du serveur, et le code peut
 * changer pendant qu'on le tape. Le pas rendu sert à refuser qu'un même
 * code serve deux fois (voir src/lib/securite-admin.ts).
 */
export function pasDuCode(secretBase32: string, saisi: string, maintenant = Date.now()): number | null {
  const code = saisi.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const secret = depuisBase32(secretBase32);
  const pas = Math.floor(maintenant / 1000 / PAS_SECONDES);
  for (const ecart of [-1, 0, 1]) {
    if (timingSafeEqual(Buffer.from(codeAuPas(secret, pas + ecart)), Buffer.from(code))) return pas + ecart;
  }
  return null;
}

/** Le code saisi est-il celui de l'application, à un pas près ? */
export function codeValide(secretBase32: string, saisi: string, maintenant = Date.now()): boolean {
  return pasDuCode(secretBase32, saisi, maintenant) !== null;
}

/** L'adresse que lit l'application en scannant le QR code. */
export function adresseApplication(secretBase32: string, compte: string): string {
  const libelle = encodeURIComponent(`Bike Land:${compte}`);
  return `otpauth://totp/${libelle}?secret=${secretBase32}&issuer=${encodeURIComponent("Bike Land")}&digits=${CHIFFRES}&period=${PAS_SECONDES}`;
}

/* ------------------------------------------------- Rangement en base */

/**
 * La clé de chiffrement, déduite d'un secret à haute entropie du serveur
 * (ADMIN_SESSION_SECRET, à défaut BOOKING_TOKEN_SECRET), jamais du mot de
 * passe : une copie de la base ne doit pas permettre de tester des mots
 * de passe hors ligne contre le secret chiffré. Sur le projet
 * d'administration, ADMIN_SESSION_SECRET seul : BOOKING_TOKEN_SECRET y est
 * aussi, mais le site le détient.
 */
function cle(): Buffer | null {
  const racine =
    roleDuDeploiement() === "admin"
      ? process.env.ADMIN_SESSION_SECRET
      : process.env.ADMIN_SESSION_SECRET || process.env.BOOKING_TOKEN_SECRET;
  if (!racine || racine.length < 16) return null;
  return createHmac("sha256", racine).update("bikeland-double-authentification").digest();
}

export function chiffrer(secretBase32: string): string {
  const k = cle();
  if (!k) throw new Error("clé de chiffrement absente");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", k, iv);
  const corps = Buffer.concat([chiffreur.update(secretBase32, "utf8"), chiffreur.final()]);
  return [iv, chiffreur.getAuthTag(), corps].map((b) => b.toString("base64url")).join(".");
}

/** Le secret en clair, ou `null` s'il ne se déchiffre plus (clé du serveur changée). */
export function dechiffrer(enregistre: string): string | null {
  const k = cle();
  if (!k) return null;
  try {
    const [iv, etiquette, corps] = enregistre.split(".").map((partie) => Buffer.from(partie, "base64url"));
    const dechiffreur = createDecipheriv("aes-256-gcm", k, iv);
    dechiffreur.setAuthTag(etiquette);
    return Buffer.concat([dechiffreur.update(corps), dechiffreur.final()]).toString("utf8");
  } catch {
    return null;
  }
}
