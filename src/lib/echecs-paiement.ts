/**
 * Pourquoi un paiement n'a pas abouti, et quoi faire ensuite.
 *
 * SasPay renvoie des messages écrits pour un développeur : « Numéro de
 * téléphone invalide pour ce pays : 10 chiffres locaux attendus, 8
 * reçus. » Montré tel quel à un client qui vient d'échouer à payer, ce
 * texte ne lui dit pas ce qu'il doit corriger, et le laisse penser que
 * le site est cassé.
 *
 * Ce module traduit le motif en un diagnostic utilisable : ce qui s'est
 * passé, ce qu'il faut faire, et quel champ corriger. Le reste du
 * parcours s'en sert pour présélectionner le bon champ et pour décider
 * s'il vaut la peine de réessayer tout de suite.
 *
 * Les motifs sont reconnus sur le texte, faute de code d'erreur stable
 * chez SasPay. La reconnaissance est donc volontairement large, et le
 * cas `inconnu` reste utilisable : il dit la vérité, propose de
 * réessayer, et donne le numéro de l'atelier.
 */

/** Ce que le client doit corriger avant de réessayer. */
export type ChampACorriger = "telephone" | "moyen" | "aucun";

export type MotifEchec =
  | "solde_insuffisant"
  | "numero_invalide"
  | "operateur_different"
  | "non_valide"
  | "refuse"
  | "montant_minimum"
  | "operateur_indisponible"
  | "reseau"
  | "inconnu";

export interface DiagnosticEchec {
  motif: MotifEchec;
  /** Titre court, affiché en tête du bloc. */
  titre: string;
  /** Ce qui s'est passé, dit au client. */
  explication: string;
  /** Ce qu'il doit faire maintenant. */
  remede: string;
  champ: ChampACorriger;
  /**
   * Vrai si réessayer immédiatement a une chance d'aboutir sans que rien
   * ne change par ailleurs. Faux quand il faut d'abord recharger son
   * compte ou attendre que l'opérateur revienne : proposer un bouton
   * « Réessayer » dans ces cas-là ne ferait qu'enchaîner les échecs.
   */
  reessayerUtile: boolean;
}

const DIAGNOSTICS: Record<MotifEchec, Omit<DiagnosticEchec, "motif">> = {
  solde_insuffisant: {
    titre: "Solde insuffisant",
    explication:
      "Votre compte Mobile Money n'a pas assez pour couvrir le montant. L'opérateur a refusé avant que nous puissions encaisser.",
    remede:
      "Rechargez votre compte, puis relancez le paiement ci-dessous. Votre vélo reste retenu.",
    champ: "aucun",
    reessayerUtile: false,
  },
  numero_invalide: {
    titre: "Numéro non reconnu",
    explication:
      "Le numéro saisi n'est pas un numéro Mobile Money valide au Bénin. Il en faut dix chiffres, sans l'indicatif.",
    remede: "Corrigez le numéro ci-dessous, puis relancez la demande.",
    champ: "telephone",
    reessayerUtile: true,
  },
  operateur_different: {
    titre: "Opérateur qui ne correspond pas",
    explication:
      "Ce numéro n'appartient pas à l'opérateur choisi. Un numéro MTN ne peut pas être débité par Moov, ni l'inverse.",
    remede:
      "Choisissez l'opérateur de votre numéro, ou saisissez un numéro de l'opérateur sélectionné.",
    champ: "moyen",
    reessayerUtile: true,
  },
  non_valide: {
    titre: "Demande non validée",
    explication:
      "La demande est bien arrivée sur votre téléphone, mais elle n'a pas été validée à temps. Elle a expiré.",
    remede:
      "Relancez-la ci-dessous, et gardez votre téléphone à portée : la notification arrive en quelques secondes.",
    champ: "aucun",
    reessayerUtile: true,
  },
  refuse: {
    titre: "Demande refusée sur le téléphone",
    explication: "La demande a été annulée depuis votre téléphone.",
    remede: "Si c'était une erreur, relancez-la ci-dessous.",
    champ: "aucun",
    reessayerUtile: true,
  },
  montant_minimum: {
    titre: "Montant trop faible",
    explication:
      "L'opérateur n'encaisse pas en dessous de 200 FCFA. Ce montant ne peut pas passer en Mobile Money.",
    remede: "Appelez-nous, nous prenons ce règlement autrement.",
    champ: "aucun",
    reessayerUtile: false,
  },
  operateur_indisponible: {
    titre: "Opérateur injoignable",
    explication:
      "Le service Mobile Money de cet opérateur ne répond pas en ce moment. Cela vient de lui, pas de votre compte.",
    remede:
      "Réessayez dans quelques minutes, ou payez avec un autre opérateur si vous en avez un.",
    champ: "moyen",
    reessayerUtile: false,
  },
  reseau: {
    titre: "Connexion interrompue",
    explication:
      "Nous n'avons pas pu joindre le service de paiement. Votre compte n'a pas été débité.",
    remede: "Vérifiez votre connexion, puis relancez la demande.",
    champ: "aucun",
    reessayerUtile: true,
  },
  inconnu: {
    titre: "Paiement non abouti",
    explication: "Le règlement n'est pas passé, et votre compte n'a pas été débité.",
    remede:
      "Relancez la demande ci-dessous. Si cela se reproduit, appelez-nous, nous prenons votre réservation par téléphone.",
    champ: "aucun",
    reessayerUtile: true,
  },
};

