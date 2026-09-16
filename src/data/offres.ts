/**
 * Les deux offres de Bike Land.
 *
 * Elles ne se distinguent pas par le vélo mais par l'encadrement, et
 * c'est cet encadrement qui commande tout le reste :
 *
 *  - **Road trip** : on roule en groupe, un coordinateur ouvre la route,
 *    remet les vélos et les kits au départ et les récupère à l'arrivée.
 *    Le matériel ne quitte jamais sa garde — d'où l'absence de caution.
 *
 *  - **Location libre** : le client part seul avec le vélo. Le matériel
 *    sort de notre garde, d'où la caution, la pièce d'identité présentée
 *    au départ et l'engagement signé.
 *
 * La tarification journalière a été retirée : la location libre se
 * facture à l'heure, le road trip au forfait.
 */

import type { CodeOffre } from "@/lib/types";

export type { CodeOffre };

/** Tarif du road trip, par personne, coco et eau compris. */
export const PRIX_ROAD_TRIP_XOF = 2500;

/** Caution de la location libre, rendue à la restitution du vélo. */
export const CAUTION_LOCATION_LIBRE_XOF = 5000;

/**
 * Grille horaire de la location libre.
 *
 * Volontairement dégressive : la deuxième heure coûte autant que la
 * première, puis chaque heure supplémentaire coûte moins cher. Au-delà
 * de cinq heures, il n'y a pas de tarif public — c'est un cas à traiter
 * au téléphone, pas à deviner.
 */
export const GRILLE_HORAIRE: { heures: number; prixXof: number }[] = [
  { heures: 1, prixXof: 1000 },
  { heures: 2, prixXof: 2000 },
  { heures: 3, prixXof: 2800 },
  { heures: 4, prixXof: 3200 },
  { heures: 5, prixXof: 3600 },
];

export const DUREE_MAX_LOCATION_LIBRE = 5;

/** Prix d'une location libre pour une durée donnée, ou `null` hors grille. */
export function prixLocationLibre(heures: number): number | null {
  return GRILLE_HORAIRE.find((palier) => palier.heures === heures)?.prixXof ?? null;
}

/** Ce que le client doit apporter ou accepter, par offre. */
export const EXIGENCES: Record<CodeOffre, string[]> = {
  "road-trip": [
    "Rien à apporter : casque, antivol et kit sont fournis au départ.",
    "Être présent au point de départ quinze minutes avant l'heure.",
  ],
  "location-libre": [
    "Présenter une pièce d'identité (CIP) au départ — elle vous est rendue au retour du vélo.",
    "Signer l'engagement de restitution, en ligne puis sur place au départ.",
    `Laisser une caution de ${CAUTION_LOCATION_LIBRE_XOF.toLocaleString("fr-FR")} FCFA, rendue à la restitution du vélo.`,
  ],
};

export const OFFRES: {
  code: CodeOffre;
  nom: string;
  accroche: string;
  description: string;
  cautionXof: number;
}[] = [
  {
    code: "road-trip",
    nom: "Road trip sur la route des Pêches",
    accroche: "Une sortie en groupe, encadrée",
    description:
      "Un de nos deux circuits, roulé ensemble avec un coordinateur qui ouvre la route. Vélo, casque, antivol, kit de réparation, coco frais et eau compris. Aucune caution.",
    cautionXof: 0,
  },
  {
    code: "location-libre",
    nom: "Location libre",
    accroche: "Le vélo pour vous, à l'heure",
    description:
      "Vous prenez le vélo et vous roulez où vous voulez, à votre rythme. De une à cinq heures. Pièce d'identité et engagement signé demandés au départ.",
    cautionXof: CAUTION_LOCATION_LIBRE_XOF,
  },
];

/**
 * Delai au-dela duquel une reservation jamais payee cesse de bloquer le
 * velo.
 *
 * Sans cela, un panier abandonne immobiliserait un velo indefiniment :
 * la reservation reste EN_ATTENTE_PAIEMENT, donc bloquante, et personne
 * ne peut plus reserver ce velo ce jour-la. Trente minutes laissent le
 * temps d'un paiement Mobile Money, y compris avec une mauvaise
 * connexion.
 */
export const EXPIRATION_PANIER_MINUTES = 30;

/**
 * Ce panier a-t-il dépassé son délai de paiement ?
 *
 * Écrit ici, au plus près du délai, et non recopié dans chaque appelant :
 * la page de suivi et la confirmation de paiement doivent répondre
 * exactement la même chose, sans quoi l'une proposerait de payer un vélo
 * que l'autre considère déjà reparti.
 */
export function panierExpire(creeLe: string, maintenant = Date.now()): boolean {
  return maintenant - new Date(creeLe).getTime() > EXPIRATION_PANIER_MINUTES * 60_000;
}
