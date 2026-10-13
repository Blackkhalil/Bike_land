/**
 * Ce que sert ce déploiement : le site public, l'administration, ou les deux.
 *
 * Le même dépôt GitHub alimente deux projets Vercel, pour que
 * l'administration ait sa propre adresse, ses propres clés et rien de
 * commun avec le site public que la base de données :
 *
 *  - `BIKELAND_ROLE=site`  : le site public seul. /admin et ses API
 *    n'existent pas, elles répondent « page introuvable ».
 *  - `BIKELAND_ROLE=admin` : l'administration seule. La racine mène à
 *    /admin, toute page publique renvoie vers le site public.
 *  - variable absente : les deux, comme avant la séparation. C'est ce
 *    qui permet de créer le projet d'administration sans jamais couper
 *    l'accès à l'admin actuelle.
 *
 * Les deux projets lisent et écrivent la même base : réservations, vélos,
 * réglages et clients sont partagés en temps réel.
 */
export type RoleDeploiement = "complet" | "site" | "admin";

export function roleDuDeploiement(): RoleDeploiement {
  const role = process.env.BIKELAND_ROLE?.trim().toLowerCase();
  return role === "site" || role === "admin" ? role : "complet";
}
