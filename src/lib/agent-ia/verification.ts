/**
 * Le contrôle du texte rédigé par l'agent IA, avant tout envoi au client.
 *
 * Règle du responsable : l'agent ne calcule JAMAIS. Il reformule des faits
 * déjà calculés par le moteur des offres, et le code vérifie, avant envoi,
 * que chaque montant du texte correspond au calcul. Au moindre écart, c'est
 * le texte modèle fixe (celui du tableur) qui part.
 *
 * Ce module est ce contrôle : pur, sans réseau, partagé par le récapitulatif
 * (recapitulatif.ts) et par la réservation payée (lot 5b). Il est
 * volontairement sévère : refuser un bon texte ne coûte rien (le texte
 * modèle est toujours juste), laisser passer un faux montant coûte un client.
 *
 * Ce qu'il exige :
 *  - chaque montant écrit en chiffres (suivi de F, FCFA ou francs) vient du
 *    calcul : la liste des montants, ou un montant écrit dans les faits ou
 *    le texte modèle, tous deux produits par le moteur ; le total y figure ;
 *  - chaque autre nombre (personnes, minutes, heures, date) figure dans les
 *    faits ou le texte modèle ;
 *  - aucun nombre en lettres, aucun chiffre d'une autre écriture, aucun
 *    tiret long, ni lien, adresse, mise en forme ou texte vide ou trop long.
 */

/** Un fait déjà calculé et mis en forme par le moteur : « Total à payer », « 11 250 F ». */
export interface FaitCalcule {
  libelle: string;
  valeur: string;
  /**
   * Le texte doit le reprendre : chacun de ses nombres doit y figurer, avec
   * son unité (exemple : la règle de retard, que le récapitulatif rappelle
   * toujours, cahier des charges étape 9).
   */
  obligatoire?: boolean;
}

/** Ce que le texte doit respecter : les chiffres du calcul. */
export interface ChiffresAttendus {
  /** Le total à payer, qui doit figurer dans le texte. */
  totalXof: number;
  /**
   * Les montants que le texte peut citer : total, prix barré, lignes du
   * détail, réduction, pénalité de retard par minute. Ceux qui sont écrits
   * dans les faits ou le texte modèle sont admis d'office.
   */
  montantsXof: readonly number[];
  faits: readonly FaitCalcule[];
  /** Le texte modèle du moteur : ses nombres viennent du même calcul. */
  texteModele?: string;
}

export type MotifRefusTexte = "montant-inconnu" | "format";

export type VerificationTexte = { ok: true } | { ok: false; motif: MotifRefusTexte; detail: string };

/** Longueurs admises : un message court, pas un mot, pas un roman. */
export const LONGUEUR_MIN_TEXTE = 40;
export const LONGUEUR_MAX_TEXTE = 1500;

/* ------------------------------------------------------------ Lecture des nombres */

/** Un nombre lu dans un texte. */
export interface NombreLu {
  /** « montant » : suivi d'une unité monétaire ; « heure » : 8 h, 08h45, 18:30. */
  genre: "montant" | "heure" | "nombre";
  /** Le montant en francs, l'heure en minutes depuis minuit, ou le nombre. */
  valeur: number;
  brut: string;
}

/**
 * Les espaces de toutes sortes (insécable, fine insécable, etc.) deviennent
 * des espaces simples, et les caractères invisibles disparaissent : « 11 250 »
 * écrit avec une espace fine se lit comme « 11 250 ».
 */
function normaliser(texte: string): string {
  return texte.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/\p{Zs}/gu, " ");
}

/**
 * 8 h, 8h, 08h00, 8 h 45, 18:30. Pas « 8 heures » ni « 10 hommes ». Seul un
 * chiffre juste avant empêche la lecture : un nombre collé à un point
 * (« personnes.15000 F ») est lu comme les autres, jamais oublié.
 */
const HEURE = /(?<!\d)(\d{1,2})(?:\s?[hH](?!\p{L})(?:\s?([0-5]\d)(?!\d))?|:([0-5]\d)(?!\d))/gu;

/**
 * Un nombre, avec ses séparateurs de milliers (espace, point ou virgule
 * suivis de trois chiffres : « 11 250 », « 11.250 », « 11,250 »), ou un
 * décimal (« 1,5 »), suivi ou non d'une unité monétaire.
 */
