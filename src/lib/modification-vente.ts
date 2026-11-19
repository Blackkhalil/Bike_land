/**
 * Modifier une vente en espèces déjà enregistrée, même ancienne (demande du
 * responsable du 19 novembre 2026). Un commercial avait saisi un Padel bike
 * pour sept personnes au lieu de six : la caisse et les comptes doivent
 * pouvoir se corriger, et chaque correction se lire au journal.
 *
 * Ce module ne fait que des calculs, sans base : ce qui se modifie selon la
 * formule, le nouveau créneau et le nouveau prix, les vélos que la vente
 * garde, rend ou prend, et ce que le journal en retient. Le formulaire de
 * l'administration s'en sert pour afficher le nouveau montant avant
 * l'enregistrement, et les deux dépôts pour le recalculer dans la
 * transaction qui écrit : le montant vu est celui qui est enregistré.
 *
 * Le prix suit la vente au comptoir d'origine : `calculerDevis` au prix des
 * espèces, avec les réglages des produits et le prix du jour. Il n'est
 * recalculé que si le nombre, le jour ou la durée changent : corriger le
 * nom du client ne change pas ce qu'il a payé. Un code de parrainage qui a
 * réduit la vente réduit aussi le nouveau montant, au même taux.
 *
 * Les offres de groupe (Bike for All, Road trip en groupe, Gbashi Bike)
 * tirent leur prix du moteur des offres et de ses réglages : seuls le client
 * et « Argent reçu par » s'y modifient.
 *
 * Aucun email ne part pour une modification : le client garde sa facture,
 * le journal garde l'avant et l'après.
 */

import { creneauOctobreRose, sortieOctobreRoseDu } from "@/data/octobre-rose";
import {
  creneauDuJour,
  DUREE_ROAD_TRIP_HEURES,
  estOffreGroupe,
  FERMETURE_COMPTOIR_HEURE,
  GRILLE_HORAIRE,
  nomDeGamme,
  OUVERTURE_COMPTOIR_HEURE,
  SORTIES_SUR_COMMANDE,
  type GammeVelo,
} from "@/data/offres";
import { blocPadel, type ReglagesProduits } from "@/data/reglages";
import { ajouterJours, estDateISOValide, type DateISO } from "@/lib/dates";
import { ordreAttribution } from "@/lib/db/contrat";
import { reductionPour } from "@/lib/parrainage";
import { calculerDevis, DureeNonTarifeeError, TarifIntrouvableError } from "@/lib/tarification";
import type { CodeOffre, EvenementJournal, Reservation } from "@/lib/types";

/** Les durées de la location libre : les mêmes d'une gamme à l'autre. */
export const DUREES_LOCATION = GRILLE_HORAIRE.CLASSIQUE.map((palier) => palier.heures);

/** Au-delà, la vente n'est pas prise, comme au comptoir. */
const JOURS_MAX = 60;

/** Le plus grand groupe d'une vente, comme au comptoir (`calculerDevis`). */
export const PERSONNES_MAX_VENTE = 12;

/* ------------------------------------------------- Ce qui se modifie */

/** Ce qui se modifie, selon la formule. */
export interface ChampsModifiables {
  /** Le nombre de personnes, ou de vélos en location libre. */
  personnes: boolean;
  /** Le jour. */
  date: boolean;
  /** L'heure de départ, là où le comptoir la fait choisir. */
  heure: boolean;
  /** La durée, en location libre. */
  duree: boolean;
}

/**
 * Ce que le formulaire de la vente d'origine laisse choisir : la location
 * libre son jour, son heure, sa durée et son nombre de vélos ; Gbashi bike
 * son jour et son heure ; le road trip, Octobre rose et Padel bike leur
 * jour seulement, l'heure venant du départ, de la sortie ou des réglages.
 * Une offre de groupe : rien de tout cela.
 */
export function champsModifiables(offre: CodeOffre): ChampsModifiables {
  switch (offre) {
    case "location-libre":
      return { personnes: true, date: true, heure: true, duree: true };
    case "gbashi-bike":
      return { personnes: true, date: true, heure: true, duree: false };
    case "road-trip":
    case "octobre-rose":
    case "padel-bike":
      return { personnes: true, date: true, heure: false, duree: false };
    default:
      return { personnes: false, date: false, heure: false, duree: false };
  }
}

