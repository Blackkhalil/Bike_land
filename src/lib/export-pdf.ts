/**
 * Le tableau de bord en PDF.
 *
 * Le PDF reprend la page d'administration dans son ordre : la journée,
 * l'argent, le parc, les clients, les répartitions, les douze derniers
 * mois, puis le détail de chaque réservation de la période. Il sert à
 * imprimer, envoyer ou classer, et doit donc se lire seul.
 *
 * Tout le contenu vient de `construireRapport`, que l'export CSV utilise
 * aussi : les deux fichiers et l'écran disent la même chose.
 *
 * Les polices standard du PDF ne connaissent que l'alphabet latin et ses
 * accents. Les espaces insécables et les guillemets typographiques y sont
 * absents, et un seul de ces caractères faisait échouer tout le document :
 * le texte est ramené à ce que la police sait écrire avant d'être posé.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { montant, type Rapport } from "@/lib/rapport";
import { site } from "@/lib/site";
import type { Reservation, StatutReservation } from "@/lib/types";

const NOIR = rgb(0.055, 0.055, 0.055);
const GRIS = rgb(0.42, 0.42, 0.42);
const FILET = rgb(0.86, 0.84, 0.8);
const ORANGE = rgb(0.95, 0.36, 0.02);
const FOND = rgb(0.95, 0.94, 0.91);

// A4 à l'italienne : le détail a neuf colonnes, il lui faut la largeur.
const LARGEUR = 841.89;
const HAUTEUR = 595.28;
const MARGE = 36;
const BAS = MARGE + 14;
const UTILE = LARGEUR - 2 * MARGE;

const LIBELLES_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE_PAIEMENT: "Non payée",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

/** Ramène un texte aux caractères que la police standard sait écrire. */
function lisible(texte: string): string {
  return texte
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e -ÿ]/g, "?");
}

const dateCourte = (iso: string) => {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
};

interface ColonneDetail {
  titre: string;
  largeur: number;
  aDroite?: boolean;
  valeur: (r: Reservation) => string;
}

const DETAIL: ColonneDetail[] = [
  { titre: "Référence", largeur: 66, valeur: (r) => r.reference },
  { titre: "Date", largeur: 62, valeur: (r) => dateCourte(r.dateDebut) },
  { titre: "Client", largeur: 104, valeur: (r) => `${r.client.prenom} ${r.client.nom}` },
  { titre: "Téléphone", largeur: 84, valeur: (r) => r.client.telephone ?? "" },
  { titre: "Vélo", largeur: 92, valeur: (r) => r.lignes.map((l) => l.veloNom).join(" + ") },
  {
    titre: "Formule",
    largeur: 86,
    valeur: (r) =>
      r.offre === "road-trip"
        ? `Road trip, ${r.nombrePersonnes} pers.`
        : r.offre === "octobre-rose"
          ? `Octobre rose, ${r.nombrePersonnes} pers.`
          : r.offre === "gbashi-bike"
            ? `Gbashi bike, ${r.nombrePersonnes} pers.`
            : r.offre === "padel-bike"
              ? `Padel bike, ${r.nombrePersonnes} pers.`
              : `Libre, ${r.dureeHeures ?? "?"} h`,
  },
  {
    titre: "Paiement",
    largeur: 78,
    valeur: (r) =>
      (r.paiements.find((p) => !p.estCaution)?.moyen ?? "")
        .replace("_MONEY", "")
        .replace("_CASH", "")
        .replace("_", " "),
  },
  { titre: "Parrainage", largeur: 52, valeur: (r) => r.codeParrainage ?? "" },
  { titre: "État", largeur: 70, valeur: (r) => LIBELLES_STATUT[r.statut] },
  { titre: "Montant", largeur: 75, aDroite: true, valeur: (r) => montant(r.totalXof) },
];

