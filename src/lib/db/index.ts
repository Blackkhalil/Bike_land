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
  velosLibres: async (date, heureDebut, heureFin) =>
    (await obtenirDepot()).velosLibres(date, heureDebut, heureFin),
  creerReservation: async (demande) => (await obtenirDepot()).creerReservation(demande),
  trouverReservationParToken: async (token) => (await obtenirDepot()).trouverReservationParToken(token),
  trouverReservationParReference: async (reference) =>
    (await obtenirDepot()).trouverReservationParReference(reference),
  trouverReservationParPaiement: async (referencePaiement) =>
    (await obtenirDepot()).trouverReservationParPaiement(referencePaiement),
  annulerReservation: async (reference, options) => (await obtenirDepot()).annulerReservation(reference, options),
  noterRemboursementEspeces: async (reference, montantXof) =>
    (await obtenirDepot()).noterRemboursementEspeces(reference, montantXof),
  supprimerReservation: async (reference) => (await obtenirDepot()).supprimerReservation(reference),
  listerRappelsAEnvoyer: async (date) => (await obtenirDepot()).listerRappelsAEnvoyer(date),
  retenirRappel: async (reservationId) => (await obtenirDepot()).retenirRappel(reservationId),
  libererRappel: async (reservationId) => (await obtenirDepot()).libererRappel(reservationId),
  listerReservations: async (options) => (await obtenirDepot()).listerReservations(options),
  listerClients: async () => (await obtenirDepot()).listerClients(),
  confirmerPaiement: async (reference, referenceTransaction) =>
    (await obtenirDepot()).confirmerPaiement(reference, referenceTransaction),
  marquerDepart: async (reference) => (await obtenirDepot()).marquerDepart(reference),
  marquerRetour: async (reference) => (await obtenirDepot()).marquerRetour(reference),
  creerVelo: async (champs) => (await obtenirDepot()).creerVelo(champs),
  lireParametreAdmin: async (cle) => (await obtenirDepot()).lireParametreAdmin(cle),
  ecrireParametreAdmin: async (cle, valeur) => (await obtenirDepot()).ecrireParametreAdmin(cle, valeur),
  effacerParametreAdmin: async (cle) => (await obtenirDepot()).effacerParametreAdmin(cle),
  avancerParametreAdmin: async (cle, valeur) => (await obtenirDepot()).avancerParametreAdmin(cle, valeur),
  compterEssai: async (cle, fenetreSecondes) => (await obtenirDepot()).compterEssai(cle, fenetreSecondes),
  effacerCompteur: async (cle) => (await obtenirDepot()).effacerCompteur(cle),
  marquerTransactionRecue: async (reference, referenceTransaction) =>
    (await obtenirDepot()).marquerTransactionRecue(reference, referenceTransaction),
  majVelo: async (id, champs) => (await obtenirDepot()).majVelo(id, champs),
  verifierCodeParrainage: async (code, montantXof) =>
    (await obtenirDepot()).verifierCodeParrainage(code, montantXof),
  listerPartenaires: async (options) => (await obtenirDepot()).listerPartenaires(options),
  creerPartenaire: async (champs) => (await obtenirDepot()).creerPartenaire(champs),
  majPartenaire: async (id, champs) => (await obtenirDepot()).majPartenaire(id, champs),
  supprimerPartenaire: async (id) => (await obtenirDepot()).supprimerPartenaire(id),
  lireOuverture: async () => (await obtenirDepot()).lireOuverture(),
  reglerCreneau: async (code, actif) => (await obtenirDepot()).reglerCreneau(code, actif),
  fermerJour: async (champs) => (await obtenirDepot()).fermerJour(champs),
  rouvrirJour: async (id) => (await obtenirDepot()).rouvrirJour(id),
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
  listerIndisponibilites: async (options) => (await obtenirDepot()).listerIndisponibilites(options),
  ajouterIndisponibilite: async (champs) => (await obtenirDepot()).ajouterIndisponibilite(champs),
  retirerIndisponibilite: async (id, par) => (await obtenirDepot()).retirerIndisponibilite(id, par),
  journaliser: async (evenement) => (await obtenirDepot()).journaliser(evenement),
  listerJournal: async (filtre) => (await obtenirDepot()).listerJournal(filtre),
  creerRemboursement: async (champs) => (await obtenirDepot()).creerRemboursement(champs),
  listerRemboursements: async (filtre) => (await obtenirDepot()).listerRemboursements(filtre),
  marquerRemboursementFait: async (id, par) => (await obtenirDepot()).marquerRemboursementFait(id, par),
  enregistrerRetard: async (reference, minutes, par) =>
    (await obtenirDepot()).enregistrerRetard(reference, minutes, par),
  reservationsTouchees: async (depuis) => (await obtenirDepot()).reservationsTouchees(depuis),
};
