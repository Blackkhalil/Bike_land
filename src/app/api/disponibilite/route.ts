import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { schemaDisponibilite } from "@/lib/validation";

/**
 * Combien de vélos d'une gamme sont libres sur un créneau.
 *
 * Appelée par le tunnel de réservation à chaque changement de jour,
 * d'heure ou de durée : c'est le plafond du nombre de personnes, ou de
 * vélos, qu'il propose, et zéro veut dire que la gamme est complète à
 * cette heure. Une page ouverte avant que le site ne fasse choisir une
 * gamme envoie encore un vélo précis : on répond alors pour lui et sa
 * gamme. La garantie réelle contre la double réservation reste côté
 * écriture.
 */
export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const analyse = schemaDisponibilite.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }

  const { veloId, dateDebut, dateFin, heureDebut, heureFin } = analyse.data;
  if (dateDebut > dateFin) {
    return NextResponse.json({ erreur: "Période invalide." }, { status: 400 });
  }

  try {
    const velo = veloId ? await depot.trouverVeloParId(veloId) : null;
    const gamme = velo ? velo.gamme : analyse.data.gamme;
    const [veloLibre, libres] = await Promise.all([
      velo ? depot.estDisponible(velo.id, dateDebut, dateFin, heureDebut, heureFin) : Promise.resolve(true),
      depot.velosLibres(dateDebut, heureDebut, heureFin),
    ]);
    const libresGamme = gamme ? libres.filter((autre) => autre.gamme === gamme).length : 0;
    return NextResponse.json({ disponible: velo ? veloLibre : libresGamme > 0, libresGamme });
  } catch (erreur) {
    // La base n'a pas répondu, même après les reprises. On ne prétend
    // surtout pas que la gamme est libre : l'appelant doit savoir que la
    // question est restée sans réponse, et réessayer.
    console.error("[disponibilite] vérification impossible", erreur);
    return NextResponse.json(
      { erreur: "Vérification impossible pour le moment. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}
