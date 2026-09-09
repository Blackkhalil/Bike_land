import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnnulerReservation } from "@/components/reservation/AnnulerReservation";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Etiquette, Pastille, Section, TitreSection } from "@/components/ui";
import { velos as catalogue, optionsLocation } from "@/data/catalogue";
import { depot } from "@/lib/db";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { formatDate, formatDateAvecJour, formatXof } from "@/lib/format";
import { numeroDeFacture } from "@/lib/facture";
import { site } from "@/lib/site";
import type { StatutReservation } from "@/lib/types";

export const metadata: Metadata = {
  title: "Ma réservation",
  // Le lien est personnel : il ne doit jamais se retrouver dans un index.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;
type Recherche = Promise<Record<string, string | string[] | undefined>>;

const libellesStatut: Record<StatutReservation, { texte: string; ton: "succes" | "info" | "alerte" | "neutre" }> = {
  EN_ATTENTE_PAIEMENT: { texte: "En attente de paiement", ton: "alerte" },
  CONFIRMEE: { texte: "Confirmée", ton: "succes" },
  EN_COURS: { texte: "Location en cours", ton: "info" },
  TERMINEE: { texte: "Terminée", ton: "neutre" },
  ANNULEE: { texte: "Annulée", ton: "alerte" },
};

export default async function PageSuiviReservation({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Recherche;
}) {
  const { token } = await params;
  const recherche = await searchParams;

  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));
  if (!reservation) notFound();

  const ligne = reservation.lignes[0];
  const velo = catalogue.find((v) => v.id === ligne?.veloId);
  const points = await depot.listerPointsDeRetrait();
  const point = points.find((p) => p.id === reservation.pointDeRetraitId);

  const statut = libellesStatut[reservation.statut];
  const nouvelle = recherche.nouvelle === "1";
  const facture = numeroDeFacture(reservation);

  // L'annulation reste gratuite jusqu'à 72 h avant le départ (cf. CGV).
  const limiteAnnulationGratuite = ajouterJours(reservation.dateDebut, -3);
  const annulable = reservation.statut === "CONFIRMEE" && reservation.dateDebut > aujourdhui();
  const gratuite = aujourdhui() <= limiteAnnulationGratuite;

  return (
    <Section fond="sable" className="pb-24 pt-32 sm:pt-40">
      {nouvelle && (
        <div className="mb-10 rounded-[1.25rem] border border-olive-300 bg-olive-50 px-6 py-5">
          <p className="font-display text-[1.1rem] font-bold uppercase text-olive-700">
            C&apos;est réservé
          </p>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-olive-800">
            Un email de confirmation et votre facture {facture} viennent de partir vers{" "}
            {reservation.client.email}. Gardez ce lien : il vous donne accès à votre réservation
            à tout moment, sans mot de passe.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Etiquette>Réservation {reservation.reference}</Etiquette>
        <Pastille ton={statut.ton}>{statut.texte}</Pastille>
      </div>

      <TitreSection as="h1" className="mt-6">
        Bonjour {reservation.client.prenom}
      </TitreSection>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {/* Le vélo réservé */}
          <div className="flex flex-wrap items-center gap-6 rounded-[1.5rem] bg-white p-6">
            {velo && (
              <div
                className="grid h-28 w-40 shrink-0 place-items-center rounded-xl px-3"
                style={{ background: velo.teintes[1] }}
              >
                <VeloIllustration categorie={velo.categorie} teintes={velo.teintes} className="w-full" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-display text-[1.35rem] font-extrabold uppercase leading-none">
                {ligne?.veloNom}
              </p>
              <p className="mt-2 text-[0.9rem] text-encre-500">
                {reservation.jours} jour{reservation.jours > 1 ? "s" : ""} de location
              </p>
              {ligne && (
                <Link
                  href={`/velos/${ligne.veloSlug}`}
                  className="lien-souligne mt-2 inline-block text-[0.82rem] font-semibold text-terre-700"
                >
                  Revoir la fiche du vélo
                </Link>
              )}
            </div>
          </div>

          {/* Les dates */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] bg-white p-6">
              <p className="etiquette opacity-55">Départ</p>
              <p className="mt-2 font-display text-[1.1rem] font-bold capitalize leading-tight">
                {formatDateAvecJour(reservation.dateDebut)}
              </p>
              {point && <p className="mt-2 text-[0.85rem] text-encre-500">{point.horaires}</p>}
            </div>
            <div className="rounded-[1.25rem] bg-white p-6">
              <p className="etiquette opacity-55">Retour</p>
              <p className="mt-2 font-display text-[1.1rem] font-bold capitalize leading-tight">
                {formatDateAvecJour(reservation.dateFin)}
              </p>
              <p className="mt-2 text-[0.85rem] text-encre-500">Avant la fermeture de l&apos;atelier</p>
            </div>
          </div>

          {point && (
            <div className="mt-6 rounded-[1.25rem] bg-white p-6">
              <p className="etiquette opacity-55">Point de retrait</p>
              <p className="mt-2 font-semibold">{point.nom}</p>
              <p className="mt-1 text-[0.9rem] text-encre-500">
                {point.adresse}, {point.ville}
              </p>
              <p className="mt-3 text-[0.85rem] text-encre-500">
                Une question sur place ? Appelez le{" "}
                <a href={`tel:${site.telephoneLien}`} className="lien-souligne font-semibold text-terre-700">
                  {site.telephone}
                </a>
                .
              </p>
            </div>
          )}

          {reservation.options.length > 0 && (
            <div className="mt-6 rounded-[1.25rem] bg-white p-6">
              <p className="etiquette opacity-55">Options retenues</p>
              <ul className="mt-3 space-y-2 text-[0.9rem]">
                {reservation.options.map((option) => {
                  const detail = optionsLocation.find((o) => o.code === option.code);
                  return (
                    <li key={option.code} className="flex justify-between gap-4 border-b border-encre-900/10 pb-2">
                      <span>
                        {option.libelle}
                        {option.quantite > 1 && ` × ${option.quantite}`}
                        {detail && (
                          <span className="block text-[0.78rem] text-encre-500">{detail.description}</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatXof(option.prixXof)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {annulable && (
            <div className="mt-6">
              <AnnulerReservation
                reference={reservation.reference}
                token={decodeURIComponent(token)}
                gratuite={gratuite}
                dateLimite={formatDate(limiteAnnulationGratuite)}
              />
            </div>
          )}
        </div>

        {/* Facture */}
        <aside className="lg:col-span-5">
          <div id="facture" className="rounded-[1.5rem] bg-white p-6 lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between gap-4">
              <p className="etiquette opacity-55">Facture</p>
              <p className="font-display text-[0.9rem] font-bold">{facture}</p>
            </div>

            <dl className="mt-5 space-y-2.5 text-[0.88rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-encre-500">Location ({reservation.jours} j)</dt>
                <dd className="tabular-nums">{formatXof(reservation.sousTotalXof)}</dd>
              </div>
              {reservation.remiseXof > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-encre-500">Remise durée</dt>
                  <dd className="tabular-nums text-olive-600">− {formatXof(reservation.remiseXof)}</dd>
                </div>
              )}
              {reservation.optionsXof > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-encre-500">Options</dt>
                  <dd className="tabular-nums">{formatXof(reservation.optionsXof)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-encre-900/12 pt-3 font-display text-[1.05rem] font-bold">
                <dt>Total réglé</dt>
                <dd className="tabular-nums">{formatXof(reservation.totalXof)}</dd>
              </div>
            </dl>

            {reservation.paiements.length > 0 && (
              <ul className="mt-5 space-y-1.5 border-t border-encre-900/12 pt-4 text-[0.8rem] text-encre-500">
                {reservation.paiements.map((paiement) => (
                  <li key={paiement.id} className="flex justify-between gap-3">
                    <span>
                      {paiement.estCaution ? "Caution" : "Paiement"} ·{" "}
                      {paiement.moyen.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatXof(paiement.montantXof)}
                      {paiement.statut === "REMBOURSE" && " (rendue)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {reservation.cautionXof > 0 && (
              <p className="mt-4 text-[0.78rem] leading-relaxed text-encre-500">
                La caution de {formatXof(reservation.cautionXof)} est libérée dans les 48 heures
                suivant la restitution du vélo, après contrôle.
              </p>
            )}

            <p className="mt-5 border-t border-encre-900/12 pt-4 text-[0.78rem] leading-relaxed text-encre-500">
              Facture émise le {formatDate(reservation.confirmeLe ?? reservation.creeLe)} par{" "}
              {site.nom}, {site.adresse.ville}, {site.adresse.pays}. Montants en francs CFA (XOF).
            </p>
          </div>
        </aside>
      </div>
    </Section>
  );
}
