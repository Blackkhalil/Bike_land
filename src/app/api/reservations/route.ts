import { NextResponse } from "next/server";

import { ConflitDisponibiliteError, depot } from "@/lib/db";
import {
  envoyerConfirmation,
  envoyerFacture,
  envoyerNotificationAdmin,
  envoyerReceptionDemande,
} from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { encaisser, fournisseurActif } from "@/lib/paiement";
import { site } from "@/lib/site";
import { erreursParChamp, schemaReservation } from "@/lib/validation";

/**
 * Création d'une réservation.
 *
 * Enchaînement : validation → encaissement → écriture (qui refait la
 * vérification de disponibilité dans sa transaction) → emails.
 *
 * L'écriture est la dernière autorité sur la disponibilité : si deux
 * clients paient à la même seconde pour le même vélo, le second reçoit un
 * 409 et son paiement est à rembourser — cas signalé explicitement plutôt
 * que masqué.
 */
export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const analyse = schemaReservation.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const donnees = analyse.data;

  const velo = await depot.trouverVeloParId(donnees.veloId);
  if (!velo) {
    return NextResponse.json({ erreur: "Ce vélo n'existe pas." }, { status: 404 });
  }

  // Contrôle en amont : évite d'encaisser pour une période déjà prise.
  const libre = await depot.estDisponible(velo.id, donnees.dateDebut, donnees.dateFin);
  if (!libre) {
    return NextResponse.json(
      { erreur: "Ce vélo n'est plus libre sur ces dates.", code: "INDISPONIBLE" },
      { status: 409 },
    );
  }

  try {
    const resultat = await depot.creerReservation({
      veloId: velo.id,
      offre: donnees.offre,
      nombrePersonnes: donnees.nombrePersonnes,
      dureeHeures: donnees.dureeHeures,
      dateDebut: donnees.dateDebut,
      dateFin: donnees.dateFin,
      options: donnees.options,
      client: {
        prenom: donnees.client.prenom,
        nom: donnees.client.nom,
        email: donnees.client.email,
        telephone: donnees.client.telephone || undefined,
      },
      moyenPaiement: donnees.moyenPaiement,
      message: donnees.message,
      cgvAcceptees: donnees.cgvAcceptees,
    });

    const { reservation, token } = resultat;

    const paiement = await encaisser({
      montantXof: reservation.totalXof,
      moyen: donnees.moyenPaiement,
      reference: reservation.reference,
      description: `Location ${velo.nom} — ${reservation.reference}`,
      client: donnees.client,
      urlRetour: `${site.url}/reservation/${token}`,
    });

    const lienSuivi = `${site.url}/reservation/${token}`;
    const facture = numeroDeFacture(reservation);

    // La réservation vient d'être créée EN ATTENTE DE PAIEMENT. Elle
    // n'est confirmée, et les emails envoyés, que lorsque l'encaissement
    // est réellement abouti :
    //
    //  - en mode démonstration, `encaisser` répond REUSSI tout de suite,
    //    on confirme donc ici ;
    //  - avec un vrai agrégateur, il répond EN_ATTENTE et redirige le
    //    client vers sa page de paiement. C'est alors le webhook signé
    //    qui confirmera, une fois l'argent reçu.
    //
    // Confirmer ici sans vérifier reviendrait à donner un vélo à qui
    // n'a pas payé.
    let confirmee = false;
    if (paiement.statut === "REUSSI") {
      const resultat = await depot.confirmerPaiement(
        reservation.reference,
        paiement.referenceTransaction,
      );
      confirmee = Boolean(resultat && !resultat.dejaConfirmee);
      if (resultat && !resultat.dejaConfirmee) {
        // Les emails ne doivent jamais faire échouer une réservation
        // déjà enregistrée et payée : on les tente, on journalise.
        await Promise.allSettled([
          envoyerConfirmation(resultat.reservation, lienSuivi),
          envoyerFacture(resultat.reservation, facture, lienSuivi),
          envoyerNotificationAdmin(resultat.reservation),
        ]);
      }
    } else {
      // Paiement pas encore abouti : le client part chez l'agregateur.
      // On lui envoie tout de suite son lien de suivi, car c'est le seul
      // moment ou le jeton existe en clair — la base n'en garde que le
      // hache, et le webhook qui confirmera ne pourra pas le reconstituer.
      await Promise.allSettled([envoyerReceptionDemande(reservation, lienSuivi)]);
    }

    return NextResponse.json(
      {
        reference: reservation.reference,
        token,
        lienSuivi,
        facture,
        confirmee,
        paiement: {
          statut: paiement.statut,
          fournisseur: paiement.fournisseur,
          urlPaiement: paiement.urlPaiement,
          message: paiement.message,
        },
        modeDemonstration: fournisseurActif() === "demo",
      },
      { status: 201 },
    );
  } catch (erreur) {
    if (erreur instanceof ConflitDisponibiliteError) {
      return NextResponse.json(
        { erreur: erreur.message, code: "INDISPONIBLE" },
        { status: 409 },
      );
    }
    console.error("[reservations] échec de création", erreur);
    return NextResponse.json(
      { erreur: "La réservation n'a pas pu être enregistrée. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
