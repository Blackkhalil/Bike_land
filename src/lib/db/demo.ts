/**
 * Implémentation « démo » du dépôt : tout en mémoire.
 *
 * Active tant que DATABASE_URL n'est pas défini. Elle permet de lancer le
 * site et le tableau de bord avec `npm run dev`, sans PostgreSQL, tout en
 * respectant la même règle métier que la production : impossible de créer
 * deux réservations qui se chevauchent sur un même vélo.
 *
 * Les écritures ne sont évidemment pas persistées au-delà du processus.
 */

import { optionsLocation, pointsDeRetrait, velos } from "@/data/catalogue";
import { aujourdhui, nombreDeJours, type DateISO } from "../dates";
import {
  DUREE_ROAD_TRIP_HEURES,
  EXPIRATION_PANIER_MINUTES,
  FERMETURE_HEURE,
  OUVERTURE_HEURE,
} from "@/data/offres";
import { calculerDevis } from "../tarification";
import { genererReference, genererToken, hacherToken, lireToken } from "../tokens";
import {
  commissionPour,
  normaliserCode,
  verifierCode,
  type CodeParrainage,
} from "../parrainage";
import type {
  AvisClient,
  Client,
  MessageContact,
  Partenaire,
  PointDeRetrait,
  Reservation,
  StatutReservation,
  Velo,
} from "../types";
import {
  ConflitDisponibiliteError,
  creneauxSeChevauchent,
  resteUneHeureLibre,
  TransactionDejaUtiliseeError,
  type Depot,
  type DemandeReservation,
  type FiltreCatalogue,
  type ResultatReservation,
} from "./contrat";
import { construireHistorique } from "./historique";

interface EtatDemo {
  clients: Client[];
  reservations: Reservation[];
  messages: MessageContact[];
  avis: AvisClient[];
  partenaires: Partenaire[];
  codesPromo: CodeParrainage[];
  /** Une entrée par utilisation : c'est la source des statistiques. */
  utilisationsPromo: {
    code: string;
    reference: string;
    remiseXof: number;
    /** Figée à l'utilisation, comme en production. */
    commissionXof: number;
    /**
     * Un usage n'est acquis au partenaire qu'une fois le paiement
     * confirmé. Même règle qu'en production, sans quoi les deux modes
     * ne raconteraient pas la même chose.
     */
    statut: "EN_ATTENTE" | "VALIDE" | "ANNULE";
    le: string;
  }[];
  /** reference -> hachage du token de suivi. */
  tokens: Map<string, string>;
}

// L'état vit sur `globalThis` : en développement, le rechargement à chaud
// de Next.js réévalue les modules et réinitialiserait sinon les données à
// chaque modification de fichier.
const cle = Symbol.for("bikeland.demo.etat");
type PorteurGlobal = typeof globalThis & { [cle]?: EtatDemo };

function etat(): EtatDemo {
  const porteur = globalThis as PorteurGlobal;
  if (!porteur[cle]) {
    const historique = construireHistorique(aujourdhui());
    porteur[cle] = {
      clients: historique.clients,
      reservations: historique.reservations,
      messages: [],
      avis: [],
      partenaires: [],
      codesPromo: [],
      utilisationsPromo: [],
      tokens: new Map(),
    };
  }
  return porteur[cle]!;
}

function copie<T>(valeur: T): T {
  return structuredClone(valeur);
}

function trouver(reference: string) {
  return etat().reservations.find(
    (r) => r.reference.toUpperCase() === reference.toUpperCase(),
  );
}

