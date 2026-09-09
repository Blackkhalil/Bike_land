import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BarreEmpilee } from "@/components/graphiques/BarreEmpilee";
import { BarresHorizontales } from "@/components/graphiques/BarresHorizontales";
import { Colonnes } from "@/components/graphiques/Colonnes";
import { Courbe } from "@/components/graphiques/Courbe";
import { Jauge, TuileStat } from "@/components/graphiques/TuileStat";
import { SelecteurPeriode } from "@/components/admin/SelecteurPeriode";
import { depot } from "@/lib/db";
import { formatDate, formatNombre, formatXof } from "@/lib/format";
import {
  calculerStatistiques,
  construirePeriode,
  type Granularite,
} from "@/lib/statistiques";

export const metadata: Metadata = { title: "Tableau de bord" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

const granularitesValides: Granularite[] = ["jour", "semaine", "mois", "annee"];

export default async function PageTableauDeBord({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;
  const demandee = typeof parametres.periode === "string" ? parametres.periode : "mois";
  const granularite = granularitesValides.includes(demandee as Granularite)
    ? (demandee as Granularite)
    : "mois";

  const [reservations, velos, clients, points] = await Promise.all([
    depot.listerReservations(),
    depot.listerVelos(),
    depot.listerClients(),
    depot.listerPointsDeRetrait(),
  ]);

  const periode = construirePeriode(granularite);
  const stats = calculerStatistiques(reservations, velos, clients, points, periode);

  const totalClients = stats.nouveauxClients + stats.clientsRecurrents;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiquette opacity-55">Exploitation</p>
          <h1 className="titre-editorial mt-3 text-[2rem]">Tableau de bord</h1>
          <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-encre-500">
            {periode.libelle} — du {formatDate(stats.fenetreCourante.debut)} au{" "}
            {formatDate(stats.fenetreCourante.fin)}
            {stats.periodeEnCours && " (période en cours)"}, comparé aux{" "}
            {formatDate(stats.periodePrecedente.debut)} – {formatDate(stats.periodePrecedente.fin)}.
            {stats.periodeEnCours &&
              " Les deux fenêtres couvrent le même nombre de jours, pour que la comparaison ait un sens."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-10 w-64 rounded-full bg-white" />}>
            <SelecteurPeriode actuelle={granularite} />
          </Suspense>
          <a
            href={`/api/admin/export?periode=${granularite}`}
            className="rounded-full bg-encre-900 px-5 py-2.5 text-[0.82rem] font-semibold text-sable-50 transition-colors hover:bg-terre-600"
          >
            Exporter en CSV
          </a>
        </div>
      </header>

      {/* ------------------------------------------------ Indicateurs financiers */}
      <section className="mt-10" aria-labelledby="titre-financier">
        <h2 id="titre-financier" className="etiquette opacity-55">
          Indicateurs financiers
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TuileStat
            libelle="Chiffre d'affaires"
            valeur={formatXof(stats.chiffreAffaires.valeur)}
            indicateur={stats.chiffreAffaires}
            aide="Pas de période précédente comparable"
          />
          <TuileStat
            libelle="Revenu moyen par réservation"
            valeur={formatXof(stats.revenuMoyenParReservation.valeur)}
            indicateur={stats.revenuMoyenParReservation}
          />
          <TuileStat
            libelle="Cautions encaissées"
            valeur={formatXof(stats.cautionsEncaissees)}
            aide={`Dont ${formatXof(stats.cautionsRestituees)} déjà restituées`}
          />
          <TuileStat
            libelle="Réservations facturées"
            valeur={formatNombre(stats.nombreReservations.valeur)}
            indicateur={stats.nombreReservations}
          />
        </div>
      </section>

      {/* --------------------------------------------------------- Graphiques */}
      <section className="mt-10 grid gap-4 lg:grid-cols-2" aria-label="Évolution">
        <Courbe
          titre="Chiffre d'affaires par mois"
          sousTitre="Douze derniers mois, réservations non annulées"
          points={stats.evolutionChiffreAffaires}
          dernierPointPartiel={stats.periodeEnCours}
        />
        <Colonnes
          titre="Saisonnalité des réservations"
          sousTitre="Nombre de départs par mois"
          points={stats.saisonnalite}
          uniteInfobulle="Réservations"
        />
      </section>

      {/* ------------------------------------------- Indicateurs de réservation */}
      <section className="mt-10" aria-labelledby="titre-reservation">
        <h2 id="titre-reservation" className="etiquette opacity-55">
          Indicateurs de réservation
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Jauge
            libelle="Taux d'occupation du parc"
            pourcentage={stats.tauxOccupation}
            detail={`Sur ${velos.length} vélos et ${stats.fenetreCourante.libelle.toLowerCase()}`}
          />
          <TuileStat
            libelle="Durée moyenne de location"
            valeur={`${formatNombre(stats.dureeMoyenne.valeur, 1)} j`}
            indicateur={stats.dureeMoyenne}
          />
          <TuileStat
            libelle="Taux d'annulation"
            valeur={`${formatNombre(stats.tauxAnnulation.valeur, 1)} %`}
            indicateur={stats.tauxAnnulation}
            aide="Aucune annulation sur les deux fenêtres comparées"
            baisseSouhaitable
          />
          <TuileStat
            libelle="Note moyenne"
            valeur={stats.noteMoyenne !== null ? `${formatNombre(stats.noteMoyenne, 2)} / 5` : "—"}
            aide={`${stats.nombreAvis} avis sur la période`}
          />
        </div>
      </section>

      {/* ------------------------------------------ Paiements, parc et clients */}
      <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label="Répartitions">
        <BarresHorizontales
          titre="Moyens de paiement"
          sousTitre="Montant encaissé, hors cautions"
          points={stats.repartitionPaiements}
          format="xof"
          uniteInfobulle="Montant"
        />
        <BarresHorizontales
          titre="Vélos les plus loués"
          sousTitre="Nombre de locations sur la période"
          points={stats.velosLesPlusLoues}
          format="nombre"
          uniteInfobulle="Locations"
          limite={6}
        />
        <div className="space-y-4">
          <BarresHorizontales
            titre="Origine des réservations"
            sousTitre="Par point de retrait"
            points={stats.originesReservations}
            format="nombre"
            uniteInfobulle="Réservations"
          />
          <BarreEmpilee
            titre="Clients de la période"
            sousTitre={`${totalClients} client${totalClients > 1 ? "s" : ""} ayant réservé`}
            segments={[
              { clef: "nouveaux", etiquette: "Nouveaux clients", valeur: stats.nouveauxClients },
              { clef: "recurrents", etiquette: "Clients récurrents", valeur: stats.clientsRecurrents },
            ]}
            format="nombre"
          />
        </div>
      </section>

      {/* -------------------------------------------------- État du parc à date */}
      <section className="mt-10" aria-labelledby="titre-parc">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="titre-parc" className="etiquette opacity-55">
            État du parc aujourd&apos;hui
          </h2>
          <Link href="/admin/velos" className="lien-souligne text-[0.82rem] font-semibold text-terre-700">
            Gérer le parc
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <TuileStat
            libelle="Vélos disponibles"
            valeur={formatNombre(stats.velosDisponibles)}
            aide="Prêts à partir, non réservés aujourd'hui"
          />
          <TuileStat
            libelle="Vélos en location"
            valeur={formatNombre(stats.velosEnLocation)}
            aide="Sortis, retour prévu selon calendrier"
          />
          <TuileStat
            libelle="Vélos en entretien"
            valeur={formatNombre(stats.velosEnEntretien)}
            aide="Retirés temporairement de la réservation"
          />
        </div>
      </section>
    </div>
  );
}