/** La formule se vend sur un vélo choisi, dont la gamme fixe le prix ; les autres attribuent leurs vélos d'office. */
export function prixParGamme(offre: CodeOffre): boolean {
  return offre === "location-libre" || offre === "road-trip" || offre === "gbashi-bike";
}

/**
 * Pourquoi cette vente ne se modifie pas ici, ou `null` si elle se modifie :
 * « introuvable » pour ce qui n'est pas une vente en espèces payée (une
 * réservation payée en ligne, par Mobile Money, ne se modifie pas ici) ;
 * « annulee » pour une vente annulée, rendue ou à rendre.
 */
export function refusModificationVente(reservation: Reservation): "introuvable" | "annulee" | null {
  const paiement = reservation.paiements.find((p) => !p.estCaution);
  if (!paiement || paiement.moyen !== "ESPECES") return "introuvable";
  if (reservation.statut === "ANNULEE" || paiement.statut === "REMBOURSE") return "annulee";
  const payee = reservation.statut === "CONFIRMEE" || reservation.statut === "EN_COURS" || reservation.statut === "TERMINEE";
  return payee && paiement.statut === "REUSSI" ? null : "introuvable";
}

/* ---------------------------------------------- Le créneau et le prix */

/** Ce qu'il faut savoir de la vente pour la recalculer. */
export interface VenteAModifier {
  offre: CodeOffre;
  nombrePersonnes: number;
  dureeHeures?: number;
  dateDebut: DateISO;
  heureDebut: number;
  heureFin: number;
  horaire?: { depart: string; retour: string };
  /** La gamme de ses vélos : elle fixe le prix de la location libre, du road trip et de Gbashi bike. */
  gamme?: GammeVelo;
  /** Le code de parrainage qui l'a réduite, s'il y en a un. */
  codeParrainage?: string;
  sousTotalXof: number;
  remiseXof: number;
  cautionXof: number;
  totalXof: number;
}

/** La vente telle que ce module la recalcule ; `gamme` : celle de son premier vélo. */
export function venteAModifier(reservation: Reservation, gamme?: GammeVelo): VenteAModifier {
  return {
    offre: reservation.offre,
    nombrePersonnes: reservation.nombrePersonnes,
    ...(reservation.dureeHeures !== undefined ? { dureeHeures: reservation.dureeHeures } : {}),
    dateDebut: reservation.dateDebut,
    heureDebut: reservation.heureDebut,
    heureFin: reservation.heureFin,
    ...(reservation.horaire ? { horaire: reservation.horaire } : {}),
    ...(gamme ? { gamme } : {}),
    ...(reservation.remiseXof > 0 && reservation.codeParrainage ? { codeParrainage: reservation.codeParrainage } : {}),
    sousTotalXof: reservation.sousTotalXof,
    remiseXof: reservation.remiseXof,
    cautionXof: reservation.cautionXof,
    totalXof: reservation.totalXof,
  };
}

/** Le nombre, le jour, l'heure et la durée demandés : seuls ceux que la formule laisse choisir comptent. */
export interface CreneauModifie {
  nombrePersonnes?: number;
  date?: DateISO;
  heureDebut?: number;
  dureeHeures?: number;
}

/** La vente après la modification : son créneau et ses montants. */
export interface CalculModification {
  nombrePersonnes: number;
  dureeHeures?: number;
  date: DateISO;
  heureDebut: number;
  heureFin: number;
  horaire?: { depart: string; retour: string };
  sousTotalXof: number;
  remiseXof: number;
  cautionXof: number;
  totalXof: number;
  /** Le jour ou les heures changent : les vélos sont revus sur le nouveau créneau. */
  creneauChange: boolean;
  /** Le nombre, le jour ou la durée changent : le prix est recalculé. */
  recalcule: boolean;
}

export type IssueModification = { ok: true; calcul: CalculModification } | { ok: false; champs: Record<string, string> };

/**
 * Le nouveau créneau et le nouveau prix de la vente, ou ce qui ne va pas,
 * champ par champ. `aujourdhuiIci` : le jour au Bénin.
 *
 * Un jour changé ne peut pas être passé, ni à plus de 60 jours, comme à la
 * vente ; un jour inchangé reste, même passé : une vente ancienne se
 * corrige. Le minimum de dix personnes du road trip ne s'applique pas : il
 * règle la vente, et une correction dit ce qui s'est vraiment passé.
 */
