import type { Metadata } from "next";
import Link from "next/link";

import { RemboursementsAFaire, type RemboursementAFaire } from "@/components/admin/RemboursementsAFaire";
import { montantF } from "@/data/libelles-reglages-offres";
import { exigerSessionAdmin } from "@/lib/admin";
import { dateAuBenin } from "@/lib/dates";
import { depot } from "@/lib/db";
import { formatDateAvecJour, formatHeureAuBenin } from "@/lib/format";
import { prenomDeAuteur } from "@/lib/journal";
import type { Remboursement } from "@/lib/types";

export const metadata: Metadata = { title: "Remboursements" };

/** Le délai promis au client pour rendre son argent (décision du responsable n° 7). */
const DELAI_HEURES = 48;

/** Combien de remboursements faits l'écran rappelle. */
const DERNIERS_FAITS = 50;

/** « le mercredi 11 novembre, 16 h 05 » : un instant, à l'heure de Cotonou. */
function instantEnClair(instant: string | Date): string {
  return `le ${formatDateAvecJour(dateAuBenin(instant))}, ${formatHeureAuBenin(instant)}`;
}

/** Chaque remboursement à faire avec son échéance, mise en mots, et s'il est en retard à cet instant. */
function avecEcheances(remboursements: Remboursement[], maintenant: number): RemboursementAFaire[] {
  return remboursements.map((remboursement) => {
    const echeance = new Date(Date.parse(remboursement.creeLe) + DELAI_HEURES * 3_600_000);
    return { ...remboursement, echeance: `avant ${instantEnClair(echeance)}`, enRetard: echeance.getTime() < maintenant };
  });
}

/** L'instant de la requête : lu hors du rendu, une fois. */
function instantPresent(): number {
  return Date.now();
}

/**
 * L'argent à rendre aux clients. Le site le note quand un paiement arrive
 * après l'expiration de la demande et que les vélos ont été repris entre-
 * temps (décision du responsable n° 6) ; le client et Bike Land en sont
 * prévenus. Le responsable rembourse lui-même, sur SasPay ou en Mobile
 * Money, sous 48 heures, puis le note ici avec son prénom : la ligne passe
 * dans « Faits », et le journal le garde.
 */
export default async function PageRemboursements() {
  await exigerSessionAdmin();
  const [aFaire, faits] = await Promise.all([
    depot.listerRemboursements({ statut: "a_faire" }),
    depot.listerRemboursements({ statut: "fait", limite: DERNIERS_FAITS }),
  ]);
  // L'échéance de chacun, mise en mots ici, une fois.
  const avecEcheance = avecEcheances(aFaire, instantPresent());
  const totalAFaire = aFaire.reduce((total, r) => total + r.montantXof, 0);

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Exploitation</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Remboursements</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          L&apos;argent à rendre quand un paiement arrive après l&apos;expiration de la demande et
          que les vélos ont été repris entre-temps. Remboursez sur SasPay ou en Mobile Money, sous{" "}
          {DELAI_HEURES} heures, puis notez-le ici.
        </p>
      </header>

      <section className="mt-8" aria-labelledby="titre-a-faire">
        <h2 id="titre-a-faire" className="font-display text-[1rem] font-bold uppercase tracking-tight">
          À faire{aFaire.length > 0 ? ` (${aFaire.length}, ${montantF(totalAFaire)})` : ""}
        </h2>
        {aFaire.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-carte)] bg-white px-5 py-8 text-center text-[0.9rem] text-gris-cadre">
            Aucun remboursement à faire.
          </p>
        ) : (
          <div className="mt-3">
            <RemboursementsAFaire remboursements={avecEcheance} />
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="titre-faits">
        <h2 id="titre-faits" className="font-display text-[1rem] font-bold uppercase tracking-tight">
          Faits
        </h2>
        {faits.length === 0 ? (
          <p className="mt-3 text-[0.88rem] text-gris-cadre">Aucun remboursement noté pour l&apos;instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-noir-piste/10 rounded-[var(--radius-carte)] bg-white px-4">
            {faits.map((remboursement) => (
              <li key={remboursement.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[0.86rem]">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {montantF(remboursement.montantXof)} à {remboursement.client.prenom} {remboursement.client.nom}
                  </p>
                  <p className="text-[0.78rem] text-gris-cadre">
                    Rendu {remboursement.faitLe ? instantEnClair(remboursement.faitLe) : ""}
                    {remboursement.faitPar ? `, par ${prenomDeAuteur(remboursement.faitPar)}` : ""} · {remboursement.motif}
                  </p>
                </div>
                <Link
                  href={`/admin/reservations?detail=${encodeURIComponent(remboursement.reference)}`}
                  className="lien-souligne cible-elargie font-mono text-[0.78rem]"
                >
                  {remboursement.reference}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {faits.length >= DERNIERS_FAITS && (
          <p className="mt-2 text-[0.78rem] text-gris-cadre">
            Les {DERNIERS_FAITS} derniers. Les plus anciens restent dans le{" "}
            <Link href="/admin/journal?type=remboursement-fait" className="lien-souligne">
              journal
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
