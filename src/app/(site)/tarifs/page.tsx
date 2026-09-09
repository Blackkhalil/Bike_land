import type { Metadata } from "next";

import { BoutonLien } from "@/components/Bouton";
import { Etiquette, Pastille, Section, TitreSection } from "@/components/ui";
import { libellesCategorie, optionsLocation, reglesPrix } from "@/data/catalogue";
import { depot } from "@/lib/db";
import { formatXof } from "@/lib/format";
import { MAJORATION_HAUTE_SAISON, calculerDevis } from "@/lib/tarification";
import type { CategorieVelo, Velo } from "@/lib/types";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Tarifs de location Bike Land : prix à la journée par type de vélo, remises automatiques à partir de trois jours, options et cautions. En francs CFA, tout compris.",
  alternates: { canonical: "/tarifs" },
};

/** Durées mises en vitrine dans la grille tarifaire. */
const dureesVitrine = [1, 3, 7, 14];

export default async function PageTarifs() {
  const velos = await depot.listerVelos();

  // Un représentant par catégorie : la grille compare des types de vélos,
  // pas des exemplaires.
  const parCategorie = new Map<CategorieVelo, Velo>();
  for (const velo of velos) {
    const existant = parCategorie.get(velo.categorie);
    if (!existant || velo.prixJourXof < existant.prixJourXof) parCategorie.set(velo.categorie, velo);
  }

  // Date hors haute saison, pour que la grille affiche le tarif de base.
  const referenceBasseSaison = "2026-06-01";

  return (
    <>
      <Section fond="sable" className="pb-16 pt-32 sm:pt-40">
        <Etiquette numero="01">Tarifs</Etiquette>
        <TitreSection as="h1" taille="lg" className="mt-6 max-w-4xl">
          Un prix par jour,
          <br />
          qui baisse avec la durée
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-encre-500">
          Tous les montants sont en francs CFA, équipement de base compris. Les remises de durée
          sont appliquées automatiquement au moment de la réservation : il n&apos;y a pas de code
          à saisir ni de forfait à demander.
        </p>
      </Section>

      {/* --- Grille par catégorie et par durée --- */}
      <Section fond="blanc" className="py-16">
        <h2 className="etiquette opacity-55">Location, par type de vélo</h2>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">
              Prix de location selon le type de vélo et la durée, hors haute saison
            </caption>
            <thead>
              <tr className="border-b border-encre-900/20">
                <th scope="col" className="py-4 pr-4 text-[0.8rem] font-semibold uppercase tracking-[0.1em]">
                  Type de vélo
                </th>
                {dureesVitrine.map((jours) => (
                  <th
                    key={jours}
                    scope="col"
                    className="py-4 pr-4 text-right text-[0.8rem] font-semibold uppercase tracking-[0.1em]"
                  >
                    {jours} jour{jours > 1 ? "s" : ""}
                  </th>
                ))}
                <th scope="col" className="py-4 text-right text-[0.8rem] font-semibold uppercase tracking-[0.1em]">
                  Caution
                </th>
              </tr>
            </thead>
            <tbody>
              {[...parCategorie.entries()].map(([categorie, velo]) => (
                <tr key={categorie} className="border-b border-encre-900/12">
                  <th scope="row" className="py-5 pr-4 font-display text-[1.05rem] font-bold uppercase">
                    {libellesCategorie[categorie]}
                    <span className="mt-1 block text-[0.78rem] font-normal normal-case tracking-normal text-encre-500">
                      à partir de {formatXof(velo.prixJourXof)} / jour
                    </span>
                  </th>
                  {dureesVitrine.map((jours) => {
                    const devis = calculerDevis(
                      velo,
                      referenceBasseSaison,
                      decalerDe(referenceBasseSaison, jours - 1),
                    );
                    return (
                      <td key={jours} className="py-5 pr-4 text-right tabular-nums">
                        <span className="font-semibold">{formatXof(devis.totalXof)}</span>
                        {devis.remisePourcent > 0 && (
                          <span className="mt-1 block text-[0.75rem] text-olive-600">
                            − {devis.remisePourcent} %
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-5 text-right tabular-nums text-encre-500">
                    {formatXof(velo.cautionXof)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-[0.85rem] leading-relaxed text-encre-500">
          Prix affichés hors haute saison. Entre novembre et mars, une majoration de{" "}
          {Math.round(MAJORATION_HAUTE_SAISON * 100)} % s&apos;applique aux seuls jours concernés,
          ce qui évite de pénaliser une location à cheval sur deux périodes.
        </p>
      </Section>

      {/* --- Remises de durée --- */}
      <Section fond="sable" className="py-16">
        <h2 className="etiquette opacity-55">Remises automatiques</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reglesPrix.map((regle) => (
            <div key={regle.id} className="rounded-[1.25rem] bg-white p-6">
              <p className="font-display text-[2.4rem] font-extrabold leading-none text-terre-600">
                {regle.remisePourcent > 0 ? `−${regle.remisePourcent}%` : "—"}
              </p>
              <p className="mt-4 font-semibold">{regle.libelle}</p>
              <p className="mt-1 text-[0.85rem] text-encre-500">
                {regle.maxJours
                  ? `De ${regle.minJours} à ${regle.maxJours} jours`
                  : `À partir de ${regle.minJours} jours`}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* --- Options --- */}
      <Section fond="blanc" className="py-16">
        <h2 className="etiquette opacity-55">Options</h2>
        <ul className="mt-6 border-t border-encre-900/12">
          {optionsLocation.map((option) => (
            <li
              key={option.code}
              className="flex flex-col gap-2 border-b border-encre-900/12 py-5 sm:flex-row sm:items-center sm:gap-8"
            >
              <div className="flex-1">
                <p className="font-semibold">{option.libelle}</p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-encre-500">
                  {option.description}
                </p>
              </div>
              <p className="shrink-0 font-display text-[1.05rem] font-bold text-terre-700">
                {formatXof(option.prixXof)}
                <span className="text-[0.75rem] font-medium text-encre-500">
                  {option.unite === "jour" ? " / jour" : " forfait"}
                </span>
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-[1.25rem] bg-sable-100 p-7">
          <Pastille ton="succes">Bon à savoir</Pastille>
          <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-encre-700">
            L&apos;assurance sérénité remplace intégralement la caution. Sur une location d&apos;une
            semaine en vélo électrique, elle revient à 17 500 FCFA et évite d&apos;immobiliser
            150 000 FCFA sur votre compte Mobile Money — c&apos;est souvent le meilleur calcul.
          </p>
        </div>
      </Section>

      {/* --- Groupes --- */}
      <Section fond="encre" className="py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <TitreSection>Groupes et séjours</TitreSection>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-sable-100/70">
              À partir de cinq vélos, ou pour un hébergeur qui souhaite proposer nos vélos à ses
              clients, nous établissons une grille dédiée. Écrivez-nous en indiquant les dates,
              le nombre de personnes et le point de départ.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <BoutonLien href="/contact" variante="clair" taille="lg">
              Demander un devis
            </BoutonLien>
            <BoutonLien
              href="/velos"
              variante="contour"
              taille="lg"
              className="border-sable-50/30 text-sable-50 hover:bg-sable-50/10"
            >
              Réserver maintenant
            </BoutonLien>
          </div>
        </div>
      </Section>
    </>
  );
}

function decalerDe(iso: string, jours: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
}
