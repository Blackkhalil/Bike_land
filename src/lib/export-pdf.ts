/**
 * Export des réservations d'une période en PDF.
 *
 * Le CSV sert au comptable, qui le recharge dans un tableur. Le PDF sert
 * à tout le reste : l'imprimer, l'envoyer, le classer. Il doit donc se
 * lire seul, sans outil, et c'est pourquoi il porte en tête ce qu'un
 * lecteur cherche d'abord : la période, le nombre de réservations
 * payées et ce qui a réellement été encaissé.
 *
 * Les totaux ne comptent que les réservations payées, selon la même
 * règle que le tableau de bord : un panier jamais réglé n'est pas une
 * recette. Le détail, lui, liste toutes les lignes de la période avec
 * leur état, pour que rien ne soit caché à qui vérifie.
 *
 * Les polices standard du PDF ne connaissent que l'alphabet latin de
 * base et ses accents. Les espaces insécables qu'insère la mise en forme
 * française des nombres, et les guillemets typographiques, y sont
 * absents : un seul de ces caractères ferait échouer tout le document.
 * Le texte est donc ramené à ce que la police sait écrire avant d'être
 * posé.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { seulementPayees } from "@/lib/reservations";
import { site } from "@/lib/site";
import type { Reservation, StatutReservation } from "@/lib/types";

const NOIR = rgb(0.055, 0.055, 0.055);
const GRIS = rgb(0.42, 0.42, 0.42);
const FILET = rgb(0.86, 0.84, 0.8);
const ORANGE = rgb(0.95, 0.36, 0.02);

// A4 à l'italienne : le détail a neuf colonnes, il lui faut la largeur.
const LARGEUR = 841.89;
const HAUTEUR = 595.28;
const MARGE = 36;

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

/** 12500 devient « 12 500 F », avec une espace ordinaire. */
function montant(xof: number): string {
  return `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}

/** 2026-10-03 devient 03/10/2026. */
function dateCourte(iso: string | undefined): string {
  if (!iso) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

/** Coupe un texte trop long pour sa colonne, en le signalant. */
function ajuster(texte: string, police: PDFFont, taille: number, largeur: number): string {
  let t = lisible(texte);
  if (police.widthOfTextAtSize(t, taille) <= largeur) return t;
  while (t.length > 1 && police.widthOfTextAtSize(`${t}...`, taille) > largeur) {
    t = t.slice(0, -1);
  }
  return `${t}...`;
}

interface Colonne {
  titre: string;
  largeur: number;
  aDroite?: boolean;
  valeur: (r: Reservation) => string;
}

const COLONNES: Colonne[] = [
  { titre: "Référence", largeur: 72, valeur: (r) => r.reference },
  { titre: "Date", largeur: 62, valeur: (r) => dateCourte(r.dateDebut) },
  {
    titre: "Client",
    largeur: 120,
    valeur: (r) => `${r.client.prenom} ${r.client.nom}`,
  },
  { titre: "Téléphone", largeur: 90, valeur: (r) => r.client.telephone ?? "" },
  {
    titre: "Vélo",
    largeur: 110,
    valeur: (r) => r.lignes.map((l) => l.veloNom).join(" + "),
  },
  {
    titre: "Formule",
    largeur: 92,
    valeur: (r) =>
      r.offre === "road-trip"
        ? `Road trip, ${r.nombrePersonnes} pers.`
        : `Libre, ${r.dureeHeures ?? "?"} h`,
  },
  {
    titre: "Paiement",
    largeur: 78,
    valeur: (r) => {
      const moyen = r.paiements.find((p) => !p.estCaution)?.moyen ?? "";
      return moyen.replace("_MONEY", "").replace("_CASH", "").replace("_", " ");
    },
  },
  { titre: "État", largeur: 70, valeur: (r) => LIBELLES_STATUT[r.statut] },
  { titre: "Montant", largeur: 75, aDroite: true, valeur: (r) => montant(r.totalXof) },
];

export async function exporterPdf(
  reservations: Reservation[],
  periode: { debut: string; fin: string; libelle?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(lisible(`${site.nom}, réservations du ${dateCourte(periode.debut)} au ${dateCourte(periode.fin)}`));
  doc.setAuthor(site.nom);
  doc.setCreator(site.nom);

  const normale = await doc.embedFont(StandardFonts.Helvetica);
  const grasse = await doc.embedFont(StandardFonts.HelveticaBold);

  const triees = [...reservations].sort((a, b) =>
    a.dateDebut === b.dateDebut ? a.reference.localeCompare(b.reference) : a.dateDebut.localeCompare(b.dateDebut),
  );
  const payees = seulementPayees(triees);
  const encaisse = payees.reduce((s, r) => s + r.totalXof, 0);
  const annulees = triees.filter((r) => r.statut === "ANNULEE").length;
  const nonPayees = triees.filter((r) => r.statut === "EN_ATTENTE_PAIEMENT").length;

  const texte = (
    page: PDFPage,
    contenu: string,
    x: number,
    y: number,
    taille: number,
    police: PDFFont = normale,
    couleur = NOIR,
  ) => page.drawText(lisible(contenu), { x, y, size: taille, font: police, color: couleur });

  let page = doc.addPage([LARGEUR, HAUTEUR]);
  let y = HAUTEUR - MARGE;

  // --- En-tête : ce qu'on cherche d'abord.
  texte(page, site.nom.toUpperCase(), MARGE, y - 4, 9, grasse, ORANGE);
  texte(page, "Réservations de la période", MARGE, y - 26, 20, grasse);
  texte(
    page,
    `Du ${dateCourte(periode.debut)} au ${dateCourte(periode.fin)}. Édité le ${dateCourte(new Date().toISOString())}.`,
    MARGE,
    y - 44,
    9.5,
    normale,
    GRIS,
  );
  y -= 70;

  const blocs: [string, string][] = [
    ["Réservations payées", String(payees.length)],
    ["Encaissé", montant(encaisse)],
    ["Panier moyen", payees.length ? montant(encaisse / payees.length) : "-"],
    ["Annulées", String(annulees)],
    ["Jamais payées", String(nonPayees)],
  ];
  const largeurBloc = (LARGEUR - 2 * MARGE) / blocs.length;
  blocs.forEach(([libelle, valeur], i) => {
    const x = MARGE + i * largeurBloc;
    texte(page, libelle, x, y, 8.5, normale, GRIS);
    texte(page, valeur, x, y - 18, 15, grasse);
  });
  y -= 34;
  texte(
    page,
    "Les totaux ne comptent que les réservations payées. Le détail liste toutes les lignes de la période.",
    MARGE,
    y,
    8,
    normale,
    GRIS,
  );
  y -= 22;

  // --- Le détail.
  const enTete = (p: PDFPage, haut: number) => {
    let x = MARGE;
    for (const c of COLONNES) {
      const titre = lisible(c.titre);
      const decalage = c.aDroite ? c.largeur - grasse.widthOfTextAtSize(titre, 8) - 4 : 0;
      p.drawText(titre, { x: x + decalage, y: haut, size: 8, font: grasse, color: GRIS });
      x += c.largeur;
    }
    p.drawLine({
      start: { x: MARGE, y: haut - 5 },
      end: { x: LARGEUR - MARGE, y: haut - 5 },
      thickness: 0.8,
      color: NOIR,
    });
    return haut - 18;
  };

  y = enTete(page, y);

  if (triees.length === 0) {
    texte(page, "Aucune réservation sur cette période.", MARGE, y, 10, normale, GRIS);
  }

  for (const r of triees) {
    if (y < MARGE + 20) {
      page = doc.addPage([LARGEUR, HAUTEUR]);
      y = enTete(page, HAUTEUR - MARGE);
    }
    const attenuee = r.statut === "ANNULEE" || r.statut === "EN_ATTENTE_PAIEMENT";
    let x = MARGE;
    for (const c of COLONNES) {
      const valeur = ajuster(c.valeur(r), normale, 8.5, c.largeur - 6);
      const decalage = c.aDroite ? c.largeur - normale.widthOfTextAtSize(valeur, 8.5) - 4 : 0;
      page.drawText(valeur, {
        x: x + decalage,
        y,
        size: 8.5,
        font: c.aDroite && !attenuee ? grasse : normale,
        color: attenuee ? GRIS : NOIR,
      });
      x += c.largeur;
    }
    page.drawLine({
      start: { x: MARGE, y: y - 5 },
      end: { x: LARGEUR - MARGE, y: y - 5 },
      thickness: 0.4,
      color: FILET,
    });
    y -= 17;
  }

  // --- Pied de chaque page : d'où vient le document, et où l'on en est.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const pied = lisible(`${site.nom}, ${site.adresse.ville} (${site.adresse.pays}). ${site.telephone}, ${site.email}`);
    p.drawText(pied, { x: MARGE, y: MARGE - 16, size: 7.5, font: normale, color: GRIS });
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
