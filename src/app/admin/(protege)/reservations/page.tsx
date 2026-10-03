import type { Metadata } from "next";

import { CalendrierParc } from "@/components/admin/CalendrierParc";
import { Pastille } from "@/components/ui";
import { NettoyerPaniers } from "@/components/admin/NettoyerPaniers";
import { estEnAttente, paniersAbandonnes, seulementPayees } from "@/lib/reservations";
import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";
import { formatDate, formatPlageHoraire, formatXof, resumeOffre } from "@/lib/format";
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

/**
 * Toutes les réservations, avec le mouvement du jour en tête.
 *
 * L'écran s'ouvre sur ce qui est en attente d'un geste, vélos à remettre,
 * vélos à récupérer, puis déroule le calendrier du parc et la liste
 * complète, filtrable.
 *
 * La recherche couvre la référence, le client, l'email **et le nom du
 * vélo** : c'est ce dernier que vise le lien « Historique des sorties »
 * depuis la fiche d'une machine, qui sans cela ne renvoyait jamais rien.
 *
 * La colonne « Formule » a remplacé l'ancienne « Période » : les dates de
 * début et de fin sont toujours les mêmes, alors que la formule et son
 * dimensionnement, participants ou heures, distinguent réellement deux
 * réservations.
 */
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
  // consulte en ouvrant l'atelier le matin. Comme sur la fiche du jour et
  // le tableau de bord, on se fie à l'état et non aux dates : un vélo déjà
  // remis n'est plus à remettre.
  const actives = seulementPayees(reservations);
  // Les paniers restent visibles, mais comptés à part : tant que le
  // client n'a pas payé, ce n'est pas une réservation.
  const enAttente = reservations.filter(estEnAttente);
  const abandonnes = paniersAbandonnes(reservations);
  const departsDuJour = actives.filter((r) => r.dateDebut <= jour && r.statut === "CONFIRMEE");
  const retoursDuJour = actives.filter((r) => r.dateFin <= jour && r.statut === "EN_COURS");

  // Le nom du vélo fait partie de la recherche : c'est ce que vise le lien
  // « Historique des sorties » depuis la fiche d'un vélo, qui sans cela ne
  // renvoyait jamais rien.
  const filtrees = reservations
    .filter((r) => {
      if (!recherche) return true;
      const terme = recherche.toLowerCase();
      return (
        r.reference.toLowerCase().includes(terme) ||
        `${r.client.prenom} ${r.client.nom}`.toLowerCase().includes(terme) ||
        r.client.email.toLowerCase().includes(terme) ||
        r.lignes.some((ligne) => ligne.veloNom.toLowerCase().includes(terme))
      );
    })
    .filter((r) => (filtreStatut ? r.statut === filtreStatut : true))
    .slice(0, 60);

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Exploitation</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Réservations</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          {actives.length} réservation{actives.length > 1 ? "s" : ""}, dont{" "}
          {actives.filter((r) => r.statut === "EN_COURS").length} en cours aujourd&apos;hui.
          {enAttente.length > 0 && (
            <>
              {" "}
              {enAttente.length} panier{enAttente.length > 1 ? "s" : ""} en attente de paiement,
              vélo retenu.
            </>
          )}
          {abandonnes.length > 0 && (
            <>
              {" "}
              {abandonnes.length} panier{abandonnes.length > 1 ? "s" : ""} abandonné
              {abandonnes.length > 1 ? "s" : ""} : jamais payé
              {abandonnes.length > 1 ? "s" : ""}, le vélo est reparti à la location.
            </>
          )}
        </p>
        <NettoyerPaniers nombre={abandonnes.length} />
      </header>

      {/* Départs et retours du jour */}
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-carte)] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Vélos à remettre
          </h2>
          {departsDuJour.length === 0 ? (
            <p className="mt-4 text-[0.88rem] text-gris-cadre">
              Aucun vélo n&apos;attend d&apos;être remis.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {departsDuJour.map((reservation) => (
                <li key={reservation.id} className="flex items-baseline justify-between gap-4 text-[0.88rem]">
                  <span>
                    <strong className="font-semibold">
                      {reservation.client.prenom} {reservation.client.nom}
                    </strong>
                    <span className="block text-[0.78rem] text-gris-cadre">
                      {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")} ·{" "}
                      {resumeOffre(reservation)}
                      {reservation.offre === "location-libre" &&
                        ` · CIP + caution ${formatXof(reservation.cautionXof)} à réclamer`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.78rem] text-gris-cadre">
                    {reservation.reference}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[var(--radius-carte)] bg-white p-6">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Vélos à récupérer
          </h2>
          {retoursDuJour.length === 0 ? (
            <p className="mt-4 text-[0.88rem] text-gris-cadre">Aucun vélo dehors dont le retour soit échu.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {retoursDuJour.map((reservation) => (
                <li key={reservation.id} className="flex items-baseline justify-between gap-4 text-[0.88rem]">
                  <span>
                    <strong className="font-semibold">
                      {reservation.client.prenom} {reservation.client.nom}
                    </strong>
                    <span className="block text-[0.78rem] text-gris-cadre">
                      {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                      {reservation.cautionXof > 0 &&
                        ` · caution ${formatXof(reservation.cautionXof)} et CIP à rendre`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.78rem] text-gris-cadre">
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
      <section className="mt-8 rounded-[var(--radius-carte)] bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[1rem] font-bold uppercase tracking-tight">
            Toutes les réservations
          </h2>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="reference"
              defaultValue={recherche}
              placeholder="Référence, nom, email ou vélo"
              aria-label="Rechercher une réservation"
              className="h-9 w-56 rounded-full border border-noir-piste/20 px-4 text-[0.85rem]"
            />
            <select
              name="statut"
              defaultValue={filtreStatut}
              aria-label="Filtrer par statut"
              className="h-9 rounded-full border border-noir-piste/20 px-4 text-[0.85rem]"
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
              className="h-9 rounded-full bg-noir-piste px-5 text-[0.82rem] font-semibold text-craie"
            >
              Filtrer
            </button>
          </form>
        </div>

        {/* Sur téléphone, une fiche par réservation : le tableau fait
            860 px de large, et le statut comme le montant tombaient hors
            de l'écran, au bout d'une ligne qu'il fallait faire glisser. */}
        <ul className="mt-6 grid gap-3 md:hidden">
          {filtrees.map((reservation) => (
            <li
              key={reservation.id}
              className="rounded-[var(--radius-carte)] border border-noir-piste/12 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {reservation.client.prenom} {reservation.client.nom}
                  </p>
                  <p className="font-mono text-[0.76rem] text-gris-cadre">{reservation.reference}</p>
                </div>
                <Pastille ton={tons[reservation.statut]}>{libelles[reservation.statut]}</Pastille>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.84rem]">
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Date</dt>
                  <dd>
                    {formatDate(reservation.dateDebut)}
                    <span className="block text-[0.76rem] text-gris-cadre tabular-nums">
                      {formatPlageHoraire(reservation.heureDebut, reservation.heureFin)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Total</dt>
                  <dd className="font-semibold tabular-nums">{formatXof(reservation.totalXof)}</dd>
                </div>
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Vélo</dt>
                  <dd>{reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-[0.74rem] text-gris-cadre">Formule</dt>
                  <dd>
                    {resumeOffre(reservation)}
                    {reservation.cautionXof > 0 && (
                      <span className="block text-[0.76rem] text-gris-cadre">
                        caution {formatXof(reservation.cautionXof)} en espèces
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 break-all text-[0.76rem] text-gris-cadre">{reservation.client.email}</p>
            </li>
          ))}
          {filtrees.length === 0 && (
            <li className="py-8 text-center text-[0.9rem] text-gris-cadre">
              Aucune réservation ne correspond à cette recherche.
            </li>
          )}
        </ul>

        <div className="mt-6 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[54rem] border-collapse text-left text-[0.85rem]">
            <caption className="sr-only">Liste des réservations</caption>
            <thead>
              <tr className="border-b border-noir-piste/15 text-[0.72rem] uppercase tracking-[0.1em] text-gris-cadre">
                <th scope="col" className="py-3 pr-4 font-semibold">Référence</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Client</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Vélo</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Formule</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Date</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Total</th>
                <th scope="col" className="py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((reservation) => (
                <tr key={reservation.id} className="border-b border-noir-piste/8">
                  <td className="py-3 pr-4 font-mono text-[0.78rem]">{reservation.reference}</td>
                  <td className="py-3 pr-4">
                    {reservation.client.prenom} {reservation.client.nom}
                    <span className="block text-[0.76rem] text-gris-cadre">
                      {reservation.client.email}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {reservation.lignes.map((ligne) => ligne.veloNom).join(", ")}
                  </td>
                  <td className="py-3 pr-4">
                    {resumeOffre(reservation)}
                    {reservation.cautionXof > 0 && (
                      <span className="block text-[0.76rem] text-gris-cadre">
                        caution {formatXof(reservation.cautionXof)} en espèces
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {formatDate(reservation.dateDebut)}
                    {/* L'horaire compte autant que le jour depuis qu'un
                        même vélo sort plusieurs fois dans la journée. */}
                    <span className="block text-[0.76rem] text-gris-cadre tabular-nums">
                      {formatPlageHoraire(reservation.heureDebut, reservation.heureFin)}
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
            <p className="py-10 text-center text-[0.9rem] text-gris-cadre">
              Aucune réservation ne correspond à cette recherche.
            </p>
          )}
        </div>

        {reservations.length > filtrees.length && (
          <p className="mt-4 text-[0.8rem] text-gris-cadre">
            {filtrees.length} lignes affichées sur {reservations.length}, paniers compris.
            Affinez la recherche ou exportez en CSV depuis le tableau de bord pour la liste
            complète.
          </p>
        )}
      </section>
    </div>
  );
}
