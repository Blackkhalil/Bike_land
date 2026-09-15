import { avisClients } from "@/data/contenus";
import { Etoiles, Section, TitreSection } from "@/components/ui";
import { formatDate } from "@/lib/format";

/** Avis clients (§2.1) : trois témoignages mis en avant sur l'accueil. */
export function Avis() {
  const selection = avisClients.slice(0, 3);
  const moyenne =
    avisClients.reduce((total, avis) => total + avis.note, 0) / avisClients.length;

  return (
    <Section fond="craie" className="py-20 sm:py-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <TitreSection className="max-w-xl">Ce qu&apos;ils en disent au retour</TitreSection>
        <p className="flex items-center gap-3 text-[0.9rem] text-gris-cadre">
          <Etoiles note={moyenne} className="text-orange-signal" />
          <span className="font-semibold text-noir-piste tabular-nums">
            {moyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5
          </span>
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {selection.map((avis) => (
          <figure key={avis.id} className="flex flex-col rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white/60 p-6">
            <Etoiles note={avis.note} className="text-orange-signal" />
            <blockquote className="mt-5 flex-1">
              <p className="titre-editorial text-[1.2rem]">{avis.titre}</p>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">
                {avis.commentaire}
              </p>
            </blockquote>
            <figcaption className="mt-6 border-t border-noir-piste/15 pt-4 text-[0.8rem] text-gris-cadre">
              <span className="font-semibold text-noir-piste">{avis.auteur}</span> · {avis.ville}
              <span className="block opacity-70">{formatDate(avis.date)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
