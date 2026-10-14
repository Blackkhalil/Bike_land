import { formatHeure } from "@/data/offres";
import { formatDate } from "@/lib/format";

import type { CreneauProposable } from "./TunnelReservation";

/**
 * Un départ fermé par l'exploitant, affiché « Sold out » à sa place dans
 * la liste des départs, et qu'on ne peut pas choisir.
 *
 * Fermer un départ dans le tableau de bord, c'est dire qu'il est plein :
 * le client voit la sortie, complète, plutôt que de la croire supprimée
 * (voir `departsComplets`).
 */
export function DepartComplet({ depart }: { depart: CreneauProposable }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-bouton)] border border-noir-piste/12 bg-craie-ombre/50 px-4 py-3 text-left text-gris-cadre">
      <span className="min-w-0">
        <span className="block font-semibold">
          {depart.libelle} {formatDate(depart.date)}
        </span>
        <span className="mt-0.5 block text-[0.78rem]">
          {formatHeure(depart.heureDebut)} - {formatHeure(depart.heureFin)}
          {depart.produit && ` · ${depart.produit}`}
        </span>
      </span>
      <span className="shrink-0 rounded-[var(--radius-bouton)] bg-noir-piste px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-craie">
        Sold out
      </span>
    </div>
  );
}

/**
 * Les départs ouverts et les départs « Sold out », mêlés dans l'ordre des
 * dates : celui du samedi plein précède le dimanche ouvert.
 */
export function departsDansLOrdre(ouverts: CreneauProposable[], complets: CreneauProposable[]) {
  return [
    ...ouverts.map((depart) => ({ depart, complet: false })),
    ...complets.map((depart) => ({ depart, complet: true })),
  ].sort((a, b) => a.depart.date.localeCompare(b.depart.date));
}
