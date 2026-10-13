import type { Metadata } from "next";

import { GestionSecurite } from "@/components/admin/GestionSecurite";
import { exigerSessionAdmin } from "@/lib/admin";
import { etatDoubleAuthentification } from "@/lib/securite-admin";

export const metadata: Metadata = { title: "Sécurité du compte" };

/** La protection de l'accès à l'administration. */
export default async function PageSecurite() {
  await exigerSessionAdmin();
  const etat = await etatDoubleAuthentification();

  return (
    <div>
      <p className="etiquette opacity-75">Compte</p>
      <h1 className="titre-editorial mt-3 text-[2rem]">Sécurité du compte</h1>
      {etat.etat === "indeterminee" ? (
        <p className="mt-6 max-w-2xl rounded-[var(--radius-carte)] bg-white p-6 text-[0.9rem]">
          L&apos;état de la double authentification ne peut pas être lu pour le moment. Rechargez
          la page dans un instant.
        </p>
      ) : (
        <GestionSecurite activeAuDepart={etat.etat === "active"} />
      )}
    </div>
  );
}
