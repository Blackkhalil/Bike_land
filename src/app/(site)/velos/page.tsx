import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DonneesStructurees } from "@/components/DonneesStructurees";
import { Section, TitreSection } from "@/components/ui";
import { GAMME_LA_PLUS_PRISE, GAMMES, GRILLE_HORAIRE, sortieEncadreeDe } from "@/data/offres";
import { depot } from "@/lib/db";
import { filDAriane } from "@/lib/donnees-structurees";
import { formatXof } from "@/lib/format";
import { metadonneesPage } from "@/lib/seo";

/** L'heure de vélo la moins chère, toutes gammes confondues. */
const PRIX_HEURE_MINIMUM = Math.min(...Object.values(GRILLE_HORAIRE).map((grille) => grille[0].prixXof));

export const metadata: Metadata = metadonneesPage({
  titre: `Vélos à louer à Cotonou dès ${formatXof(PRIX_HEURE_MINIMUM)} l'heure`,
  description:
    "Trois gammes de vélos à louer sur la route des Pêches à Cotonou : Classique, Premium et Prestige. " +
    "Choisissez votre gamme et votre jour, réservez en ligne.",
  chemin: "/velos",
});

/**
 * Page régénérée au plus une fois par minute : elle compte les vélos de
 * chaque gamme, ce qui change deux fois par an. Les disponibilités réelles
 * se jouent dans le tunnel et, en dernier ressort, dans la transaction
 * sérialisable qui écrit la réservation.
 */
export const revalidate = 60;

/**
 * Là où mène « Réserver un vélo » : les trois gammes, et rien d'autre.
 *
 * Le client ne choisit plus un vélo précis, il choisit une gamme : c'est
 * elle qui fixe le prix, et un vélo libre de la gamme lui est attribué à la
 * réservation, réglé à sa taille au départ. Une gamme touchée ouvre sa page
 * de réservation (/reserver/<gamme>), où se choisissent la formule (road
 * trip ou location libre) et le jour, et où restent les photos de ses
 * vélos.
 */
export default async function PageCatalogue() {
  const velos = await depot.listerVelos();
  const gammes = GAMMES.map((gamme) => {
    const deLaGamme = velos.filter((velo) => velo.gamme === gamme.code);
    return {
      ...gamme,
      nombre: deLaGamme.length,
      // La photo d'un vélo de la gamme, pour la reconnaître d'un coup d'œil.
      photo: deLaGamme.find((velo) => velo.photo)?.photo,
      lePlusPris: gamme.code === GAMME_LA_PLUS_PRISE,
      sortie: sortieEncadreeDe(gamme.code),
    };
  }).filter((gamme) => gamme.nombre > 0);

  return (
    <Section fond="noir" className="pb-24 pt-32 sm:pt-40">
      <DonneesStructurees donnees={filDAriane([{ nom: "Nos vélos", chemin: "/velos" }])} />
      <div>
        <TitreSection className="max-w-3xl" as="h1">
          Des vélos préparés
          <br />
          pour la route des Pêches
        </TitreSection>
        <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-craie/70">
          Trois gammes, trois tarifs. Choisissez votre gamme, puis votre formule et votre jour&nbsp;:
          nous vous attribuons un vélo libre de la gamme, réglé à votre taille au départ, et un
          coordinateur vérifie freins et pression avant que vous partiez.
        </p>
      </div>

      {gammes.length === 0 ? (
        <div className="mt-16 rounded-[var(--radius-carte)] bg-white px-8 py-16 text-center">
          <p className="titre-editorial text-[1.6rem] text-noir-piste">Aucun vélo disponible</p>
          <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-gris-cadre">
            Tout le parc est momentanément à l&apos;atelier. Écrivez-nous, nous vous dirons quand
            les vélos repartent.
          </p>
        </div>
      ) : (
        <nav aria-label="Nos gammes de vélos" className="mt-12">
          {/* Trois cadres de front seulement dès 1024 px : dessous, ils
              s'empilent, chacun gardant la largeur de lire son prix. */}
          <ul className="grid gap-5 lg:grid-cols-3">
            {gammes.map((gamme) => (
              <li key={gamme.code}>
                <Link
                  href={`/reserver/${gamme.code.toLowerCase()}`}
                  className={`group flex h-full flex-col overflow-hidden rounded-[var(--radius-bloc)] border-2 transition-colors ${
                    gamme.lePlusPris
                      ? "border-orange-signal/70 bg-noir-releve hover:border-orange-signal"
                      : "border-craie/15 bg-noir-releve/60 hover:border-craie/40"
                  }`}
                >
                  {gamme.photo && (
                    <span className="relative block aspect-16/9 overflow-hidden bg-craie">
                      <Image
                        src={gamme.photo}
                        alt={`Un vélo ${gamme.nom} Bike Land`}
                        fill
                        sizes="(min-width: 1024px) 400px, 100vw"
                        className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                          gamme.photo.startsWith("/images/affiches/") ? "object-left" : ""
                        }`}
                      />
                    </span>
                  )}
                  <span className="flex flex-1 flex-col p-6">
                    <span className="flex min-h-9 items-center justify-between gap-3">
                      <span className="titre-editorial text-[1.7rem] text-craie">{gamme.nom}</span>
                      {gamme.lePlusPris && (
                        <span className="shrink-0 rounded-full bg-orange-signal px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-noir-piste">
                          Le plus pris
                        </span>
                      )}
                    </span>
                    <span className="mt-2 text-[0.88rem] leading-relaxed text-craie/70">{gamme.pourQui}</span>
                    <span className="mb-5 mt-5 block">
                      <span className="font-display text-[1.9rem] font-extrabold leading-none tabular-nums text-orange-signal">
                        {formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof)}
                      </span>
                      <span className="mt-1 block text-[0.8rem] text-craie/60">
                        l&apos;heure
                        {/* Le road trip du samedi, pour le Premium et le
                            Prestige. Le Classique n'a pas de sortie encadrée
                            en ligne : ni phrase, ni séparateur. */}
                        {gamme.sortie && (
                          <>
                            {" ·"}{" "}
                            <span className="inline-block">
                              {gamme.sortie.nomDansLaPhrase} {gamme.sortie.avantPrix}{" "}
                              <span className="whitespace-nowrap">{formatXof(gamme.sortie.prixMinimum)} / pers.</span>
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-craie/15 pt-4 text-[0.85rem]">
                      <span className="text-craie/70">
                        {gamme.nombre === 1 ? "1 vélo, exemplaire unique" : `${gamme.nombre} vélos`}
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-craie underline-offset-4 group-hover:underline">
                        Réserver un vélo {gamme.nom}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M1.5 6h9M6.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Section>
  );
}
