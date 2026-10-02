import type { Metadata } from "next";

import { FicheDuJour } from "@/components/admin/FicheDuJour";
import { seulementPayees } from "@/lib/reservations";
import { depot } from "@/lib/db";
import { aujourdhui } from "@/lib/dates";

export const metadata: Metadata = { title: "La sortie du jour" };

/**
 * La fiche du jour.
 *
 * Le seul écran de l'espace d'exploitation pensé pour le terrain plutôt
 * que pour le bureau : c'est celui qu'on ouvre sur la route des Pêches,
 * au moment de remettre les vélos.
 *
 * Il ne montre que ce qui se passe aujourd'hui. Tout le reste, chiffres,
 * historique, tarifs, est à un clic, mais pas ici.
 */
export default async function PageAujourdhui() {
  const jour = aujourdhui();
  const reservations = await depot.listerReservations();

  // Le planning du jour ne montre que des sorties payées : un panier
  // non réglé n'amènera personne à l'atelier.
  const actives = seulementPayees(reservations);

  // Un départ reste à faire tant que le vélo n'est pas remis. Une
  // réservation qui devait partir hier et n'est jamais passée en
  // EN_COURS reste donc visible : c'est une anomalie à traiter, pas une
  // ligne à faire disparaître.
  const departs = actives
    .filter((r) => r.dateDebut <= jour && r.statut === "CONFIRMEE")
    // Dans l'ordre de la journée : le coordinateur lit cette liste de
    // haut en bas au fil des départs.
    .sort((a, b) =>
      a.dateDebut === b.dateDebut
        ? a.heureDebut - b.heureDebut
        : a.dateDebut < b.dateDebut
          ? -1
          : 1,
    );

  // Un retour est attendu dès que la date de fin est atteinte et que le
  // vélo est effectivement sorti.
  const retours = actives
    .filter((r) => r.statut === "EN_COURS" && r.dateFin <= jour)
    .sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1));

  return <FicheDuJour jour={jour} departs={departs} retours={retours} />;
}
