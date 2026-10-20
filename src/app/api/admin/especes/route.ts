import { NextResponse } from "next/server";

import {
  creneauOctobreRose,
  formatHoraire,
  sortieOctobreRoseDu,
  sortieOctobreRosePartie,
} from "@/data/octobre-rose";
import { DUREE_ROAD_TRIP_HEURES, heureAuBenin } from "@/data/offres";
import { dateAuBenin } from "@/lib/dates";
import { sessionAdminValide } from "@/lib/admin";
import { ConflitDisponibiliteError, depot, TransactionDejaUtiliseeError } from "@/lib/db";
import { messagePlacesManquantes } from "@/lib/db/contrat";
import {
  envoyerAnnulationAdmin,
  envoyerAnnulationComptoir,
  envoyerConfirmation,
  envoyerFacture,
  envoyerNotificationAdmin,
} from "@/lib/email";
import { numeroDeFacture } from "@/lib/facture";
import { formatDateAvecJour, resumeOffre } from "@/lib/format";
import { lienDeSuivi } from "@/lib/lien-suivi";
import { personnesMaxPour } from "@/lib/ouverture";
import { MESSAGES_REFUS } from "@/lib/parrainage";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { estPayee, estVenteEspeces, montantARendre } from "@/lib/reservations";
import { site } from "@/lib/site";
import { calculerDevis, type Devis } from "@/lib/tarification";
import type { Reservation, Velo } from "@/lib/types";
import {
  erreursParChamp,
  schemaDevisComptoir,
  schemaVenteComptoir,
  type EntreeDevisComptoir,
} from "@/lib/validation";

/**
 * Les ventes au comptoir, réglées en espèces.
 *
 * Le client se présente au point de départ et paie de la main à la main.
 * Le commercial saisit la vente ici, et le client reçoit aussitôt sa
 * confirmation et sa facture par email, comme s'il avait payé en ligne.
 *
 * Cinq actions, toutes réservées à l'administration :
 *
 *  - `devis` : le montant exact à encaisser, code de parrainage vérifié,
 *    et si le vélo est libre. N'écrit rien.
 *  - `enregistrer` (par défaut) : la vente, déjà payée. Le serveur refuse
 *    tout autre montant que celui que le commercial a vu, donc encaissé :
 *    la caisse et les comptes ne peuvent pas diverger sans que personne le
 *    voie.
 *  - `renvoyer` : renvoie au client sa confirmation et sa facture, quand
 *    le premier envoi n'est pas parti.
 *  - `annuler` : annule une vente tant que le vélo n'est pas parti et que
 *    son créneau n'est pas passé (erreur de saisie, client qui renonce sur
 *    place). L'argent est rendu sur-le-champ, le client et le gérant en
 *    sont prévenus.
 *  - `rendre` : note que l'argent d'une vente annulée par le client depuis
 *    son lien lui a été rendu, pour le montant prévu par les CGV.
 *
 * Le prix n'est jamais saisi : il vient de `calculerDevis`, comme en ligne,
 * au prix de la plaquette, sans les frais du paiement en ligne. Octobre rose
 * se vend au prix comptoir de la sortie du jour choisi (`prixComptoirXof`).
 */
export const maxDuration = 30;

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const corps = (await requete.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }

  if (corps.action === "renvoyer") return renvoyer(corps.reference);
  if (corps.action === "annuler") return annuler(corps.reference);
  if (corps.action === "rendre") return rendre(corps.reference);
  const incomplete = configurationIncomplete();
  if (incomplete) return incomplete;
  if (corps.action === "devis") return devis(corps);
  return enregistrer(corps);
}

/**
 * La vente signe le lien de suivi du client avec BOOKING_TOKEN_SECRET, qui
 * doit être celui du site. En base réelle, sans lui, l'écriture échouerait
 * après l'encaissement : on le dit avant, dès le devis, pour que le
 * commercial n'encaisse pas.
 */
function configurationIncomplete(): NextResponse | null {
  if (process.env.DATABASE_URL && (process.env.BOOKING_TOKEN_SECRET ?? "").length < 16) {
    console.error("[admin/especes] BOOKING_TOKEN_SECRET absent du projet d'administration : ventes impossibles.");
    return NextResponse.json(
      {
        erreur:
          "Ventes en espèces indisponibles : la configuration du serveur est incomplète. " +
          "N'encaissez pas, et prévenez le gérant.",
      },
      { status: 503 },
    );
  }
  return null;
}

