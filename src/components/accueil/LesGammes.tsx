import Link from "next/link";

import { Section, TitreSection } from "@/components/ui";
import {
  COCOS_ROAD_TRIP,
  GAMMES,
  GRILLE_HORAIRE,
  PRIX_ROAD_TRIP_XOF,
  type GammeVelo,
} from "@/data/offres";
import { formatXof } from "@/lib/format";
import type { Velo } from "@/lib/types";

/**
 * Les trois gammes, côte à côte.
 *
 * Le client doit comprendre **pourquoi** un vélo coûte deux fois plus
 * qu'un autre. Afficher trois prix sans rien d'autre ne l'explique pas :
 * chaque colonne dit donc ce qui change dans la machine, suspension et
 * freinage, parce que c'est exactement ce qui justifie l'écart.
 *
 * Le tableau des durées est lu de haut en bas : un client compare les
 * trois prix d'une même durée d'un coup d'œil, ce qu'une liste par
 * gamme ne permet pas.
 *
 * Les chiffres viennent tous de `src/data/offres.ts`. Aucun n'est
 * recopié ici : changer un tarif à un seul endroit change la page.
 */

/**
 * Ce qui distingue chaque gamme.
 *
 * `machine` décrit ce qu'on trouve dans la gamme, et non une règle
 * technique uniforme : la Classique va du VTT dame à sept vitesses au
 * tout-suspendu à freins à disque. Prétendre le contraire ferait mentir
 * la fiche de la moitié des vélos.
 */
const DISTINCTIONS: Record<GammeVelo, { machine: string; choix: string; pourQui: string }> = {
  CLASSIQUE: {
    machine: "Du VTT dame au tout-suspendu",
    choix: "Six vélos, toutes tailles",
    pourQui: "Une première sortie, une balade, un budget tenu.",
  },
  PREMIUM: {
    machine: "Marques reconnues, meilleures finitions",
    choix: "Quatre vélos",
    pourQui: "Rouler plus longtemps, plus confortablement.",
  },
  PRESTIGE: {
    machine: "Acier haute résistance, double disque, jantes bâton",
    choix: "Un seul exemplaire",
    pourQui: "La plus belle machine du parc, quand elle est libre.",
  },
};

