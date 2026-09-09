import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TunnelReservation } from "@/components/reservation/TunnelReservation";
import { Etiquette, Section, TitreSection } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import { depot } from "@/lib/db";
import { aujourdhui, estDateISOValide } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Réserver",
  description: "Finalisez votre réservation Bike Land en trois étapes, sans créer de compte.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Recherche = Promise<Record<string, string | string[] | undefined>>;

export default async function PageReservation({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;

  const slug = typeof parametres.velo === "string" ? parametres.velo : null;
  const debut = typeof parametres.debut === "string" ? parametres.debut : null;
  const fin = typeof parametres.fin === "string" ? parametres.fin : null;

  // Sans période valide, il n'y a rien à réserver : on renvoie au catalogue
  // plutôt que d'afficher un tunnel vide.
  if (
    !slug ||
    !debut ||
    !fin ||
    !estDateISOValide(debut) ||
    !estDateISOValide(fin) ||
    debut > fin ||
    debut < aujourdhui()
  ) {
    redirect("/velos");
  }

  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) redirect("/velos");

  const [disponible, points] = await Promise.all([
    depot.estDisponible(velo.id, debut, fin),
    depot.listerPointsDeRetrait(),
  ]);

  const optionsDemandees = (
    Array.isArray(parametres.option) ? parametres.option : parametres.option ? [parametres.option] : []
  ).filter((code) => optionsLocation.some((option) => option.code === code));

  return (
    <Section fond="sable" className="pb-24 pt-32 sm:pt-40">
      <Etiquette numero="01">Réservation</Etiquette>
      <TitreSection as="h1" className="mt-6">
        Plus que quelques minutes
      </TitreSection>

      {disponible ? (
        <div className="mt-12">
          <TunnelReservation
            velo={velo}
            point={points.find((point) => point.id === velo.pointDeRetraitId)}
            dateDebut={debut}
            dateFin={fin}
            optionsInitiales={optionsDemandees}
          />
        </div>
      ) : (
        <div className="mt-12 max-w-xl rounded-[1.5rem] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Ce vélo n&apos;est plus libre</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-encre-500">
            Quelqu&apos;un a réservé le {velo.nom} sur cette période pendant que vous
            choisissiez vos options. Aucun montant n&apos;a été prélevé.
          </p>
          <Link
            href={`/velos?debut=${debut}&fin=${fin}`}
            className="mt-6 inline-flex rounded-full bg-encre-900 px-6 py-3 text-sm font-semibold text-sable-50"
          >
            Voir les vélos libres sur ces dates
          </Link>
        </div>
      )}
    </Section>
  );
}