/* ------------------------------------------------------------------ Devis */

type Preparation =
  | { refus: NextResponse }
  | {
      /** Le vélo choisi ; `null` pour Octobre rose, dont les vélos sont attribués d'office. */
      velo: Velo | null;
      devis: Devis;
      heureFin: number;
      libre: boolean;
      refusCode?: string;
      /** Octobre rose : les places encore libres sur la sortie. */
      places?: number;
    };

/**
 * Ce que coûtera cette vente, et si elle peut avoir lieu.
 *
 * Le code de parrainage est vérifié sans être consommé : il ne l'est qu'à
 * l'enregistrement, dans la transaction qui crée la réservation.
 */
async function preparer(donnees: EntreeDevisComptoir): Promise<Preparation> {
  if (donnees.offre === "octobre-rose") return preparerOctobreRose(donnees);

  const velo = donnees.veloId ? await depot.trouverVeloParId(donnees.veloId) : null;
  if (!velo) {
    return { refus: NextResponse.json({ erreur: "Ce vélo n'existe pas." }, { status: 404 }) };
  }
  if (velo.statut === "RETIRE" || velo.statut === "MAINTENANCE") {
    return {
      refus: NextResponse.json(
        { erreur: `Le ${velo.nom} est en entretien ou retiré du parc : il ne peut pas partir.` },
        { status: 409 },
      ),
    };
  }

  const roadTrip = donnees.offre === "road-trip";
  // Une personne, un vélo : même plafond qu'en ligne.
  if (roadTrip) {
    const personnesMax = personnesMaxPour(velo, await depot.listerVelos());
    if (donnees.nombrePersonnes > personnesMax) {
      return {
        refus: NextResponse.json(
          {
            erreur:
              personnesMax === 1
                ? `Le ${velo.nom} est un exemplaire unique : une seule personne.`
                : `Cette gamme compte ${personnesMax} vélos en état : ${personnesMax} personnes au plus.`,
            champs: { nombrePersonnes: "Trop de personnes pour cette gamme." },
          },
          { status: 422 },
        ),
      };
    }
  }

  // Au prix de la plaquette : les espèces ne paient pas les frais du
  // paiement en ligne (cf. FRAIS_PAIEMENT_EN_LIGNE_XOF).
  const parametres = {
    offre: donnees.offre,
    gamme: velo.gamme,
    nombrePersonnes: roadTrip ? donnees.nombrePersonnes : 1,
    dureeHeures: roadTrip ? undefined : donnees.dureeHeures,
    especes: true,
  };
  const brut = calculerDevis(parametres);

  let devisFinal = brut;
  let refusCode: string | undefined;
  if (donnees.codeParrainage) {
    const verification = await depot.verifierCodeParrainage(donnees.codeParrainage, brut.totalXof);
    if (!verification.valide) refusCode = MESSAGES_REFUS[verification.motif];
    else if (verification.remiseXof > 0) {
      devisFinal = calculerDevis({
        ...parametres,
        remise: { code: verification.code.code, montantXof: verification.remiseXof },
      });
    }
  }

  const heureFin = roadTrip
    ? donnees.heureDebut + DUREE_ROAD_TRIP_HEURES
    : donnees.heureDebut + (donnees.dureeHeures ?? 1);
  const libre = await depot.estDisponible(velo.id, donnees.date, donnees.date, donnees.heureDebut, heureFin);

  return { velo, devis: devisFinal, heureFin, libre, refusCode };
}

/**
 * Une vente Octobre rose au comptoir, pour la sortie du jour choisi : au
 * prix comptoir de cette sortie, le même qu'en ligne avant les frais de
 * paiement (les 125 F ne s'en retirent pas), sans code de parrainage (le
 * prix est forfaitaire). Les vélos sont attribués d'office à
 * l'enregistrement ; « libre » dit qu'il en reste assez ce jour-là pour ces
 * personnes. Le comptoir vend jusqu'au départ du groupe de ce jour : ni
 * l'heure limite des inscriptions en ligne ni le « Sold out » du tableau de
 * bord ne s'y appliquent, mais une sortie partie ne se vend plus.
 */
