import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { creneauOctobreRose } from "@/data/octobre-rose";
import {
  DUREE_ROAD_TRIP_HEURES,
  FERMETURE_RESERVATIONS_HEURE,
  OUVERTURE_RESERVATIONS_HEURE,
  reouvertureReservations,
  reservationsOuvertes,
} from "@/data/offres";
import { identifiantAppelant } from "@/lib/anti-force-brute";
import { ConflitDisponibiliteError, depot } from "@/lib/db";
import { messagePlacesManquantes, type DemandeReservation } from "@/lib/db/contrat";
import {
  envoyerConfirmation,
  envoyerFacture,
  envoyerNotificationAdmin,
  envoyerReceptionDemande,
} from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { encaisser, fournisseurActif } from "@/lib/paiement";
import { estEnAttente } from "@/lib/reservations";
import { site } from "@/lib/site";
import {
  erreursParChamp,
  schemaInscriptionOctobreRose,
  schemaReservation,
} from "@/lib/validation";
import { lireOuverture, motifDeRefus, personnesMaxPour } from "@/lib/ouverture";

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
 *
 * Deux portes d'entrée, une seule suite : le tunnel, pour un vélo choisi
 * (road trip ou location libre), et l'inscription à Octobre rose, sans
 * vélo, que le dépôt attribue lui-même. Une fois la demande vérifiée,
 * l'écriture, l'encaissement et les emails sont les mêmes.
 */
export async function POST(requete: Request) {
  const corps: unknown = await requete.json().catch(() => null);
  const preparation =
    corps && typeof corps === "object" && (corps as { offre?: unknown }).offre === "octobre-rose"
      ? await preparerOctobreRose(corps, requete)
      : await preparerReservation(corps);
  if ("refus" in preparation) return preparation.refus;
  return creerEtEncaisser(preparation.demande);
}

type Preparation = { refus: NextResponse } | { demande: DemandeReservation };

/**
 * Contrôle avant toute écriture : sans moyen d'encaisser, on ne crée pas
 * de réservation qui resterait éternellement en attente de paiement.
 */
