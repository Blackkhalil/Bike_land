import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TunnelReservation } from "@/components/reservation/TunnelReservation";
import { Section, TitreSection } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import type { CodeOffre } from "@/lib/types";
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
  // L'offre vient de l'URL mais n'est jamais crue sur parole : le prix
  // est recalcule cote serveur a la creation, et la validation Zod
  // refuse toute duree hors grille.
  const offre: CodeOffre = parametres.offre === "location-libre" ? "location-libre" : "road-trip";
  const heuresBrutes = Number(parametres.heures);
  const dureeHeures = Number.isInteger(heuresBrutes) ? heuresBrutes : 2;
  const personnesBrutes = Number(parametres.personnes);
  const nombrePersonnes =
    Number.isInteger(personnesBrutes) && personnesBrutes > 0 ? Math.min(personnesBrutes, 12) : 1;

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
    <Section fond="craie" className="pb-24 pt-32 sm:pt-40">
      <TitreSection as="h1">
        Plus que quelques minutes
      </TitreSection>

      {disponible ? (
        <div className="mt-12">
          <TunnelReservation
            velo={velo}
            point={points.find((point) => point.id === velo.pointDeRetraitId)}
            offre={offre}
            dureeHeures={dureeHeures}
            nombrePersonnes={nombrePersonnes}
            dateDebut={debut}
            dateFin={fin}
            optionsInitiales={optionsDemandees}
          />
        </div>
      ) : (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Ce vélo n&apos;est plus libre</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Quelqu&apos;un a réservé le {velo.nom} sur cette période pendant que vous
            choisissiez vos options. Aucun montant n&apos;a été prélevé.
          </p>
          <Link
            href={`/velos?debut=${debut}&fin=${fin}`}
            className="mt-6 inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
          >
            Voir les vélos libres sur ces dates
          </Link>
        </div>
      )}
    </Section>
  );
}