async function preparerOctobreRose(donnees: EntreeDevisComptoir): Promise<Preparation> {
  // Le schéma n'accepte que les jours des sorties.
  const sortie = sortieOctobreRoseDu(donnees.date);
  if (!sortie) {
    return {
      refus: NextResponse.json(
        { erreur: "Aucune sortie Octobre rose ce jour-là.", champs: { date: "Jour sans sortie." } },
        { status: 422 },
      ),
    };
  }
  if (sortieOctobreRosePartie(sortie, Date.now())) {
    return {
      refus: NextResponse.json(
        {
          erreur:
            `La sortie du ${formatDateAvecJour(sortie.date)} est partie à ` +
            `${formatHoraire(sortie.depart)}${String.fromCharCode(0xa0)}: elle ne se vend plus.`,
          code: "PARTIE",
        },
        { status: 409 },
      ),
    };
  }
  const creneau = creneauOctobreRose(sortie);
  const devisFinal = calculerDevis({
    offre: "octobre-rose",
    date: sortie.date,
    nombrePersonnes: donnees.nombrePersonnes,
    especes: true,
  });
  const places = (await depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin)).length;
  return {
    velo: null,
    devis: devisFinal,
    heureFin: creneau.heureFin,
    libre: places >= devisFinal.nombrePersonnes,
    places,
  };
}

/** Le devis tel que l'écran l'affiche. */
function resume(preparation: Extract<Preparation, { devis: Devis }>) {
  return {
    totalXof: preparation.devis.totalXof,
    sousTotalXof: preparation.devis.sousTotalXof,
    remiseXof: preparation.devis.remiseXof,
    cautionXof: preparation.devis.cautionXof,
    libre: preparation.libre,
    refusCode: preparation.refusCode,
    places: preparation.places,
  };
}

async function devis(corps: Record<string, unknown>) {
  const analyse = schemaDevisComptoir.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Vente incomplète.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }
  const preparation = await preparer(analyse.data);
  if ("refus" in preparation) return preparation.refus;
  return NextResponse.json(resume(preparation));
}

/* ------------------------------------------------------------ Enregistrer */