export function calculerModification(
  vente: VenteAModifier,
  demande: CreneauModifie,
  reglages: ReglagesProduits,
  aujourdhuiIci: DateISO,
): IssueModification {
  const peut = champsModifiables(vente.offre);
  const champs: Record<string, string> = {};
  const unite = vente.offre === "location-libre" ? "vélos" : "personnes";

  const nombrePersonnes =
    peut.personnes && demande.nombrePersonnes !== undefined ? demande.nombrePersonnes : vente.nombrePersonnes;
  if (
    nombrePersonnes !== vente.nombrePersonnes &&
    (!Number.isInteger(nombrePersonnes) || nombrePersonnes < 1 || nombrePersonnes > PERSONNES_MAX_VENTE)
  ) {
    champs.nombrePersonnes = `Entre 1 et ${PERSONNES_MAX_VENTE} ${unite}.`;
  }

  const date = peut.date && demande.date !== undefined ? demande.date : vente.dateDebut;
  if (date !== vente.dateDebut) {
    if (!estDateISOValide(date)) champs.date = "Date attendue au format AAAA-MM-JJ.";
    else if (date < aujourdhuiIci) champs.date = "Cette date est passée.";
    else if (date > ajouterJours(aujourdhuiIci, JOURS_MAX)) champs.date = "Au-delà de 60 jours, la vente n'est pas prise.";
  }

  const dureeAvant = vente.dureeHeures ?? 1;
  const dureeHeures =
    vente.offre === "location-libre"
      ? peut.duree && demande.dureeHeures !== undefined
        ? demande.dureeHeures
        : dureeAvant
      : undefined;
  if (dureeHeures !== undefined && dureeHeures !== dureeAvant && !DUREES_LOCATION.includes(dureeHeures)) {
    champs.dureeHeures = "Durée non proposée.";
  }

  // Le créneau, selon la formule.
  let heureDebut = vente.heureDebut;
  let heureFin = vente.heureFin;
  let horaire = vente.horaire;
  if (vente.offre === "location-libre" || vente.offre === "gbashi-bike") {
    heureDebut = peut.heure && demande.heureDebut !== undefined ? demande.heureDebut : vente.heureDebut;
    const duree = vente.offre === "location-libre" ? (dureeHeures ?? 1) : SORTIES_SUR_COMMANDE["gbashi-bike"].dureeHeures;
    heureFin = heureDebut + duree;
    if (heureDebut !== vente.heureDebut || heureFin !== vente.heureFin) {
      if (!Number.isInteger(heureDebut) || heureDebut < OUVERTURE_COMPTOIR_HEURE || heureDebut > FERMETURE_COMPTOIR_HEURE - 1) {
        champs.heureDebut = `Départ entre ${OUVERTURE_COMPTOIR_HEURE} h et ${FERMETURE_COMPTOIR_HEURE - 1} h.`;
      } else if (heureFin > FERMETURE_COMPTOIR_HEURE) {
        champs.heureDebut =
          vente.offre === "location-libre"
            ? `Le vélo rentrerait après ${FERMETURE_COMPTOIR_HEURE} h : partez plus tôt, ou louez moins longtemps.`
            : `La sortie dure ${duree} h et rentrerait après ${FERMETURE_COMPTOIR_HEURE} h : partez au plus tard à ${FERMETURE_COMPTOIR_HEURE - duree} h.`;
      }
    }
  } else if (vente.offre === "road-trip" && date !== vente.dateDebut) {
    const creneau = creneauDuJour(date);
    if (!creneau) champs.date ??= "Le road trip part le samedi et le dimanche, à 8 h.";
    else {
      heureDebut = creneau.heureDebut;
      heureFin = creneau.heureDebut + DUREE_ROAD_TRIP_HEURES;
    }
  } else if (vente.offre === "octobre-rose" && date !== vente.dateDebut) {
    const sortie = sortieOctobreRoseDu(date);
    if (!sortie) champs.date ??= "Choisissez l'un des jours de la sortie Octobre rose.";
    else {
      const creneau = creneauOctobreRose(sortie);
      heureDebut = creneau.heureDebut;
      heureFin = creneau.heureFin;
    }
  } else if (vente.offre === "padel-bike" && date !== vente.dateDebut) {
    // Le même jour, la sortie garde l'horaire vendu ; un autre jour, celui
    // des réglages des produits, comme une vente nouvelle.
    const bloc = blocPadel(reglages.padel);
    heureDebut = bloc.heureDebut;
    heureFin = bloc.heureFin;
    horaire = { depart: reglages.padel.depart, retour: reglages.padel.retour };
  }

  if (Object.keys(champs).length > 0) return { ok: false, champs };

  const recalcule =
    !estOffreGroupe(vente.offre) &&
    (nombrePersonnes !== vente.nombrePersonnes ||
      date !== vente.dateDebut ||
      (dureeHeures !== undefined && dureeHeures !== dureeAvant));
  const creneauChange = date !== vente.dateDebut || heureDebut !== vente.heureDebut || heureFin !== vente.heureFin;

  let montants = {
    sousTotalXof: vente.sousTotalXof,
    remiseXof: vente.remiseXof,
    cautionXof: vente.cautionXof,
    totalXof: vente.totalXof,
  };
  if (recalcule) {
    const parGamme = prixParGamme(vente.offre);
    if (parGamme && !vente.gamme) {
      return { ok: false, champs: { nombrePersonnes: "La gamme des vélos de cette vente est inconnue : son prix ne se recalcule pas." } };
    }
    const parametres = {
      offre: vente.offre,
      ...(parGamme ? { gamme: vente.gamme } : {}),
      date,
      nombrePersonnes,
      ...(vente.offre === "location-libre" ? { dureeHeures } : {}),
      especes: true,
    };
    try {
      const brut = calculerDevis(parametres, reglages);
      const devis = vente.codeParrainage
        ? calculerDevis(
            { ...parametres, remise: { code: vente.codeParrainage, montantXof: reductionPour(brut.totalXof) } },
            reglages,
          )
        : brut;
      montants = {
        sousTotalXof: devis.sousTotalXof,
        remiseXof: devis.remiseXof,
        cautionXof: devis.cautionXof,
        totalXof: devis.totalXof,
      };
    } catch (erreur) {
      if (erreur instanceof TarifIntrouvableError || erreur instanceof DureeNonTarifeeError) {
        return { ok: false, champs: { [vente.offre === "location-libre" ? "dureeHeures" : "date"]: erreur.message } };
      }
      throw erreur;
    }
  }

  return {
    ok: true,
    calcul: {
      nombrePersonnes,
      ...(dureeHeures !== undefined ? { dureeHeures } : {}),
      date,
      heureDebut,
      heureFin,
      ...(horaire ? { horaire } : {}),
      ...montants,
      creneauChange,
      recalcule,
    },
  };
}