/**
 * Chaque motif et les tournures qui le trahissent, dans l'ordre où elles
 * sont essayées. L'ordre compte : « solde insuffisant » doit être testé
 * avant les formulations générales de refus, sans quoi un refus pour
 * manque d'argent passerait pour un refus quelconque et le client
 * réessaierait sans recharger.
 */
const INDICES: [MotifEchec, RegExp][] = [
  [
    "solde_insuffisant",
    /solde\s+insuffisant|insufficient\s+(funds|balance)|fonds\s+insuffisants|balance\s+too\s+low|not\s+enough\s+(funds|balance|money)/i,
  ],
  [
    "montant_minimum",
    /montant\s+minimum|minimum\s+amount|below\s+minimum|inf[ée]rieur\s+au\s+minimum|trop\s+faible/i,
  ],
  [
    "operateur_different",
    /op[ée]rateur\s+(diff[ée]rent|incorrect|ne\s+correspond)|wrong\s+(network|operator)|network\s+mismatch|n'appartient\s+pas/i,
  ],
  [
    "numero_invalide",
    /num[ée]ro\s+(de\s+t[ée]l[ée]phone\s+)?invalide|invalid\s+(phone|msisdn|number)|chiffres\s+locaux|mal\s+form[ée]|format\s+du\s+num[ée]ro/i,
  ],
  [
    "non_valide",
    /expir[ée]|timeout|timed\s+out|d[ée]lai\s+d[ée]pass[ée]|non\s+valid[ée]e?\s+[àa]\s+temps|no\s+response\s+from\s+(the\s+)?(customer|subscriber)/i,
  ],
  [
    "refuse",
    /refus[ée]e?\s+par\s+(le\s+)?client|annul[ée]e?\s+par|cancelled\s+by|rejected\s+by\s+(the\s+)?(user|customer|subscriber)|CANCELLED/i,
  ],
  [
    "operateur_indisponible",
    /op[ée]rateur\s+(indisponible|injoignable)|service\s+unavailable|temporarily\s+unavailable|maintenance|503|502|504|upstream/i,
  ],
  [
    "reseau",
    /connexion|network\s+error|timeout\s+r[ée]seau|fetch\s+failed|ECONNRESET|ENOTFOUND|illisible|impossible\s+d'appeler|appel\s+SasPay\s+impossible/i,
  ],
];

/**
 * Lit le motif d'échec dans ce que SasPay a répondu.
 *
 * `statut` sert de repli quand le message ne dit rien d'exploitable : un
 * `CANCELLED` sans explication reste un refus depuis le téléphone.
 */
export function diagnostiquer(
  message: string | null | undefined,
  statut?: string | null,
): DiagnosticEchec {
  const texte = (message ?? "").trim();

  if (texte) {
    for (const [motif, indice] of INDICES) {
      if (indice.test(texte)) return { motif, ...DIAGNOSTICS[motif] };
    }
  }

  const etat = (statut ?? "").toUpperCase();
  if (etat === "CANCELLED") return { motif: "refuse", ...DIAGNOSTICS.refuse };
  if (etat === "PENDING") return { motif: "non_valide", ...DIAGNOSTICS.non_valide };

  return { motif: "inconnu", ...DIAGNOSTICS.inconnu };
}

/** Les motifs connus, pour relire un code venu de l'adresse de la page. */
export function motifDepuisCode(code: string | null | undefined): DiagnosticEchec | null {
  if (!code) return null;
  const motif = code as MotifEchec;
  if (!(motif in DIAGNOSTICS)) return null;
  return { motif, ...DIAGNOSTICS[motif] };
}