async function enregistrer(corps: Record<string, unknown>) {
  const analyse = schemaVenteComptoir.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Vente incomplète.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }
  const donnees = analyse.data;

  // Une même saisie n'est enregistrée qu'une fois. Un double clic, ou une
  // réponse perdue suivie d'un nouvel envoi, retrouve la vente déjà faite
  // au lieu de compter deux fois le même argent, ou de répondre que le vélo
  // est pris, par cette vente même. La base garantit le reste : cette
  // référence de paiement est unique.
  //
  // La question se repose avant chaque « vélo pris » : deux envois
  // simultanés de la même saisie passent ensemble le premier contrôle, et
  // le second trouve alors le vélo pris par le premier.
  const referenceSaisie = `ESP-${donnees.cleVente}`;
  const dejaFaite = async () => {
    const enregistree = await depot.trouverReservationParPaiement(referenceSaisie);
    if (!enregistree) return null;
    // Le formulaire a pu changer entre les deux envois : on le signale, la
    // vente enregistrée restant celle du premier envoi.
    // Octobre rose n'a pas de vélo choisi : ses vélos sont attribués.
    const memeSaisie =
      (donnees.offre === "octobre-rose" || enregistree.lignes[0]?.veloId === donnees.veloId) &&
      enregistree.offre === donnees.offre &&
      enregistree.dateDebut === donnees.date &&
      enregistree.heureDebut === donnees.heureDebut &&
      (donnees.offre === "location-libre"
        ? enregistree.dureeHeures === donnees.dureeHeures
        : enregistree.nombrePersonnes === donnees.nombrePersonnes) &&
      enregistree.client.email === donnees.client.email;
    return reponseVente(enregistree, donnees.montantAttenduXof, null, !memeSaisie);
  };
  const deja = await dejaFaite();
  if (deja) return deja;

  const preparation = await preparer(donnees);
  if ("refus" in preparation) return preparation.refus;

  if (!preparation.libre) {
    const entreTemps = await dejaFaite();
    if (entreTemps) return entreTemps;
    return NextResponse.json(
      {
        erreur: preparation.velo
          ? `Le ${preparation.velo.nom} est déjà pris sur ce créneau. Choisissez un autre vélo ou une autre heure.`
          : messagePlacesManquantes(preparation.devis.nombrePersonnes, preparation.places ?? 0, true),
        code: preparation.velo ? "INDISPONIBLE" : "PLACES",
        places: preparation.places,
      },
      { status: 409 },
    );
  }

  // Le montant que le commercial a vu est celui qu'il a encaissé. Un code
  // devenu invalide entre-temps changerait le total : on ne l'enregistre
  // pas en silence, on lui montre le bon montant.
  if (donnees.montantAttenduXof !== preparation.devis.totalXof) {
    return NextResponse.json(
      {
        erreur:
          `Le montant a changé : ${preparation.devis.totalXof.toLocaleString("fr-FR")} FCFA ` +
          `et non ${donnees.montantAttenduXof.toLocaleString("fr-FR")} FCFA. ` +
          "Vérifiez avec le client, puis enregistrez à nouveau.",
        code: "MONTANT",
        devis: resume(preparation),
      },
      { status: 409 },
    );
  }

  let reservation: Reservation;
  let token: string;
  try {
    const resultat = await depot.creerReservation({
      // Octobre rose : pas de vélo choisi, le dépôt les attribue.
      veloId: preparation.velo?.id,
      offre: donnees.offre,
      nombrePersonnes: donnees.offre === "location-libre" ? 1 : donnees.nombrePersonnes,
      dureeHeures: donnees.offre === "location-libre" ? donnees.dureeHeures : undefined,
      dateDebut: donnees.date,
      dateFin: donnees.date,
      heureDebut: donnees.heureDebut,
      options: [],
      // Le code n'est transmis que s'il vient d'être accordé : un code que
      // le commercial a vu refusé ne doit pas valoir à l'écriture, il a
      // encaissé le prix plein.
      codeParrainage: preparation.devis.remiseXof > 0 ? donnees.codeParrainage || undefined : undefined,
      client: {
        prenom: donnees.client.prenom,
        nom: donnees.client.nom,
        email: donnees.client.email,
        telephone: donnees.client.telephone || undefined,
      },
      moyenPaiement: "ESPECES",
      cgvAcceptees: donnees.cgvAcceptees,
      encaissement: { par: donnees.encaissePar, reference: referenceSaisie },
    });
    reservation = resultat.reservation;
    token = resultat.token;
  } catch (erreur) {
    // Deux envois simultanés de la même saisie : l'autre l'a enregistrée, et
    // celui-ci bute sur l'unicité de la référence, ou sur le vélo qu'elle
    // vient de prendre.
    if (erreur instanceof TransactionDejaUtiliseeError || erreur instanceof ConflitDisponibiliteError) {
      const entreTemps = await dejaFaite();
      if (entreTemps) return entreTemps;
    }
    if (erreur instanceof ConflitDisponibiliteError) {
      // Octobre rose : le dépôt dit combien de places il reste.
      return NextResponse.json(
        preparation.velo
          ? { erreur: "Ce vélo vient d'être pris sur ce créneau. Choisissez-en un autre.", code: "INDISPONIBLE" }
          : { erreur: erreur.message, code: "PLACES" },
        { status: 409 },
      );
    }
    console.error("[admin/especes] vente non enregistrée", erreur);
    return NextResponse.json(
      { erreur: "La vente n'a pas pu être enregistrée. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  // La vente est enregistrée : plus rien ne doit la faire échouer. Les
  // emails sont tentés, et l'écran dit franchement s'ils sont partis.
  const lienSuivi = `${site.url}/reservation/${token}`;
  const [confirmation, envoiFacture] = await Promise.allSettled([
    sansTrainer(envoyerConfirmation(reservation, lienSuivi)),
    sansTrainer(envoyerFacture(reservation, numeroDeFacture(reservation), lienSuivi)),
    sansTrainer(envoyerNotificationAdmin(reservation)),
  ]);
  await rafraichirSitePublic();

  return reponseVente(reservation, donnees.montantAttenduXof, parti(confirmation) && parti(envoiFacture));
}

const parti = (envoi: PromiseSettledResult<{ envoye: boolean }>) =>
  envoi.status === "fulfilled" && envoi.value.envoye;

/**
 * Un envoi d'email qui traîne ne retient pas la réponse. Sans cette borne,
 * une boîte d'envoi lente faisait dépasser le temps accordé à la route :
 * la vente était enregistrée, mais l'écran ne recevait jamais la réponse,
 * et le commercial pouvait la croire perdue. Passé ce délai, l'envoi
 * compte comme non parti, et l'écran propose de renvoyer la facture.
 */
const DELAI_EMAIL_MS = 12_000;
function sansTrainer(envoi: Promise<{ envoye: boolean }>): Promise<{ envoye: boolean }> {
  return Promise.race([
    envoi,
    new Promise<{ envoye: boolean }>((resoudre) => setTimeout(() => resoudre({ envoye: false }), DELAI_EMAIL_MS)),
  ]);
}

/**
 * Ce que l'écran affiche d'une vente enregistrée, tiré de la vente
 * elle-même et non du formulaire : après une réponse perdue, le
 * commercial a pu changer la saisie, et l'écran doit montrer ce qui est
 * réellement enregistré. `emailEnvoye` vaut `null` pour une saisie déjà
 * enregistrée par un envoi précédent : ses emails sont partis avec lui, ou
 * pas, cet appel-ci n'en sait rien.
 */
function reponseVente(
  reservation: Reservation,
  montantAttenduXof: number,
  emailEnvoye: boolean | null,
  saisieDifferente = false,
) {
  return NextResponse.json(
    {
      saisieDifferente,
      reference: reservation.reference,
      offre: reservation.offre,
      facture: numeroDeFacture(reservation),
      totalXof: reservation.totalXof,
      remiseXof: reservation.remiseXof,
      cautionXof: reservation.cautionXof,
      email: reservation.client.email,
      client: `${reservation.client.prenom} ${reservation.client.nom}`,
      veloNom: reservation.lignes.map((ligne) => ligne.veloNom).join(", "),
      formule: resumeOffre(reservation),
      dateDebut: reservation.dateDebut,
      heureDebut: reservation.heureDebut,
      heureFin: reservation.heureFin,
      emailEnvoye,
      deja: emailEnvoye === null,
      // Une remise retenue à l'affichage mais refusée dans la transaction
      // (code épuisé à la même seconde) : rare, mais le commercial doit le
      // savoir, il a encaissé l'autre montant. Seulement pour une vente que
      // cet appel vient de créer : une vente déjà enregistrée par un envoi
      // précédent est montrée telle quelle, avec `saisieDifferente`.
      montantDifferent: emailEnvoye !== null && reservation.totalXof !== montantAttenduXof,
    },
    { status: emailEnvoye === null ? 200 : 201 },
  );
}

/* --------------------------------------------------------------- Renvoyer */

async function renvoyer(brute: unknown) {
  const reference = typeof brute === "string" ? brute.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,20}$/.test(reference)) {
    return NextResponse.json({ erreur: "Référence invalide." }, { status: 422 });
  }

  const reservation = await depot.trouverReservationParReference(reference);
  if (!reservation || !estVenteEspeces(reservation) || !estPayee(reservation)) {
    return NextResponse.json({ erreur: "Vente en espèces introuvable." }, { status: 404 });
  }

  // Quelques renvois suffisent ; au-delà, c'est l'adresse qu'il faut revoir.
  if ((await depot.compterEssai(`renvoi-facture:${reservation.reference}`, 3600)) > 5) {
    return NextResponse.json(
      { erreur: "Facture déjà renvoyée plusieurs fois cette heure-ci : vérifiez l'adresse avec le client." },
      { status: 429 },
    );
  }

  const lienSuivi = await lienDeSuivi(reservation.reference);
  const [confirmation, envoiFacture] = await Promise.allSettled([
    sansTrainer(envoyerConfirmation(reservation, lienSuivi)),
    sansTrainer(envoyerFacture(reservation, numeroDeFacture(reservation), lienSuivi)),
  ]);

  if (!parti(confirmation) || !parti(envoiFacture)) {
    return NextResponse.json(
      { erreur: "L'email n'est toujours pas parti. Réessayez dans quelques minutes." },
      { status: 502 },
    );
  }
  return NextResponse.json({ reference: reservation.reference, email: reservation.client.email });
}