/* ---------------------------------------------------- Les vélos */

/** Un vélo, pour choisir ceux que la vente garde, rend ou prend. */
export interface VeloAttribuable {
  id: string;
  nom: string;
  gamme: GammeVelo;
}

/**
 * Les vélos de la vente après la modification, un par personne (un par
 * vélo loué en location libre).
 *
 * Le créneau inchangé, la vente garde ses vélos. Le créneau changé, elle
 * garde ceux qui y sont libres et remplace les autres. Moins de personnes :
 * elle rend d'abord les vélos de la gamme la plus rare du parc, puis les
 * derniers attribués ; le vélo choisi au comptoir part donc en dernier.
 * Plus de personnes : elle prend des vélos libres sur le créneau, de la
 * gamme de la vente quand c'est elle qui fixe le prix (location libre, road
 * trip, Gbashi bike), toutes gammes sinon (Octobre rose, Padel bike), dans
 * l'ordre d'attribution de la vente d'origine.
 *
 * `libres` : les vélos qui peuvent rouler pour cette vente sur le nouveau
 * créneau (en état, pas déclarés indisponibles ce jour-là, pris par aucune
 * autre réservation), les siens compris. `parcParGamme` : les vélos en état
 * de chaque gamme. Sans assez de vélos, `disponibles` dit combien la vente
 * peut en avoir au plus.
 */
