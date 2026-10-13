/**
 * Faut-il épargner la connexion de ce visiteur ?
 *
 * Vrai sur un téléphone, en mode économie de données, ou sur une
 * connexion annoncée lente. La plupart des clients de Bike Land arrivent
 * sur un réseau mobile béninois, où chaque vidéo de deux ou trois
 * mégaoctets téléchargée d'office ralentit tout le reste de la page :
 * les vidéos n'y partent alors qu'à la demande, les photos suffisent.
 *
 * À n'appeler que dans le navigateur, après le montage : le serveur ne
 * connaît ni l'écran ni le réseau du visiteur.
 */
export function connexionAEpargner(): boolean {
  const reseau = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (reseau?.saveData) return true;
  if (reseau?.effectiveType && ["slow-2g", "2g", "3g"].includes(reseau.effectiveType)) return true;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}
