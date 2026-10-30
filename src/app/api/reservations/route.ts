import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { creneauOctobreRose, OCTOBRE_ROSE, sortieOctobreRoseDu } from "@/data/octobre-rose";
import {
  DUREE_ROAD_TRIP_HEURES,
  FERMETURE_RESERVATIONS_HEURE,
  OUVERTURE_RESERVATIONS_HEURE,
  reouvertureReservations,
  reservationsOuvertes,
} from "@/data/offres";
import { identifiantAppelant } from "@/lib/anti-force-brute";
import { ConflitDisponibiliteError, depot } from "@/lib/db";
import { messagePlacesManquantes, messageVelosManquants, type DemandeReservation } from "@/lib/db/contrat";
import {
  envoyerConfirmation,
  envoyerFacture,
  envoyerNotificationAdmin,
  envoyerReceptionDemande,
} from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { formatDateAvecJour } from "@/lib/format";
import { encaisser, fournisseurActif } from "@/lib/paiement";
import { estEnAttente } from "@/lib/reservations";
import { site } from "@/lib/site";
import {
  erreursParChamp,
  schemaInscriptionOctobreRose,
  schemaReservation,
} from "@/lib/validation";
import {
  lireOuverture,
  motifDeRefus,
  refusInscriptionOctobreRose,
} from "@/lib/ouverture";

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

  // Un vélo précis : seulement depuis un tunnel ouvert avant que le site ne
  // fasse choisir une gamme. Sinon, la gamme choisie, dont les vélos sont
  // attribués à l'écriture.
  const velo = donnees.veloId ? await depot.trouverVeloParId(donnees.veloId) : null;
  if (donnees.veloId && !velo) {
    return { refus: NextResponse.json({ erreur: "Ce vélo n'existe pas." }, { status: 404 }) };
  }
  const gamme = velo ? velo.gamme : donnees.gamme!;

  // L'heure de fin découle de la formule : le road trip dure le temps de
  // son créneau encadré, la location libre le nombre d'heures acheté.
  const heureFin =
    donnees.offre === "road-trip"
      ? donnees.heureDebut + DUREE_ROAD_TRIP_HEURES
      : donnees.heureDebut + (donnees.dureeHeures ?? 1);

  // Un vélo par personne, de la gamme choisie : pas plus de vélos qu'il
  // n'en reste de cette gamme, libres à cette heure, et au moins un. Vérifié
  // ici, le compteur du site pouvant être contourné ; l'écriture revérifie,
  // en transaction, au moment d'attribuer les vélos.
  if (!velo || donnees.nombrePersonnes > 1) {
    const libresGamme = (await depot.velosLibres(donnees.dateDebut, donnees.heureDebut, heureFin)).filter(
      (autre) => autre.gamme === gamme,
    ).length;
    if (donnees.nombrePersonnes > libresGamme) {
      return {
        refus: NextResponse.json(
          {
            erreur: messageVelosManquants(gamme, libresGamme),
            code: libresGamme === 0 ? "INDISPONIBLE" : "PLACES",
            places: libresGamme,
          },
          { status: 409 },
        ),
      };
    }
  }

  // Contrôle en amont du vélo précis : évite d'encaisser pour un créneau
  // déjà pris. La garantie réelle reste l'écriture, en transaction
  // sérialisable.
  if (velo) {
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
  }

  return {
    demande: {
      ...(velo ? { veloId: velo.id } : { gamme }),
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
 * L'inscription à Octobre rose : ni vélo ni heure à vérifier, ce sont ceux
 * de la sortie du jour choisi. Restent, pour ce jour-là seulement,
 * l'ouverture des inscriptions (heure limite du jour, et « Sold out »
 * depuis le tableau de bord) et les places : autant que de vélos libres sur
 * le créneau de cette sortie.
 *
 * Une inscription retient ses vélos le temps du paiement, jusqu'à cinq à
 * la fois. Deux garde-fous empêchent qu'on retienne les sorties sans payer :
 * une seule inscription en attente par email et par numéro, tous jours
 * confondus (une demande qui n'est pas arrivée se relance depuis le lien
 * reçu par email, sans se réinscrire), et un plafond par adresse.
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

  // Le schéma n'accepte que les jours des sorties : la sortie existe.
  const sortie = sortieOctobreRoseDu(donnees.date);
  if (!sortie) {
    return {
      refus: NextResponse.json(
        { erreur: "Aucune sortie Octobre rose ce jour-là.", champs: { date: "Jour non proposé." } },
        { status: 422 },
      ),
    };
  }
  const creneau = creneauOctobreRose(sortie);

  const indisponible = paiementIndisponible();
  if (indisponible) return { refus: indisponible };

  // L'heure limite de ce jour-là, et son réglage au tableau de bord. Une
  // inscription close ou fermée pour un jour ne dit rien de l'autre.
  const refus = refusInscriptionOctobreRose(await lireOuverture(), sortie);
  if (refus) {
    return {
      refus: NextResponse.json(
        { erreur: refus.erreur, code: refus.code },
        { status: refus.code === "FERME" ? 403 : 409 },
      ),
    };
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

  // La même personne a déjà une inscription qui attend son paiement, quel
  // qu'en soit le jour : elle retient déjà des vélos. On la renvoie vers
  // elle au lieu d'en ouvrir une seconde, qui en retiendrait autant. Payée,
  // elle laisse s'inscrire pour un autre jour.
  const email = donnees.client.email.trim().toLowerCase();
  const numero = finDeNumero(donnees.client.telephone);
  const jours = OCTOBRE_ROSE.sorties.map((s) => s.date).sort();
  const enAttente = (
    await depot.listerReservations({
      statut: "EN_ATTENTE_PAIEMENT",
      depuis: jours[0],
      jusqua: jours[jours.length - 1],
    })
  ).find(
    (r) =>
      r.offre === "octobre-rose" &&
      estEnAttente(r) &&
      (r.client.email.toLowerCase() === email || (numero.length === 8 && finDeNumero(r.client.telephone) === numero)),
  );
  if (enAttente) {
    const autreJour =
      enAttente.dateDebut !== sortie.date ? `, pour le ${formatDateAvecJour(enAttente.dateDebut)},` : "";
    return {
      refus: NextResponse.json(
        {
          erreur:
            `Une inscription à votre nom${autreJour} attend déjà son paiement (${enAttente.reference}). ` +
            "Validez la demande sur votre téléphone, ou relancez-la depuis le lien reçu par email. " +
            "Sans paiement, elle se libère d'elle-même au bout de 30 minutes.",
          code: "EN_ATTENTE",
        },
        { status: 409 },
      ),
    };
  }

  // Contrôle en amont, comme pour un vélo choisi : la transaction qui écrit
  // attribue les vélos et refait le compte. Les places sont celles de ce
  // jour-là : chaque sortie a ses vélos.
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
      // Octobre rose : une autre inscription vient de prendre des vélos sur
      // la sortie de ce jour. Le formulaire ajuste le nombre de places qu'il
      // propose pour ce jour-là. À plusieurs sur un vélo choisi : ce qu'il
      // reste de sa gamme à cette heure.
      const sortie = demande.offre === "octobre-rose" ? sortieOctobreRoseDu(demande.dateDebut) : null;
      const creneau = sortie ? creneauOctobreRose(sortie) : null;
      // Réservation par gamme : ce qu'il reste de la gamme sur ce créneau,
      // pour que le tunnel ramène son compteur à ce qui est encore possible.
      const heureFin =
        demande.offre === "road-trip"
          ? demande.heureDebut + DUREE_ROAD_TRIP_HEURES
          : demande.heureDebut + (demande.dureeHeures ?? 1);
      const places = creneau
        ? (await depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin).catch(() => null))?.length
        : demande.gamme
          ? (await depot.velosLibres(demande.dateDebut, demande.heureDebut, heureFin).catch(() => null))?.filter(
              (velo) => velo.gamme === demande.gamme,
            ).length
          : undefined;
      const plusieurs = !creneau && (demande.nombrePersonnes ?? 1) > 1;
      return NextResponse.json(
        {
          erreur: erreur.message,
          code: creneau || (plusieurs && places !== 0) ? "PLACES" : "INDISPONIBLE",
          places,
        },
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