export function velosApresModification<V extends VeloAttribuable>(entree: {
  offre: CodeOffre;
  gamme?: GammeVelo;
  actuels: V[];
  nombre: number;
  creneauChange: boolean;
  libres: V[];
  parcParGamme: Partial<Record<GammeVelo, number>>;
}): { ok: true; gardes: V[]; retires: V[]; ajoutes: V[] } | { ok: false; disponibles: number } {
  const libres = new Set(entree.libres.map((velo) => velo.id));
  const utilisables = entree.creneauChange ? entree.actuels.filter((velo) => libres.has(velo.id)) : [...entree.actuels];
  const retires = entree.actuels.filter((velo) => !utilisables.includes(velo));
  let gardes = utilisables;
  if (gardes.length > entree.nombre) {
    const enTrop = aRendre(gardes, gardes.length - entree.nombre, entree.parcParGamme);
    gardes = gardes.filter((velo) => !enTrop.includes(velo));
    retires.push(...enTrop);
  }
  const ajoutes: V[] = [];
  if (gardes.length < entree.nombre) {
    const dejaLa = new Set(gardes.map((velo) => velo.id));
    const parGamme = prixParGamme(entree.offre);
    const candidats = ordreAttribution(
      entree.libres.filter((velo) => !dejaLa.has(velo.id) && (!parGamme || velo.gamme === entree.gamme)),
    );
    const manque = entree.nombre - gardes.length;
    if (candidats.length < manque) return { ok: false, disponibles: gardes.length + candidats.length };
    ajoutes.push(...candidats.slice(0, manque));
  }
  return { ok: true, gardes, retires, ajoutes };
}

/** Les vélos à rendre : la gamme la plus rare d'abord, puis les derniers attribués. */
function aRendre<V extends VeloAttribuable>(
  velos: V[],
  combien: number,
  parcParGamme: Partial<Record<GammeVelo, number>>,
): V[] {
  return velos
    .map((velo, rang) => ({ velo, rang }))
    .sort((a, b) => (parcParGamme[a.velo.gamme] ?? 0) - (parcParGamme[b.velo.gamme] ?? 0) || b.rang - a.rang)
    .slice(0, combien)
    .map(({ velo }) => velo);
}

/** Les vélos en état de chaque gamme : la plus rare se rend d'abord. */
export function compterParGamme(velos: { gamme: GammeVelo }[]): Partial<Record<GammeVelo, number>> {
  const compte: Partial<Record<GammeVelo, number>> = {};
  for (const velo of velos) compte[velo.gamme] = (compte[velo.gamme] ?? 0) + 1;
  return compte;
}

/** Pourquoi la vente ne peut pas avoir ces vélos : « Il ne reste que 3 vélos Premium libres… ». */
export function messageVelosModification(offre: CodeOffre, gamme: GammeVelo | undefined, disponibles: number): string {
  const deGamme = prixParGamme(offre) && gamme ? ` ${nomDeGamme(gamme)}` : "";
  const unite = offre === "location-libre" ? "vélo" : "personne";
  if (disponibles <= 0) {
    return `Plus aucun vélo${deGamme} libre sur ce créneau : choisissez ${champsModifiables(offre).heure ? "une autre heure ou " : ""}un autre jour.`;
  }
  return disponibles === 1
    ? `Il ne reste qu'un vélo${deGamme} libre pour cette vente sur ce créneau : 1 ${unite} au plus.`
    : `Il ne reste que ${disponibles} vélos${deGamme} libres pour cette vente sur ce créneau : ${disponibles} ${unite}s au plus.`;
}

/* --------------------------------------------- La modification entière */

/**
 * Ce que l'administration change sur une vente en espèces déjà enregistrée.
 * Seuls les champs donnés changent ; le créneau d'une offre de groupe ne
 * change jamais.
 */
export interface ModificationVente extends CreneauModifie {
  prenom?: string;
  nom?: string;
  email?: string;
  /** Vide : le client n'a plus de téléphone noté. */
  telephone?: string;
  encaissePar?: string;
  /** Le total que l'écran montrait : si la vente a changé depuis, rien n'est écrit. */
  totalAttenduXof: number;
  /** Le nouveau total que l'écran montrait : le dépôt doit trouver le même. */
  nouveauTotalXof: number;
  /** « admin (Zayed) » : signe la ligne du journal. */
  par: string;
}

/** Ce que donne une modification : la vente à jour, ou pourquoi rien n'a été écrit. */
export type ResultatModificationVente =
  | {
      ok: true;
      reservation: Reservation;
      /** La vente telle qu'elle était. */
      avant: Reservation;
      /** La ligne écrite au journal ; absente quand rien n'était à écrire. */
      evenement?: EvenementJournal;
      /** La vente était déjà telle que demandée (envoi répété) : rien n'est écrit. */
      deja: boolean;
      velosRetires: string[];
      velosAjoutes: string[];
    }
  | { ok: false; raison: "introuvable" | "annulee" }
  | { ok: false; raison: "changee" | "montant"; totalXof: number }
  | { ok: false; raison: "velos"; message: string }
  | { ok: false; raison: "saisie"; champs: Record<string, string> };

