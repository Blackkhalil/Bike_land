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
import { formatHeure, GAMMES, OFFRES, OFFRES_GROUPE, SORTIES_SUR_COMMANDE } from "@/data/offres";
import { formatDateAvecJour } from "@/lib/format";
import { heureEnClair } from "@/lib/offres/calendrier";
import { insecables } from "@/lib/offres-groupe/textes-chat";
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
  "preuve-email-non-envoye": "Email de réduction non parti",
  "vente-comptoir-groupe": "Vente de groupe au comptoir",
  "vente-modifiee": "Vente en espèces modifiée",
  "paiement-sans-reservation": "Paiement sans réservation",
  "reservation-refusee": "Réservation refusée faute de vélo",
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

/** Une phrase pour l'événement, quelques lignes de détail, et la page où agir s'il y en a une. */
export interface ResumeEvenement {
  titre: string;
  lignes: string[];
  lien?: { href: string; libelle: string };
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
    case "preuve-email-non-envoye":
      return {
        titre: "L'email au client n'est pas parti : prévenez-le par WhatsApp",
        lignes: [
          d.statut === "refusee" ? "Après un refus de sa capture." : "Après la validation de sa capture.",
          // Les quatre derniers chiffres seulement : la page des preuves montre le numéro entier.
          ...(texte(d.finNumero) ? [`Son numéro finit par ${texte(d.finNumero)}.`] : []),
        ],
        lien: { href: "/admin/preuves", libelle: "Voir son numéro dans les preuves de réduction" },
      };
    case "vente-comptoir-groupe":
      return {
        titre: `Vente au comptoir : ${montantF(nombre(d.totalXof) ?? 0)} en espèces`,
        lignes: [
          `${nomOffreGroupe(d.offre)}, ${nombre(d.personnes) ?? "?"} personnes, le ${jour(d.date)}.`,
          ...(texte(d.encaissePar) ? [`Encaissé par ${texte(d.encaissePar)}.`] : []),
        ],
      };
    case "vente-modifiee":
      return resumeVenteModifiee(evenement);
    case "paiement-sans-reservation": {
      // Un paiement réussi sans réservation à confirmer (src/lib/paiement-confirmation.ts).
      const montant = nombre(d.montantXof);
      return {
        titre: `${montant ? montantF(montant) : "Un paiement"} reçu sans réservation : à rembourser`,
        lignes: [
          `Transaction SasPay ${texte(d.paiementId) ?? "inconnue"}.`,
          evenement.reference
            ? `La demande ${evenement.reference} n'existe plus : retrouvez le client sur SasPay pour le rembourser.`
            : "Le paiement ne dit pas pour quelle réservation : retrouvez le client sur SasPay pour le rembourser.",
        ],
      };
    }
    case "reservation-refusee":
      return resumeRefus(evenement);
    default:
      return {
        titre: libelleEvenement(evenement.type),
        lignes: Object.entries(d).map(([cle, valeur]) => `${cle} : ${brut(valeur)}`),
      };
  }
}

/** Un objet des détails, lu prudemment : mal formé, il est vide. */
function objet(valeur: unknown): Record<string, unknown> {
  return valeur !== null && typeof valeur === "object" && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {};
}

/** Le nom d'un vélo : écrit tel quel, ou rangé dans un objet (`veloNom`, `nom`). */
function nomDeVelo(valeur: unknown): string | undefined {
  return texte(valeur) ?? texte(objet(valeur).veloNom) ?? texte(objet(valeur).nom);
}

/** « 17 h 30 - 20 h 30 » pour « 17:30-20:30 », ou tel quel s'il ne se lit pas. */
function heuresEnClair(valeur: unknown): string {
  const heures = texte(valeur);
  const lues = heures ? /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(heures) : null;
  if (!lues) return heures ?? "?";
  return `${heureEnClair(`${lues[1]}:${lues[2]}`)} - ${heureEnClair(`${lues[3]}:${lues[4]}`)}`;
}

/**
 * Une vente en espèces modifiée : « BL-ZPS2C5 : 7 → 6 personnes, 24 500 F →
 * 21 000 F, par Zayed », puis le reste de ce qui a changé, une ligne par
 * champ. Lit aussi une ligne réduite au nombre et au montant, avant et
 * après, avec le vélo rendu au parc et le motif (`veloRetire`, `motif`).
 */
