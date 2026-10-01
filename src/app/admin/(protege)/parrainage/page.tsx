import type { Metadata } from "next";

import { GestionParrainage } from "@/components/admin/GestionParrainage";
import { libelleCommission, libelleReduction } from "@/lib/parrainage";
import { Pastille } from "@/components/ui";
import { depot } from "@/lib/db";
import { formatDate, formatNombre, formatXof } from "@/lib/format";

export const metadata: Metadata = { title: "Parrainage" };

export const dynamic = "force-dynamic";

/**
 * Parrainage partenaires.
 *
 * L'écran répond à deux questions : quel partenaire nous a apporté quels
 * clients, et combien nous lui devons. La réduction accordée au client
 * n'est que le moyen, c'est le code saisi qui fait le lien, et c'est
 * pourquoi tout code est obligatoirement rattaché à un partenaire.
 *
 * Le chiffre compté est celui **après** réduction : ce que ces clients ont
 * réellement payé, donc ce que le partenariat a rapporté. Y mettre le
 * montant avant réduction gonflerait le rendement de chaque partenaire de
 * la réduction qu'on a consentie à son client.
 *
 * La commission n'est pas recalculée mais additionnée depuis les montants
 * figés à chaque utilisation : le taux est une politique, et l'appliquer
 * rétroactivement fausserait l'historique des versements.
 *
 * Une réservation annulée ne compte pas : le partenaire n'a pas apporté un
 * client qui s'est décommandé.
 */
export default async function PageCodesPromoAdmin() {
  const [partenaires, codes, statistiques] = await Promise.all([
    depot.listerPartenaires({ inclureInactifs: true }),
    depot.listerCodesParrainage(),
    depot.statistiquesPartenaires(),
  ]);

  const actifs = statistiques.filter((ligne) => ligne.utilisations > 0);
  const totalUtilisations = statistiques.reduce((total, ligne) => total + ligne.utilisations, 0);
  const totalReductions = statistiques.reduce(
    (total, ligne) => total + ligne.reductionsAccordeesXof,
    0,
  );
  const totalCommissions = statistiques.reduce(
    (total, ligne) => total + ligne.commissionDueXof,
    0,
  );
  const totalApporte = statistiques.reduce((total, ligne) => total + ligne.chiffreAffairesXof, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titre-editorial text-[1.9rem]">Parrainage</h1>
          <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-gris-cadre">
            Chaque code appartient à un partenaire. Le client le saisit au moment de payer et
            obtient <strong className="text-noir-piste">{libelleReduction()}</strong> ; le
            partenaire touche <strong className="text-noir-piste">{libelleCommission()}</strong>{" "}
            de ce que son client a payé. C&apos;est ainsi que vous savez qui vous apporte des
            clients, et combien vous lui devez.
          </p>
        </div>

        {totalUtilisations > 0 && (
          <p className="text-[0.9rem] text-gris-cadre">
            <strong className="font-semibold text-noir-piste tabular-nums">
              {formatNombre(totalUtilisations)}
            </strong>{" "}
            client{totalUtilisations > 1 ? "s" : ""} apporté
            {totalUtilisations > 1 ? "s" : ""} ·{" "}
            <strong className="font-semibold text-noir-piste tabular-nums">
              {formatXof(totalApporte)}
            </strong>{" "}
            encaissés ·{" "}
            <strong className="font-semibold text-orange-sourd tabular-nums">
              {formatXof(totalCommissions)}
            </strong>{" "}
            à verser
          </p>
        )}
      </div>

      {/* ------------------------------------ Ce que chaque partenaire apporte */}
      <section className="mt-10">
        <h2 className="titre-editorial text-[1.3rem]">Par partenaire</h2>

        {statistiques.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-bloc)] border border-noir-piste/12 p-6 text-[0.88rem] leading-relaxed text-gris-cadre">
            Aucun partenaire enregistré. Créez-en un ci-dessous, puis donnez-lui un code de
            parrainage.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left text-[0.88rem]">
                <thead>
                  <tr className="border-b border-noir-piste/20 text-[0.74rem] uppercase tracking-[0.06em] text-gris-cadre">
                    <th className="py-2 pr-4 font-semibold">Partenaire</th>
                    <th className="py-2 pr-4 font-semibold">Codes</th>
                    <th className="py-2 pr-4 text-right font-semibold">Clients apportés</th>
                    <th className="py-2 pr-4 text-right font-semibold">Réductions accordées</th>
                    <th className="py-2 pr-4 text-right font-semibold">Chiffre apporté</th>
                    <th className="py-2 pr-4 text-right font-semibold">Commission due</th>
                    <th className="py-2 font-semibold">Dernière fois</th>
                  </tr>
                </thead>
                <tbody>
                  {statistiques.map((ligne) => (
                    <tr key={ligne.partenaire.id} className="border-b border-noir-piste/10">
                      <td className="py-3 pr-4">
                        <span className="font-semibold">{ligne.partenaire.nom}</span>
                        {!ligne.partenaire.actif && (
                          <Pastille ton="neutre" className="ml-2">
                            inactif
                          </Pastille>
                        )}
                        {ligne.partenaire.contact && (
                          <span className="block text-[0.78rem] text-gris-cadre">
                            {ligne.partenaire.contact}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-[0.8rem]">
                        {ligne.codes.length > 0 ? ligne.codes.join(", ") : "aucun"}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatNombre(ligne.utilisations)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gris-cadre">
                        {ligne.reductionsAccordeesXof > 0
                          ? `− ${formatXof(ligne.reductionsAccordeesXof)}`
                          : "aucune"}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                        {ligne.chiffreAffairesXof > 0 ? formatXof(ligne.chiffreAffairesXof) : "aucun"}
                      </td>
                      {/* Ce qu'il reste à verser au partenaire. Le site ne
                          le verse pas : il dit seulement combien. */}
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-orange-sourd">
                        {ligne.commissionDueXof > 0 ? formatXof(ligne.commissionDueXof) : "aucune"}
                      </td>
                      <td className="py-3 text-[0.82rem] whitespace-nowrap text-gris-cadre">
                        {ligne.derniereUtilisation
                          ? formatDate(ligne.derniereUtilisation)
                          : "jamais"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[0.82rem] leading-relaxed text-gris-cadre">
              Le chiffre apporté est ce que ces clients ont <strong>réellement payé</strong>,
              réduction déduite, soit {formatXof(totalReductions)} de réductions accordées en tout.
              Les commissions sont à verser aux partenaires en dehors du site : cet écran dit
              combien, il ne paie pas. Les réservations annulées n&apos;y figurent pas.
              {actifs.length > 0 && statistiques.length > actifs.length && (
                <>
                  {" "}
                  {statistiques.length - actifs.length} partenaire
                  {statistiques.length - actifs.length > 1 ? "s n'ont" : " n'a"} encore rien
                  apporté.
                </>
              )}
            </p>
          </>
        )}
      </section>

      <GestionParrainage partenaires={partenaires} codes={codes} />
    </div>
  );
}
