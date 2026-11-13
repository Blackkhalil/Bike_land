/**
 * Les montants des offres de groupe, écrits comme le tableur et le cahier
 * des charges les écrivent : « 11 250 F ».
 *
 * Séparateur : l'espace insécable ordinaire (U+00A0), entre les milliers et
 * avant le « F ». Il se lit comme une espace, mais « 11 250 F » ne se coupe
 * jamais en fin de ligne, sur téléphone comme dans un email : c'est la règle
 * déjà suivie par formatXof (src/lib/format.ts). On n'utilise pas l'espace
 * fine insécable (U+202F) que donne Intl en français : certaines polices et
 * messageries l'affichent mal. Le formatage est fait à la main, sans Intl,
 * pour donner le même texte sur tous les serveurs et tous les navigateurs.
 *
 * L'extraction fait l'inverse : elle retrouve chaque montant d'un texte,
 * quelle que soit l'espace employée (ordinaire, insécable, fine) ou sans
 * espace du tout. Les tests s'en servent pour relire les montants du
 * récapitulatif.
 */

/** L'espace insécable des montants : « 11 250 F ». */
export const ESPACE_MONTANT = String.fromCharCode(0xa0);

/** « 11250 » devient « 11 250 », avec l'espace insécable. */
export function formatNombre(valeur: number): string {
  const entier = Math.round(valeur);
  const chiffres = String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MONTANT);
  // Le signe moins typographique (U+2212), comme ailleurs sur le site.
  return entier < 0 ? `${String.fromCharCode(0x2212)}${chiffres}` : chiffres;
}

/** « 11 250 F » : un montant en francs CFA, arrondi au franc. */
export function formatMontant(montantXof: number): string {
  return `${formatNombre(montantXof)}${ESPACE_MONTANT}F`;
}

/**
 * Le quotient `numerateur / denominateur`, arrondi au franc le plus proche
 * (une moitié vers le haut), calculé en nombres entiers : aucun arrondi
 * flottant ne peut faire tomber 212,5 sur 212. Pour des valeurs positives.
 * Avec les réglages de départ, tous les montants tombent juste et cet
 * arrondi ne change rien ; il ne sert que si un réglage donne des centimes.
 */
export function arrondiDivision(numerateur: number, denominateur: number): number {
  return Math.floor((2 * numerateur + denominateur) / (2 * denominateur));
}

/**
 * Un taux (0,2) en dix-millièmes (2 000), pour comparer et calculer en
 * nombres entiers : 0,2 n'a pas d'écriture exacte en binaire, 2 000 si.
 */
export function enDixMilliemes(taux: number): number {
  return Math.round(taux * 10000);
}

/** « 4 % », « 3,25 % » : un taux (0,04) en pourcentage, à la française. */
export function formatPourcentage(taux: number): string {
  const pourcent = Math.round(taux * 10000) / 100;
  return `${String(pourcent).replace(".", ",")}${ESPACE_MONTANT}%`;
}

/**
 * Un montant : des chiffres groupés par trois (séparés par une espace,
 * insécable ou non, ou un point), ou des chiffres collés, suivis de
 * « F », « FCFA », « F CFA », « XOF » ou « franc(s) ». Le nombre ne doit
 * pas commencer au milieu d'un autre, ni l'unité se prolonger en mot
 * (« 10 Fidjrossè » n'est pas un montant).
 */
const MOTIF_MONTANT =
  /(?<![\d.,])(\d{1,3}(?:[    .]\d{3})+|\d+)[    ]?(?:FCFA|F[   ]CFA|XOF|francs?|F)(?![\p{L}\p{N}])/gu;

/**
 * Tous les montants d'un texte, dans l'ordre où ils apparaissent :
 * « vous paierez 11 250 F au lieu de 17 250 F » donne [11250, 17250].
 * Les nombres sans unité (10 personnes, 45 minutes, 08h00) sont ignorés.
 */
export function extraireMontants(texte: string): number[] {
  return [...texte.matchAll(MOTIF_MONTANT)].map((trouve) => Number(trouve[1].replace(/[^\d]/g, "")));
}
