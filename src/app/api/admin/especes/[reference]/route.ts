import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { auteurAdmin } from "@/lib/journal";
import { formatMontant } from "@/lib/offres";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { erreursParChamp, schemaModificationVente } from "@/lib/validation";

/**
 * Modifier une vente en espèces déjà enregistrée, même ancienne (demande du
 * responsable du 19 novembre 2026). Réservé à l'administration.
 *
 * Seuls les champs envoyés changent : le client, l'agent qui a encaissé, et
 * pour une vente au comptoir classique le nombre de personnes (de vélos en
 * location libre), le jour, l'heure et la durée, là où la vente d'origine
 * les laissait choisir. Une offre de groupe ne change que de client et
 * d'agent : son prix vient du moteur des offres.
 *
 * Le serveur recalcule le prix comme à la vente quand le nombre ou la durée
 * changent, quand le jour change là où il fixe le prix, ou quand
 * `remettreAuPrixDuComptoir` le demande (une vente ancienne enregistrée au
 * prix en ligne). Il revoit les vélos du créneau, et écrit au journal qui a
 * modifié quoi, l'avant et l'après.
 * `totalAttenduXof` est le total que l'écran montrait : si la vente a
 * changé depuis, 409 et rien n'est écrit. `nouveauTotalXof` est le nouveau
 * montant affiché : le serveur doit trouver le même (409 sinon), c'est lui
 * que le commercial a annoncé au client.
 *
 * Aucun email ne part : le client garde sa facture, le journal garde la trace.
 */
export const maxDuration = 30;

export async function PATCH(requete: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const reference = (await params).reference.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(reference)) {
    return NextResponse.json({ erreur: "Référence invalide." }, { status: 422 });
  }

  const corps: unknown = await requete.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }
  const analyse = schemaModificationVente.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Modification incomplète : vérifiez les champs signalés.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }
  const { modifiePar, ...modification } = analyse.data;

  let resultat;
  try {
    resultat = await depot.modifierVenteEspeces(reference, { ...modification, par: auteurAdmin(modifiePar) });
  } catch (erreur) {
    console.error("[admin/especes] modification non enregistrée", erreur);
    return NextResponse.json(
      { erreur: "La modification n'a pas pu être enregistrée. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  if (!resultat.ok) {
    switch (resultat.raison) {
      case "introuvable":
        return NextResponse.json({ erreur: "Vente en espèces introuvable." }, { status: 404 });
      case "annulee":
        return NextResponse.json(
          { erreur: "Cette vente est annulée : elle ne se modifie plus.", code: "ANNULEE" },
          { status: 409 },
        );
      case "changee":
        return NextResponse.json(
          {
            erreur: "Cette vente a changé entre-temps. Fermez, puis rouvrez-la pour repartir du montant à jour.",
            code: "CHANGEE",
            totalXof: resultat.totalXof,
          },
          { status: 409 },
        );
      case "montant":
        return NextResponse.json(
          {
            erreur:
              `Le nouveau montant est de ${formatMontant(resultat.totalXof)}, et non ${formatMontant(modification.nouveauTotalXof)}. ` +
              "Vérifiez avec le client, puis enregistrez à nouveau.",
            code: "MONTANT",
            totalXof: resultat.totalXof,
          },
          { status: 409 },
        );
      case "velos":
        return NextResponse.json({ erreur: resultat.message, code: "PLACES" }, { status: 409 });
      case "saisie":
        return NextResponse.json(
          { erreur: "Modification impossible : vérifiez les champs signalés.", champs: resultat.champs },
          { status: 422 },
        );
    }
  }

  // Des vélos rendus ou pris : le site public relit ses créneaux.
  if (!resultat.deja) await rafraichirSitePublic();

  const { reservation, avant } = resultat;
  return NextResponse.json({
    reference: reservation.reference,
    deja: resultat.deja,
    ancienTotalXof: avant.totalXof,
    totalXof: reservation.totalXof,
    differenceXof: reservation.totalXof - avant.totalXof,
    nombrePersonnes: reservation.nombrePersonnes,
    dateDebut: reservation.dateDebut,
    heureDebut: reservation.heureDebut,
    heureFin: reservation.heureFin,
    velos: reservation.lignes.map((ligne) => ligne.veloNom),
    velosRetires: resultat.velosRetires,
    velosAjoutes: resultat.velosAjoutes,
    modifieeLe: resultat.evenement?.creeLe ?? null,
  });
}
