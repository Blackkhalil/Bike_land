import type { Metadata } from "next";

import { Pastille } from "@/components/ui";
import { exigerSessionAdmin } from "@/lib/admin";
import { seulementPayees } from "@/lib/reservations";
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
 * « Total dépensé » ne compte que ce qui a été réellement payé, en ligne
 * ou au comptoir : les cautions de location libre, remises en espèces au
 * départ et rendues au retour, n'y figurent pas, ce n'est pas du chiffre
 * d'affaires.
 *
 * Le nom et le téléphone affichés sont ceux de la dernière réservation
 * payée. La fiche, elle, garde ceux de la toute première réservation, qui
 * pouvait être celle d'un inconnu ayant réservé avec l'adresse d'un autre
 * sans jamais payer.
 *
 * Le pavé de bas de page rappelle les durées de conservation : ce sont
 * des obligations, pas une décoration.
 */
export default async function PageClientsAdmin({ searchParams }: { searchParams: Recherche }) {
  await exigerSessionAdmin();
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
      const facturees = seulementPayees(siennes);
      const total = facturees.reduce((somme, reservation) => somme + reservation.totalXof, 0);
      // La dernière location est celle qu'il a payée. Un panier
      // abandonné n'est pas une venue à l'atelier.
      const derniere = facturees
        .map((reservation) => reservation.dateDebut)
        .sort()
        .at(-1);

      // On ne compte que les vraies annulations. Soustraire les payées
      // du total ferait passer pour un annulateur celui qui a seulement
      // renoncé avant de payer, ce qui n'engage personne.
      const annulations = siennes.filter(
        (reservation) => reservation.statut === "ANNULEE",
      ).length;

      // Le contact de la dernière réservation payée, à défaut la fiche.
      const instant = (reservation: (typeof facturees)[number]) => reservation.confirmeLe ?? reservation.creeLe;
      const derniereReglee = [...facturees].sort((a, b) => (instant(a) < instant(b) ? 1 : -1))[0];
      const contact = derniereReglee?.client ?? client;

      return { client, contact, nombre: facturees.length, total, derniere, annulations };
    })
    .filter((fiche) => fiche.nombre > 0)
    .filter((fiche) =>
      recherche
        ? `${fiche.contact.prenom} ${fiche.contact.nom} ${fiche.client.prenom} ${fiche.client.nom} ${fiche.client.email}`
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

        <form method="get" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom ou email"
            aria-label="Rechercher un client"
            className="h-9 min-w-0 flex-1 rounded-full border border-noir-piste/20 px-4 text-[0.85rem] sm:w-56 sm:flex-none"
          />
          <button
            type="submit"
            className="h-9 rounded-full bg-noir-piste px-5 text-[0.82rem] font-semibold text-craie"
          >
            Chercher
          </button>
        </form>
      </header>

      {/* Sur téléphone, une fiche par client plutôt qu'un tableau de
          770 px qu'il faudrait faire glisser. */}
      <ul className="mt-8 grid gap-3 md:hidden">
        {fiches.slice(0, 80).map((fiche) => (
          <li
            key={fiche.client.id}
            className="rounded-[var(--radius-carte)] border border-noir-piste/12 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">
                {fiche.contact.prenom} {fiche.contact.nom}
              </p>
              {fiche.nombre > 2 ? (
                <Pastille ton="succes">Fidèle</Pastille>
              ) : fiche.nombre > 1 ? (
                <Pastille ton="info">Récurrent</Pastille>
              ) : (
                <Pastille ton="neutre">Première fois</Pastille>
              )}
            </div>
            <p className="mt-0.5 break-all text-[0.8rem] text-gris-cadre">{fiche.client.email}</p>
            {fiche.contact.telephone && (
              <a
                href={`tel:${fiche.contact.telephone.replace(/\s+/g, "")}`}
                className="cible-elargie mt-0.5 inline-block text-[0.84rem] font-semibold text-orange-sourd"
              >
                {fiche.contact.telephone}
              </a>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-x-3 text-[0.82rem]">
              <div>
                <dt className="text-[0.72rem] text-gris-cadre">Locations</dt>
                <dd className="font-semibold tabular-nums">{fiche.nombre}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] text-gris-cadre">Dépensé</dt>
                <dd className="font-semibold tabular-nums">{formatXof(fiche.total)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] text-gris-cadre">Dernière</dt>
                <dd>{fiche.derniere ? formatDate(fiche.derniere) : "jamais"}</dd>
              </div>
            </dl>
          </li>
        ))}
        {fiches.length === 0 && (
          <li className="py-8 text-center text-[0.9rem] text-gris-cadre">
            Aucun client ne correspond à cette recherche.
          </li>
        )}
      </ul>

      <div className="mt-8 hidden overflow-x-auto rounded-[var(--radius-carte)] bg-white p-6 md:block">
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
                  {fiche.contact.prenom} {fiche.contact.nom}
                </td>
                <td className="py-3 pr-4 text-gris-cadre">
                  {fiche.client.email}
                  {fiche.contact.telephone && (
                    <span className="block text-[0.78rem]">{fiche.contact.telephone}</span>
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
