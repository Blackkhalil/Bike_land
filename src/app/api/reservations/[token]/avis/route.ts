import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { erreursParChamp, schemaAvis } from "@/lib/validation";

type Params = Promise<{ token: string }>;

/**
 * Avis d'un client sur sa sortie.
 *
 * Le lien de suivi vaut autorisation : seul son porteur peut noter la
 * sortie, et il ne peut noter que la sienne. C'est ce qui distingue ces
 * avis d'un formulaire public, chacun correspond à une location payée
 * et réellement faite.
 *
 * L'avis n'apparaît pas tout de suite sur le site : quelqu'un le relit
 * d'abord depuis l'espace d'exploitation.
 */
export async function POST(requete: Request, { params }: { params: Params }) {
  const { token } = await params;
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));

  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }

  // Un avis note un vélo, et paraît sur sa fiche. Le vélo d'Octobre rose
  // n'a pas été choisi, mais attribué : l'avis noterait une machine au
  // hasard. La sortie ne se note donc pas ici.
  if (reservation.offre === "octobre-rose") {
    return NextResponse.json(
      { erreur: "La sortie Octobre rose ne se note pas ici : écrivez-nous, votre retour nous fera plaisir." },
      { status: 409 },
    );
  }

  if (reservation.statut !== "TERMINEE") {
    return NextResponse.json(
      { erreur: "Vous pourrez noter cette sortie une fois le vélo rendu." },
      { status: 409 },
    );
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaAvis.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Avis incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const avis = await depot.enregistrerAvis({
    reference: reservation.reference,
    note: analyse.data.note,
    titre: analyse.data.titre || undefined,
    commentaire: analyse.data.commentaire || undefined,
  });

  if (!avis) {
    return NextResponse.json(
      { erreur: "Cet avis n'a pas pu être enregistré." },
      { status: 409 },
    );
  }

  return NextResponse.json({ note: avis.note, publie: avis.publie }, { status: 201 });
}