/* ---------------------------------------------------------------- Annuler */

/**
 * Annule une vente au comptoir : erreur de saisie, ou client qui renonce
 * avant de partir. Seulement tant que le vélo n'est pas parti, et l'argent
 * est rendu sur-le-champ. La vente reste comptée le jour où elle a été
 * encaissée ; son remboursement apparaît le jour de l'annulation. Le
 * client reçoit l'annulation (il avait une facture), le gérant aussi.
 */
async function annuler(brute: unknown) {
  const reference = typeof brute === "string" ? brute.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,20}$/.test(reference)) {
    return NextResponse.json({ erreur: "Référence invalide." }, { status: 422 });
  }

  const reservation = await depot.trouverReservationParReference(reference);
  if (!reservation || !estVenteEspeces(reservation)) {
    return NextResponse.json({ erreur: "Vente en espèces introuvable." }, { status: 404 });
  }
  if (reservation.statut !== "CONFIRMEE") {
    return NextResponse.json(
      {
        erreur:
          reservation.statut === "ANNULEE"
            ? "Cette vente est déjà annulée."
            : "Le vélo est déjà parti : cette vente ne s'annule plus d'ici. Voyez-le avec le gérant.",
      },
      { status: 409 },
    );
  }
  // Une fois le créneau passé, la location est due en totalité (article 5
  // des CGV) : on ne rend plus l'argent d'une sortie qui a eu lieu, même si
  // le départ n'a pas été noté.
  if (!avantFinDuCreneau(reservation)) {
    return NextResponse.json(
      { erreur: "Le créneau de cette vente est passé : elle ne s'annule plus. Voyez-le avec le gérant." },
      { status: 409 },
    );
  }

  // `null` : un autre appel l'a annulée au même instant (second bouton,
  // autre téléphone), ou le vélo vient de partir. Rien n'est rendu deux fois,
  // aucun email ne part en double.
  const annulee = await depot.annulerReservation(reservation.reference, { rembourseAuComptoir: true });
  if (!annulee) {
    return NextResponse.json(
      { erreur: "Cette vente vient d'être annulée ou le vélo vient de partir : rien n'a été annulé ici." },
      { status: 409 },
    );
  }

  const [email] = await Promise.allSettled([
    sansTrainer(envoyerAnnulationComptoir(annulee)),
    sansTrainer(envoyerAnnulationAdmin(annulee, annulee.totalXof, "comptoir")),
  ]);
  await rafraichirSitePublic();
  return NextResponse.json({
    reference: annulee.reference,
    renduXof: annulee.totalXof,
    email: annulee.client.email,
    emailEnvoye: parti(email),
  });
}

