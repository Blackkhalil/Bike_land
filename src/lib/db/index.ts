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
  estDisponible: async (veloId, debut, fin) => (await obtenirDepot()).estDisponible(veloId, debut, fin),
  creerReservation: async (demande) => (await obtenirDepot()).creerReservation(demande),
  trouverReservationParToken: async (token) => (await obtenirDepot()).trouverReservationParToken(token),
  trouverReservationParReference: async (reference) =>
    (await obtenirDepot()).trouverReservationParReference(reference),
  annulerReservation: async (reference) => (await obtenirDepot()).annulerReservation(reference),
  listerReservations: async (options) => (await obtenirDepot()).listerReservations(options),
  listerClients: async () => (await obtenirDepot()).listerClients(),
  enregistrerMessageContact: async (message) => (await obtenirDepot()).enregistrerMessageContact(message),
  listerMessagesContact: async () => (await obtenirDepot()).listerMessagesContact(),
};
