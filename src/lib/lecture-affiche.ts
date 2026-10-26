/**
 * Ce qu'on peut déduire d'une affiche de vélo Bike Land.
 *
 * Les affiches portent une fiche technique écrite : type de vélo, fourche,
 * freins, vitesses, taille de roue, coloris, parfois cadre, jantes et
 * pneus. Le texte, lu par reconnaissance de caractères, arrive bruité :
 * des morceaux de la photo du vélo sont pris pour des lettres. On ne
 * cherche donc pas à le comprendre ligne à ligne, seulement à y repérer
 * les motifs connus, et tout ce qui n'est pas reconnu est ignoré.
 *
 * La gamme n'est jamais lue sur l'affiche : les affiches Premium portent
 * elles aussi le mot « Prestige », et c'est la gamme qui fixe le prix.
 * Elle n'est que proposée d'après le nom du fichier, et l'exploitant la
 * confirme.
 */

import type { GammeVelo } from "@/data/offres";
import type { CategorieVelo } from "@/lib/types";

export interface FicheLue {
  nom?: string;
  categorie?: CategorieVelo;
  gamme?: GammeVelo;
  vitesses?: number;
  accroche?: string;
  description?: string;
  /** Ce qui a été reconnu, pour le montrer à l'exploitant. */
  trouvailles: string[];
}

const COULEURS = "noir|blanc|rouge|bleu|vert|jaune|orange|gris|rose|violet|marron|argent|bordeaux|turquoise|kaki";

/** Mots du nom de fichier qui ne disent rien du vélo. */
const MOTS_GENERIQUES =
  /^(bike|land|bikeland|prenium|premium|prestige|img|image|photo|video|vid|whatsapp|at|affiche|velo|v\d+|\d+|jpe?g|png|webp|mp4|mov|webm)$/i;

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
const capitaliser = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase();

function listeFrancaise(elements: string[]): string {
  if (elements.length <= 1) return elements.join("");
  return `${elements.slice(0, -1).join(", ")} et ${elements.at(-1)}`;
}

