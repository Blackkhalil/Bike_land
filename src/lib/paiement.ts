/**
 * Encaissement des paiements, via KkiaPay.
 *
 * Le Mobile Money est très majoritaire au Bénin devant la carte
 * bancaire, et ni Stripe ni PayPal ne le couvrent : le cahier des charges
 * retient donc un agrégateur local. KkiaPay a été choisi.
 *
 * Son fonctionnement diffère d'un agrégateur à page hébergée : le client
 * paie dans une fenêtre ouverte par **son navigateur**, qui reçoit en
 * retour un identifiant de transaction. Le serveur ne fabrique donc rien
 * ici — il se contente de fournir au navigateur la clé publique et le
 * montant, puis vérifie après coup (cf. `src/lib/kkiapay.ts`).
 *
 * Deux modes seulement :
 *
 *  - **kkiapay** dès que les trois clés sont présentes ;
 *  - **démonstration** en développement local sans clé, pour que le
 *    parcours reste testable de bout en bout.
 *
 * En production, l'absence de clés ne bascule PAS en démonstration : elle
 * rend le paiement indisponible. Simuler un encaissement réussi sur un
 * site en ligne reviendrait à distribuer les vélos gratuitement.
 *
 * Aucune coordonnée bancaire ne transite par notre serveur : la fenêtre
 * de paiement appartient à KkiaPay, nous ne manipulons que des
 * identifiants de transaction.
 */

import { configurationKkiapay } from "./kkiapay";
import type { MoyenPaiement } from "./types";

export type FournisseurActif = "kkiapay" | "demo" | "indisponible";

export interface DemandePaiement {
  montantXof: number;
  reference: string;
  moyen: MoyenPaiement;
  client: { prenom: string; nom: string; email: string; telephone?: string };
}

/** Ce que le navigateur doit connaître pour ouvrir la fenêtre KkiaPay. */
export interface ConfigurationWidget {
  clePublique: string;
  sandbox: boolean;
  montantXof: number;
  /** Notre référence, renvoyée par KkiaPay et vérifiée côté serveur. */
  reference: string;
  /** Restreint la fenêtre au moyen choisi par le client. */
  methodes: string[];
  nom: string;
  email: string;
  telephone?: string;
}

export interface ResultatPaiement {
  statut: "REUSSI" | "EN_ATTENTE" | "ECHOUE";
  fournisseur: FournisseurActif;
  referenceTransaction: string;
  /** Présent en mode KkiaPay : le navigateur ouvre la fenêtre avec ceci. */
  widget?: ConfigurationWidget;
  message?: string;
}

export function fournisseurActif(): FournisseurActif {
  if (configurationKkiapay()) return "kkiapay";

  // Le mode démonstration confirme sans encaisser : tolérable en
  // développement, jamais en ligne. `PAIEMENT_DEMO_AUTORISE` existe pour
  // les vitrines de démonstration délibérées, et pour elles seules.
  if (process.env.NODE_ENV === "production" && process.env.PAIEMENT_DEMO_AUTORISE !== "true") {
    return "indisponible";
  }
  return "demo";
}

/**
 * Moyens de paiement proposés au client.
 *
 * Mobile Money uniquement : la carte bancaire a été retirée de l'offre.
 * Elle est très minoritaire au Bénin, et la proposer obligeait à afficher
 * un moyen que presque personne n'utilise.
 */
export const moyensDisponibles: { code: MoyenPaiement; libelle: string; detail: string }[] = [
  { code: "MTN_MONEY", libelle: "MTN MoMo", detail: "Paiement par mobile" },
  { code: "MOOV_MONEY", libelle: "Moov Money", detail: "Paiement par mobile" },
];

/**
 * Filtre passé à la fenêtre KkiaPay.
 *
 * Toujours « momo » : c'est le seul moyen que nous acceptons. KkiaPay ne
 * distingue pas MTN de Moov dans ce filtre — l'opérateur se choisit dans
 * sa fenêtre — mais restreindre à « momo » empêche la carte d'y
 * apparaître, ce qui serait incohérent avec ce qu'annonce le site.
 */
export function methodesWidget(): string[] {
  return ["momo"];
}

export async function encaisser(demande: DemandePaiement): Promise<ResultatPaiement> {
  const fournisseur = fournisseurActif();

  if (fournisseur === "indisponible") {
    return {
      statut: "ECHOUE",
      fournisseur,
      referenceTransaction: "",
      message:
        "Le paiement en ligne n'est pas configuré. Aucune réservation ne peut être encaissée.",
    };
  }

  if (fournisseur === "demo") {
    return {
      statut: "REUSSI",
      fournisseur,
      referenceTransaction: `DEMO-${demande.reference}`,
      message:
        "Mode démonstration : aucun paiement réel n'a été effectué. " +
        "Renseignez les clés KkiaPay pour encaisser réellement.",
    };
  }

  return {
    statut: "EN_ATTENTE",
    fournisseur: "kkiapay",
    referenceTransaction: "",
    widget: configurationWidgetPour(demande)!,
  };
}

/**
 * De quoi ouvrir la fenêtre KkiaPay pour une somme donnée.
 *
 * Sert au tunnel de réservation comme à la page de suivi : un client qui
 * a fermé la fenêtre sans payer doit pouvoir la rouvrir depuis son lien
 * personnel, sans recréer de réservation.
 *
 * Renvoie `null` si KkiaPay n'est pas configuré — la page appelante
 * n'affiche alors simplement pas de bouton de paiement.
 */
export function configurationWidgetPour(demande: DemandePaiement): ConfigurationWidget | null {
  const configuration = configurationKkiapay();
  if (!configuration) return null;

  return {
    clePublique: configuration.clePublique,
    sandbox: configuration.sandbox,
    montantXof: demande.montantXof,
    reference: demande.reference,
    methodes: methodesWidget(),
    nom: `${demande.client.prenom} ${demande.client.nom}`.trim(),
    email: demande.client.email,
    telephone: demande.client.telephone,
  };
}
