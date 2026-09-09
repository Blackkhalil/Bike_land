import type { Metadata } from "next";
import { Suspense } from "react";

import { CarteVelo } from "@/components/CarteVelo";
import { FiltresCatalogue } from "@/components/FiltresCatalogue";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";
import { estDateISOValide } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Nos vélos",
  description:
    "Le parc Bike Land : randonneurs, gravels, vélos à assistance électrique, tout chemin et tandem. Filtrez par type, taille, point de retrait et dates disponibles.",
  alternates: { canonical: "/velos" },
};

/** Le filtre par dates dépend des réservations : la page ne peut pas être figée. */
export const dynamic = "force-dynamic";

type Parametres = Promise<Record<string, string | string[] | undefined>>;

export default async function PageCatalogue({ searchParams }: { searchParams: Parametres }) {
  const parametres = await searchParams;

  const enListe = (valeur: string | string[] | undefined): string[] =>
    valeur === undefined ? [] : Array.isArray(valeur) ? valeur : [valeur];

  const debut = typeof parametres.debut === "string" && estDateISOValide(parametres.debut)
    ? parametres.debut
    : undefined;
  const fin = typeof parametres.fin === "string" && estDateISOValide(parametres.fin)
    ? parametres.fin
    : undefined;
  // Les deux dates ne comptent qu'ensemble, et dans le bon ordre.
  const periodeValide = debut && fin && debut <= fin;

  const [velos, points] = await Promise.all([
    depot.listerVelos({
      categories: enListe(parametres.categorie),
      tailles: enListe(parametres.taille),
      pointDeRetraitId: typeof parametres.point === "string" ? parametres.point : undefined,
      dateDebut: periodeValide ? debut : undefined,
      dateFin: periodeValide ? fin : undefined,
    }),
    depot.listerPointsDeRetrait(),
  ]);

  const parametresReservation = periodeValide ? `debut=${debut}&fin=${fin}` : undefined;

  return (
    <Section fond="sable" className="pb-24 pt-32 sm:pt-40">
      <div>
        <Etiquette numero="01">Le parc</Etiquette>
        <TitreSection className="mt-6 max-w-3xl" as="h1">
          Neuf vélos préparés
          <br />
          pour l&apos;itinérance
        </TitreSection>
        <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-encre-500">
          Indiquez vos dates pour ne voir que les vélos réellement libres. La disponibilité
          est calculée sur le parc physique : un vélo déjà loué n&apos;apparaît pas.
        </p>
      </div>

      <div className="mt-12">
        <Suspense fallback={<div className="h-40 border-y border-encre-900/12" />}>
          <FiltresCatalogue points={points} nombreResultats={velos.length} />
        </Suspense>
      </div>

      {velos.length === 0 ? (
        <div className="mt-16 rounded-[1.25rem] bg-white px-8 py-16 text-center">
          <p className="titre-editorial text-[1.6rem]">Aucun vélo sur ces critères</p>
          <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-encre-500">
            Élargissez la période ou retirez un filtre. Si vos dates sont fermes, écrivez-nous :
            nous pouvons parfois avancer un retour ou proposer un modèle équivalent.
          </p>
        </div>
      ) : (
        <div className="mt-14 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {velos.map((velo) => (
            <CarteVelo
              key={velo.id}
              velo={velo}
              parametresReservation={parametresReservation}
              className="reveal"
            />
          ))}
        </div>
      )}
    </Section>
  );
}