export const depotDemo: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    let resultat = filtre?.inclureRetires
      ? velos
      : velos.filter((velo) => velo.statut !== "RETIRE");

    if (filtre?.pointDeRetraitId) {
      resultat = resultat.filter((velo) => velo.pointDeRetraitId === filtre.pointDeRetraitId);
    }
    if (filtre?.dateDebut && filtre?.dateFin) {
      // « Ce vélo a-t-il encore de la place ce jour-là », et non « est-il
      // intégralement libre » : une sortie du matin laisse l'après-midi.
      const libres = new Set<string>();
      for (const velo of resultat) {
        // Un vélo à l'atelier ne se propose pas, quelle que soit la date.
        if (velo.statut === "MAINTENANCE") continue;
        const pris = await this.periodesIndisponibles(velo.id);
        if (
          resteUneHeureLibre(
            pris,
            filtre.dateDebut,
            filtre.dateFin,
            OUVERTURE_HEURE,
            FERMETURE_HEURE,
          )
        ) {
          libres.add(velo.id);
        }
      }
      resultat = resultat.filter((velo) => libres.has(velo.id));
    }

    return copie(resultat);
  },

  async trouverVeloParSlug(slug: string) {
    return copie(velos.find((velo) => velo.slug === slug) ?? null);
  },

  async trouverVeloParId(id: string) {
    return copie(velos.find((velo) => velo.id === id) ?? null);
  },

  async listerPointsDeRetrait(): Promise<PointDeRetrait[]> {
    return copie(pointsDeRetrait.filter((point) => point.actif));
  },

  async periodesIndisponibles(veloId: string) {
    const limite = Date.now() - EXPIRATION_PANIER_MINUTES * 60_000;
    return etat()
      .reservations.filter(
        (reservation) =>
          reservation.statut !== "ANNULEE" &&
          // Un panier abandonne cesse de bloquer le velo.
          !(
            reservation.statut === "EN_ATTENTE_PAIEMENT" &&
            new Date(reservation.creeLe).getTime() < limite
          ) &&
          reservation.lignes.some((ligne) => ligne.veloId === veloId),
      )
      .map((reservation) => ({
        debut: reservation.dateDebut,
        fin: reservation.dateFin,
        heureDebut: reservation.heureDebut,
        heureFin: reservation.heureFin,
      }));
  },

  async estDisponible(
    veloId: string,
    debut: DateISO,
    fin: DateISO,
    heureDebut: number,
    heureFin: number,
  ) {
    const velo = velos.find((v) => v.id === veloId);
    if (!velo || velo.statut === "RETIRE" || velo.statut === "MAINTENANCE") return false;

    const periodes = await this.periodesIndisponibles(veloId);
    return !periodes.some((periode) =>
      creneauxSeChevauchent({ debut, fin, heureDebut, heureFin }, periode),
    );
  },

  async creerReservation(demande: DemandeReservation): Promise<ResultatReservation> {
    const velo = velos.find((v) => v.id === demande.veloId);
    if (!velo) throw new Error("Vélo introuvable.");

    // Devis sans remise d'abord : c'est sur son total que le code de parrainage
    // s'applique.
    const devisBrut = calculerDevis({
      offre: demande.offre,
      // La gamme vient du vélo, jamais de l'appelant : c'est elle qui
      // fixe le prix.
      gamme: velo.gamme,
      nombrePersonnes: demande.nombrePersonnes,
      dureeHeures: demande.dureeHeures,
      options: demande.options,
    });

    // Vérification et consommation du code dans la foulée. Le mode
    // démonstration est mono-processus, il n'y a pas de concurrence à
    // protéger, mais la règle appliquée est exactement la même qu'en
    // production, sans quoi les deux modes ne répondraient pas pareil.
    let remise: { code: string; montantXof: number } | undefined;
    if (demande.codeParrainage) {
      const controle = await this.verifierCodeParrainage(demande.codeParrainage, devisBrut.totalXof);
      if (controle.valide && controle.remiseXof > 0) {
        const ligne = etat().codesPromo.find((c) => c.code === controle.code.code);
        if (ligne) {
          ligne.utilisations += 1;
          remise = { code: ligne.code, montantXof: controle.remiseXof };
        }
      }
    }

    const devis = remise
      ? calculerDevis({
          offre: demande.offre,
          gamme: velo.gamme,
          nombrePersonnes: demande.nombrePersonnes,
          dureeHeures: demande.dureeHeures,
          options: demande.options,
          remise,
        })
      : devisBrut;

    // L'heure de fin découle de la formule : le road trip dure le temps
    // de son créneau, la location libre le nombre d'heures choisi.
    const heureFin =
      demande.offre === "road-trip"
        ? demande.heureDebut + DUREE_ROAD_TRIP_HEURES
        : demande.heureDebut + (devis.dureeHeures ?? 1);

    // Dernière vérification avant écriture : c'est ici que se joue
    // l'absence de double réservation.
    if (
      !(await this.estDisponible(
        velo.id,
        demande.dateDebut,
        demande.dateFin,
        demande.heureDebut,
        heureFin,
      ))
    ) {
      throw new ConflitDisponibiliteError();
    }
    const donnees = etat();

    const emailNormalise = demande.client.email.trim().toLowerCase();
    let client = donnees.clients.find((c) => c.email === emailNormalise);
    if (!client) {
      client = {
        id: `cli-${donnees.clients.length + 1}-${Date.now().toString(36)}`,
        email: emailNormalise,
        prenom: demande.client.prenom.trim(),
        nom: demande.client.nom.trim(),
        telephone: demande.client.telephone?.trim(),
        creeLe: new Date().toISOString(),
      };
      donnees.clients.push(client);
    }

    const reference = genererReference();
    const token = genererToken(reference);
    donnees.tokens.set(reference, hacherToken(token));

    const maintenant = new Date().toISOString();
    const reservation: Reservation = {
      id: `res-${reference}`,
      reference,
      // La reservation nait EN ATTENTE : seul le paiement verifie la
      // confirme. Sans cela, on pourrait reserver un velo sans payer.
      statut: "EN_ATTENTE_PAIEMENT",
      offre: demande.offre,
      nombrePersonnes: devis.nombrePersonnes,
      dureeHeures: devis.dureeHeures ?? undefined,
      clientId: client.id,
      client,
      pointDeRetraitId: velo.pointDeRetraitId,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      heureDebut: demande.heureDebut,
      heureFin,
      jours: nombreDeJours(demande.dateDebut, demande.dateFin),
      lignes: [
        {
          veloId: velo.id,
          veloNom: velo.nom,
          veloSlug: velo.slug,
          prixUnitaireXof: devis.sousTotalXof,
          totalLigneXof: devis.sousTotalXof,
        },
      ],
      options: devis.optionsDetaillees.map((ligne) => ({
        code: ligne.option.code,
        libelle: ligne.option.libelle,
        prixXof: ligne.montantXof,
        quantite: ligne.quantite,
      })),
      sousTotalXof: devis.sousTotalXof,
      optionsXof: devis.optionsXof,
      remiseXof: devis.remiseXof,
      codeParrainage: remise?.code,
      commissionParrainageXof: remise ? commissionPour(devis.totalXof) : undefined,
      cautionXof: devis.cautionXof,
      totalXof: devis.totalXof,
      paiements: [
        {
          id: `pay-${reference}`,
          fournisseur: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "SASPAY",
          moyen: demande.moyenPaiement,
          statut: "INITIE",
          montantXof: devis.totalXof,
          referenceFournisseur: `TX-${reference}`,
          estCaution: false,
          creeLe: maintenant,
        },
      ],
      message: demande.message,
      creeLe: maintenant,
    };

    donnees.reservations.push(reservation);

    // L'utilisation est enregistrée après coup, une fois la référence
    // connue : c'est elle qui rattache ce client au partenaire.
    if (remise) {
      donnees.utilisationsPromo.push({
        code: remise.code,
        reference: reservation.reference,
        remiseXof: remise.montantXof,
        commissionXof: commissionPour(devis.totalXof),
        statut: "EN_ATTENTE",
        le: maintenant,
      });
    }
    return { reservation: copie(reservation), token };
  },

  async trouverReservationParToken(token: string) {
    const reference = lireToken(token);
    if (!reference) return null;

    const hachageAttendu = etat().tokens.get(reference);
    // L'historique de démonstration n'a pas de token émis : on autorise
    // alors l'accès sur la seule signature, qui reste vérifiée.
    if (hachageAttendu && hachageAttendu !== hacherToken(token)) return null;

    return this.trouverReservationParReference(reference);
  },

  async trouverReservationParReference(reference: string) {
    const reservation = etat().reservations.find(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    return reservation ? copie(reservation) : null;
  },

  async supprimerReservation(reference: string) {
    const donnees = etat();
    const index = donnees.reservations.findIndex(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    if (index === -1) return false;

    const reservation = donnees.reservations[index];
    // Même garde-fou qu'en base : ce qui a encaissé ne s'efface pas.
    const aEncaisse = reservation.paiements.some(
      (paiement) => !paiement.estCaution && paiement.statut === "REUSSI",
    );
    if (aEncaisse || reservation.statut !== "EN_ATTENTE_PAIEMENT") return false;

    const usage = donnees.utilisationsPromo.find(
      (u) => u.reference === reservation.reference && u.statut === "EN_ATTENTE",
    );
    if (usage) {
      const code = donnees.codesPromo.find((c) => c.code === usage.code);
      if (code) code.utilisations = Math.max(0, code.utilisations - 1);
      donnees.utilisationsPromo.splice(donnees.utilisationsPromo.indexOf(usage), 1);
    }

    donnees.reservations.splice(index, 1);
    return true;
  },

  async annulerReservation(reference: string) {
    const reservation = etat().reservations.find(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    if (!reservation) return null;
    reservation.statut = "ANNULEE";
    reservation.annuleLe = new Date().toISOString();

    // Un usage encore en attente libère le quota qu'il retenait. Un
    // usage validé, lui, correspond à un paiement encaissé : on n'y
    // touche pas.
    const donnees = etat();
    const usage = donnees.utilisationsPromo.find(
      (u) => u.reference === reservation.reference && u.statut === "EN_ATTENTE",
    );
    if (usage) {
      usage.statut = "ANNULE";
      const code = donnees.codesPromo.find((c) => c.code === usage.code);
      if (code && code.utilisations > 0) code.utilisations -= 1;
    }

    return copie(reservation);
  },

  async listerReservations(options?: { statut?: StatutReservation; depuis?: DateISO; jusqua?: DateISO }) {
    let resultat = etat().reservations;
    if (options?.statut) resultat = resultat.filter((r) => r.statut === options.statut);
    if (options?.depuis) resultat = resultat.filter((r) => r.dateFin >= options.depuis!);
    if (options?.jusqua) resultat = resultat.filter((r) => r.dateDebut <= options.jusqua!);
    return copie([...resultat].sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1)));
  },

  async listerClients() {
    return copie(etat().clients);
  },

  async confirmerPaiement(reference: string, referenceTransaction?: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;

    // Équivalent en mémoire de la contrainte d'unicité de PostgreSQL :
    // un identifiant de transaction ne confirme qu'une seule réservation.
    if (referenceTransaction) {
      const ailleurs = etat().reservations.some(
        (autre) =>
          autre.reference !== reservation.reference &&
          autre.paiements.some(
            (paiement) => paiement.referenceFournisseur === referenceTransaction,
          ),
      );
      if (ailleurs) throw new TransactionDejaUtiliseeError();
    }

    // Idempotence : rejouer la notification ne doit rien changer, et
    // surtout ne pas renvoyer un second email au client.
    if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
      return { reservation: copie(reservation), dejaConfirmee: true };
    }

    reservation.statut = "CONFIRMEE";
    reservation.confirmeLe = new Date().toISOString();
    for (const paiement of reservation.paiements) {
      if (paiement.estCaution) continue;
      paiement.statut = "REUSSI";
      if (referenceTransaction) paiement.referenceFournisseur = referenceTransaction;
    }

    // Le parrainage n'est acquis au partenaire qu'ici. Le filtre sur
    // « en attente » interdit le double comptage d'un webhook rejoué.
    const usage = etat().utilisationsPromo.find(
      (u) => u.reference === reservation.reference && u.statut === "EN_ATTENTE",
    );
    if (usage) usage.statut = "VALIDE";

    return { reservation: copie(reservation), dejaConfirmee: false };
  },

  async marquerDepart(reference: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;
    // Une reservation annulee ne repart pas ; une deja en cours reste
    // en cours (le coordinateur a pu cliquer deux fois).
    if (reservation.statut === "ANNULEE") return copie(reservation);
    reservation.statut = "EN_COURS";
    return copie(reservation);
  },

  async marquerRetour(reference: string) {
    const reservation = trouver(reference);
    if (!reservation) return null;
    if (reservation.statut === "ANNULEE") return copie(reservation);
    reservation.statut = "TERMINEE";
    return copie(reservation);
  },

  async creerVelo(champs) {
    // Même logique que `majVelo` : le catalogue est un module importé,
    // donc partagé. On y pousse le vélo, sans rien persister au-delà du
    // processus, c'est la limite assumée du mode démonstration.
    const velo: Velo = {
      id: `velo-${slugifier(champs.nom)}-${Date.now().toString(36)}`,
      slug: slugUnique(slugifier(champs.nom)),
      nom: champs.nom,
      categorie: champs.categorie,
      gamme: champs.gamme,
      taille: champs.taille,
      statut: "DISPONIBLE",
      accroche: champs.accroche,
      description: champs.description,
      poidsKg: champs.poidsKg,
      vitesses: champs.vitesses,
      chargeMaxKg: champs.chargeMaxKg,
      autonomieConseilleeKm: champs.autonomieConseilleeKm,
      equipementInclus: champs.equipementInclus,
      pointDeRetraitId: champs.pointDeRetraitId ?? pointsDeRetrait[0].id,
      noteMoyenne: 0,
      nombreAvis: 0,
      teintes: ["#1c1b19", "#f25c05"],
      photo: champs.photo,
    };
    velos.push(velo);
    return copie(velo);
  },

  async majVelo(id, champs) {
    // Le catalogue est un module importe, donc partage : on mute
    // l'objet en place, comme le fait deja l'historique de demonstration
    // pour les reservations. Rien n'est persiste au-dela du processus.
    const velo = velos.find((v) => v.id === id);
    if (!velo) return null;
    if (champs.statut !== undefined) velo.statut = champs.statut;
    if (champs.gamme !== undefined) velo.gamme = champs.gamme;
    return copie(velo);
  },

  /* ------------------------------------------------ Parrainage partenaires */

  async verifierCodeParrainage(code, montantXof) {
    const normalise = normaliserCode(code);
    const donnees = etat();
    const ligne = donnees.codesPromo.find((c) => c.code === normalise) ?? null;
    // Un partenariat désactivé retire toute valeur à ses codes.
    const partenaire = ligne
      ? donnees.partenaires.find((p) => p.id === ligne.partenaireId)
      : undefined;
    return verifierCode(ligne && partenaire?.actif ? ligne : null, montantXof);
  },

  async listerPartenaires(options) {
    const liste = options?.inclureInactifs
      ? etat().partenaires
      : etat().partenaires.filter((p) => p.actif);
    return copie([...liste].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
  },

  async creerPartenaire(champs) {
    const donnees = etat();
    const partenaire: Partenaire = {
      id: `part-${donnees.partenaires.length + 1}-${Date.now().toString(36)}`,
      nom: champs.nom.trim(),
      contact: champs.contact?.trim() || undefined,
      notes: champs.notes?.trim() || undefined,
      actif: true,
      creeLe: new Date().toISOString(),
    };
    donnees.partenaires.push(partenaire);
    return copie(partenaire);
  },

  async majPartenaire(id, champs) {
    const partenaire = etat().partenaires.find((p) => p.id === id);
    if (!partenaire) return null;
    if (champs.actif !== undefined) partenaire.actif = champs.actif;
    return copie(partenaire);
  },

  async listerCodesParrainage() {
    return copie([...etat().codesPromo].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1)));
  },

  async creerCodeParrainage(champs) {
    const donnees = etat();
    const partenaire = donnees.partenaires.find((p) => p.id === champs.partenaireId);
    const code: CodeParrainage = {
      code: normaliserCode(champs.code),
      partenaireId: champs.partenaireId,
      partenaireNom: partenaire?.nom ?? "",
      debuteLe: champs.debuteLe,
      // Fin de journée incluse : un code qui finit « le 31 » vaut tout le 31.
      finitLe: champs.finitLe ? new Date(`${champs.finitLe}T23:59:59`).toISOString() : undefined,
      utilisationsMax: champs.utilisationsMax,
      utilisations: 0,
      actif: true,
      creeLe: new Date().toISOString(),
    };
    donnees.codesPromo.push(code);
    return copie(code);
  },

  async majCodeParrainage(code, champs) {
    const ligne = etat().codesPromo.find((c) => c.code === normaliserCode(code));
    if (!ligne) return null;
    if (champs.actif !== undefined) ligne.actif = champs.actif;
    return copie(ligne);
  },

  async supprimerPartenaire(id) {
    const donnees = etat();
    const index = donnees.partenaires.findIndex((p) => p.id === id);
    if (index < 0) return { supprime: false };
    const siens = new Set(donnees.codesPromo.filter((c) => c.partenaireId === id).map((c) => c.code));
    const usages = donnees.utilisationsPromo.filter((u) => siens.has(u.code));
    if (usages.some((u) => u.statut === "VALIDE")) return { supprime: false, raison: "commissions" as const };
    if (usages.some((u) => u.statut === "EN_ATTENTE")) return { supprime: false, raison: "en-attente" as const };
    donnees.utilisationsPromo = donnees.utilisationsPromo.filter((u) => !siens.has(u.code));
    donnees.codesPromo = donnees.codesPromo.filter((c) => !siens.has(c.code));
    donnees.partenaires.splice(index, 1);
    return { supprime: true, codes: siens.size };
  },

  async supprimerCodeParrainage(code) {
    const normalise = normaliserCode(code);
    const donnees = etat();
    // Effacer un code déjà utilisé effacerait la seule trace de ce que le
    // partenaire a apporté.
    if (donnees.utilisationsPromo.some((u) => u.code === normalise)) {
      return { supprime: false, raison: "deja-utilise" as const };
    }
    const index = donnees.codesPromo.findIndex((c) => c.code === normalise);
    if (index < 0) return { supprime: false };
    donnees.codesPromo.splice(index, 1);
    return { supprime: true };
  },

  async statistiquesPartenaires() {
    const donnees = etat();
    return copie(
      [...donnees.partenaires]
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        .map((partenaire) => {
          const codes = donnees.codesPromo
            .filter((c) => c.partenaireId === partenaire.id)
            .map((c) => c.code);

          // Les réservations annulées ne comptent pas : le partenaire n'a
          // pas apporté un client qui s'est décommandé.
          const utilisations = donnees.utilisationsPromo
            .filter((u) => codes.includes(u.code) && u.statut === "VALIDE")
            .map((u) => ({
              ...u,
              reservation: donnees.reservations.find((r) => r.reference === u.reference),
            }))
            .filter((u) => u.reservation && u.reservation.statut !== "ANNULEE");

          return {
            partenaire,
            codes,
            utilisations: utilisations.length,
            reductionsAccordeesXof: utilisations.reduce((total, u) => total + u.remiseXof, 0),
            chiffreAffairesXof: utilisations.reduce(
              (total, u) => total + (u.reservation?.totalXof ?? 0),
              0,
            ),
            commissionDueXof: utilisations.reduce((total, u) => total + u.commissionXof, 0),
            derniereUtilisation: utilisations.map((u) => u.le).sort().at(-1),
          };
        }),
    );
  },

  /* ------------------------------------------------------- Avis clients */

  async enregistrerAvis(entree) {
    const reservation = trouver(entree.reference);
    // On ne note que ce qu'on a vécu : la sortie doit être terminée.
    if (!reservation || reservation.statut !== "TERMINEE") return null;

    const donnees = etat();
    const ligne = reservation.lignes[0];
    const existant = donnees.avis.find(
      (avis) => avis.reference.toUpperCase() === entree.reference.toUpperCase(),
    );

    // Un second envoi corrige le premier plutôt que d'en empiler un autre,
    // et repasse en relecture : le texte a changé.
    if (existant) {
      existant.note = entree.note;
      existant.titre = entree.titre;
      existant.commentaire = entree.commentaire;
      existant.publie = false;
      return copie(existant);
    }

    const avis: AvisClient = {
      id: `avis-${reservation.reference}`,
      veloId: ligne?.veloId ?? "",
      veloNom: ligne?.veloNom ?? "",
      reference: reservation.reference,
      // Le nom de famille reste chez nous : un avis public n'a pas à
      // désigner quelqu'un précisément.
      auteur: `${reservation.client.prenom} ${reservation.client.nom.slice(0, 1)}.`,
      note: entree.note,
      titre: entree.titre,
      commentaire: entree.commentaire,
      publie: false,
      creeLe: new Date().toISOString(),
    };
    donnees.avis.push(avis);
    return copie(avis);
  },

  async trouverAvisParReference(reference) {
    const avis = etat().avis.find(
      (element) => element.reference.toUpperCase() === reference.toUpperCase(),
    );
    return copie(avis ?? null);
  },

  async listerAvis(filtre) {
    let resultat = etat().avis;
    if (filtre?.publiesSeulement) resultat = resultat.filter((avis) => avis.publie);
    if (filtre?.veloId) resultat = resultat.filter((avis) => avis.veloId === filtre.veloId);
    return copie([...resultat].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1)));
  },

  async publierAvis(id, publie) {
    const avis = etat().avis.find((element) => element.id === id);
    if (!avis) return null;
    avis.publie = publie;
    return copie(avis);
  },

  async enregistrerMessageContact(message) {
    const enregistre: MessageContact = {
      ...message,
      id: `msg-${Date.now().toString(36)}`,
      creeLe: new Date().toISOString(),
    };
    etat().messages.unshift(enregistre);
    return copie(enregistre);
  },

  async listerMessagesContact() {
    return copie(etat().messages);
  },
};

/** Exposé pour les récapitulatifs : le catalogue d'options est statique. */
export { optionsLocation };

/** « Vélo de ville N°3 » devient « velo-de-ville-n-3 ». */
function slugifier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Suffixe le slug tant qu'un vélo porte déjà le même. */
function slugUnique(base: string): string {
  if (!velos.some((velo) => velo.slug === base)) return base;
  let suffixe = 2;
  while (velos.some((velo) => velo.slug === `${base}-${suffixe}`)) suffixe += 1;
  return `${base}-${suffixe}`;
}
