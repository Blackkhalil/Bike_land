import type { Metadata } from "next";

import { CarteVelo } from "@/components/CarteVelo";
import { GAMMES, GRILLE_HORAIRE, PRIX_ROAD_TRIP_XOF } from "@/data/offres";
import { formatXof } from "@/lib/format";
import { Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";

export const metadata: Metadata = {
  title: "Nos vélos",
  description:
    "Le parc Bike Land, sur la route des Pêches à Cotonou. Choisissez un vélo et une date ; la formule se choisit à l'étape suivante.",
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
 * Le catalogue.
 *
 * Aucun filtre : ni type de vélo, ni taille, ni point de départ.
 *
 * Avec un parc restreint sur un seul point, filtrer n'aide personne. Surtout,
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
          Des vélos préparés
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
        /* Le parc est groupé par gamme, et non aligné d'un bloc : un
           client qui compare onze vélos sans repère ne comprend pas
           pourquoi l'un coûte le double de l'autre. Le titre de groupe
           porte le prix d'entrée, ce qui répond à la question avant
           qu'elle soit posée. */
        <div className="mt-14 space-y-16">
          {GAMMES.map((gamme) => {
            const duGroupe = velos.filter((velo) => velo.gamme === gamme.code);
            if (duGroupe.length === 0) return null;

            return (
              <section key={gamme.code}>
                <div className="flex flex-col gap-2 border-b border-craie/20 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="titre-editorial text-[1.7rem] text-craie">{gamme.nom}</h2>
                    <p className="mt-1.5 max-w-lg text-[0.88rem] leading-relaxed text-craie/70">
                      {gamme.description}
                    </p>
                  </div>
                  <p className="shrink-0 text-[0.9rem] text-craie/70">
                    dès{" "}
                    <strong className="font-display text-[1.2rem] font-bold text-orange-signal">
                      {formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof)}
                    </strong>{" "}
                    l&apos;heure · road trip {formatXof(PRIX_ROAD_TRIP_XOF[gamme.code])}
                  </p>
                </div>

                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {duGroupe.map((velo) => (
                    <CarteVelo key={velo.id} velo={velo} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Section>
  );
}
