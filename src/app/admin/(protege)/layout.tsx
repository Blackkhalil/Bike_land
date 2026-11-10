import { notFound, redirect } from "next/navigation";

import { NavigationAdmin } from "@/components/admin/NavigationAdmin";
import { modeAcces, sessionAdminValide } from "@/lib/admin";
import { depot, modeDonnees } from "@/lib/db";
import { roleDuDeploiement } from "@/lib/deploiement";

export const dynamic = "force-dynamic";

/**
 * Les captures de réduction qui attendent, pour le chiffre à côté de
 * « Preuves de réduction » (décision 24) : une seule requête de comptage.
 * Une base muette n'empêche jamais l'administration de s'afficher.
 */
async function capturesAVerifier(): Promise<number> {
  try {
    return await depot.compterPreuvesEnAttente();
  } catch (erreur) {
    console.error("[admin] captures à vérifier illisibles", erreur);
    return 0;
  }
}

/** Toutes les pages de ce groupe exigent une session valide. */
export default async function LayoutAdminProtege({ children }: { children: React.ReactNode }) {
  // Sur le site public, l'administration n'existe pas, même si une
  // requête échappait au proxy.
  if (roleDuDeploiement() === "site") notFound();
  if (!(await sessionAdminValide())) redirect("/admin/connexion");

  return (
    <div className="min-h-screen bg-craie text-noir-piste">
      <NavigationAdmin protege={modeAcces() === "protege"} modeDonnees={modeDonnees()} preuvesAVerifier={await capturesAVerifier()} />
      <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:pl-[17.5rem]">{children}</div>
    </div>
  );
}
