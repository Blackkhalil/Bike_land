import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CarteVelo } from "@/components/CarteVelo";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { WidgetReservation } from "@/components/reservation/WidgetReservation";
import { Pastille, Section, TitreSection } from "@/components/ui";
import {
  creneauxDisponibles,
  departsComplets,
  DUREE_MAX_LOCATION_LIBRE,
  FERMETURE_HEURE,
  GAMME_LA_PLUS_PRISE,
  GAMMES,
  GRILLE_HORAIRE,
  noteDepartsHorsGamme,
  OUVERTURE_HEURE,
  sortieEncadreeDe,
  velosEnEtatDe,
} from "@/data/offres";
import { depot } from "@/lib/db";
import { occupationsDeLaGamme } from "@/lib/db/contrat";
import { filDAriane } from "@/lib/donnees-structurees";
import { formatXof } from "@/lib/format";
import { departsDeLaGamme, joursFermesCommeOccupes, lireOuverture } from "@/lib/ouverture";
import { offresGroupeEnVente } from "@/lib/offres-groupe/vitrine";
import { DESCRIPTION_MAX, metadonneesPage, premierQuiTient } from "@/lib/seo";

type Params = Promise<{ gamme: string }>;

/** « premium » dans l'adresse, la gamme PREMIUM dans les données. */
function gammeDeLAdresse(segment: string) {
  return GAMMES.find((gamme) => gamme.code.toLowerCase() === segment.toLowerCase()) ?? null;
}

/**
 * Régénérée au plus une fois par minute : le calendrier y barre les jours
 * où tous les vélos de la gamme sont pris. La disponibilité réelle se joue
 * dans le tunnel et, en dernier ressort, dans la transaction qui écrit.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return GAMMES.map((gamme) => ({ gamme: gamme.code.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const gamme = gammeDeLAdresse((await params).gamme);
  if (!gamme) return { title: "Gamme introuvable" };
  const heure = formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof);
  // Le road trip encadré du samedi, en groupe de dix au moins : pour une
  // gamme qui a ce prix et assez de vélos en état (le Premium). Sinon (le
  // Classique, le Prestige), la description dit la durée et la machine.
  const sortie = sortieEncadreeDe(gamme.code, velosEnEtatDe(gamme.code, await depot.listerVelos()));
  const prixSortie = sortie ? formatXof(sortie.prixMinimum) : "";
  const quoi = sortie ? (sortie.nom === "Road trip" ? "road trip encadré" : sortie.nom) : "";
  const machine = gamme.machine.charAt(0).toLowerCase() + gamme.machine.slice(1);
  const enSortie = sortie
    ? `, ou en ${quoi} ${sortie.avantPrix} ${prixSortie} par personne`
    : `, de 1 à ${DUREE_MAX_LOCATION_LIBRE} heures : ${machine}`;
  const enSortieCourt = sortie ? `, ${quoi} ${sortie.avantPrix} ${prixSortie} par personne` : "";
  return metadonneesPage({
    titre: `Location de vélo ${gamme.nom} à Cotonou`,
    description: premierQuiTient(
      [
        `Vélo ${gamme.nom} à louer à Cotonou dès ${heure} l'heure${enSortie}. Réservez en ligne, payez en Mobile Money.`,
        `Vélo ${gamme.nom} à louer à Cotonou dès ${heure} l'heure${enSortie}. Réservation en ligne.`,
        `Vélo ${gamme.nom} à louer à Cotonou dès ${heure} l'heure${enSortieCourt}.`,
      ],
      DESCRIPTION_MAX,
    ),
    chemin: `/reserver/${gamme.code.toLowerCase()}`,
  });
}

/**
 * La réservation d'une gamme : c'est là que mène chacune des trois gammes
 * de « Nos vélos ».
 *
 * Le client ne choisit plus un vélo : il choisit une gamme, qui fixe le
 * prix, puis sa formule (road trip ou location libre) et son jour. Les
 * vélos de la gamme libres sur son créneau lui sont attribués à la
 * réservation, un par personne, et réglés à sa taille au départ. Les
 * photos des vélos restent sous l'encart : on voit sur quoi on roulera.
 */
