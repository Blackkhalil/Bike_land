/**
 * Le journal des événements, pour le lire : les types d'événements connus,
 * leurs libellés, qui a fait quoi, et une phrase par événement pour la page
 * /admin/journal.
 *
 * Le journal s'écrit par le dépôt (`depot.journaliser`, et dans la même
 * transaction que l'écriture qu'il raconte pour les vélos indisponibles,
 * les retards et les remboursements). Une ligne ne se modifie ni ne
 * s'efface. Un type inconnu ici s'affiche quand même, avec ses détails
 * bruts : un lot qui journalise un nouvel événement n'a rien à déclarer.
 *
 * L'auteur est « admin » suivi du prénom saisi : il n'y a aujourd'hui qu'un
 * compte d'administration, partagé (décision technique du 9 novembre 2026).
 * « site » signale ce que le site a fait de lui-même (un paiement arrivé
 * trop tard qui crée un remboursement, par exemple).
 */

import {
  montantF,
  nomDuReglage,
  valeurReglageEnClair,
} from "@/data/libelles-reglages-offres";
import { OFFRES_GROUPE } from "@/data/offres";
import { formatDateAvecJour } from "@/lib/format";
import type { EvenementJournal } from "@/lib/types";

/** Les événements que l'administration sait raconter, et leur nom. */
export const TYPES_EVENEMENT: Readonly<Record<string, string>> = {
  "reglages-offres": "Réglages des offres",
  "interrupteur-offres": "Offres de groupe",
  "indisponibilite-ajoutee": "Vélo indisponible",
  "indisponibilite-retiree": "Vélo rendu au parc",
  retard: "Retard au retour",
  "remboursement-cree": "Remboursement à faire",
  "remboursement-fait": "Remboursement fait",
  "preuve-validee": "Réduction validée",
  "preuve-refusee": "Réduction refusée",
  "vente-comptoir-groupe": "Vente de groupe au comptoir",
};

/** Le nom d'un type d'événement, ou le type lui-même s'il est inconnu. */
export function libelleEvenement(type: string): string {
  return TYPES_EVENEMENT[type] ?? type;
}

/** « admin (Koffi) » : l'auteur d'un geste fait dans l'administration. */
export function auteurAdmin(prenom?: string): string {
  const nettoye = prenom?.trim();
  return nettoye ? `admin (${nettoye})` : "admin";
}

/** « Koffi » pour « admin (Koffi) », « le site » pour « site ». */
export function prenomDeAuteur(auteur: string): string {
  if (auteur === "site") return "le site";
  const correspondance = /^admin \((.+)\)$/.exec(auteur);
  return correspondance ? correspondance[1] : auteur;
}

/** Une phrase pour l'événement, et quelques lignes de détail. */
export interface ResumeEvenement {
  titre: string;
  lignes: string[];
}

const texte = (valeur: unknown): string | undefined => (typeof valeur === "string" && valeur.trim() ? valeur : undefined);
const nombre = (valeur: unknown): number | undefined =>
  typeof valeur === "number" && Number.isFinite(valeur) ? valeur : undefined;

/** Le jour d'un événement : « samedi 14 novembre », ou tel quel s'il ne se lit pas. */
function jour(valeur: unknown): string {
  const date = texte(valeur);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateAvecJour(date) : (date ?? "un jour inconnu");
}

/** Le nom d'une offre de groupe, d'après son code : « Bike for All ». */
function nomOffreGroupe(valeur: unknown): string {
  const code = texte(valeur);
  return code && code in OFFRES_GROUPE ? OFFRES_GROUPE[code as keyof typeof OFFRES_GROUPE].nom : "Offre de groupe";
}

/** Une valeur brute, courte, pour un événement que l'administration ne connaît pas. */
function brut(valeur: unknown): string {
  const ecrit = typeof valeur === "string" ? valeur : JSON.stringify(valeur);
  return ecrit.length > 160 ? `${ecrit.slice(0, 157)}...` : ecrit;
}

