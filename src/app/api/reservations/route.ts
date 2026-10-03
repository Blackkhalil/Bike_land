import { NextResponse } from "next/server";

import {
  DUREE_ROAD_TRIP_HEURES,
  FERMETURE_RESERVATIONS_HEURE,
  OUVERTURE_RESERVATIONS_HEURE,
  reouvertureReservations,
  reservationsOuvertes,
} from "@/data/offres";
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
 * 409 et son paiement est à rembourser, cas signalé explicitement plutôt
 * que masqué.
 */
export async function POST(requete: Request) {
  // Avant toute autre chose : hors des heures de réservation, rien n'est
  // créé. Le site prévient déjà, mais c'est ici que la règle tient, pour
  // une page restée ouverte depuis l'après-midi comme pour un appel
  // direct.
  if (!reservationsOuvertes()) {
    return NextResponse.json(
      {
        erreur:
          `Les réservations en ligne sont fermées de ${FERMETURE_RESERVATIONS_HEURE} h à ` +
          `${OUVERTURE_RESERVATIONS_HEURE} h. Elles rouvrent ${reouvertureReservations()}. ` +
          `Aucun montant n'a été prélevé.`,
        code: "FERME",
      },
      { status: 403 },
    );
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaReservation.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const donnees = analyse.data;

  // Contrôle avant toute écriture : sans moyen d'encaisser, on ne crée pas
  // de réservation qui resterait éternellement en attente de paiement.
  if (fournisseurActif() === "indisponible") {
    console.error("[reservations] aucune clé SasPay configurée : réservation refusée.");
    return NextResponse.json(
      {
        erreur:
          "Le paiement en ligne est momentanément indisponible. " +
          `Appelez-nous au ${site.telephone}, nous prenons votre réservation par téléphone.`,
      },
      { status: 503 },
    );
  }

  const velo = await depot.trouverVeloParId(donnees.veloId);
  if (!velo) {
    return NextResponse.json({ erreur: "Ce vélo n'existe pas." }, { status: 404 });
  }

  // L'heure de fin découle de la formule : le road trip dure le temps de
  // son créneau encadré, la location libre le nombre d'heures acheté.
  const heureFin =
    donnees.offre === "road-trip"
      ? donnees.heureDebut + DUREE_ROAD_TRIP_HEURES
      : donnees.heureDebut + (donnees.dureeHeures ?? 1);

  // Contrôle en amont : évite d'encaisser pour un créneau déjà pris. La
  // garantie réelle reste l'écriture, en transaction sérialisable.
  const libre = await depot.estDisponible(
    velo.id,
    donnees.dateDebut,
    donnees.dateFin,
    donnees.heureDebut,
    heureFin,
  );
  if (!libre) {
    return NextResponse.json(
      { erreur: "Ce vélo n'est plus libre sur ce créneau.", code: "INDISPONIBLE" },
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
      heureDebut: donnees.heureDebut,
      options: donnees.options,
      codeParrainage: donnees.codeParrainage || undefined,
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
      reference: reservation.reference,
      moyen: donnees.moyenPaiement,
      client: donnees.client,
    });

    const lienSuivi = `${site.url}/reservation/${token}`;
    const facture = numeroDeFacture(reservation);

    // La réservation vient d'être créée EN ATTENTE DE PAIEMENT. Elle
    // n'est confirmée, et les emails envoyés, que lorsque l'encaissement
    // est réellement abouti :
    //
    //  - en mode démonstration, `encaisser` répond REUSSI tout de suite,
    //    on confirme donc ici ;
    //  - avec SasPay, il répond EN_ATTENTE : la demande vient de partir
    //    sur le téléphone du client, qui doit la valider. La confirmation
    //    viendra ensuite de /api/paiement/saspay (que le navigateur
    //    interroge) ou du webhook, tous deux après vérification du
    //    paiement auprès de SasPay.
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
      // Paiement pas encore abouti : la demande est partie sur le
      // téléphone du client et attend sa validation.
      // On envoie tout de suite le lien de suivi, car c'est le seul
      // moment ou le jeton existe en clair, la base n'en garde que le
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
          // Rien de secret ne sort d'ici : seulement l'identifiant du
          // paiement SasPay, dont le navigateur a besoin pour demander
          // où en est la validation sur le téléphone du client.
          suivi: paiement.suivi,
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
