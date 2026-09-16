import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormulaireConnexion } from "@/components/admin/FormulaireConnexion";
import { Marque } from "@/components/Marque";
import { emailAdminConfigure, modeAcces, sessionAdminValide } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Connexion — administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageConnexionAdmin() {
  if (await sessionAdminValide()) redirect("/admin");
  const mode = modeAcces();

  return (
    <div className="grid min-h-screen place-items-center bg-noir-piste px-5 py-16 text-craie">
      <div className="w-full max-w-sm">
        <Marque className="text-craie" />
        <h1 className="titre-editorial mt-8 text-[1.8rem]">Espace exploitant</h1>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-craie/70">
          Réservations, parc, clients et tableau de bord.
        </p>

        {mode === "verrouille" ? (
          <p className="mt-8 rounded-[var(--radius-carte)] border border-orange-vif/40 bg-orange-vif/10 px-5 py-4 text-[0.88rem] leading-relaxed text-orange-signal/55">
            Aucun mot de passe d&apos;administration n&apos;est configuré sur ce déploiement.
            Définissez <code className="font-mono">ADMIN_PASSWORD</code> dans les variables
            d&apos;environnement, puis redéployez : tant qu&apos;il est absent, l&apos;accès reste
            fermé plutôt qu&apos;ouvert à tous.
          </p>
        ) : (
          <div className="mt-8">
            {/* Le champ adresse est toujours affiché, mais il n'est
                réellement contrôlé qu'une fois ADMIN_EMAIL défini. Le
                silence serait pire : on croirait la protection active. */}
            {!emailAdminConfigure() && (
              <p className="mb-6 rounded-[var(--radius-carte)] border border-orange-vif/40 bg-orange-vif/10 px-5 py-4 text-[0.85rem] leading-relaxed text-orange-signal/55">
                <code className="font-mono">ADMIN_EMAIL</code> n&apos;est pas encore définie :
                l&apos;adresse saisie ci-dessous n&apos;est pas vérifiée, seul le mot de passe
                protège l&apos;accès. Renseignez-la dans les variables d&apos;environnement pour
                activer ce second contrôle.
              </p>
            )}
            <FormulaireConnexion />
          </div>
        )}
      </div>
    </div>
  );
}
