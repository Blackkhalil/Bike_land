import type { Metadata } from "next";

import { CarteVelo } from "@/components/CarteVelo";
import { Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";

export const metadata: Metadata = {
  title: "Nos vélos",
  description:
    "Le parc Bike Land, sur la route des Pêches à Cotonou. Choisissez un vélo et une date ; la formule se choisit à l'étape suivante.",
  alternates: { canonical: "/velos" },
};

/** Le parc dépend des réservations en cours : la page ne peut pas être figée. */
export const dynamic = "force-dynamic";

/**
 * Le catalogue.
 *
 * Aucun filtre : ni type de vélo, ni taille, ni point de départ.
 *
 * Avec sept vélos sur un seul point, filtrer n'aide personne. Surtout,
 * ni le type ni la taille ne changent quoi que ce soit : le prix dépend
 * de la formule et non du vélo, et le coordinateur règle la machine à la
 * morphologie du client au départ. Afficher ces critères laisserait
 * croire qu'ils comptent.
 *
 * Le visiteur choisit un vélo, puis une date. C'est tout.
 */
export default async function PageCatalogue() {
  const velos = await depot.listerVelos();

  return (
    <Section fond="noir" className="pb-24 pt-32 sm:pt-40">
      <div>
        <TitreSection className="max-w-3xl" as="h1">
          {velos.length} vélos préparés
          <br />
          pour la route des Pêches
        </TitreSection>
        <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-craie/70">
          Choisissez le vélo qui vous plaît, puis votre date. Il sera réglé à votre taille au
          départ, et un coordinateur vérifie freins et pression avant que vous partiez.
        </p>
      </div>

      {velos.length === 0 ? (
        <div className="mt-16 rounded-[var(--radius-carte)] bg-white px-8 py-16 text-center">
          <p className="titre-editorial text-[1.6rem]">Aucun vélo disponible</p>
          <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-gris-cadre">
            Tout le parc est momentanément à l&apos;atelier. Écrivez-nous, nous vous dirons quand
            les vélos repartent.
          </p>
        </div>
      ) : (
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {velos.map((velo) => (
            <CarteVelo key={velo.id} velo={velo} />
          ))}
        </div>
      )}
    </Section>
  );
}
