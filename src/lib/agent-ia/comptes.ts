/**
 * Les comptes de Bike Land sur les réseaux sociaux, ceux qu'un client suit
 * pour obtenir la réduction du Road trip en groupe (cahier des charges,
 * étape 6 ; décision 8).
 *
 * Deux sources :
 *  - les liens du site (src/lib/site.ts, `reseaux`) : Instagram @bikeland_bj
 *    aujourd'hui. Un compte retiré du site, comme Facebook, n'ouvre plus
 *    droit à la réduction ; un compte ajouté au site y ouvre droit sans
 *    toucher à ce fichier. WhatsApp n'est pas un compte qu'on suit : il est
 *    écarté ;
 *  - les comptes cités par le cahier des charges dont le site n'a pas le
 *    lien : le compte TikTok « Bike Land », @bikelandbj, confirmé par le
 *    responsable le 9 novembre 2026 (voir docs/bike-land/SUIVI.md). Le jour
 *    où son lien est ajouté à `site.reseaux`, c'est ce lien qui compte et
 *    cette entrée s'efface d'elle-même.
 *
 * Un compte peut aussi être connu sans son nom d'utilisateur (`identifiant`
 * à `null`, comme l'était TikTok avant la réponse du responsable) : une
 * capture de ce réseau n'est alors jamais validée automatiquement, elle passe
 * en vérification à la main. De même, si un nom enregistré ici est faux, les
 * captures passent à la main : jamais de réduction à tort.
 *
 * Aucune liste d'abonnés n'est jamais lue : interdit par ces réseaux, et le
 * compte de Bike Land pourrait être bloqué. Seule la capture d'écran envoyée
 * par le client est regardée (capture.ts).
 */

import { site } from "@/lib/site";

/** Les réseaux où l'on suit un compte. */
export type ReseauSocial = "instagram" | "tiktok" | "facebook";

export interface CompteBikeLand {
  reseau: ReseauSocial;
  /** Le nom affiché du compte : « Bike Land ». */
  nom: string;
  /**
   * Le nom d'utilisateur, sans @ : « bikeland_bj ». `null` tant que Bike
   * Land ne l'a pas donné : aucune capture de ce réseau n'est alors validée
   * automatiquement.
   */
  identifiant: string | null;
  /** L'adresse du compte, quand le site l'a. */
  url: string | null;
}

/** Le nom d'un réseau tel qu'on l'écrit. */
export const NOMS_RESEAUX: Record<ReseauSocial, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/** Un compte cité par le cahier des charges, avec son nom d'utilisateur s'il est connu. */
export interface CompteDuCahier {
  reseau: ReseauSocial;
  nom: string;
  /** Le nom d'utilisateur donné par le responsable, sans @ ; `null` tant qu'il ne l'a pas donné. */
  identifiant: string | null;
}

/**
 * Les comptes cités par le cahier des charges (étape 6) dont le site n'a pas
 * le lien : le compte TikTok « Bike Land », @bikelandbj, nom d'utilisateur
 * confirmé par le responsable le 9 novembre 2026. Aucun identifiant n'est
 * deviné : un compte sans réponse du responsable s'écrit avec `null`.
 */
export const COMPTES_DU_CAHIER: readonly CompteDuCahier[] = [
  { reseau: "tiktok", nom: "Bike Land", identifiant: "bikelandbj" },
];

/** L'adresse publique d'un compte, d'après son réseau et son nom d'utilisateur. */
function adresseDuCompte(reseau: ReseauSocial, identifiant: string): string {
  if (reseau === "tiktok") return `https://www.tiktok.com/@${identifiant}`;
  if (reseau === "instagram") return `https://instagram.com/${identifiant}`;
  return `https://www.facebook.com/${identifiant}`;
}

/** Le réseau d'une adresse, d'après son domaine, ou `null` (WhatsApp, autre). */
function reseauDe(hote: string): ReseauSocial | null {
  const domaine = hote.toLowerCase().replace(/^www\./, "");
  if (domaine === "instagram.com" || domaine.endsWith(".instagram.com") || domaine === "instagr.am") return "instagram";
  if (domaine === "tiktok.com" || domaine.endsWith(".tiktok.com")) return "tiktok";
  if (domaine === "facebook.com" || domaine.endsWith(".facebook.com") || domaine === "fb.com") return "facebook";
  return null;
}

/**
 * Un nom de compte ramené à sa forme simple, pour comparer : minuscules,
 * sans @, sans adresse autour. « @BikeLand_BJ », « bikeland_bj » et
 * « https://www.instagram.com/bikeland_bj/?hl=fr » donnent tous
 * « bikeland_bj ». Les adresses TikTok s'écrivent avec un @ dans le chemin
 * (« tiktok.com/@bikeland ») : il est retiré de même.
 */
export function normaliserIdentifiant(brut: string): string {
  let texte = brut.normalize("NFKC").trim().toLowerCase();
  // Une adresse : le premier segment du chemin après le domaine du réseau.
  const adresse = texte.match(
    /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am|tiktok\.com|facebook\.com|fb\.com)\/+([^/?#\s]*)/,
  );
  if (adresse) {
    texte = adresse[1];
  } else {
    // Un nom précédé d'un @ au milieu d'une phrase : « Bike Land (@bikeland_bj) ».
    const mention = texte.match(/@([a-z0-9._]+)/);
    if (mention) texte = mention[1];
  }
  return texte.replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
}

/**
 * Les comptes de Bike Land : ceux des liens du site, puis ceux du cahier des
 * charges dont le réseau n'a pas de lien sur le site.
 */
export function comptesBikeLand(
  reseaux: ReadonlyArray<{ nom: string; url: string }> = site.reseaux,
  cahier: readonly CompteDuCahier[] = COMPTES_DU_CAHIER,
): CompteBikeLand[] {
  const comptes: CompteBikeLand[] = [];
  for (const lien of reseaux) {
    let adresse: URL;
    try {
      adresse = new URL(lien.url);
    } catch {
      continue;
    }
    const reseau = reseauDe(adresse.hostname);
    if (!reseau) continue;
    const identifiant = normaliserIdentifiant(lien.url);
    if (!identifiant) continue;
    comptes.push({ reseau, nom: site.nom, identifiant, url: lien.url });
  }
  for (const compte of cahier) {
    if (comptes.some((c) => c.reseau === compte.reseau)) continue;
    const identifiant = compte.identifiant ? normaliserIdentifiant(compte.identifiant) || null : null;
    comptes.push({
      reseau: compte.reseau,
      nom: compte.nom,
      identifiant,
      url: identifiant ? adresseDuCompte(compte.reseau, identifiant) : null,
    });
  }
  return comptes;
}