export default async function PageReserverGamme({ params }: { params: Params }) {
  const gamme = gammeDeLAdresse((await params).gamme);
  if (!gamme) notFound();

  const [parc, ouverture] = await Promise.all([depot.listerVelos(), lireOuverture()]);
  // Offres de groupe ouvertes (décision 1) : le road trip par gamme ne se
  // réserve plus ici, il passe en groupe, toutes gammes, avec le chatbot.
  const roadTripEnGroupe = (await offresGroupeEnVente(ouverture)) !== null;
  const deLaGamme = parc.filter((velo) => velo.gamme === gamme.code);
  const enEtat = deLaGamme.filter((velo) => velo.statut !== "MAINTENANCE" && velo.statut !== "RETIRE");

  // Le calendrier ne barre un jour que si tous les vélos de la gamme sont
  // pris en même temps, ou si le jour est fermé depuis le tableau de bord.
  const creneauxParVelo = await Promise.all(enEtat.map((velo) => depot.periodesIndisponibles(velo.id)));
  const periodesOccupees = [
    ...occupationsDeLaGamme(creneauxParVelo, OUVERTURE_HEURE, FERMETURE_HEURE),
    ...joursFermesCommeOccupes(ouverture),
  ];

  // Les départs encadrés : complets pour la gamme, ils s'affichent « Sold out ».
  const maintenant = new Date();
  const departs = roadTripEnGroupe
    ? { creneaux: [], complets: [] }
    : await departsDeLaGamme(gamme.code, creneauxDisponibles(maintenant, ouverture), departsComplets(maintenant, ouverture));

  const lePlusPris = gamme.code === GAMME_LA_PLUS_PRISE;
  const autres = GAMMES.filter((autre) => autre.code !== gamme.code);
  const nombre = deLaGamme.length;
  const sortie = roadTripEnGroupe ? null : sortieEncadreeDe(gamme.code, enEtat.length);
  // « Le road trip du samedi se fait en vélo Premium ou Prestige » : sur la
  // page Classique, sous le prix. Sur celle du Prestige : le groupe de dix
  // ne tient pas sur son seul vélo.
  const horsGamme = roadTripEnGroupe ? null : noteDepartsHorsGamme(gamme.code, enEtat.length);

  return (
    <>
      <DonneesStructurees
        donnees={filDAriane([
          { nom: "Nos vélos", chemin: "/velos" },
          { nom: `Vélos ${gamme.nom}`, chemin: `/reserver/${gamme.code.toLowerCase()}` },
        ])}
      />

      <Section fond="noir" className="pb-16 pt-32 sm:pb-20 sm:pt-40">
        <nav aria-label="Fil d'ariane" className="etiquette flex items-center gap-2 opacity-75">
          <Link href="/velos" className="lien-souligne cible-elargie">
            Nos vélos
          </Link>
          <span aria-hidden="true">/</span>
          <span>{gamme.nom}</span>
        </nav>

        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            {lePlusPris && <Pastille ton="neutre">Le plus pris</Pastille>}
            <TitreSection as="h1" taille="lg" className={lePlusPris ? "mt-4" : ""}>
              Vélos {gamme.nom}
            </TitreSection>
            <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-craie/80">{gamme.pourQui}</p>

            <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.95rem] text-craie/70">
              <strong className="font-display text-[1.6rem] font-extrabold tabular-nums text-orange-signal">
                {formatXof(GRILLE_HORAIRE[gamme.code][0].prixXof)}
              </strong>
              l&apos;heure
              {/* Le road trip du samedi, pour le Premium et le Prestige : le
                  Classique n'a pas de sortie encadrée en ligne. */}
              {sortie && (
                <>
                  <span aria-hidden="true" className="hidden px-1 opacity-40 sm:inline">
                    •
                  </span>
                  {/* Un bloc à part, qui passe entier à la ligne : la phrase
                      s'y replie sans déborder d'un téléphone. */}
                  <span className="min-w-0">
                    {sortie.nomDansLaPhrase} {sortie.avantPrix}{" "}
                    <strong className="whitespace-nowrap font-semibold tabular-nums text-craie">
                      {formatXof(sortie.prixMinimum)}
                    </strong>{" "}
                    par personne{sortie.groupeMin > 1 && `, en groupe de ${sortie.groupeMin} au moins`}
                  </span>
                </>
              )}
            </p>
            {horsGamme && <p className="mt-2 max-w-xl text-[0.88rem] text-craie/60">{horsGamme}</p>}

            <p className="mt-8 max-w-xl text-[0.98rem] leading-relaxed text-craie/75">{gamme.description}</p>

            <div className="mt-8 max-w-xl rounded-[var(--radius-carte)] border border-craie/15 bg-noir-releve p-5">
              <p className="text-[0.9rem] font-semibold">Vous réservez une gamme, pas un vélo précis</p>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-craie/70">
                {nombre > 1
                  ? `Nous vous attribuons des vélos ${gamme.nom} libres sur votre créneau, un par personne, parmi les ${nombre} de la gamme.`
                  : `La gamme ${gamme.nom} compte un seul vélo : il vous est réservé s'il est libre sur votre créneau.`}{" "}
                Il est réglé à votre taille au départ, et un coordinateur vérifie freins et pression
                avant que vous partiez.
              </p>
            </div>

            <p className="mt-8 text-[0.88rem] text-craie/70">
              Une autre gamme ?{" "}
              {autres.map((autre, index) => (
                <span key={autre.code}>
                  {index > 0 && " ou "}
                  <Link
                    href={`/reserver/${autre.code.toLowerCase()}`}
                    className="lien-souligne cible-elargie font-semibold text-craie"
                  >
                    {autre.nom}
                  </Link>
                </span>
              ))}
            </p>
          </div>

          <div id="reserver" className="scroll-mt-24 lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              {/* L'encart lit les paramètres de l'URL (?debut=), ce qui n'est
                  possible dans une page prérendue qu'à l'intérieur d'une
                  frontière Suspense : le reste de la page part du cache. */}
              <Suspense fallback={<SqueletteReservation />}>
                <WidgetReservation
                  gamme={gamme.code}
                  velosEnEtat={enEtat.length}
                  creneaux={departs.creneaux}
                  complets={departs.complets}
                  periodesOccupees={periodesOccupees}
                  aucunVelo={enEtat.length === 0}
                  roadTripEnGroupe={roadTripEnGroupe}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </Section>

      {nombre > 0 && (
        <Section fond="craie" className="py-16 sm:py-20">
          <TitreSection>{nombre > 1 ? `Les vélos ${gamme.nom}` : `Le vélo ${gamme.nom}`}</TitreSection>
          <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-gris-cadre">
            {nombre > 1
              ? "Vous roulerez sur l'un d'eux, selon ceux qui sont libres sur votre créneau."
              : "Exemplaire unique : c'est lui que vous roulerez."}
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {deLaGamme.map((velo) => (
              <CarteVelo key={velo.id} velo={velo} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** Emplacement réservé pendant que l'encart de réservation s'installe. */
function SqueletteReservation() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[26rem] animate-pulse rounded-[var(--radius-bloc)] border border-noir-piste/10 bg-white/60"
    />
  );
}
