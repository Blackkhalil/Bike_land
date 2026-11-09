import type { Metadata } from "next";

import { ReglagesProduits } from "@/components/admin/ReglagesProduits";
import { heureAuBenin } from "@/data/offres";
import { REGLAGES_PAR_DEFAUT } from "@/data/reglages";
import { exigerSessionAdmin } from "@/lib/admin";
import { lireReglages } from "@/lib/reglages";

export const metadata: Metadata = { title: "Réglages des produits" };

/**
 * Les réglages des produits : ce que l'exploitant change lui-même, sans
 * passer par le code, et que le site applique tout de suite.
 */
export default async function PageReglages() {
  await exigerSessionAdmin();
  const reglages = await lireReglages();

  return (
    <div>
      <p className="etiquette opacity-75">Produits</p>
      <h1 className="titre-editorial mt-3 text-[2rem]">Réglages des produits</h1>
      <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-gris-cadre">
        L&apos;heure, les jours, le prix, le nombre de personnes et les dates se changent ici, sans
        passer par le code. Le site se met à jour dès l&apos;enregistrement, et le comptoir aussi.
        Les réservations déjà prises gardent l&apos;horaire et le prix payés.
      </p>
      <ReglagesProduits reglages={reglages} parDefaut={REGLAGES_PAR_DEFAUT} aujourdhui={heureAuBenin().date} />
    </div>
  );
}
