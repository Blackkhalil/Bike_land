import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TunnelReservation } from "@/components/reservation/TunnelReservation";
import { Section, TitreSection } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import {
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  DUREE_ROAD_TRIP_HEURES,
  heuresDepartPossibles,
} from "@/data/offres";
import type { CodeOffre } from "@/lib/types";
import { depot } from "@/lib/db";
import { aujourdhui, estDateISOValide } from "@/lib/dates";
import { lireOuverture, motifDeRefus, personnesMaxPour } from "@/lib/ouverture";
import { formatDate } from "@/lib/format";

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

  // Heure de départ. Le road trip part au créneau encadré ; la location
  // libre accepte l'heure passée dans l'URL, à condition qu'elle laisse
  // le temps de rendre le vélo avant la fermeture, qu'elle n'empiète pas
  // sur le road trip du week-end et qu'elle ne soit pas déjà passée.
  const maintenant = new Date();
  const heureBrute = Number(parametres.heure);
  const departsPossibles = heuresDepartPossibles(dureeHeures, debut ?? undefined, maintenant);
  const heureDebut =
    offre === "road-trip"
      ? CRENEAUX_ROAD_TRIP[0].heureDebut
      : departsPossibles.includes(heureBrute)
        ? heureBrute
        : (departsPossibles[0] ?? CRENEAUX_ROAD_TRIP[0].heureDebut);
  const heureFin =
    heureDebut + (offre === "road-trip" ? DUREE_ROAD_TRIP_HEURES : dureeHeures);

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

  // Les créneaux encadrés se calculent ici, sur le serveur : le tunnel
  // est un composant client, et y appeler `new Date()` donnerait une
  // valeur différente de celle du rendu serveur.
  const ouverture = await lireOuverture();
  const creneaux = creneauxDisponibles(maintenant, ouverture);
  // Un jour fermé depuis l'admin, arrivé par un lien ou une page restée
  // ouverte : on le dit tout de suite, plutôt qu'au moment de payer.
  const refusLocation =
    offre === "location-libre"
      ? motifDeRefus(ouverture, { offre, dateDebut: debut, dateFin: fin, heureDebut })
      : null;

  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) redirect("/velos");

  const [disponible, points, parc] = await Promise.all([
    depot.estDisponible(velo.id, debut, fin, heureDebut, heureFin),
    depot.listerPointsDeRetrait(),
    depot.listerVelos(),
  ]);
  // Pas plus de personnes que de vélos de cette gamme : une seule pour le
  // Prestige, exemplaire unique.
  const personnesMax = personnesMaxPour(velo, parc);

  const optionsDemandees = (
    Array.isArray(parametres.option) ? parametres.option : parametres.option ? [parametres.option] : []
  ).filter((code) => optionsLocation.some((option) => option.code === code));

  return (
    <Section fond="craie" className="pb-24 pt-32 sm:pt-40">
      <TitreSection as="h1">
        Plus que quelques minutes
      </TitreSection>

      {refusLocation ? (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Ce jour est complet</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Toutes les places du {formatDate(debut)} sont prises. Aucun montant n&apos;a été
            prélevé.
          </p>
          <Link
            href={`/velos/${velo.slug}`}
            className="mt-6 inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
          >
            Choisir une autre date
          </Link>
        </div>
      ) : disponible ? (
        <div className="mt-12">
          <TunnelReservation
            velo={velo}
            point={points.find((point) => point.id === velo.pointDeRetraitId)}
            offre={offre}
            dureeHeures={dureeHeures}
            nombrePersonnes={Math.min(nombrePersonnes, personnesMax)}
            personnesMax={personnesMax}
            dateDebut={debut}
            dateFin={fin}
            heureDebut={heureDebut}
            creneaux={creneaux}
            instant={maintenant.getTime()}
            optionsInitiales={optionsDemandees}
          />
        </div>
      ) : (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Ce vélo n&apos;est plus libre</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Quelqu&apos;un a réservé le {velo.nom} sur ce créneau pendant que vous
            choisissiez vos options. Aucun montant n&apos;a été prélevé.
          </p>
          <Link
            href={`/velos?debut=${debut}&fin=${fin}`}
            className="mt-6 inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
          >
            Voir les vélos libres sur ce créneau
          </Link>
        </div>
      )}
    </Section>
  );
}
