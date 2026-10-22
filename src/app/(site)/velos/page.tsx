import type { Metadata } from "next";

import { CarteVelo } from "@/components/CarteVelo";
import { ChoixDeGamme } from "@/components/ChoixDeGamme";
import { GAMME_LA_PLUS_PRISE, GAMMES, GRILLE_HORAIRE, prixRoadTripMinimum } from "@/data/offres";
import { formatXof } from "@/lib/format";
import { Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";

export const metadata: Metadata = {
  title: "Nos vélos",
  description:
    "Le parc Bike Land, sur la route des Pêches à Cotonou : trois gammes, Classique, Premium et Prestige. Choisissez votre gamme, puis votre vélo et votre date ; la formule se choisit à l'étape suivante.",
  alternates: { canonical: "/velos" },
};

/**
 * Page régénérée au plus une fois par minute.
 *
 * Elle était reconstruite à chaque visite, au motif que le parc dépend
 * des réservations. C'est faux ici : sans filtre de date, cette page ne
 * montre aucune disponibilité, elle liste les vélos qui ne sont pas
 * retirés du parc, ce qui change deux fois par an.
 *
 * Le coût était mesurable : neuf réponses servies sur soixante lors d'un
 * test de charge, le pool de connexions épuisé. Une minute de cache
 * suffit à l'effacer.
 *
 * Les disponibilités réelles se jouent dans le tunnel et, en dernier
 * ressort, dans la transaction sérialisable qui écrit la réservation.
 */
export const revalidate = 60;

/**
 * Le catalogue : c'est là que mène « Réserver ».
 *
 * Aucun filtre : ni type de vélo, ni taille, ni point de départ.
 *
 * Avec un parc restreint sur un seul point, filtrer n'aide personne. Surtout,
 * ni le type ni la taille ne changent quoi que ce soit : le prix dépend
 * de la gamme et de la formule, et le coordinateur règle la machine à la
 * morphologie du client au départ. Afficher ces critères laisserait
 * croire qu'ils comptent.
 *
 * Le visiteur choisit d'abord sa gamme, présentée en cadre avec son prix
 * d'entrée et son nombre de vélos : il comprend tout de suite pourquoi un
 * vélo coûte plus qu'un autre. Les vélos de la gamme choisie s'affichent
 * alors, et eux seuls (ChoixDeGamme) ; il en choisit un, puis une date.
 */
/**
 * Les colonnes de la grille des vélos d'une gamme, selon leur nombre : une
 * carte seule sur la dernière rangée laissait les deux tiers du cadre vides.
 * Quatre ou huit vélos se rangent par deux, puis par quatre sur grand écran ;
 * sept finissent en 4 + 3 ; les autres nombres gardent trois colonnes.
 */
function colonnesDeLaGrille(nombre: number): string {
  if (nombre % 4 === 0) return "sm:grid-cols-2 xl:grid-cols-4";
  if (nombre % 4 === 3 && nombre > 3) return "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

export default async function PageCatalogue() {
  const velos = await depot.listerVelos();
  const gammes = GAMMES.map((gamme) => {
    const duGroupe = velos.filter((velo) => velo.gamme === gamme.code);
    return {
      code: gamme.code,
      nom: gamme.nom,
      pourQui: gamme.pourQui,
      description: gamme.description,
      prixHeure: formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof),
      prixRoadTrip: formatXof(prixRoadTripMinimum(gamme.code)),
      nombre: duGroupe.length,
      lePlusPris: gamme.code === GAMME_LA_PLUS_PRISE,
      velos: (
        <div className={`grid gap-6 ${colonnesDeLaGrille(duGroupe.length)}`}>
          {duGroupe.map((velo) => (
            <CarteVelo key={velo.id} velo={velo} />
          ))}
        </div>
      ),
    };
  }).filter((gamme) => gamme.nombre > 0);

  return (
    <Section fond="noir" className="pb-24 pt-32 sm:pt-40">
      <div>
        <TitreSection className="max-w-3xl" as="h1">
          Des vélos préparés
          <br />
          pour la route des Pêches
        </TitreSection>
        <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-craie/70">
          Trois gammes, trois tarifs. Choisissez d&apos;abord votre gamme&nbsp;: ses vélos
          s&apos;affichent, vous prenez celui qui vous plaît, puis votre date. Il sera réglé à votre
          taille au départ, et un coordinateur vérifie freins et pression avant que vous partiez.
        </p>
      </div>

      {velos.length === 0 ? (
        <div className="mt-16 rounded-[var(--radius-carte)] bg-white px-8 py-16 text-center">
          <p className="titre-editorial text-[1.6rem] text-noir-piste">Aucun vélo disponible</p>
          <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-gris-cadre">
            Tout le parc est momentanément à l&apos;atelier. Écrivez-nous, nous vous dirons quand
            les vélos repartent.
          </p>
        </div>
      ) : (
        <ChoixDeGamme gammes={gammes} />
      )}
    </Section>
  );
}