/** Le créneau n'est pas encore fini, à l'heure du Bénin. */
function avantFinDuCreneau(reservation: Reservation): boolean {
  const ici = heureAuBenin();
  return reservation.dateFin > ici.date || (reservation.dateFin === ici.date && reservation.heureFin > ici.heure);
}

/* ----------------------------------------------------------------- Rendre */

/**
 * Note que l'argent d'une vente en espèces, annulée par le client depuis
 * son lien, lui a été rendu. Jusque-là, la vente est « à rendre » et ne
 * sort pas de la caisse ; à partir de là, le montant prévu par les CGV
 * compte comme sorti, le jour où il a été rendu.
 */
async function rendre(brute: unknown) {
  const reference = typeof brute === "string" ? brute.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,20}$/.test(reference)) {
    return NextResponse.json({ erreur: "Référence invalide." }, { status: 422 });
  }

  const reservation = await depot.trouverReservationParReference(reference);
  if (!reservation || !estVenteEspeces(reservation) || reservation.statut !== "ANNULEE" || !reservation.annuleLe) {
    return NextResponse.json({ erreur: "Aucune vente en espèces annulée sous cette référence." }, { status: 404 });
  }

  const montant = montantARendre(reservation, dateAuBenin(reservation.annuleLe));
  const rendue = await depot.noterRemboursementEspeces(reservation.reference, montant);
  if (!rendue) {
    return NextResponse.json({ erreur: "Cette vente est déjà notée comme rendue." }, { status: 409 });
  }
  return NextResponse.json({ reference: rendue.reference, renduXof: montant });
}
