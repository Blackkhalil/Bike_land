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
import { aujourdhui, nombreDeJours, periodesSeChevauchent, type DateISO } from "../dates";
import { calculerDevis } from "../tarification";
import { genererReference, genererToken, hacherToken, lireToken } from "../tokens";
import type {
  Client,
  MessageContact,
  PointDeRetrait,
  Reservation,
  StatutReservation,
  Velo,
} from "../types";
import {
  ConflitDisponibiliteError,
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
      tokens: new Map(),
    };
  }
  return porteur[cle]!;
}

function copie<T>(valeur: T): T {
  return structuredClone(valeur);
}

export const depotDemo: Depot = {
  async listerVelos(filtre?: FiltreCatalogue): Promise<Velo[]> {
    let resultat = velos.filter((velo) => velo.statut !== "RETIRE");

    if (filtre?.categories?.length) {
      resultat = resultat.filter((velo) => filtre.categories!.includes(velo.categorie));
    }
    if (filtre?.tailles?.length) {
      resultat = resultat.filter((velo) => filtre.tailles!.includes(velo.taille));
    }
    if (filtre?.pointDeRetraitId) {
      resultat = resultat.filter((velo) => velo.pointDeRetraitId === filtre.pointDeRetraitId);
    }
    if (filtre?.prixMaxXof) {
      resultat = resultat.filter((velo) => velo.prixJourXof <= filtre.prixMaxXof!);
    }
    if (filtre?.dateDebut && filtre?.dateFin) {
      const libres = new Set<string>();
      for (const velo of resultat) {
        if (await this.estDisponible(velo.id, filtre.dateDebut, filtre.dateFin)) {
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
    return etat()
      .reservations.filter(
        (reservation) =>
          reservation.statut !== "ANNULEE" && reservation.lignes.some((ligne) => ligne.veloId === veloId),
      )
      .map((reservation) => ({ debut: reservation.dateDebut, fin: reservation.dateFin }));
  },

  async estDisponible(veloId: string, debut: DateISO, fin: DateISO) {
    const velo = velos.find((v) => v.id === veloId);
    if (!velo || velo.statut === "RETIRE" || velo.statut === "MAINTENANCE") return false;

    const periodes = await this.periodesIndisponibles(veloId);
    return !periodes.some((periode) => periodesSeChevauchent(debut, fin, periode.debut, periode.fin));
  },

  async creerReservation(demande: DemandeReservation): Promise<ResultatReservation> {
    const velo = velos.find((v) => v.id === demande.veloId);
    if (!velo) throw new Error("Vélo introuvable.");

    // Dernière vérification avant écriture : c'est ici que se joue
    // l'absence de double réservation.
    if (!(await this.estDisponible(velo.id, demande.dateDebut, demande.dateFin))) {
      throw new ConflitDisponibiliteError();
    }

    const devis = calculerDevis(velo, demande.dateDebut, demande.dateFin, demande.options);
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
      statut: "CONFIRMEE",
      clientId: client.id,
      client,
      pointDeRetraitId: velo.pointDeRetraitId,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      jours: nombreDeJours(demande.dateDebut, demande.dateFin),
      lignes: [
        {
          veloId: velo.id,
          veloNom: velo.nom,
          veloSlug: velo.slug,
          prixUnitaireXof: velo.prixJourXof,
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
      cautionXof: devis.cautionXof,
      totalXof: devis.totalXof,
      paiements: [
        {
          id: `pay-${reference}`,
          fournisseur: demande.moyenPaiement === "ESPECES" ? "ESPECES" : "FEDAPAY",
          moyen: demande.moyenPaiement,
          statut: "REUSSI",
          montantXof: devis.totalXof,
          referenceFournisseur: `TX-${reference}`,
          estCaution: false,
          creeLe: maintenant,
        },
      ],
      message: demande.message,
      creeLe: maintenant,
      confirmeLe: maintenant,
    };

    donnees.reservations.push(reservation);
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

  async annulerReservation(reference: string) {
    const reservation = etat().reservations.find(
      (r) => r.reference.toUpperCase() === reference.toUpperCase(),
    );
    if (!reservation) return null;
    reservation.statut = "ANNULEE";
    reservation.annuleLe = new Date().toISOString();
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
