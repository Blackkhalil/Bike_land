/**
 * Limitation des tentatives de connexion à l'espace d'exploitation.
 *
 * L'administration est protégée par un unique mot de passe partagé. Sans
 * limite, une machine peut en essayer des milliers par heure : le délai
 * fixe de 400 ms posé sur les échecs ralentit, mais ne protège pas.
 *
 * Le compteur vit **en mémoire du processus**. C'est volontaire et c'est
 * suffisant ici : Bike Land tourne sur une seule instance. Si un jour le
 * site est répliqué sur plusieurs machines, chacune aura son compteur et
 * la limite sera multipliée d'autant — il faudra alors la déplacer dans
 * Redis ou dans la base. Redémarrer le serveur remet aussi les compteurs
 * à zéro ; c'est acceptable pour un blocage de quelques minutes.
 */

const MAX_ECHECS = 8;
const FENETRE_MS = 15 * 60 * 1000;

type Compteur = { echecs: number; expireLe: number };

// Sur `globalThis` pour survivre au rechargement à chaud du serveur de
// développement, comme l'état de démonstration.
const cle = Symbol.for("bikeland.anti-force-brute");
type Porteur = typeof globalThis & { [cle]?: Map<string, Compteur> };

function compteurs(): Map<string, Compteur> {
  const porteur = globalThis as Porteur;
  porteur[cle] ??= new Map();
  return porteur[cle];
}

/**
 * Identifie l'appelant.
 *
 * Derrière un reverse proxy (Vercel, Nginx), l'adresse vue par Node est
 * celle du proxy : on lit donc l'en-tête qu'il pose. Cet en-tête est
 * falsifiable si le site est exposé sans proxy — on ne s'en sert que pour
 * répartir un quota, jamais pour autoriser quoi que ce soit.
 */
export function identifiantAppelant(requete: Request): string {
  const transmise = requete.headers.get("x-forwarded-for");
  if (transmise) return transmise.split(",")[0].trim();
  return requete.headers.get("x-real-ip") ?? "inconnu";
}

/** Nombre de secondes à attendre, ou `null` si l'appelant peut essayer. */
export function delaiAvantNouvelEssai(identifiant: string): number | null {
  const compteur = compteurs().get(identifiant);
  if (!compteur) return null;
  if (Date.now() > compteur.expireLe) {
    compteurs().delete(identifiant);
    return null;
  }
  if (compteur.echecs < MAX_ECHECS) return null;
  return Math.ceil((compteur.expireLe - Date.now()) / 1000);
}

export function enregistrerEchec(identifiant: string): void {
  const maintenant = Date.now();
  const existant = compteurs().get(identifiant);
  if (!existant || maintenant > existant.expireLe) {
    compteurs().set(identifiant, { echecs: 1, expireLe: maintenant + FENETRE_MS });
    return;
  }
  existant.echecs += 1;
  // La fenêtre repart à chaque échec : s'acharner prolonge le blocage.
  existant.expireLe = maintenant + FENETRE_MS;
}

/** Une connexion réussie efface l'ardoise. */
export function reinitialiser(identifiant: string): void {
  compteurs().delete(identifiant);
}
