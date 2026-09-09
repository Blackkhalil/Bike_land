import type { Metadata } from "next";

import { depot } from "@/lib/db";
import { libellesCategorie, optionsLocation, reglesPrix } from "@/data/catalogue";
import { formatNombre, formatXof } from "@/lib/format";
import { MAJORATION_HAUTE_SAISON, calculerDevis } from "@/lib/tarification";

export const metadata: Metadata = { title: "Tarifs" };

/** Durées de référence pour la simulation. */
const durees = [1, 3, 7, 14, 21];

export default async function PageTarifsAdmin() {
  const velos = await depot.listerVelos();

  // Simulation faite avec le même moteur que le site public : ce que
  // l'exploitant lit ici est exactement ce que le client paiera.
  const basseSaison = "2026-06-01";
  const hauteSaison = "2026-12-01";

  return (
    <div>
      <header>
        <p className="etiquette opacity-55">Exploitation</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Tarifs</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-encre-500">
          Les montants ci-dessous sont calculés par le moteur de tarification du site : ils sont
          identiques, au franc près, à ceux affichés au client au moment de réserver.
        </p>
      </header>

      <section className="mt-8 rounded-[1.25rem] bg-white p-6">
        <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
          Simulation par vélo et par durée
        </h2>
        <p className="mt-1 text-[0.8rem] text-encre-500">Hors haute saison, options non comprises</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-[0.85rem]">
            <caption className="sr-only">Prix total selon le vélo et la durée</caption>
            <thead>
              <tr className="border-b border-encre-900/15 text-[0.72rem] uppercase tracking-[0.1em] text-encre-500">
                <th scope="col" className="py-3 pr-4 font-semibold">Vélo</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Prix / jour</th>
                {durees.map((jours) => (
                  <th key={jours} scope="col" className="py-3 pr-4 text-right font-semibold">
                    {jours} j
                  </th>
                ))}
                <th scope="col" className="py-3 text-right font-semibold">Caution</th>
              </tr>
            </thead>
            <tbody>
              {velos.map((velo) => (
                <tr key={velo.id} className="border-b border-encre-900/8">
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    {velo.nom}
                    <span className="block text-[0.76rem] font-normal text-encre-500">
                      {libellesCategorie[velo.categorie]} · {velo.taille}
                    </span>
                  </th>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatXof(velo.prixJourXof)}</td>
                  {durees.map((jours) => {
                    const devis = calculerDevis(velo, basseSaison, decaler(basseSaison, jours - 1));
                    return (
                      <td key={jours} className="py-3 pr-4 text-right tabular-nums">
                        {formatXof(devis.totalXof)}
                        {devis.remisePourcent > 0 && (
                          <span className="block text-[0.72rem] text-olive-600">
                            − {devis.remisePourcent} %
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 text-right tabular-nums text-encre-500">
                    {formatXof(velo.cautionXof)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.25rem] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Remises de durée
          </h2>
          <ul className="mt-4">
            {reglesPrix.map((regle) => (
              <li
                key={regle.id}
                className="flex items-baseline justify-between gap-4 border-b border-encre-900/10 py-3 text-[0.88rem] last:border-0"
              >
                <span>
                  {regle.libelle}
                  <span className="block text-[0.78rem] text-encre-500">
                    {regle.maxJours
                      ? `${regle.minJours} à ${regle.maxJours} jours`
                      : `${regle.minJours} jours et plus`}
                  </span>
                </span>
                <span className="shrink-0 font-display text-[1.1rem] font-bold text-terre-700 tabular-nums">
                  {regle.remisePourcent > 0 ? `− ${regle.remisePourcent} %` : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-encre-900/10 pt-4 text-[0.82rem] leading-relaxed text-encre-500">
            Les remises ne se cumulent pas : la règle appliquée est celle dont la plage contient
            la durée demandée.
          </p>
        </div>

        <div className="rounded-[1.25rem] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Haute saison
          </h2>
          <p className="mt-4 text-[0.88rem] leading-relaxed text-encre-500">
            Une majoration de {formatNombre(MAJORATION_HAUTE_SAISON * 100)} % s&apos;applique aux
            seuls jours compris entre le 1<sup>er</sup> novembre et le 31 mars, période sèche et
            haute saison touristique. Une location à cheval sur deux périodes n&apos;est donc
            majorée qu&apos;au prorata.
          </p>

          <div className="mt-5 rounded-2xl bg-sable-100 p-5">
            <p className="etiquette opacity-55">Exemple</p>
            {velos[0] && (
              <p className="mt-3 text-[0.88rem] leading-relaxed">
                {velos[0].nom}, 7 jours :{" "}
                <strong className="font-semibold">
                  {formatXof(calculerDevis(velos[0], basseSaison, decaler(basseSaison, 6)).totalXof)}
                </strong>{" "}
                en juin, contre{" "}
                <strong className="font-semibold">
                  {formatXof(calculerDevis(velos[0], hauteSaison, decaler(hauteSaison, 6)).totalXof)}
                </strong>{" "}
                en décembre.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[1.25rem] bg-white p-6">
        <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">Options</h2>
        <ul className="mt-4">
          {optionsLocation.map((option) => (
            <li
              key={option.code}
              className="flex flex-wrap items-baseline justify-between gap-4 border-b border-encre-900/10 py-3 text-[0.88rem] last:border-0"
            >
              <span className="flex-1">
                {option.libelle}
                <span className="block text-[0.78rem] text-encre-500">{option.description}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatXof(option.prixXof)}
                <span className="font-normal text-encre-500">
                  {option.unite === "jour" ? " / jour" : " forfait"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 rounded-[1.25rem] border border-encre-900/12 p-6 text-[0.85rem] leading-relaxed text-encre-500">
        Les prix journaliers vivent sur chaque vélo, les remises et la majoration de saison dans{" "}
        <code className="font-mono">src/data/catalogue.ts</code> et{" "}
        <code className="font-mono">src/lib/tarification.ts</code>. Le modèle Prisma{" "}
        <code className="font-mono">PriceRule</code> est prêt à recevoir ces règles en base
        lorsque vous voudrez les modifier sans redéployer.
      </p>
    </div>
  );
}

function decaler(iso: string, jours: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
}