function resumeVenteModifiee(evenement: EvenementJournal): ResumeEvenement {
  const d = evenement.details;
  const avant = objet(d.avant);
  const apres = objet(d.apres);

  const morceaux: string[] = [];
  const personnesAvant = nombre(avant.personnes);
  const personnesApres = nombre(apres.personnes);
  if (personnesAvant !== undefined && personnesApres !== undefined && personnesAvant !== personnesApres) {
    const unite = d.offre === "location-libre" ? "vélo" : "personne";
    morceaux.push(`${personnesAvant} → ${personnesApres} ${unite}${personnesApres > 1 ? "s" : ""}`);
  }
  const totalAvant = nombre(avant.totalXof);
  const totalApres = nombre(apres.totalXof);
  if (totalAvant !== undefined && totalApres !== undefined && totalAvant !== totalApres) {
    morceaux.push(`${montantF(totalAvant)} → ${montantF(totalApres)}`);
  }

  const lignes: string[] = [];
  // Le commercial a remis la vente au prix du comptoir du jour de la modification.
  if (d.prixRemisAuComptoir === true) lignes.push("Montant remis au prix du comptoir.");
  const avantApres = (cle: string, libelle: string, enClair: (valeur: unknown) => string) => {
    if (avant[cle] !== undefined && apres[cle] !== undefined && avant[cle] !== apres[cle]) {
      lignes.push(`${libelle} : ${enClair(avant[cle])} → ${enClair(apres[cle])}`);
    }
  };
  avantApres("date", "Jour", jour);
  avantApres("heures", "Heures", heuresEnClair);
  avantApres("dureeHeures", "Durée", (valeur) => `${nombre(valeur) ?? "?"} h`);
  if ((avant.prenom !== apres.prenom || avant.nom !== apres.nom) && texte(apres.prenom) !== undefined) {
    const nomComplet = (personne: Record<string, unknown>) => `${texte(personne.prenom) ?? ""} ${texte(personne.nom) ?? ""}`.trim();
    lignes.push(`Client : ${nomComplet(avant)} → ${nomComplet(apres)}`);
  }
  avantApres("telephone", "Téléphone", (valeur) => texte(valeur) ?? "aucun");
  avantApres("email", "Email", (valeur) => texte(valeur) ?? "aucun");
  avantApres("encaissePar", "Encaissé par", (valeur) => texte(valeur) ?? "non renseigné");
  // Une vente partie ou terminée, déplacée à un jour à venir : le départ se note de nouveau.
  if (apres.statut === "CONFIRMEE" && (avant.statut === "EN_COURS" || avant.statut === "TERMINEE")) {
    lignes.push(
      `La vente était ${avant.statut === "TERMINEE" ? "terminée" : "en cours"} : elle repasse à « Vélo à remettre », le départ est à noter de nouveau.`,
    );
  }
  const liste = (valeur: unknown) => (Array.isArray(valeur) ? valeur.map(nomDeVelo).filter((nom): nom is string => Boolean(nom)) : []);
  const liberes = [...liste(d.velosRetires), ...(nomDeVelo(d.veloRetire) ? [nomDeVelo(d.veloRetire) as string] : [])];
  if (liberes.length > 0) lignes.push(`${liberes.length > 1 ? "Vélos libérés" : "Vélo libéré"} : ${liberes.join(", ")}`);
  const ajoutes = liste(d.velosAjoutes);
  if (ajoutes.length > 0) lignes.push(`${ajoutes.length > 1 ? "Vélos ajoutés" : "Vélo ajouté"} : ${ajoutes.join(", ")}`);
  if (texte(d.motif)) lignes.push(`Motif : ${texte(d.motif)}`);

  const quoi = morceaux.length > 0 ? morceaux.join(", ") : "vente corrigée";
  return {
    titre: insecables(`${evenement.reference ?? "Vente"} : ${quoi}, par ${prenomDeAuteur(evenement.auteur)}`),
    lignes: lignes.map(insecables),
  };
}

/** Le nom d'une formule d'après son code : « Padel bike », ou le code s'il est inconnu. */
function nomOffre(valeur: unknown): string {
  const code = texte(valeur);
  if (!code) return "Formule inconnue";
  if (code === "octobre-rose") return "Octobre rose";
  if (code in SORTIES_SUR_COMMANDE) return SORTIES_SUR_COMMANDE[code as keyof typeof SORTIES_SUR_COMMANDE].nom;
  if (code in OFFRES_GROUPE) return OFFRES_GROUPE[code as keyof typeof OFFRES_GROUPE].nom;
  if (code === "location-libre") return "Location libre";
  if (code === "road-trip") return "Road trip";
  return OFFRES.find((offre) => offre.code === code)?.nom ?? code;
}

/**
 * Une réservation refusée faute de vélo (src/lib/refus.ts) : « Gamme
 * Classique complète le samedi 14 novembre, de 16 h à 18 h », puis ce qui
 * était demandé et ce qu'il restait.
 */
function resumeRefus(evenement: EvenementJournal): ResumeEvenement {
  const d = evenement.details;
  const gamme = GAMMES.find((g) => g.code === texte(d.gamme))?.nom;
  const debut = nombre(d.heureDebut);
  const fin = nombre(d.heureFin);
  const creneau =
    debut !== undefined && fin !== undefined
      ? `, de ${formatHeure(debut)} à ${formatHeure(fin)}`
      : debut !== undefined
        ? `, à ${formatHeure(debut)}`
        : "";
  const quoi = gamme ? `Gamme ${gamme}` : nomOffre(d.offre);
  const places = nombre(d.places);
  const personnes = nombre(d.personnes) ?? 1;
  const constat = d.code === "PLACES" ? "pas assez de vélos" : "complet";
  return {
    titre: insecables(`${quoi} : ${constat} le ${jour(d.date)}${creneau}`),
    lignes: [
      insecables(
        `${nomOffre(d.offre)}, ${personnes} demandé${personnes > 1 ? "s" : ""}` +
          (places !== undefined ? `, ${places} vélo${places > 1 ? "s" : ""} libre${places > 1 ? "s" : ""}.` : "."),
      ),
    ],
  };
}
