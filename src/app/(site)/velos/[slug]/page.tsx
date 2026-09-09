import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonLien } from "@/components/Bouton";
import { CarteVelo } from "@/components/CarteVelo";
import { SpecificationsAnnotees } from "@/components/SpecificationsAnnotees";
import { VeloIllustration } from "@/components/VeloIllustration";
import { WidgetReservation } from "@/components/reservation/WidgetReservation";
import { Etiquette, Etoiles, Pastille, Section, TitreSection } from "@/components/ui";
import { libellesCategorie, libellesTaille, velos as catalogue } from "@/data/catalogue";
import { avisClients } from "@/data/contenus";
import { depot } from "@/lib/db";
import { estDateISOValide } from "@/lib/dates";
import { formatDate, formatXof } from "@/lib/format";
import { prixIndicatifSemaine } from "@/lib/tarification";

type Params = Promise<{ slug: string }>;
type Recherche = Promise<Record<string, string | string[] | undefined>>;

/** La disponibilité évolue à chaque réservation : pas de mise en cache. */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return catalogue.map((velo) => ({ slug: velo.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) return { title: "Vélo introuvable" };

  return {
    title: `${velo.nom} — ${libellesCategorie[velo.categorie]}`,
    description: `${velo.accroche}. ${formatXof(velo.prixJourXof)} par jour, caution ${formatXof(velo.cautionXof)}, réservable en ligne sans créer de compte.`,
    alternates: { canonical: `/velos/${velo.slug}` },
  };
}

export default async function PageVelo({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Recherche;
}) {
  const { slug } = await params;
  const recherche = await searchParams;

  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) notFound();

  const [periodesOccupees, points, tousLesVelos] = await Promise.all([
    depot.periodesIndisponibles(velo.id),
    depot.listerPointsDeRetrait(),
    depot.listerVelos(),
  ]);

  const point = points.find((p) => p.id === velo.pointDeRetraitId);
  const avis = avisClients.filter((a) => a.veloId === velo.id);
  const similaires = tousLesVelos
    .filter((autre) => autre.id !== velo.id && autre.categorie === velo.categorie)
    .concat(tousLesVelos.filter((autre) => autre.id !== velo.id && autre.categorie !== velo.categorie))
    .slice(0, 3);

  const debut = typeof recherche.debut === "string" && estDateISOValide(recherche.debut) ? recherche.debut : undefined;
  const fin = typeof recherche.fin === "string" && estDateISOValide(recherche.fin) ? recherche.fin : undefined;
  const datesInitiales = debut && fin && debut <= fin ? { debut, fin } : undefined;

  const caracteristiques = [
    { libelle: "Catégorie", valeur: libellesCategorie[velo.categorie] },
    { libelle: "Taille du cadre", valeur: libellesTaille[velo.taille] },
    { libelle: "Poids", valeur: `${velo.poidsKg.toLocaleString("fr-FR")} kg` },
    { libelle: "Vitesses", valeur: `${velo.vitesses}` },
    { libelle: "Charge maximale", valeur: `${velo.chargeMaxKg} kg` },
    { libelle: "Autonomie conseillée", valeur: `${velo.autonomieConseilleeKm} km / jour` },
    ...(velo.moteurWatts ? [{ libelle: "Moteur", valeur: `${velo.moteurWatts} W` }] : []),
    ...(velo.batterieWh ? [{ libelle: "Batterie", valeur: `${velo.batterieWh} Wh` }] : []),
    ...(velo.autonomieAssistanceKm
      ? [{ libelle: "Autonomie assistée", valeur: `${velo.autonomieAssistanceKm} km` }]
      : []),
    { libelle: "Point de retrait", valeur: point ? `${point.nom}, ${point.ville}` : "À définir" },
  ];

  return (
    <>
      {/* --- Bandeau produit --- */}
      <section
        className="pt-28 sm:pt-36"
        style={{ background: `linear-gradient(170deg, ${velo.teintes[1]} 0%, #fdfbf7 78%)` }}
      >
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <nav aria-label="Fil d'ariane" className="etiquette flex items-center gap-2 opacity-55">
            <Link href="/velos" className="lien-souligne">
              Nos vélos
            </Link>
            <span aria-hidden="true">/</span>
            <span>{velo.nom}</span>
          </nav>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Pastille ton="sombre">{libellesCategorie[velo.categorie]}</Pastille>
            <Pastille ton="neutre">Taille {velo.taille}</Pastille>
            {velo.statut === "MAINTENANCE" && <Pastille ton="alerte">À l&apos;atelier</Pastille>}
          </div>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <TitreSection as="h1" taille="lg">
                {velo.nom}
              </TitreSection>
              <p className="mt-4 max-w-xl text-[1.05rem] text-encre-700">{velo.accroche}</p>
            </div>
            <div className="flex items-center gap-3 text-[0.88rem] text-encre-500">
              <Etoiles note={velo.noteMoyenne} className="text-soleil-500" />
              <span className="font-semibold text-encre-900 tabular-nums">
                {velo.noteMoyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}
              </span>
              <span>· {velo.nombreAvis} avis</span>
            </div>
          </div>

          <VeloIllustration
            categorie={velo.categorie}
            teintes={velo.teintes}
            className="mx-auto mt-4 w-full max-w-4xl"
          />
        </div>
      </section>

      {/* --- Description, caractéristiques et encart de réservation --- */}
      <Section fond="sable" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Etiquette numero="01">Le vélo</Etiquette>
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed">{velo.description}</p>

            <h2 className="etiquette mt-12 opacity-55">Caractéristiques</h2>
            <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
              {caracteristiques.map((item) => (
                <div
                  key={item.libelle}
                  className="flex items-baseline justify-between gap-4 border-b border-encre-900/12 py-3"
                >
                  <dt className="text-[0.88rem] text-encre-500">{item.libelle}</dt>
                  <dd className="text-right text-[0.9rem] font-semibold">{item.valeur}</dd>
                </div>
              ))}
            </dl>

            <h2 className="etiquette mt-12 opacity-55">Fourni avec le vélo</h2>
            <ul className="mt-5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {velo.equipementInclus.map((equipement) => (
                <li
                  key={equipement}
                  className="flex items-start gap-3 border-b border-encre-900/12 py-3 text-[0.9rem]"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    className="mt-0.5 shrink-0 text-olive-500"
                    aria-hidden="true"
                  >
                    <path
                      d="m3 8.4 3.2 3.2L13 4.8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  {equipement}
                </li>
              ))}
            </ul>

            <div className="mt-12 rounded-[1.25rem] bg-white p-6">
              <p className="etiquette opacity-55">Bon à savoir</p>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-encre-500">
                À partir de trois jours, une remise de 8 % s&apos;applique automatiquement, 15 % à
                la semaine et 22 % au-delà de deux semaines. Une semaine sur ce vélo revient à{" "}
                <strong className="font-semibold text-encre-900">
                  {formatXof(prixIndicatifSemaine(velo))}
                </strong>
                .
              </p>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <WidgetReservation
                velo={velo}
                periodesOccupees={periodesOccupees}
                datesInitiales={datesInitiales}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* --- Schéma annoté --- */}
      <Section fond="blanc" className="py-16 sm:py-20">
        <Etiquette numero="02">En détail</Etiquette>
        <TitreSection className="mt-6">Ce qui compte sur la route</TitreSection>
        <SpecificationsAnnotees velo={velo} className="mt-6" />
      </Section>

      {/* --- Avis sur ce vélo --- */}
      {avis.length > 0 && (
        <Section fond="sable" className="py-16 sm:py-20">
          <Etiquette numero="03">Avis vérifiés</Etiquette>
          <TitreSection className="mt-6">Ils ont roulé sur ce vélo</TitreSection>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {avis.map((item) => (
              <figure key={item.id} className="rounded-[1.25rem] bg-white p-7">
                <Etoiles note={item.note} className="text-soleil-500" />
                <blockquote className="mt-4">
                  <p className="font-display text-[1.05rem] font-bold uppercase leading-tight">
                    {item.titre}
                  </p>
                  <p className="mt-3 text-[0.92rem] leading-relaxed text-encre-500">
                    {item.commentaire}
                  </p>
                </blockquote>
                <figcaption className="mt-5 border-t border-encre-900/12 pt-4 text-[0.8rem] text-encre-500">
                  <span className="font-semibold text-encre-900">{item.auteur}</span> · {item.ville}{" "}
                  · {formatDate(item.date)}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* --- Autres vélos --- */}
      <Section fond="blanc" className="py-16 sm:py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <TitreSection>Voir aussi</TitreSection>
          <BoutonLien href="/velos" variante="contour" className="text-encre-900">
            Tout le catalogue
          </BoutonLien>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {similaires.map((autre) => (
            <CarteVelo key={autre.id} velo={autre} />
          ))}
        </div>
      </Section>
    </>
  );
}