const NOMBRE =
  /(?<!\d)(\d{1,3}(?:[ .,]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)(\s*(?:F\s?CFA|FCFA|francs?(?:\s?CFA)?|XOF|F)(?![\p{L}\d]))?/giu;

function valeurDe(nombre: string): number {
  // Groupes de trois chiffres : les séparateurs sont des milliers.
  if (/^\d{1,3}(?:[ .,]\d{3})+$/.test(nombre)) return Number(nombre.replace(/[ .,]/g, ""));
  return Number(nombre.replace(",", "."));
}

/** Tous les nombres écrits en chiffres dans un texte, dans l'ordre. */
export function lireNombres(texte: string): NombreLu[] {
  const lus: { position: number; nombre: NombreLu }[] = [];
  // Les heures d'abord, remplacées par des blancs de même longueur pour ne
  // pas être relues comme des nombres.
  const sansHeures = normaliser(texte).replace(
    HEURE,
    (brut: string, heures: string, minutesH: string | undefined, minutesP: string | undefined, position: number) => {
      const minutes = Number(minutesH ?? minutesP ?? 0);
      lus.push({ position, nombre: { genre: "heure", valeur: Number(heures) * 60 + minutes, brut } });
      return " ".repeat(brut.length);
    },
  );
  for (const correspondance of sansHeures.matchAll(NOMBRE)) {
    const [brut, nombre, unite] = correspondance;
    lus.push({
      position: correspondance.index ?? 0,
      nombre: { genre: unite ? "montant" : "nombre", valeur: valeurDe(nombre), brut: brut.trim() },
    });
  }
  return lus.sort((a, b) => a.position - b.position).map((lu) => lu.nombre);
}

/* --------------------------------------------------------------- Ce qui est refusé */

/**
 * Les nombres en toutes lettres, sans les articles « un » et « une » : un
 * montant ou une durée en lettres ne peut pas être vérifié, donc il n'est
 * pas admis. Comparés sans accents.
 */
const NOMBRES_EN_LETTRES = new Set([
  "zero",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "vingt",
  "vingts",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "septante",
  "octante",
  "huitante",
  "nonante",
  "cent",
  "cents",
  "mille",
  "milles",
  "million",
  "millions",
  "milliard",
  "milliards",
  "demi",
  "demie",
  "demis",
  "demies",
  "quart",
  "quarts",
  "dizaine",
  "dizaines",
  "douzaine",
  "douzaines",
  "quinzaine",
  "quinzaines",
  "vingtaine",
  "vingtaines",
  "trentaine",
  "trentaines",
  "quarantaine",
  "cinquantaine",
  "soixantaine",
  "centaine",
  "centaines",
  "millier",
  "milliers",
]);

/** Les ordinaux en lettres : « deuxième », « dixième ». */
const ORDINAL_EN_LETTRES =
  /^(?:deux|trois|quatr|cinqu|six|sept|huit|neuv|dix|onz|douz|treiz|quatorz|quinz|seiz|vingt|trent|quarant|cinquant|soixant|cent|mill)iemes?$/;

function sansAccents(mot: string): string {
  return mot.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Le premier nombre écrit en lettres, s'il y en a un. */
export function nombreEnLettres(texte: string): string | null {
  for (const mot of texte.toLowerCase().match(/\p{L}+/gu) ?? []) {
    const simple = sansAccents(mot);
    if (NOMBRES_EN_LETTRES.has(simple) || ORDINAL_EN_LETTRES.test(simple)) return mot;
  }
  return null;
}

/**
 * Ce qui ne doit jamais partir : tirets longs (règle du responsable), liens,
 * adresses et noms de compte, balises, modèles à trous, mise en forme
 * Markdown, emojis.
 */
const INTERDITS: { motif: RegExp; detail: string }[] = [
  { motif: /[‒–—―⸺⸻﹘]|--/u, detail: "tiret long" },
  { motif: /https?:|www\./iu, detail: "lien" },
  { motif: /@/u, detail: "adresse ou nom de compte" },
  { motif: /[<>{}[\]]/u, detail: "balise ou modèle à trous" },
  { motif: /\*\*|__|`|^\s*#/mu, detail: "mise en forme" },
  { motif: /\p{Extended_Pictographic}/u, detail: "emoji" },
];

/** Des chiffres d'une autre écriture (« ١٢ », « ５ », « ½ », « ² ») : illisibles pour le contrôle. */
const CHIFFRES_EXOTIQUES = /(?![0-9])\p{N}/u;

/* ---------------------------------------------------------------------- Contrôle */

function montantEnClair(montant: number): string {
  return `${String(Math.round(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}

function heureEnClair(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Les chiffres admis, tirés des textes du moteur (faits, texte modèle) :
 * chaque montant, chaque nombre, chaque heure et ses parties (« 8 h 45 »
 * admet aussi 8 et 45).
 */
function chiffresAdmis(textes: readonly string[]): { montants: Set<number>; nombres: Set<number>; heures: Set<number> } {
  const montants = new Set<number>();
  const nombres = new Set<number>();
  const heures = new Set<number>();
  for (const texte of textes) {
    for (const lu of lireNombres(texte)) {
      if (lu.genre === "heure") {
        heures.add(lu.valeur);
        nombres.add(Math.floor(lu.valeur / 60));
        nombres.add(lu.valeur % 60);
        nombres.add(lu.valeur);
      } else {
        if (lu.genre === "montant") montants.add(lu.valeur);
        nombres.add(lu.valeur);
      }
    }
  }
  return { montants, nombres, heures };
}

/**
 * Le texte de l'agent respecte-t-il le calcul ? `ok: false` dit pourquoi,
 * en clair (pour les journaux : jamais le texte entier).
 */
export function verifierTexteIa(texte: string, attendus: ChiffresAttendus): VerificationTexte {
  const propre = texte.trim();
  if (propre.length < LONGUEUR_MIN_TEXTE) return { ok: false, motif: "format", detail: "texte vide ou trop court" };
  if (propre.length > LONGUEUR_MAX_TEXTE) return { ok: false, motif: "format", detail: "texte trop long" };

  for (const { motif, detail } of INTERDITS) {
    if (motif.test(propre)) return { ok: false, motif: "format", detail };
  }
  if (CHIFFRES_EXOTIQUES.test(propre)) return { ok: false, motif: "format", detail: "chiffres d'une autre écriture" };
  const enLettres = nombreEnLettres(propre);
  if (enLettres) return { ok: false, motif: "format", detail: `nombre en lettres : « ${enLettres} »` };

  const sources = [...attendus.faits.map((fait) => fait.valeur), attendus.texteModele ?? ""];
  const admis = chiffresAdmis(sources);
  const montantsAdmis = new Set([attendus.totalXof, ...attendus.montantsXof, ...admis.montants]);
  const nombresAdmis = new Set([...admis.nombres, ...montantsAdmis]);
  const lus = lireNombres(propre);

  for (const lu of lus) {
    if (lu.genre === "montant" && !montantsAdmis.has(lu.valeur)) {
      return { ok: false, motif: "montant-inconnu", detail: `montant ${montantEnClair(lu.valeur)} absent du calcul` };
    }
    if (lu.genre === "heure" && !admis.heures.has(lu.valeur)) {
      return { ok: false, motif: "montant-inconnu", detail: `heure ${heureEnClair(lu.valeur)} absente des faits` };
    }
    if (lu.genre === "nombre" && !nombresAdmis.has(lu.valeur)) {
      return { ok: false, motif: "montant-inconnu", detail: `nombre ${lu.brut} absent des faits` };
    }
  }

  if (!lus.some((lu) => lu.genre === "montant" && lu.valeur === attendus.totalXof)) {
    return { ok: false, motif: "montant-inconnu", detail: `total ${montantEnClair(attendus.totalXof)} absent du texte` };
  }

  // Les faits obligatoires : chacun de leurs nombres est repris, avec la même unité.
  for (const fait of attendus.faits) {
    if (!fait.obligatoire) continue;
    for (const attendu of lireNombres(fait.valeur)) {
      if (!lus.some((lu) => lu.genre === attendu.genre && lu.valeur === attendu.valeur)) {
        return { ok: false, motif: "montant-inconnu", detail: `fait obligatoire non repris : ${fait.libelle}` };
      }
    }
  }

  return { ok: true };
}
