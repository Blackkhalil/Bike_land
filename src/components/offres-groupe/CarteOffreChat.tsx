import type { ReglagesOffres } from "@/data/reglages-offres";
import { formatMontant, formatPourcentage, heureEnClair, type ResultatOffre } from "@/lib/offres";
import { inclusDans } from "@/lib/offres-groupe/conversation";
import { insecables, jourEnClair, majuscule, NOMS_OFFRES, personnesEnClair, regleRetard } from "@/lib/offres-groupe/textes-chat";
import { TAUX_ENCAISSEMENT } from "@/lib/tarifs-paiement";

/**
 * L'offre chiffrée, dans la discussion : chaque ligne de prix du moteur, le
 * prix barré, la ligne des frais de paiement électronique (125 F par
 * personne), la commission de l'opérateur Mobile Money (décision 3, donnée
 * par le serveur avec son devis), le total, ce qui est compris, la règle de
 * retard et le récapitulatif modèle du tableur (pas d'IA au lancement).
 *
 * Rien n'est calculé ici : tout vient du résultat du moteur et du devis.
 */
export function CarteOffreChat({
  resultat,
  confirme,
  commissionXof,
  montantADebiterXof,
  reglages,
}: {
  resultat: ResultatOffre;
  /** Vrai quand le serveur a confirmé ce prix (devis). */
  confirme: boolean;
  commissionXof?: number;
  montantADebiterXof?: number;
  reglages: ReglagesOffres;
}) {
  const ligneTotal = "flex items-baseline justify-between gap-3";
  return (
    <section aria-label="Votre offre" className="rounded-[var(--radius-carte)] border border-noir-piste/10 bg-white p-4 text-[0.88rem]">
      <p className="font-display text-[1.2rem] font-semibold leading-tight">{NOMS_OFFRES[resultat.offre]}</p>
      <p className="mt-1 text-[0.8rem] text-gris-cadre">
        {majuscule(jourEnClair(resultat.date))}, de {heureEnClair(resultat.depart)} à {heureEnClair(resultat.fin)} ·{" "}
        {personnesEnClair(resultat.personnes)}
      </p>

      <dl className="mt-4 space-y-2.5">
        {resultat.lignes.map((ligne) => (
          <div key={ligne.code} className="flex items-start justify-between gap-3">
            <dt className="min-w-0">
              <span className="block">{ligne.libelle}</span>
              {ligne.detail && <span className="block text-[0.76rem] leading-snug text-gris-cadre">{ligne.detail}</span>}
            </dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatMontant(ligne.montantXof)}</dd>
          </div>
        ))}
        <div className={`${ligneTotal} border-t border-noir-piste/10 pt-2.5 font-semibold`}>
          <dt>Prix de l&apos;offre</dt>
          <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatMontant(resultat.totalXof)}</dd>
        </div>
        {resultat.prixBarreXof !== null && (
          <div className={`${ligneTotal} text-[0.82rem] text-gris-cadre`}>
            <dt>Prix habituel</dt>
            <dd className="shrink-0 whitespace-nowrap tabular-nums">
              <s>{formatMontant(resultat.prixBarreXof)}</s>
            </dd>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <dt className="min-w-0">
            <span className="block">Frais Mobile Money</span>
            <span className="block text-[0.76rem] leading-snug text-gris-cadre">
              {formatPourcentage(TAUX_ENCAISSEMENT)}, prélevés par l&apos;opérateur de paiement au moment de payer
            </span>
          </dt>
          <dd className="shrink-0 whitespace-nowrap tabular-nums">
            {confirme && typeof commissionXof === "number" ? `+ ${formatMontant(commissionXof)}` : "en calcul…"}
          </dd>
        </div>
        <div className={`${ligneTotal} rounded-[var(--radius-bouton)] bg-noir-piste px-3 py-2.5 text-craie`}>
          <dt className="font-semibold">Débité de votre compte</dt>
          <dd className="shrink-0 whitespace-nowrap font-display text-[1.25rem] font-bold tabular-nums">
            {confirme && typeof montantADebiterXof === "number" ? formatMontant(montantADebiterXof) : "…"}
          </dd>
        </div>
      </dl>
      {!confirme && (
        <p role="status" className="mt-2 text-[0.78rem] text-gris-cadre">
          Je fais confirmer ce prix par Bike Land…
        </p>
      )}

      <p className="mt-4 font-semibold">Compris dans le prix</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.84rem]">
        {inclusDans(resultat, reglages).map((element) => (
          <li key={element}>{element}</li>
        ))}
      </ul>

      <p className="mt-4 rounded-[var(--radius-bouton)] bg-craie px-3 py-2 text-[0.8rem] leading-relaxed">{insecables(regleRetard(reglages))}</p>

      <details className="mt-3 text-[0.82rem]">
        <summary className="cursor-pointer font-semibold">Votre récapitulatif</summary>
        <p className="mt-2 whitespace-pre-line leading-relaxed text-gris-cadre">{insecables(resultat.recapModele)}</p>
      </details>
    </section>
  );
}
