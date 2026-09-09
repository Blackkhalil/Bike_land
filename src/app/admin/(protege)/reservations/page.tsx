import type { Metadata } from "next";

import { CalendrierParc } from "@/components/admin/CalendrierParc";
import { Pastille } from "@/components/ui";
import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";
import { formatDate, formatXof } from "@/lib/format";
import type { StatutReservation } from "@/lib/types";

export const metadata: Metadata = { title: "Réservations" };

const tons: Record<StatutReservation, "succes" | "info" | "alerte" | "neutre"> = {
  EN_ATTENTE_PAIEMENT: "alerte",
  CONFIRMEE: "succes",
  EN_COURS: "info",
  TERMINEE: "neutre",
  ANNULEE: "alerte",
};

const libelles: Record<StatutReservation, string> = {
  EN_ATTENTE_PAIEMENT: "À payer",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

type Recherche = Promise<Record<string, string | string[] | undefined>>;

export default async function PageReservationsAdmin({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;
  const recherche = typeof parametres.reference === "string" ? parametres.reference.trim() : "";
  const filtreStatut = typeof parametres.statut === "string" ? parametres.statut : "";

  const [reservations, velos] = await Promise.all([
    depot.listerReservations(),
    depot.listerVelos(),
  ]);

  const jour = aujourdhui();

  // Les départs et retours du jour d'abord : c'est ce que l'exploitant
  // consulte en ouvrant l'atelier le matin.
  const departsDuJour = reservations.filter((r) => r.dateDebut === jour && r.statut !== "ANNULEE");
  const retoursDuJour = reservations.filter((r) => r.dateFin === jour && r.statut !== "ANNULEE");

  const filtrees = reservations
    .filter((r) =>
      recherche
        ? r.reference.toLowerCase().includes(recherche.toLowerCase()) ||
          `${r.client.prenom} ${r.client.nom}`.toLowerCase().includes(recherche.toLowerCase()) ||
          r.client.email.toLowerCase().includes(recherche.toLowerCase())
        : true,
    )
    .filter((r) => (filtreStatut ? r.statut === filtreStatut : true))
    .slice(0, 60);

  return (
    <div>
      <header>
        <p className="etiquette opacity-55">Exploitation</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Réservations</h1>
        <p className="mt-2 text-[0.88rem] text-encre-500">
          {reservations.length} réservations enregistrées, dont{" "}
          {reservations.filter((r) => r.statut === "EN_COURS").length} en cours aujourd&apos;hui.
        </p>
      </header>

      {/* Départs et retours du jour */}
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.25rem] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Départs aujourd&apos;hui
          </h2>
          {departsDuJour.length === 0 ? (
            <p className="mt-4 text-[0.88rem] text-encre-500">Aucun départ prévu.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {departsDuJour.map((reservation) => (
                <li key={reservation.id} className="flex items-baseline justify-between gap-4 text-[0.88rem]">
                  <span>
                    <strong className="font-semibold">
                      {reservation.client.prenom} {reservation.client.nom}
                    </strong>
                    <span className="block text-[0.78rem] text-encre-500">
                      {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")} · retour le{" "}
                      {formatDate(reservation.dateFin)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.78rem] text-encre-500">
                    {reservation.reference}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[1.25rem] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Retours aujourd&apos;hui
          </h2>
          {retoursDuJour.length === 0 ? (
            <p className="mt-4 text-[0.88rem] text-encre-500">Aucun retour prévu.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {retoursDuJour.map((reservation) => (
                <li key={reservation.id} className="flex items-baseline justify-between gap-4 text-[0.88rem]">
                  <span>
                    <strong className="font-semibold">
                      {reservation.client.prenom} {reservation.client.nom}
                    </strong>
                    <span className="block text-[0.78rem] text-encre-500">
                      {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                      {reservation.cautionXof > 0 &&
                        ` · caution ${formatXof(reservation.cautionXof)} à libérer`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.78rem] text-encre-500">
                    {reservation.reference}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8">
        <CalendrierParc velos={velos} reservations={reservations} />
      </section>

      {/* Liste filtrable */}
      <section className="mt-8 rounded-[1.25rem] bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Toutes les réservations
          </h2>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="reference"
              defaultValue={recherche}
              placeholder="Référence, nom ou email"
              aria-label="Rechercher une réservation"
              className="h-9 w-56 rounded-full border border-encre-900/20 px-4 text-[0.85rem]"
            />
            <select
              name="statut"
              defaultValue={filtreStatut}
              aria-label="Filtrer par statut"
              className="h-9 rounded-full border border-encre-900/20 px-4 text-[0.85rem]"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(libelles).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-full bg-encre-900 px-5 text-[0.82rem] font-semibold text-sable-50"
            >
              Filtrer
            </button>
          </form>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse text-left text-[0.85rem]">
            <caption className="sr-only">Liste des réservations</caption>
            <thead>
              <tr className="border-b border-encre-900/15 text-[0.72rem] uppercase tracking-[0.1em] text-encre-500">
                <th scope="col" className="py-3 pr-4 font-semibold">Référence</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Client</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Vélo</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Période</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Total</th>
                <th scope="col" className="py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((reservation) => (
                <tr key={reservation.id} className="border-b border-encre-900/8">
                  <td className="py-3 pr-4 font-mono text-[0.78rem]">{reservation.reference}</td>
                  <td className="py-3 pr-4">
                    {reservation.client.prenom} {reservation.client.nom}
                    <span className="block text-[0.76rem] text-encre-500">
                      {reservation.client.email}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {formatDate(reservation.dateDebut)}
                    <span className="block text-[0.76rem] text-encre-500">
                      {reservation.jours} jour{reservation.jours > 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatXof(reservation.totalXof)}
                  </td>
                  <td className="py-3">
                    <Pastille ton={tons[reservation.statut]}>{libelles[reservation.statut]}</Pastille>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtrees.length === 0 && (
            <p className="py-10 text-center text-[0.9rem] text-encre-500">
              Aucune réservation ne correspond à cette recherche.
            </p>
          )}
        </div>

        {reservations.length > filtrees.length && (
          <p className="mt-4 text-[0.8rem] text-encre-500">
            {filtrees.length} réservations affichées sur {reservations.length}. Affinez la
            recherche ou exportez en CSV depuis le tableau de bord pour la liste complète.
          </p>
        )}
      </section>
    </div>
  );
}
