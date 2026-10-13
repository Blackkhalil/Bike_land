/**
 * Le visiteur a-t-il demandé d'économiser ses données ?
 *
 * Vrai en mode économie de données, ou sur une connexion annoncée en 2G.
 * La vidéo de l'accueil, la seule du site, ne part alors pas d'office :
 * son affiche suffit, et la page reste légère pour qui l'a demandé.
 * Partout ailleurs, téléphone compris, elle joue.
 *
 * À n'appeler que dans le navigateur, après le montage : le serveur ne
 * connaît pas le réseau du visiteur.
 */
export function economieDeDonnees(): boolean {
  const reseau = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (reseau?.saveData) return true;
  return reseau?.effectiveType === "slow-2g" || reseau?.effectiveType === "2g";
}