/** Ce que les deux dépôts font de la demande, avant de toucher aux vélos. */
export type PreparationModification =
  | { etape: "refus"; resultat: Extract<ResultatModificationVente, { ok: false }> }
  | { etape: "deja" }
  | { etape: "ecrire"; calcul: CalculModification; prevue: Reservation };

/**
 * La règle des deux dépôts, la même en démonstration et en base : la vente
 * se modifie-t-elle, que devient-elle, et le total vu à l'écran est-il
 * toujours le sien. `gamme` : celle de son premier vélo.
 *
 * Le total attendu ne correspond plus : la vente a changé entre-temps
 * (« changee »), sauf si elle est déjà exactement telle que demandée, un
 * envoi répété dont la réponse s'est perdue (« deja »). Le nouveau total
 * vu à l'écran doit être celui que le serveur trouve (« montant » sinon).
 */
export function preparerModification(
  avant: Reservation,
  gamme: GammeVelo | undefined,
  modification: ModificationVente,
  reglages: ReglagesProduits,
  aujourdhuiIci: DateISO,
): PreparationModification {
  const refus = refusModificationVente(avant);
  if (refus) return { etape: "refus", resultat: { ok: false, raison: refus } };

  const client = clientApres(avant, modification);
  const champsClient: Record<string, string> = {};
  // Au comptoir, un prénom et un nom de deux lettres au moins ; une offre de
  // groupe en accepte d'une seule, comme sa vente.
  const minimum = estOffreGroupe(avant.offre) ? 1 : 2;
  if (client.prenom !== avant.client.prenom && client.prenom.length < minimum) champsClient.prenom = "Prénom trop court.";
  if (client.nom !== avant.client.nom && client.nom.length < minimum) champsClient.nom = "Nom trop court.";

  const issue = calculerModification(venteAModifier(avant, gamme), modification, reglages, aujourdhuiIci);
  if (!issue.ok || Object.keys(champsClient).length > 0) {
    return { etape: "refus", resultat: { ok: false, raison: "saisie", champs: { ...(issue.ok ? {} : issue.champs), ...champsClient } } };
  }

  const encaissePar = modification.encaissePar?.trim() ?? encaisseParDe(avant);
  const prevue = reservationPrevue(avant, issue.calcul, client, encaissePar);
  const rienNeChange = champsChanges(etatDeLaVente(avant), etatDeLaVente(prevue)).length === 0;
  if (avant.totalXof !== modification.totalAttenduXof) {
    if (rienNeChange && avant.totalXof === modification.nouveauTotalXof) return { etape: "deja" };
    return { etape: "refus", resultat: { ok: false, raison: "changee", totalXof: avant.totalXof } };
  }
  if (rienNeChange) return { etape: "deja" };
  if (issue.calcul.totalXof !== modification.nouveauTotalXof) {
    return { etape: "refus", resultat: { ok: false, raison: "montant", totalXof: issue.calcul.totalXof } };
  }
  return { etape: "ecrire", calcul: issue.calcul, prevue };
}

/** Le client après la modification : les champs donnés, nettoyés, et les autres tels quels. */
function clientApres(
  avant: Reservation,
  modification: ModificationVente,
): { prenom: string; nom: string; email: string; telephone: string } {
  return {
    prenom: modification.prenom?.trim() ?? avant.client.prenom,
    nom: modification.nom?.trim() ?? avant.client.nom,
    email: modification.email?.trim().toLowerCase() ?? avant.client.email,
    telephone: modification.telephone?.trim() ?? avant.client.telephone ?? "",
  };
}

/** Qui a reçu l'argent de la vente. */
function encaisseParDe(reservation: Reservation): string {
  return reservation.paiements.find((p) => !p.estCaution)?.encaissePar ?? "";
}

/**
 * La vente telle qu'elle sera après la modification, vélos mis à part :
 * ce que la démonstration écrit, et ce que le journal compare.
 */