function paiementIndisponible(): NextResponse | null {
  if (fournisseurActif() !== "indisponible") return null;
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

/* ------------------------------------------------------- Le tunnel */

async function preparerReservation(corps: unknown): Promise<Preparation> {
  const analyse = schemaReservation.safeParse(corps);

  if (!analyse.success) {
    return {
      refus: NextResponse.json(
        { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
        { status: 422 },
      ),
    };
  }

  const donnees = analyse.data;

  // La nuit, aucun road trip n'est créé. Le site prévient déjà, mais
  // c'est ici que la règle tient, pour une page restée ouverte depuis
  // l'après-midi comme pour un appel direct. La location libre, elle, se
  // réserve à toute heure.
  if (donnees.offre === "road-trip" && !reservationsOuvertes()) {
    return {
      refus: NextResponse.json(
        {
          erreur:
            `Le road trip se réserve en ligne de ${OUVERTURE_RESERVATIONS_HEURE} h à ` +
            `${FERMETURE_RESERVATIONS_HEURE} h. La réservation rouvre ${reouvertureReservations()} ; ` +
            `la location libre, elle, reste ouverte. Aucun montant n'a été prélevé.`,
          code: "FERME",
        },
        { status: 403 },
      ),
    };
  }

  const indisponible = paiementIndisponible();
  if (indisponible) return { refus: indisponible };

  // Créneau ou jour fermé depuis le tableau de bord : complet, ou
  // volontairement retiré. Vérifié ici et non seulement à l'affichage,
  // une page restée ouverte pouvant encore le proposer.
  const refus = motifDeRefus(await lireOuverture(), donnees);
  if (refus) {
    return { refus: NextResponse.json({ erreur: refus, code: "COMPLET" }, { status: 409 }) };
  }

  const velo = await depot.trouverVeloParId(donnees.veloId);
  if (!velo) {
    return { refus: NextResponse.json({ erreur: "Ce vélo n'existe pas." }, { status: 404 }) };
  }

  // Une personne, un vélo : pas plus de personnes que de vélos de la
  // gamme. Vérifié ici, le compteur du site pouvant être contourné.
  const personnesMax = personnesMaxPour(velo, await depot.listerVelos());
  if (donnees.nombrePersonnes > personnesMax) {
    return {
      refus: NextResponse.json(
        {
          erreur:
            personnesMax === 1
              ? `Le ${velo.nom} est un exemplaire unique : il se réserve pour une seule personne.`
              : `Cette gamme compte ${personnesMax} vélos : ${personnesMax} personnes au plus.`,
          champs: { nombrePersonnes: "Trop de personnes pour ce vélo." },
        },
        { status: 422 },
      ),
    };
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
    return {
      refus: NextResponse.json(
        { erreur: "Ce vélo n'est plus libre sur ce créneau.", code: "INDISPONIBLE" },
        { status: 409 },
      ),
    };
  }

  return {
    demande: {
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
    },
  };
}

/* ------------------------------------------------------- Octobre rose */

/**
 * Inscriptions à Octobre rose acceptées par heure depuis une même
 * adresse. Large : derrière un opérateur mobile, beaucoup de clients
 * partagent la même adresse. Il borne seulement l'automate qui
 * retiendrait toute la sortie, sans payer, à répétition.
 */
const INSCRIPTIONS_PAR_HEURE = 12;

/** Les huit derniers chiffres d'un numéro : « +229 01 97… » et « 0197… » se reconnaissent. */
const finDeNumero = (telephone?: string) => (telephone ?? "").replace(/[^0-9]/g, "").slice(-8);

/**
 * L'inscription à Octobre rose : ni vélo, ni date, ni heure à vérifier,
 * ce sont ceux de la sortie fixée. Restent l'ouverture des inscriptions
 * (heure limite, et « Sold out » depuis le tableau de bord) et les places :
 * autant que de vélos libres sur le créneau de la sortie.
 *
 * Une inscription retient ses vélos le temps du paiement, jusqu'à cinq à
 * la fois. Deux garde-fous empêchent qu'on retienne la sortie sans payer :
 * une seule inscription en attente par email et par numéro (une demande
 * qui n'est pas arrivée se relance depuis le lien reçu par email, sans se
 * réinscrire), et un plafond par adresse.
 */
async function preparerOctobreRose(corps: unknown, requete: Request): Promise<Preparation> {
  const analyse = schemaInscriptionOctobreRose.safeParse(corps);
  if (!analyse.success) {
    return {
      refus: NextResponse.json(
        { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
        { status: 422 },
      ),
    };
  }
  const donnees = analyse.data;

  const creneau = creneauOctobreRose();
  if (!creneau) {
    return {
      refus: NextResponse.json(
        { erreur: "La sortie Octobre rose n'est pas encore ouverte à l'inscription.", code: "FERME" },
        { status: 403 },
      ),
    };
  }

  const indisponible = paiementIndisponible();
  if (indisponible) return { refus: indisponible };

  const refus = motifDeRefus(await lireOuverture(), {
    offre: "octobre-rose",
    dateDebut: creneau.date,
    dateFin: creneau.date,
    heureDebut: creneau.heureDebut,
  });
  if (refus) {
    return { refus: NextResponse.json({ erreur: refus, code: "COMPLET" }, { status: 409 }) };
  }

  let essais = 0;
  try {
    essais = await depot.compterEssai(`octobre-rose:${identifiantAppelant(requete)}`, 60 * 60);
  } catch (erreur) {
    // Compteur injoignable : on n'empêche pas une inscription pour autant.
    console.error("[reservations] compteur Octobre rose injoignable", erreur);
  }
  if (essais > INSCRIPTIONS_PAR_HEURE) {
    return {
      refus: NextResponse.json(
        {
          erreur:
            "Trop d'inscriptions depuis cette connexion en une heure. Réessayez plus tard, " +
            "ou écrivez-nous sur WhatsApp : nous vous inscrivons.",
          code: "TROP",
        },
        { status: 429 },
      ),
    };
  }

  // La même personne a déjà une inscription qui attend son paiement : elle
  // retient déjà ses vélos. On la renvoie vers elle au lieu d'en ouvrir une
  // seconde, qui en retiendrait autant.
  const email = donnees.client.email.trim().toLowerCase();
  const numero = finDeNumero(donnees.client.telephone);
  const enAttente = (
    await depot.listerReservations({
      statut: "EN_ATTENTE_PAIEMENT",
      depuis: creneau.date,
      jusqua: creneau.date,
    })
  ).find(
    (r) =>
      r.offre === "octobre-rose" &&
      estEnAttente(r) &&
      (r.client.email.toLowerCase() === email || (numero.length === 8 && finDeNumero(r.client.telephone) === numero)),
  );
  if (enAttente) {
    return {
      refus: NextResponse.json(
        {
          erreur:
            `Une inscription à votre nom attend déjà son paiement (${enAttente.reference}). ` +
            "Validez la demande sur votre téléphone, ou relancez-la depuis le lien reçu par email. " +
            "Sans paiement, elle se libère d'elle-même au bout de 30 minutes.",
          code: "EN_ATTENTE",
        },
        { status: 409 },
      ),
    };
  }

  // Contrôle en amont, comme pour un vélo choisi : la transaction qui écrit
  // attribue les vélos et refait le compte.
  const libres = await depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin);
  if (libres.length < donnees.nombrePersonnes) {
    return {
      refus: NextResponse.json(
        {
          erreur: messagePlacesManquantes(donnees.nombrePersonnes, libres.length),
          code: libres.length === 0 ? "COMPLET" : "PLACES",
          places: libres.length,
        },
        { status: 409 },
      ),
    };
  }

  return {
    demande: {
      offre: "octobre-rose",
      nombrePersonnes: donnees.nombrePersonnes,
      dateDebut: creneau.date,
      dateFin: creneau.date,
      heureDebut: creneau.heureDebut,
      options: [],
      client: {
        prenom: donnees.client.prenom,
        nom: donnees.client.nom,
        email: donnees.client.email,
        telephone: donnees.client.telephone,
      },
      moyenPaiement: donnees.moyenPaiement,
      message: donnees.message,
      cgvAcceptees: donnees.cgvAcceptees,
    },
  };
}

/* --------------------------------------------- Écriture et encaissement */

async function creerEtEncaisser(demande: DemandeReservation) {
  try {
    const resultat = await depot.creerReservation(demande);

    const { reservation, token } = resultat;

    // Les places d'Octobre rose viennent de baisser : les pages qui les
    // comptent se régénèrent à la visite suivante, sans attendre leur cache.
    // Rien de tout cela ne doit faire échouer une inscription enregistrée.
    if (demande.offre === "octobre-rose") {
      try {
        revalidatePath("/octobre-rose");
        revalidatePath("/produits");
      } catch (erreur) {
        console.warn("[reservations] pages Octobre rose non rafraîchies", erreur);
      }
    }

    const paiement = await encaisser({
      montantXof: reservation.totalXof,
      reference: reservation.reference,
      moyen: demande.moyenPaiement,
      client: demande.client,
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
      // Octobre rose : une autre inscription vient de prendre des vélos. Le
      // formulaire ajuste le nombre de places qu'il propose.
      const creneau = demande.offre === "octobre-rose" ? creneauOctobreRose() : null;
      const places = creneau
        ? (await depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin).catch(() => null))?.length
        : undefined;
      return NextResponse.json(
        { erreur: erreur.message, code: creneau ? "PLACES" : "INDISPONIBLE", places },
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