export async function exporterPdf(rapport: Rapport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(lisible(`${site.nom}, ${rapport.titre}, ${rapport.periodeLibelle}`));
  doc.setAuthor(site.nom);
  doc.setCreator(site.nom);

  const normale = await doc.embedFont(StandardFonts.Helvetica);
  const grasse = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([LARGEUR, HAUTEUR]);
  let y = HAUTEUR - MARGE;

  const ecrire = (
    contenu: string,
    x: number,
    haut: number,
    taille: number,
    police: PDFFont = normale,
    couleur = NOIR,
    p: PDFPage = page,
  ) => p.drawText(lisible(contenu), { x, y: haut, size: taille, font: police, color: couleur });

  const aDroite = (contenu: string, xDroit: number, haut: number, taille: number, police: PDFFont, couleur = NOIR) => {
    const t = lisible(contenu);
    page.drawText(t, { x: xDroit - police.widthOfTextAtSize(t, taille), y: haut, size: taille, font: police, color: couleur });
  };

  const ajuster = (texte: string, police: PDFFont, taille: number, largeur: number) => {
    let t = lisible(texte);
    if (police.widthOfTextAtSize(t, taille) <= largeur) return t;
    while (t.length > 1 && police.widthOfTextAtSize(`${t}...`, taille) > largeur) t = t.slice(0, -1);
    return `${t}...`;
  };

  /** Passe à la page suivante si la hauteur demandée ne tient plus. */
  const place = (hauteur: number) => {
    if (y - hauteur < BAS) {
      page = doc.addPage([LARGEUR, HAUTEUR]);
      y = HAUTEUR - MARGE;
    }
  };

  const titreBloc = (titre: string, question: string) => {
    place(52);
    y -= 8;
    ecrire(titre, MARGE, y, 13, grasse);
    ecrire(question, MARGE, y - 14, 8.5, normale, GRIS);
    y -= 26;
  };

  // --- En-tête.
  ecrire(site.nom.toUpperCase(), MARGE, y - 4, 9, grasse, ORANGE);
  ecrire(`${rapport.titre} : ${rapport.periodeLibelle.toLowerCase()}`, MARGE, y - 26, 20, grasse);
  ecrire(
    `${rapport.fenetre}. ${rapport.comparaison}. Édité le ${rapport.editeLe}.`,
    MARGE,
    y - 43,
    9.5,
    normale,
    GRIS,
  );
  y -= 60;

  // --- Sections d'indicateurs : libellé, valeur, période précédente,
  //     évolution, explication.
  const col = { libelle: MARGE, valeur: MARGE + 250, precedente: MARGE + 350, variation: MARGE + 450, aide: MARGE + 470 };
  for (const section of rapport.sections) {
    titreBloc(section.titre, section.question);
    const compare = section.lignes.some((l) => l.precedente !== undefined);
    if (compare) {
      place(14);
      aDroite("Période", col.valeur, y, 7.5, grasse, GRIS);
      aDroite("Précédente", col.precedente, y, 7.5, grasse, GRIS);
      aDroite("Évolution", col.variation, y, 7.5, grasse, GRIS);
      y -= 12;
    }
    for (const ligne of section.lignes) {
      place(16);
      ecrire(ligne.libelle, col.libelle, y, 9.5);
      aDroite(ligne.valeur, col.valeur, y, 9.5, grasse);
      if (ligne.precedente !== undefined) aDroite(ligne.precedente, col.precedente, y, 9, normale, GRIS);
      if (ligne.variation !== undefined) aDroite(ligne.variation, col.variation, y, 9, normale, GRIS);
      if (ligne.aide) ecrire(ajuster(ligne.aide, normale, 8, LARGEUR - MARGE - col.aide), col.aide, y, 8, normale, GRIS);
      page.drawLine({ start: { x: MARGE, y: y - 5 }, end: { x: LARGEUR - MARGE, y: y - 5 }, thickness: 0.4, color: FILET });
      y -= 16;
    }
  }

  // --- Tableaux de répartition.
  for (const tableau of rapport.tableaux) {
    titreBloc(tableau.titre, tableau.sousTitre);
    const largeur = Math.min(UTILE, 160 + 120 * (tableau.colonnes.length - 1));
    const premiere = 160;
    const autres = (largeur - premiere) / Math.max(1, tableau.colonnes.length - 1);
    const xGauche = (i: number) => MARGE + premiere + autres * (i - 1) + 8;
    const xDroit = (i: number) => MARGE + premiere + autres * i;
    const poser = (v: string, i: number, taille: number, police: PDFFont, couleur = NOIR) => {
      if (i === 0) ecrire(ajuster(v, police, taille, premiere - 8), MARGE, y, taille, police, couleur);
      else if (tableau.aDroite.includes(i)) aDroite(v, xDroit(i), y, taille, police, couleur);
      else ecrire(ajuster(v, police, taille, autres - 10), xGauche(i), y, taille, police, couleur);
    };

    place(16);
    tableau.colonnes.forEach((c, i) => poser(c, i, 7.5, grasse, GRIS));
    y -= 12;

    if (tableau.lignes.length === 0) {
      place(16);
      ecrire(tableau.vide ?? "Aucune donnée sur la période.", MARGE, y, 9, normale, GRIS);
      y -= 16;
      continue;
    }
    for (const ligne of tableau.lignes) {
      place(15);
      ligne.forEach((v, i) => poser(v, i, 9, normale));
      page.drawLine({ start: { x: MARGE, y: y - 4 }, end: { x: MARGE + largeur, y: y - 4 }, thickness: 0.4, color: FILET });
      y -= 15;
    }
  }

  // --- Détail des réservations, sur une nouvelle page.
  page = doc.addPage([LARGEUR, HAUTEUR]);
  y = HAUTEUR - MARGE;
  ecrire("Détail des réservations de la période", MARGE, y - 14, 13, grasse);
  ecrire(
    `${rapport.detail.length} ligne${rapport.detail.length > 1 ? "s" : ""}. Les annulées et les non payées sont en gris : elles ne comptent dans aucun total.`,
    MARGE,
    y - 28,
    8.5,
    normale,
    GRIS,
  );
  y -= 46;

  const enTeteDetail = () => {
    page.drawRectangle({ x: MARGE, y: y - 5, width: UTILE, height: 16, color: FOND });
    let x = MARGE;
    for (const c of DETAIL) {
      if (c.aDroite) aDroite(c.titre, x + c.largeur - 4, y, 8, grasse, GRIS);
      else ecrire(c.titre, x + 2, y, 8, grasse, GRIS);
      x += c.largeur;
    }
    y -= 18;
  };
  enTeteDetail();

  if (rapport.detail.length === 0) {
    ecrire("Aucune réservation sur cette période.", MARGE, y, 10, normale, GRIS);
  }

  for (const r of rapport.detail) {
    if (y < BAS + 6) {
      page = doc.addPage([LARGEUR, HAUTEUR]);
      y = HAUTEUR - MARGE;
      enTeteDetail();
    }
    const attenuee = r.statut === "ANNULEE" || r.statut === "EN_ATTENTE_PAIEMENT";
    let x = MARGE;
    for (const c of DETAIL) {
      const valeur = ajuster(c.valeur(r), normale, 8.5, c.largeur - 6);
      const police = c.aDroite && !attenuee ? grasse : normale;
      const couleur = attenuee ? GRIS : NOIR;
      if (c.aDroite) aDroite(valeur, x + c.largeur - 4, y, 8.5, police, couleur);
      else ecrire(valeur, x + 2, y, 8.5, police, couleur);
      x += c.largeur;
    }
    page.drawLine({ start: { x: MARGE, y: y - 5 }, end: { x: LARGEUR - MARGE, y: y - 5 }, thickness: 0.4, color: FILET });
    y -= 17;
  }

  // --- Pied de chaque page.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    ecrire(
      `${site.nom}, ${site.adresse.ville} (${site.adresse.pays}). ${site.telephone}, ${site.email}`,
      MARGE,
      MARGE - 16,
      7.5,
      normale,
      GRIS,
      p,
    );
    const numero = `Page ${i + 1} sur ${pages.length}`;
    p.drawText(numero, {
      x: LARGEUR - MARGE - normale.widthOfTextAtSize(numero, 7.5),
      y: MARGE - 16,
      size: 7.5,
      font: normale,
      color: GRIS,
    });
  });

  return doc.save();
}