/** Ce que l'événement raconte, en français courant. */
export function resumeEvenement(evenement: EvenementJournal): ResumeEvenement {
  const d = evenement.details;
  switch (evenement.type) {
    case "reglages-offres": {
      const changements = Array.isArray(d.changements)
        ? (d.changements as { chemin?: unknown; avant?: unknown; apres?: unknown }[]).filter(
            (c) => typeof c?.chemin === "string",
          )
        : [];
      const n = changements.length;
      return {
        titre:
          n === 0
            ? "Réglages enregistrés, sans changement"
            : `${n} réglage${n > 1 ? "s" : ""} changé${n > 1 ? "s" : ""}`,
        lignes: [
          ...(d.sourceAvant === "illisible" ? ["Les réglages enregistrés avant ne se lisaient plus : ils sont remplacés."] : []),
          ...changements.map((c) => {
            const chemin = c.chemin as string;
            return `${nomDuReglage(chemin)} : ${valeurReglageEnClair(chemin, c.avant)} → ${valeurReglageEnClair(chemin, c.apres)}`;
          }),
        ],
      };
    }
    case "interrupteur-offres":
      return {
        titre: d.actif === true ? "Offres de groupe activées : visibles des clients" : "Offres de groupe désactivées : cachées aux clients",
        lignes: [],
      };
    case "indisponibilite-ajoutee": {
      const motif = texte(d.motif);
      return {
        titre: `${texte(d.veloNom) ?? "Un vélo"} indisponible le ${jour(d.date)}${motif ? ` (${motif})` : ""}`,
        lignes: d.dejaDeclare === true ? ["Déjà déclaré ce jour-là : le motif est mis à jour."] : [],
      };
    }
    case "indisponibilite-retiree":
      return { titre: `${texte(d.veloNom) ?? "Un vélo"} de nouveau disponible le ${jour(d.date)}`, lignes: [] };
    case "retard": {
      const minutes = nombre(d.minutes) ?? 0;
      const penalite = nombre(d.penaliteXof) ?? 0;
      const tolerance = nombre(d.toleranceMinutes);
      const parMinute = nombre(d.penaliteParMinuteXof);
      const avant = d.avant as { minutes?: unknown; penaliteXof?: unknown } | null | undefined;
      return {
        titre:
          penalite > 0
            ? `${minutes} min de retard : pénalité de ${montantF(penalite)}`
            : `${minutes} min de retard : aucune pénalité`,
        lignes: [
          ...(tolerance !== undefined && parMinute !== undefined
            ? [`Règle appliquée : ${tolerance} min de tolérance, puis ${montantF(parMinute)} par minute.`]
            : []),
          ...(avant && nombre(avant.minutes) !== undefined
            ? [`Saisie précédente : ${nombre(avant.minutes)} min, ${montantF(nombre(avant.penaliteXof) ?? 0)}.`]
            : []),
        ],
      };
    }
    case "remboursement-cree":
      return {
        titre: `${montantF(nombre(d.montantXof) ?? 0)} à rembourser`,
        lignes: texte(d.motif) ? [texte(d.motif) as string] : [],
      };
    case "remboursement-fait":
      return {
        titre: `${montantF(nombre(d.montantXof) ?? 0)} remboursés`,
        lignes: texte(d.motif) ? [texte(d.motif) as string] : [],
      };
    case "preuve-validee":
    case "preuve-refusee":
      return {
        titre: evenement.type === "preuve-validee" ? "Capture de réduction validée" : "Capture de réduction refusée",
        lignes: texte(d.motif) ? [texte(d.motif) as string] : [],
      };
    case "vente-comptoir-groupe":
      return {
        titre: `Vente au comptoir : ${montantF(nombre(d.totalXof) ?? 0)} en espèces`,
        lignes: [
          `${nomOffreGroupe(d.offre)}, ${nombre(d.personnes) ?? "?"} personnes, le ${jour(d.date)}.`,
          ...(texte(d.encaissePar) ? [`Argent reçu par ${texte(d.encaissePar)}.`] : []),
        ],
      };
    default:
      return {
        titre: libelleEvenement(evenement.type),
        lignes: Object.entries(d).map(([cle, valeur]) => `${cle} : ${brut(valeur)}`),
      };
  }
}
