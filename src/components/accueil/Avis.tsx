import { avisClients } from "@/data/contenus";
import { Etiquette, Etoiles, Section, TitreSection } from "@/components/ui";
import { formatDate } from "@/lib/format";

/** Avis clients (§2.1) : trois témoignages mis en avant sur l'accueil. */
export function Avis() {
  const selection = avisClients.slice(0, 3);
  const moyenne =
    avisClients.reduce((total, avis) => total + avis.note, 0) / avisClients.length;

  return (
    <Section fond="sable" className="py-20 sm:py-28">
      <div className="reveal flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Etiquette numero="06">Ils sont partis</Etiquette>
          <TitreSection className="mt-6 max-w-xl">Ce qu&apos;ils en disent au retour</TitreSection>
        </div>
        <p className="flex items-center gap-3 text-[0.9rem] text-encre-500">
          <Etoiles note={moyenne} className="text-soleil-500" />
          <span className="font-semibold text-encre-900 tabular-nums">
            {moyenne.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5
          </span>
          <span>sur 222 locations</span>
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {selection.map((avis, index) => (
          <figure
            key={avis.id}
            className="reveal flex flex-col rounded-[1.25rem] bg-white p-7"
            data-delai={index * 90}
          >
            <Etoiles note={avis.note} className="text-soleil-500" />
            <blockquote className="mt-5 flex-1">
              <p className="font-display text-[1.1rem] font-bold uppercase leading-tight tracking-[-0.01em]">
                {avis.titre}
              </p>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-encre-500">{avis.commentaire}</p>
            </blockquote>
            <figcaption className="mt-6 border-t border-encre-900/12 pt-4 text-[0.8rem] text-encre-500">
              <span className="font-semibold text-encre-900">{avis.auteur}</span> · {avis.ville}
              <span className="block opacity-70">{formatDate(avis.date)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