export function LesGammes({ velos }: { velos: Velo[] }) {
  const durees = GRILLE_HORAIRE.CLASSIQUE.map((palier) => palier.heures);

  return (
    <Section fond="craie" className="py-20 sm:py-28">
      <TitreSection className="max-w-2xl">Trois gammes, trois tarifs</TitreSection>
      <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-gris-cadre">
        Le prix dépend du vélo, pas de la durée seule. Plus la machine encaisse la piste, plus
        elle coûte, et vous voyez exactement ce que vous payez en plus.
      </p>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {GAMMES.map((gamme) => {
          const distinction = DISTINCTIONS[gamme.code];
          const disponibles = velos.filter(
            (velo) => velo.gamme === gamme.code && velo.statut !== "RETIRE",
          );
          const misEnAvant = gamme.code === "CLASSIQUE";

          return (
            <article
              key={gamme.code}
              className={`flex flex-col rounded-[var(--radius-bloc)] border p-7 ${
                misEnAvant
                  ? "border-orange-signal bg-white shadow-[0_2px_24px_rgba(28,27,25,0.08)]"
                  : "border-noir-piste/15 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="titre-editorial text-[1.5rem]">{gamme.nom}</h3>
                {misEnAvant && (
                  <span className="rounded-full bg-orange-signal px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-noir-piste">
                    Le plus pris
                  </span>
                )}
              </div>

              <p className="mt-3 text-[0.9rem] leading-relaxed text-gris-cadre">
                {distinction.pourQui}
              </p>

              {/* Le prix d'entrée, en gros : c'est le premier chiffre que
                  le client cherche, et celui qu'il retient. */}
              <p className="mt-6 font-display text-[2.4rem] font-extrabold leading-none tabular-nums text-orange-sourd">
                {formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof)}
              </p>
              <p className="mt-1 text-[0.82rem] text-gris-cadre">l&apos;heure, frais compris</p>

              <dl className="mt-6 space-y-2.5 border-t border-noir-piste/12 pt-5 text-[0.86rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-gris-cadre">La machine</dt>
                  <dd className="text-right font-medium">{distinction.machine}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gris-cadre">Au choix</dt>
                  <dd className="text-right font-medium">{distinction.choix}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gris-cadre">Road trip</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatXof(PRIX_ROAD_TRIP_XOF[gamme.code])} / pers.
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gris-cadre">Offert au retour</dt>
                  <dd className="text-right font-medium">
                    Eau +{" "}
                    {COCOS_ROAD_TRIP[gamme.code] > 1
                      ? `${COCOS_ROAD_TRIP[gamme.code]} cocos`
                      : "1 coco"}
                  </dd>
                </div>
              </dl>

              <p className="mt-5 text-[0.82rem] text-gris-cadre">
                {disponibles.length > 0
                  ? `${disponibles.length} vélo${disponibles.length > 1 ? "s" : ""} : ${disponibles
                      .map((velo) => velo.nom)
                      .join(", ")}`
                  : "Aucun vélo dans cette gamme pour le moment."}
              </p>

              <Link
                href="/velos"
                className={`mt-6 inline-flex justify-center rounded-[var(--radius-bouton)] px-5 py-3 text-[0.88rem] font-semibold transition-opacity hover:opacity-85 ${
                  misEnAvant
                    ? "bg-orange-signal text-noir-piste"
                    : "border border-noir-piste/25 text-noir-piste"
                }`}
              >
                Voir les {gamme.nom.toLowerCase()}
              </Link>
            </article>
          );
        })}
      </div>

      {/* La comparaison ligne à ligne : c'est elle qui rend l'écart
          lisible, là où trois colonnes séparées obligent à faire le
          calcul de tête. */}
      <div className="mt-10 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.84rem] sm:min-w-[34rem] sm:text-[0.9rem]">
          <caption className="pb-3 text-left text-[0.86rem] text-gris-cadre">
            Location libre : ce que coûte chaque durée, par gamme, en FCFA. Tous les tarifs
            sont frais compris : le montant affiché est celui que vous payez.
          </caption>
          <thead>
            <tr className="border-b border-noir-piste/20 text-[0.74rem] uppercase tracking-[0.06em] text-gris-cadre">
              <th className="py-2.5 pr-2 font-semibold sm:pr-4">Gamme</th>
              {durees.map((heures) => (
                <th key={heures} className="py-2.5 pr-2 text-right font-semibold sm:pr-4">
                  {heures} h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GAMMES.map((gamme) => (
              <tr key={gamme.code} className="border-b border-noir-piste/10">
                <td className="py-3 pr-2 font-semibold sm:pr-4">{gamme.nom}</td>
                {GRILLE_HORAIRE[gamme.code].map((palier) => (
                  <td key={palier.heures} className="py-3 pr-2 text-right tabular-nums sm:pr-4">
                    {/* L'unité est dite une fois dans la légende sur
                        téléphone : répétée dans chaque case, elle faisait
                        déborder le tableau et cachait les 3 h et 4 h. */}
                    <span className="sm:hidden">{formatXof(palier.prixXof).replace(" FCFA", "")}</span>
                    <span className="hidden sm:inline">{formatXof(palier.prixXof)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-[0.84rem] leading-relaxed text-gris-cadre">
        Le forfait de {durees[durees.length - 1]} heures est le plus avantageux de chaque ligne.
        La location libre demande une caution, rendue à la restitution du vélo ; le road trip
        n&apos;en demande aucune, la sortie étant encadrée.
      </p>
    </Section>
  );
}
