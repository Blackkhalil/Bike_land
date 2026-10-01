import type { Metadata } from "next";

import { Pastille } from "@/components/ui";
import { depot } from "@/lib/db";
import { formatDate, formatNombre, formatXof } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

/**
 * La base clients.
 *
 * Elle n'est jamais saisie : elle se constitue toute seule, une fiche par
 * adresse email rencontrée lors d'une réservation. Le client n'ouvre
 * aucun compte et ne choisit aucun mot de passe, c'est un parti pris du
 * parcours de réservation, et cet écran en est la conséquence.
 *
 * « Total dépensé » ne compte que ce qui a été réellement payé en ligne :
 * les cautions de location libre, remises en espèces au départ et rendues
 * au retour, n'y figurent pas, ce n'est pas du chiffre d'affaires.
 *
 * Le pavé de bas de page rappelle les durées de conservation : ce sont
 * des obligations, pas une décoration.
 */
export default async function PageClientsAdmin({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;
  const recherche = typeof parametres.q === "string" ? parametres.q.trim().toLowerCase() : "";

  const [clients, reservations] = await Promise.all([
    depot.listerClients(),
    depot.listerReservations(),
  ]);

  // La base clients se constitue à chaque réservation, sans compte (§2.2).
  const fiches = clients
    .map((client) => {
      const siennes = reservations.filter((reservation) => reservation.clientId === client.id);
      const facturees = siennes.filter((reservation) => reservation.statut !== "ANNULEE");
      const total = facturees.reduce((somme, reservation) => somme + reservation.totalXof, 0);
      const derniere = siennes
        .map((reservation) => reservation.dateDebut)
        .sort()
        .at(-1);

      return { client, nombre: facturees.length, total, derniere, annulations: siennes.length - facturees.length };
    })
    .filter((fiche) => fiche.nombre > 0)
    .filter((fiche) =>
      recherche
        ? `${fiche.client.prenom} ${fiche.client.nom} ${fiche.client.email}`
            .toLowerCase()
            .includes(recherche)
        : true,
    )
    .sort((a, b) => b.total - a.total);

  const recurrents = fiches.filter((fiche) => fiche.nombre > 1).length;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiquette opacity-75">Exploitation</p>
          <h1 className="titre-editorial mt-3 text-[2rem]">Clients</h1>
          <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
            {formatNombre(fiches.length)} clients, dont {formatNombre(recurrents)} sont revenus au
            moins une fois. La fiche se crée automatiquement à la première réservation : aucun
            compte n&apos;est demandé au client.
          </p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom ou email"
            aria-label="Rechercher un client"
            className="h-9 w-56 rounded-full border border-noir-piste/20 px-4 text-[0.85rem]"
          />
          <button
            type="submit"
            className="h-9 rounded-full bg-noir-piste px-5 text-[0.82rem] font-semibold text-craie"
          >
            Chercher
          </button>
        </form>
      </header>

      <div className="mt-8 overflow-x-auto rounded-[var(--radius-carte)] bg-white p-6">
        <table className="w-full min-w-[48rem] border-collapse text-left text-[0.85rem]">
          <caption className="sr-only">Base clients constituée à partir des réservations</caption>
          <thead>
            <tr className="border-b border-noir-piste/15 text-[0.72rem] uppercase tracking-[0.1em] text-gris-cadre">
              <th scope="col" className="py-3 pr-4 font-semibold">Client</th>
              <th scope="col" className="py-3 pr-4 font-semibold">Contact</th>
              <th scope="col" className="py-3 pr-4 text-right font-semibold">Locations</th>
              <th scope="col" className="py-3 pr-4 text-right font-semibold">Total dépensé</th>
              <th scope="col" className="py-3 pr-4 font-semibold">Dernière location</th>
              <th scope="col" className="py-3 font-semibold">Profil</th>
            </tr>
          </thead>
          <tbody>
            {fiches.slice(0, 80).map((fiche) => (
              <tr key={fiche.client.id} className="border-b border-noir-piste/8">
                <td className="py-3 pr-4 font-semibold">
                  {fiche.client.prenom} {fiche.client.nom}
                </td>
                <td className="py-3 pr-4 text-gris-cadre">
                  {fiche.client.email}
                  {fiche.client.telephone && (
                    <span className="block text-[0.78rem]">{fiche.client.telephone}</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{fiche.nombre}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{formatXof(fiche.total)}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {fiche.derniere ? formatDate(fiche.derniere) : "jamais"}
                </td>
                <td className="py-3">
                  {fiche.nombre > 2 ? (
                    <Pastille ton="succes">Fidèle</Pastille>
                  ) : fiche.nombre > 1 ? (
                    <Pastille ton="info">Récurrent</Pastille>
                  ) : (
                    <Pastille ton="neutre">Première fois</Pastille>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {fiches.length === 0 && (
          <p className="py-10 text-center text-[0.9rem] text-gris-cadre">
            Aucun client ne correspond à cette recherche.
          </p>
        )}
      </div>

      <p className="mt-6 rounded-[var(--radius-carte)] border border-noir-piste/12 p-6 text-[0.85rem] leading-relaxed text-gris-cadre">
        Ces données sont conservées trois ans après la dernière location, et les pièces
        comptables dix ans. Toute demande de suppression reçue à l&apos;adresse de contact doit
        être traitée sous trente jours, conformément à la réglementation béninoise sur les
        données à caractère personnel.
      </p>
    </div>
  );
}
