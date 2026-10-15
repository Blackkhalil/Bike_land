import type { Metadata } from "next";

import { CarteVelo } from "@/components/CarteVelo";
import {
  GAMME_LA_PLUS_PRISE,
  GAMMES,
  GRILLE_HORAIRE,
  PRIX_ROAD_TRIP_XOF,
  type GammeVelo,
} from "@/data/offres";
import { formatXof } from "@/lib/format";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";

export const metadata: Metadata = {
  title: "Nos vélos",
  description:
    "Le parc Bike Land, sur la route des Pêches à Cotonou : trois gammes, Classique, Premium et Prestige. Choisissez votre gamme, votre vélo et votre date ; la formule se choisit à l'étape suivante.",
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

/** L'ancre d'une gamme dans la page : « gamme-premium ». */
const ancre = (gamme: GammeVelo) => `gamme-${gamme.toLowerCase()}`;

/** « 6 vélos », « 1 vélo, exemplaire unique ». */
function nombreDeVelos(nombre: number): string {
  if (nombre === 1) return "1 vélo, exemplaire unique";
  return `${nombre} vélos`;
}

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
 * Le visiteur voit d'abord les trois gammes, chacune dans son cadre avec
 * son prix d'entrée et son nombre de vélos : il comprend tout de suite
 * pourquoi un vélo coûte plus qu'un autre. Un cadre mène aux vélos de sa
 * gamme, plus bas ; le visiteur choisit un vélo, puis une date. C'est tout.
 */
export default async function PageCatalogue() {
  const velos = await depot.listerVelos();
  const gammes = GAMMES.map((gamme) => ({
    ...gamme,
    velos: velos.filter((velo) => velo.gamme === gamme.code),
    lePlusPris: gamme.code === GAMME_LA_PLUS_PRISE,
  })).filter((gamme) => gamme.velos.length > 0);

  return (
    <Section fond="noir" className="pb-24 pt-32 sm:pt-40">
      <div>
        <TitreSection className="max-w-3xl" as="h1">
          Des vélos préparés
          <br />
          pour la route des Pêches
        </TitreSection>
        <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-craie/70">
          Trois gammes, trois tarifs. Choisissez votre gamme, puis le vélo qui vous plaît et votre
          date. Il sera réglé à votre taille au départ, et un coordinateur vérifie freins et pression
          avant que vous partiez.
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
        <>
          {/* Les gammes, en cadres : le premier choix du client. Chaque cadre
              mène aux vélos de sa gamme. Le Premium, le plus pris, est mis
              en avant. */}
          <nav aria-label="Nos gammes de vélos" className="mt-12">
            <ul className="grid gap-4 md:grid-cols-3">
              {gammes.map((gamme) => (
                <li key={gamme.code}>
                  <a
                    href={`#${ancre(gamme.code)}`}
                    className={`group flex h-full flex-col rounded-[var(--radius-bloc)] border-2 p-6 transition-colors ${
                      gamme.lePlusPris
                        ? "border-orange-signal bg-noir-releve"
                        : "border-craie/15 bg-noir-releve/60 hover:border-craie/40"
                    }`}
                  >
                    <span className="flex min-h-9 items-center justify-between gap-3">
                      <span className="titre-editorial text-[1.7rem] text-craie">{gamme.nom}</span>
                      {gamme.lePlusPris && (
                        <span className="shrink-0 rounded-full bg-orange-signal px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-noir-piste">
                          Le plus pris
                        </span>
                      )}
                    </span>
                    <span className="mt-2 text-[0.88rem] leading-relaxed text-craie/70">{gamme.pourQui}</span>
                    <span className="mt-5 block">
                      <span className="font-display text-[1.9rem] font-extrabold leading-none tabular-nums text-orange-signal">
                        {formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof)}
                      </span>
                      <span className="mt-1 block text-[0.8rem] text-craie/60">
                        l&apos;heure · road trip {formatXof(PRIX_ROAD_TRIP_XOF[gamme.code])} / pers.
                      </span>
                    </span>
                    <span className="mt-5 flex items-center justify-between gap-3 border-t border-craie/15 pt-4 text-[0.85rem]">
                      <span className="text-craie/70">{nombreDeVelos(gamme.velos.length)}</span>
                      <span className="font-semibold text-craie underline-offset-4 group-hover:underline">
                        Voir les vélos
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Le parc, groupé par gamme dans le même cadre : un client qui
              compare onze vélos sans repère ne comprend pas pourquoi l'un
              coûte le double de l'autre. Le titre de groupe porte le prix
              d'entrée, ce qui répond à la question avant qu'elle soit posée. */}
          <div className="mt-14 space-y-10">
            {gammes.map((gamme) => (
              <section
                key={gamme.code}
                id={ancre(gamme.code)}
                aria-labelledby={`${ancre(gamme.code)}-titre`}
                className={`scroll-mt-[88px] rounded-[var(--radius-bloc)] border-2 p-5 sm:p-8 ${
                  gamme.lePlusPris ? "border-orange-signal/70" : "border-craie/12"
                }`}
              >
                <div className="flex flex-col gap-3 border-b border-craie/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 id={`${ancre(gamme.code)}-titre`} className="titre-editorial text-[1.7rem] text-craie">
                        {gamme.nom}
                      </h2>
                      {gamme.lePlusPris && <Pastille ton="neutre">Le plus pris</Pastille>}
                    </div>
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
                  {gamme.velos.map((velo) => (
                    <CarteVelo key={velo.id} velo={velo} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