export function analyserAffiche(texte: string, nomFichier: string): FicheLue {
  const trouvailles: string[] = [];
  const brut = texte.replace(/\r/g, "");
  // Un mot coupé en fin de ligne (« TOUT- » puis « SUSPENDU ») est recollé
  // avant tout : sinon seule la première moitié était retenue, et la fiche
  // du Titan disait « VTT tout- ». « Bike Land - Premium », avec un espace
  // avant le tiret, n'est pas touché.
  const plat = brut.replace(/(\p{L})-\s+(?=\p{L})/gu, "$1-").replace(/\s+/g, " ");

  // --- Nom : d'abord le nom du fichier, puis un mot isolé de l'affiche.
  const motsFichier = nomFichier
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^\p{L}\d]+/u)
    .filter((mot) => mot.length >= 3 && !MOTS_GENERIQUES.test(mot));
  let nom: string | undefined;
  const premierMot = motsFichier[0];
  if (premierMot) {
    // Écrit sur l'affiche, le nom garde ses accents (« Émeraude »), que le
    // nom de fichier a souvent perdus.
    const cible = sansAccents(premierMot).toLowerCase();
    const surAffiche = (brut.match(/\p{L}+/gu) ?? []).find((m) => sansAccents(m).toLowerCase() === cible);
    nom = capitaliser(surAffiche ?? premierMot);
  }
  if (!nom) {
    const motIsole = brut
      .split("\n")
      .map((ligne) => ligne.replace(/[^\p{L}\s-]/gu, " ").trim())
      .find((ligne) => /^\p{Lu}\p{Ll}{2,}$/u.test(ligne) && !/^(Bike|Land|Prestige|Premium|Disponible)$/i.test(ligne));
    if (motIsole) nom = motIsole;
  }

  // --- Gamme, d'après le nom du fichier seulement.
  let gamme: GammeVelo | undefined;
  if (/prestige/i.test(nomFichier)) gamme = "PRESTIGE";
  else if (/pre[mn]i?um|prenium/i.test(nomFichier)) gamme = "PREMIUM";
  // Le Prestige est unique : son affiche ne porte pas d'autre nom.
  if (!nom && gamme === "PRESTIGE") nom = "Prestige";

  // --- Type de vélo.
  let categorie: CategorieVelo | undefined;
  let type = "";
  const vtt = plat.match(/\bVTT\b\s*([\p{L}-]{3,}(?:\s(?!\d)[\p{Ll}-]{3,})?)?/u);
  if (vtt) {
    categorie = "VTT";
    const precision = vtt[1] && !/^(fourche|freins?|v-brake)$/i.test(vtt[1]) ? vtt[1].toLowerCase() : "";
    type = precision ? `VTT ${precision}` : "VTT";
  } else if (/\bVTC\b/.test(plat)) {
    categorie = "VTC";
    type = "VTC";
  } else if (/gravel/i.test(plat)) {
    categorie = "GRAVEL";
    type = "gravel";
  } else if (/tandem/i.test(plat)) {
    categorie = "TANDEM";
    type = "tandem";
  } else if (/[ée]lectrique|\bVAE\b|assistance/i.test(plat)) {
    categorie = "VAE";
    type = "vélo à assistance électrique";
  } else if (/randonn/i.test(plat)) {
    categorie = "RANDONNEUR";
    type = "randonneur";
  }
  if (type) trouvailles.push(type);

  // --- Caractéristiques.
  const caracteristiques: string[] = [];
  if (/fourche\s+rigide/i.test(plat)) caracteristiques.push("une fourche rigide");
  else if (/fourche\s+(avant|suspendue|t[ée]lescopique)/i.test(plat)) caracteristiques.push("une fourche suspendue");

  if (/acier\s+haute\s+r[ée]sistance/i.test(plat)) caracteristiques.push("un cadre en acier haute résistance");
  else if (/alumin/i.test(plat)) caracteristiques.push("un cadre en aluminium");

  if (/double\s+freins?\s+[àa]\s+disques?/i.test(plat)) caracteristiques.push("un double frein à disque");
  else if (/freins?\s+[àa]\s+disques?/i.test(plat)) caracteristiques.push("des freins à disque");
  else if (/v\s?-?\s?brake/i.test(plat)) caracteristiques.push(`des freins V-Brake${/patins/i.test(plat) ? " à patins" : ""}`);

  if (/b[âa]ton\s+mag/i.test(plat)) caracteristiques.push("des jantes bâton en magnésium");
  if (/kenda/i.test(plat)) caracteristiques.push(`des pneus KENDA${/tout[\s-]?terrain/i.test(plat) ? " tout-terrain" : ""}`);

  const vitessesLues = plat.match(/\b(\d{1,2})\s*vitesses?\b/i);
  const vitesses = vitessesLues ? Number(vitessesLues[1]) : undefined;
  if (vitesses && vitesses >= 1 && vitesses <= 30) caracteristiques.push(`${vitesses} vitesses`);

  const rouesLues = plat.match(/\b(\d{2}(?:[.,]\d)?)\s*pouces?\b/i);
  const roues = rouesLues ? `${rouesLues[1].replace(".", ",")} pouces` : undefined;
  if (roues) caracteristiques.push(`des roues de ${roues}`);

  const couleursLues = plat.match(new RegExp(`\\b(${COULEURS})\\s*/\\s*(${COULEURS})\\b`, "i"));
  const couleurs = couleursLues ? [couleursLues[1].toLowerCase(), couleursLues[2].toLowerCase()] : [];

  trouvailles.push(...caracteristiques.map((c) => c.replace(/^(une|un|des)\s/, "")));
  if (couleurs.length) trouvailles.push(couleurs.join(" / "));

  // --- Accroche et description, rédigées à partir de ce qui a été lu.
  const morceauxAccroche = [
    [type || "Vélo", vitesses ? `${vitesses} vitesses` : ""].filter(Boolean).join(" "),
    roues ? `roues de ${roues}` : "",
    couleurs.length ? listeFrancaise(couleurs) : "",
  ].filter(Boolean);
  const accroche =
    caracteristiques.length || type
      ? `${morceauxAccroche.join(", ")}.`.replace(/^./, (l) => l.toUpperCase()).slice(0, 140)
      : undefined;

  const description =
    caracteristiques.length || type
      ? [
          type
            ? `${nom ?? "Ce vélo"} est un ${type}${caracteristiques.length ? ` avec ${listeFrancaise(caracteristiques)}` : ""}.`
            : `${nom ?? "Ce vélo"} a ${listeFrancaise(caracteristiques)}.`,
          couleurs.length ? `Coloris ${listeFrancaise(couleurs)}.` : "",
          "Révisé entre deux sorties, il vous est remis réglé à votre taille, avec casque, antivol et kit de réparation.",
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  return {
    nom,
    categorie,
    gamme,
    vitesses: vitesses && vitesses <= 30 ? vitesses : undefined,
    accroche,
    description,
    trouvailles,
  };
}
