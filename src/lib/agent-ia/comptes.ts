/**
 * Les comptes de Bike Land sur les réseaux sociaux, ceux qu'un client suit
 * pour obtenir la réduction du Road trip en groupe (cahier des charges,
 * étape 6 ; décision 8).
 *
 * Ils viennent des liens du site (src/lib/site.ts, `reseaux`), et d'eux
 * seuls : un compte retiré du site, comme Facebook, n'ouvre plus droit à la
 * réduction, et un compte ajouté au site y ouvre droit sans toucher à ce
 * fichier. WhatsApp n'est pas un compte qu'on suit : il est écarté.
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
  /** Le nom du compte, sans @ : « bikeland_bj ». */
  identifiant: string;
  url: string;
}

/** Le nom d'un réseau tel qu'on l'écrit. */
export const NOMS_RESEAUX: Record<ReseauSocial, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

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
 * « bikeland_bj ».
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

/** Les comptes de Bike Land, tirés des liens du site. */
export function comptesBikeLand(
  reseaux: ReadonlyArray<{ nom: string; url: string }> = site.reseaux,
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
    comptes.push({ reseau, identifiant, url: lien.url });
  }
  return comptes;
}