export function reservationPrevue(
  avant: Reservation,
  calcul: CalculModification,
  client: { prenom: string; nom: string; email: string; telephone: string },
  encaissePar: string,
): Reservation {
  return {
    ...avant,
    nombrePersonnes: calcul.nombrePersonnes,
    dureeHeures: calcul.dureeHeures,
    dateDebut: calcul.date,
    dateFin: calcul.date,
    heureDebut: calcul.heureDebut,
    heureFin: calcul.heureFin,
    horaire: calcul.horaire,
    sousTotalXof: calcul.sousTotalXof,
    remiseXof: calcul.remiseXof,
    cautionXof: calcul.cautionXof,
    totalXof: calcul.totalXof,
    client: {
      ...avant.client,
      prenom: client.prenom,
      nom: client.nom,
      email: client.email,
      telephone: client.telephone || undefined,
    },
    paiements: avant.paiements.map((paiement) =>
      paiement.estCaution ? paiement : { ...paiement, montantXof: calcul.totalXof, encaissePar: encaissePar || undefined },
    ),
  };
}

/* ----------------------------------------------------- Le journal */

/** Ce que le journal garde d'une vente, avant et après : des valeurs simples. */
export interface EtatVente {
  personnes: number;
  totalXof: number;
  date: DateISO;
  /** « 17:00-21:00 », ou l'horaire exact d'une sortie réglée à la minute (« 17:30-20:30 »). */
  heures: string;
  /** La location libre seulement. */
  dureeHeures?: number;
  prenom: string;
  nom: string;
  email: string;
  /** Vide quand le client n'en a pas laissé. */
  telephone: string;
  encaissePar: string;
}

const deuxChiffres = (n: number) => String(n).padStart(2, "0");

/** « 17:00-21:00 » ; l'horaire exact quand la vente en a un, ou les minutes d'une offre de groupe. */
export function heuresDe(
  reservation: Pick<Reservation, "heureDebut" | "heureFin" | "horaire" | "minuteDebut" | "minuteFin">,
): string {
  if (reservation.horaire) return `${reservation.horaire.depart}-${reservation.horaire.retour}`;
  if (reservation.minuteDebut !== undefined && reservation.minuteFin !== undefined) {
    const heure = (minutes: number) => `${deuxChiffres(Math.floor(minutes / 60))}:${deuxChiffres(minutes % 60)}`;
    return `${heure(reservation.minuteDebut)}-${heure(reservation.minuteFin)}`;
  }
  return `${deuxChiffres(reservation.heureDebut)}:00-${deuxChiffres(reservation.heureFin)}:00`;
}

export function etatDeLaVente(reservation: Reservation): EtatVente {
  return {
    personnes: reservation.nombrePersonnes,
    totalXof: reservation.totalXof,
    date: reservation.dateDebut,
    heures: heuresDe(reservation),
    ...(reservation.offre === "location-libre" && reservation.dureeHeures !== undefined
      ? { dureeHeures: reservation.dureeHeures }
      : {}),
    prenom: reservation.client.prenom,
    nom: reservation.client.nom,
    email: reservation.client.email,
    telephone: reservation.client.telephone ?? "",
    encaissePar: encaisseParDe(reservation),
  };
}

/** Les champs qui ont changé, dans l'ordre où le journal les raconte. */
export function champsChanges(avant: EtatVente, apres: EtatVente): (keyof EtatVente)[] {
  const ordre: (keyof EtatVente)[] = [
    "personnes",
    "totalXof",
    "date",
    "heures",
    "dureeHeures",
    "prenom",
    "nom",
    "telephone",
    "email",
    "encaissePar",
  ];
  return ordre.filter((cle) => avant[cle] !== apres[cle]);
}

/** Les détails de la ligne « vente-modifiee » du journal : l'avant, l'après, ce qui a changé, les vélos rendus ou pris. */
export function detailsVenteModifiee(
  avant: Reservation,
  apres: Reservation,
  velos: { retires: string[]; ajoutes: string[] },
): Record<string, unknown> {
  const etatAvant = etatDeLaVente(avant);
  const etatApres = etatDeLaVente(apres);
  return {
    offre: apres.offre,
    avant: etatAvant,
    apres: etatApres,
    champs: champsChanges(etatAvant, etatApres),
    ...(velos.retires.length > 0 ? { velosRetires: velos.retires } : {}),
    ...(velos.ajoutes.length > 0 ? { velosAjoutes: velos.ajoutes } : {}),
  };
}
