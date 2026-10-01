import { Etoiles, Section, TitreSection } from "@/components/ui";
import { depot } from "@/lib/db";
import { formatDate } from "@/lib/format";

/**
 * Avis clients sur l'accueil.
 *
 * Ils viennent tous d'une sortie payée et terminée, et sont relus avant
 * de paraître : il n'existe pas de formulaire public d'avis, seulement
 * le lien de suivi envoyé au client après sa location.
 *
 * Tant qu'aucun avis n'est publié, cette section disparaît. C'est
 * délibéré : trois témoignages inventés se repèrent, et un visiteur qui
 * les repère cesse de croire le reste de la page. Mieux vaut une page
 * plus courte qu'une page qui ment.
 */
export async function Avis() {
  const avis = await depot.listerAvis({ publiesSeulement: true });
  if (avis.length === 0) return null;

  const selection = avis.slice(0, 3);
  const moyenne = avis.reduce((total, element) => total + element.note, 0) / avis.length;

  return (
    <Section fond="craie" className="py-20 sm:py-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <TitreSection className="max-w-xl">Ce qu&apos;ils en disent au retour</TitreSection>
        <p className="flex items-center gap-3 text-[0.9rem] text-gris-cadre">
          <Etoiles note={moyenne} className="text-orange-signal" />
          <span className="font-semibold text-noir-piste tabular-nums">
            {moyenne.toLocaleString("fr-FR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            / 5
          </span>
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {selection.map((avisClient) => (
          <figure
            key={avisClient.id}
            className="flex flex-col rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white/60 p-6"
          >
            <Etoiles note={avisClient.note} className="text-orange-signal" />
            <blockquote className="mt-5 flex-1">
              {avisClient.titre && (
                <p className="titre-editorial text-[1.2rem]">{avisClient.titre}</p>
              )}
              {avisClient.commentaire && (
                <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">
                  {avisClient.commentaire}
                </p>
              )}
            </blockquote>
            <figcaption className="mt-6 border-t border-noir-piste/15 pt-4 text-[0.8rem] text-gris-cadre">
              <span className="font-semibold text-noir-piste">{avisClient.auteur}</span>
              <span className="block opacity-70">{formatDate(avisClient.creeLe)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
