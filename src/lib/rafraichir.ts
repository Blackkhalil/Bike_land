/**
 * Fait voir tout de suite au site public ce que l'admin vient de changer.
 *
 * Les pages publiques sont mises en cache (une à cinq minutes). Quand
 * l'admin et le site tournent dans le même déploiement, vider ce cache
 * est local. Quand l'admin a son propre projet (BIKELAND_ROLE=admin), le
 * cache à vider est celui de l'autre projet : on le lui demande par
 * /api/revalider, avec un secret partagé par les deux projets.
 *
 * Un échec n'empêche jamais l'action de l'admin : au pire, le site
 * public se met à jour de lui-même à l'expiration de son cache.
 */

import { revalidatePath } from "next/cache";

import { roleDuDeploiement } from "@/lib/deploiement";
import { site } from "@/lib/site";

export async function rafraichirSitePublic(): Promise<void> {
  if (roleDuDeploiement() !== "admin") {
    revalidatePath("/", "layout");
    return;
  }

  const secret = process.env.REVALIDATION_SECRET;
  if (!secret) {
    console.warn("[rafraichir] REVALIDATION_SECRET absent : le site public se mettra à jour à l'expiration de son cache.");
    return;
  }
  try {
    const reponse = await fetch(`${site.url}/api/revalider`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!reponse.ok) console.warn(`[rafraichir] le site public a répondu ${reponse.status}.`);
  } catch {
    console.warn("[rafraichir] site public injoignable : il se mettra à jour à l'expiration de son cache.");
  }
}
