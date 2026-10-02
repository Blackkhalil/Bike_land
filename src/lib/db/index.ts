/**
 * Point d'entrée unique de la couche de données.
 *
 * Le choix de l'implémentation est fait au premier appel : PostgreSQL si
 * DATABASE_URL est présent, jeu de démonstration en mémoire sinon. Les
 * pages et les routes d'API importent uniquement `depot` et ignorent
 * laquelle des deux répond.
 */

import { depotDemo } from "./demo";
import type { Depot } from "./contrat";

export * from "./contrat";

export function modeDonnees(): "postgres" | "demo" {
  return process.env.DATABASE_URL ? "postgres" : "demo";
}

let resolution: Promise<Depot> | null = null;

async function obtenirDepot(): Promise<Depot> {
  if (modeDonnees() === "demo") return depotDemo;
  resolution ??= import("./postgres").then((module) => module.depotPostgres);
  return resolution;
}

/**
 * Façade asynchrone : chaque méthode résout l'implémentation puis délègue.
 * Écrit à la main plutôt qu'avec un Proxy pour rester entièrement typé.
 */
export const depot: Depot = {
  listerVelos: async (filtre) => (await obtenirDepot()).listerVelos(filtre),
  trouverVeloParSlug: async (slug) => (await obtenirDepot()).trouverVeloParSlug(slug),
  trouverVeloParId: async (id) => (await obtenirDepot()).trouverVeloParId(id),
  listerPointsDeRetrait: async () => (await obtenirDepot()).listerPointsDeRetrait(),
  periodesIndisponibles: async (veloId) => (await obtenirDepot()).periodesIndisponibles(veloId),
  estDisponible: async (veloId, debut, fin, heureDebut, heureFin) =>
    (await obtenirDepot()).estDisponible(veloId, debut, fin, heureDebut, heureFin),
  creerReservation: async (demande) => (await obtenirDepot()).creerReservation(demande),
  trouverReservationParToken: async (token) => (await obtenirDepot()).trouverReservationParToken(token),
  trouverReservationParReference: async (reference) =>
    (await obtenirDepot()).trouverReservationParReference(reference),
  annulerReservation: async (reference) => (await obtenirDepot()).annulerReservation(reference),
  supprimerReservation: async (reference) => (await obtenirDepot()).supprimerReservation(reference),
  listerReservations: async (options) => (await obtenirDepot()).listerReservations(options),
  listerClients: async () => (await obtenirDepot()).listerClients(),
  confirmerPaiement: async (reference, referenceTransaction) =>
    (await obtenirDepot()).confirmerPaiement(reference, referenceTransaction),
  marquerDepart: async (reference) => (await obtenirDepot()).marquerDepart(reference),
  marquerRetour: async (reference) => (await obtenirDepot()).marquerRetour(reference),
  creerVelo: async (champs) => (await obtenirDepot()).creerVelo(champs),
  majVelo: async (id, champs) => (await obtenirDepot()).majVelo(id, champs),
  verifierCodeParrainage: async (code, montantXof) =>
    (await obtenirDepot()).verifierCodeParrainage(code, montantXof),
  listerPartenaires: async (options) => (await obtenirDepot()).listerPartenaires(options),
  creerPartenaire: async (champs) => (await obtenirDepot()).creerPartenaire(champs),
  majPartenaire: async (id, champs) => (await obtenirDepot()).majPartenaire(id, champs),
  listerCodesParrainage: async () => (await obtenirDepot()).listerCodesParrainage(),
  creerCodeParrainage: async (champs) => (await obtenirDepot()).creerCodeParrainage(champs),
  majCodeParrainage: async (code, champs) => (await obtenirDepot()).majCodeParrainage(code, champs),
  supprimerCodeParrainage: async (code) => (await obtenirDepot()).supprimerCodeParrainage(code),
  statistiquesPartenaires: async () => (await obtenirDepot()).statistiquesPartenaires(),
  enregistrerAvis: async (entree) => (await obtenirDepot()).enregistrerAvis(entree),
  trouverAvisParReference: async (reference) =>
    (await obtenirDepot()).trouverAvisParReference(reference),
  listerAvis: async (filtre) => (await obtenirDepot()).listerAvis(filtre),
  publierAvis: async (id, publie) => (await obtenirDepot()).publierAvis(id, publie),
  enregistrerMessageContact: async (message) => (await obtenirDepot()).enregistrerMessageContact(message),
  listerMessagesContact: async () => (await obtenirDepot()).listerMessagesContact(),
};
