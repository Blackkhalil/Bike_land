/**
 * Les réglages des offres de groupe, tels que l'administration les nomme :
 * un libellé et une unité pour chaque réglage de `ReglagesOffres`
 * (src/data/reglages-offres.ts), rangés dans les rubriques de la page
 * « Réglages des offres ». Le formulaire s'en sert pour ses cases, le
 * journal pour dire ce qui a changé (« Prix par personne : 3 000 F → 3 200 F »).
 *
 * Ce module ne fait que décrire, comme src/data/reglages.ts : aucun prix,
 * aucune règle. Il se lit aussi bien dans le navigateur que sur le serveur.
 * Un réglage ajouté au contrat sans libellé ici est signalé par le test
 * tests/offres/donnees-admin.test.mts.
 */

import { NOMS_JOURS, joursEnClair } from "@/data/reglages";
import type { ReglagesOffres } from "@/data/reglages-offres";

/** Ce qu'une case contient, donc comment on la saisit et comment on l'écrit. */
export type UniteReglage = "F" | "%" | "min" | "km" | "personnes" | "nombre" | "heure" | "jours" | "jour";

export interface ChampReglage {
  /** Le chemin du réglage dans `ReglagesOffres` : « roadTrip.prixPersonneXof ». */
  chemin: string;
  libelle: string;
  unite: UniteReglage;
  /** Une phrase sous la case, quand le libellé ne suffit pas. */
  aide?: string;
}

export interface RubriqueReglages {
  id: string;
  titre: string;
  description: string;
  champs: ChampReglage[];
}

/** Sous les cocos d'une sortie : ils sont offerts, et Bike Land les prépare et les paie. */
const AIDE_CONSOMMABLES_COMPRIS = "Compris dans le prix, comme l'eau. Comptés pour préparer la sortie et pour l'encaissé net.";

/** Les rubriques de la page, dans l'ordre où elles s'affichent. */
export const RUBRIQUES_REGLAGES_OFFRES: RubriqueReglages[] = [
  {
    id: "bike-for-all",
    titre: "Bike for All",
    description: "Le groupe donne son budget ou sa durée ; le site calcule le reste.",
    champs: [
      { chemin: "tarifNormalHeureXof", libelle: "Tarif normal d'un vélo, à l'heure", unite: "F", aide: "Sert au prix barré." },
      { chemin: "bikeForAll.tarifHeurePersonneXof", libelle: "Tarif Bike for All, par heure et par personne", unite: "F" },
      { chemin: "bikeForAll.personnesMin", libelle: "Personnes au minimum", unite: "personnes" },
      { chemin: "bikeForAll.budgetMinXof", libelle: "Budget minimum du groupe", unite: "F" },
      { chemin: "bikeForAll.fraisOrganisationXof", libelle: "Frais d'organisation", unite: "F" },
      { chemin: "bikeForAll.fraisOrganisationGrosXof", libelle: "Frais d'organisation à partir du seuil", unite: "F" },
      {
        chemin: "bikeForAll.seuilGrosBudgetXof",
        libelle: "Seuil des frais majorés",
        unite: "F",
        aide: "Comparé au budget, ou au temps de vélo quand le client donne sa durée.",
      },
      { chemin: "bikeForAll.partMaxCocos", libelle: "Part maximale des cocos dans le budget", unite: "%" },
      { chemin: "bikeForAll.dureeMinMinutes", libelle: "Durée minimale de vélo", unite: "min" },
      { chemin: "bikeForAll.pasMinutes", libelle: "Pas de la durée", unite: "min", aide: "Les durées s'arrondissent à ce pas, vers le bas." },
      { chemin: "bikeForAll.fraisHorsOffreXof", libelle: "Frais d'organisation hors offre", unite: "F", aide: "Sert au prix barré." },
      { chemin: "bikeForAll.premierDepart", libelle: "Premier départ", unite: "heure" },
      { chemin: "bikeForAll.dernierDepart", libelle: "Dernier départ", unite: "heure" },
      { chemin: "bikeForAll.retourAuPlusTard", libelle: "Retour des vélos au plus tard", unite: "heure" },
    ],
  },
  {
    id: "accompagnateur",
    titre: "Accompagnateur",
    description: "En option sur Bike for All : un membre de l'équipe roule avec le groupe.",
    champs: [
      { chemin: "accompagnateur.minXof", libelle: "Prix minimum", unite: "F" },
      {
        chemin: "accompagnateur.personnesIncluses",
        libelle: "Personnes comprises dans le prix minimum",
        unite: "personnes",
        aide: "Le prix minimum les couvre ; au-delà, chaque personne en plus se paie à part.",
      },
      {
        chemin: "accompagnateur.parPersonneXof",
        libelle: "Par personne en plus",
        unite: "F",
        aide: "Pour chaque personne au-delà de celles comprises dans le prix minimum.",
      },
      { chemin: "accompagnateur.parHeureXof", libelle: "Par heure entamée après la première", unite: "F" },
      { chemin: "accompagnateur.plafondXof", libelle: "Plafond", unite: "F" },
    ],
  },
  {
    id: "consommables",
    titre: "Consommables",
    description: "Les cocos et les gâteaux vendus avec les offres, et ce qu'ils coûtent à Bike Land.",
    champs: [
      { chemin: "consommables.cocoPetitXof", libelle: "Coco petit format", unite: "F" },
      { chemin: "consommables.cocoGrandXof", libelle: "Coco grand format", unite: "F" },
      { chemin: "consommables.gateauPrixXof", libelle: "Gâteau, prix au client", unite: "F" },
      { chemin: "consommables.gateauCoutXof", libelle: "Gâteau, coût d'achat", unite: "F", aide: "Pour l'encaissé net, jamais facturé." },
      { chemin: "consommables.eauCoutXof", libelle: "Bouteille d'eau, coût d'achat", unite: "F", aide: "Pour l'encaissé net, jamais facturé." },
    ],
  },
  {
    id: "road-trip-groupe",
    titre: "Road trip en groupe",
    description: "La balade de groupe du week-end, prix fixe par personne, toutes gammes.",
    champs: [
      { chemin: "roadTrip.prixPersonneXof", libelle: "Prix par personne, avant les frais de paiement", unite: "F" },
      { chemin: "roadTrip.reduction", libelle: "Réduction (abonné à nos réseaux)", unite: "%", aide: "Une seule par groupe, sur le prix avant les frais." },
      { chemin: "roadTrip.personnesMin", libelle: "Personnes au minimum", unite: "personnes" },
      {
        chemin: "roadTrip.cocosGrandsParPersonne",
        libelle: "Cocos grand format par personne",
        unite: "nombre",
        aide: AIDE_CONSOMMABLES_COMPRIS,
      },
      { chemin: "roadTrip.eauxParPersonne", libelle: "Bouteilles d'eau par personne", unite: "nombre" },
      { chemin: "roadTrip.distanceKm", libelle: "Distance", unite: "km" },
      { chemin: "roadTrip.jours", libelle: "Jours de départ", unite: "jours" },
      { chemin: "roadTrip.depart", libelle: "Départ", unite: "heure" },
      { chemin: "roadTrip.retour", libelle: "Retour", unite: "heure" },
    ],
  },
  {
    id: "gbashi",
    titre: "Gbashi Bike",
    description: "Vélo et séance de sport en bord de mer, sur réservation, prix selon la gamme de chaque vélo.",
    champs: [
      { chemin: "gbashi.prixXof.CLASSIQUE", libelle: "Classique, avant les frais de paiement", unite: "F" },
      { chemin: "gbashi.prixXof.PREMIUM", libelle: "Premium, avant les frais de paiement", unite: "F" },
      { chemin: "gbashi.prixXof.PRESTIGE", libelle: "Prestige, avant les frais de paiement", unite: "F" },
      { chemin: "gbashi.personnesMin", libelle: "Personnes au minimum", unite: "personnes" },
      {
        chemin: "gbashi.cocosGrandsParPersonne",
        libelle: "Cocos grand format par personne",
        unite: "nombre",
        aide: AIDE_CONSOMMABLES_COMPRIS,
      },
      { chemin: "gbashi.eauxParPersonne", libelle: "Bouteilles d'eau par personne", unite: "nombre" },
      { chemin: "gbashi.jours", libelle: "Jours de départ", unite: "jours" },
      { chemin: "gbashi.depart", libelle: "Départ", unite: "heure" },
      { chemin: "gbashi.retour", libelle: "Retour", unite: "heure" },
    ],
  },
  {
    id: "paiement",
    titre: "Paiement",
    description: "Ajoutés aux paiements en ligne, par personne. Jamais au comptoir.",
    champs: [{ chemin: "paiement.fraisParPersonneXof", libelle: "Frais de paiement électronique, par personne", unite: "F" }],
  },
  {
    // Le délai et la date limite ne valent que sur le site : au comptoir, une
    // sortie se vend tant que son jour n'est pas passé (décisions techniques,
    // docs/bike-land/SUIVI.md).
    id: "reservation-en-ligne",
    titre: "Réservation en ligne",
    description: "Pour les trois offres, sur le site seulement. Le comptoir n'est concerné ni par le délai ni par la date limite.",
    champs: [
      {
        chemin: "delaiMinimumMinutes",
        libelle: "Délai minimum avant le départ",
        unite: "min",
        aide: "Le temps de préparer les vélos, les cocos et les gâteaux. Le comptoir n'est pas concerné.",
      },
      {
        chemin: "dateLimiteWeekend.jour",
        libelle: "Date limite du week-end, jour",
        unite: "jour",
        aide: "Les sorties du samedi et du dimanche se réservent au plus tard ce jour-là.",
      },
      { chemin: "dateLimiteWeekend.heure", libelle: "Date limite du week-end, heure", unite: "heure" },
    ],
  },
  {
    id: "retard",
    titre: "Retard",
    description: "Affiché avant le paiement et dans le récapitulatif ; la pénalité se paie en espèces au retour.",
    champs: [
      { chemin: "retard.toleranceMinutes", libelle: "Tolérance", unite: "min" },
      { chemin: "retard.penaliteParMinuteXof", libelle: "Pénalité par minute au-delà, pour tout le groupe", unite: "F" },
    ],
  },
];

/** Tous les réglages, par chemin. */
export const CHAMPS_REGLAGES_OFFRES: ReadonlyMap<string, ChampReglage> = new Map(
  RUBRIQUES_REGLAGES_OFFRES.flatMap((rubrique) => rubrique.champs.map((champ) => [champ.chemin, champ] as const)),
);

/** La valeur rangée sous un chemin : `lireChemin(r, "roadTrip.depart")`. */
export function lireChemin(objet: unknown, chemin: string): unknown {
  let courant: unknown = objet;
  for (const morceau of chemin.split(".")) {
    if (courant === null || typeof courant !== "object") return undefined;
    courant = (courant as Record<string, unknown>)[morceau];
  }
  return courant;
}

/**
 * Les chemins de toutes les feuilles d'un objet de réglages, tableaux
 * compris comme une seule valeur (les jours de départ).
 */
export function cheminsDesFeuilles(objet: unknown, prefixe = ""): string[] {
  if (objet === null || typeof objet !== "object" || Array.isArray(objet)) return prefixe ? [prefixe] : [];
  return Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
    cheminsDesFeuilles(valeur, prefixe ? `${prefixe}.${cle}` : cle),
  );
}

export interface ChangementReglage {
  chemin: string;
  avant: unknown;
  apres: unknown;
}

/** Ce qui change d'un jeu de réglages à l'autre, réglage par réglage, dans l'ordre de la page. */
export function differencesReglagesOffres(avant: ReglagesOffres, apres: ReglagesOffres): ChangementReglage[] {
  const chemins = [
    ...CHAMPS_REGLAGES_OFFRES.keys(),
    // Un réglage que la page ne connaît pas encore compte aussi.
    ...cheminsDesFeuilles(apres).filter((chemin) => !CHAMPS_REGLAGES_OFFRES.has(chemin)),
  ];
  const changements: ChangementReglage[] = [];
  for (const chemin of chemins) {
    const a = lireChemin(avant, chemin);
    const b = lireChemin(apres, chemin);
    if (comparable(a) !== comparable(b)) changements.push({ chemin, avant: a ?? null, apres: b ?? null });
  }
  return changements;
}

/**
 * Une valeur prête à comparer. Les jours de départ sont un ensemble : le
 * samedi et le dimanche, dans un ordre ou dans l'autre, ne changent rien
 * (le schéma les range dans l'ordre, les valeurs de départ non).
 */
function comparable(valeur: unknown): string {
  if (Array.isArray(valeur)) {
    return JSON.stringify([...valeur].sort((x, y) => (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)))));
  }
  return JSON.stringify(valeur ?? null);
}

const INSECABLE = String.fromCharCode(0xa0);
const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** « 3 000 F » : un montant comme le cahier des charges l'écrit. */
export function montantF(montant: number): string {
  return `${nombreFr.format(Math.round(montant))}${INSECABLE}F`;
}

/** « 8 h », « 21 h 30 » pour « 08:00 », « 21:30 ». */
export function heureEnClair(heure: string): string {
  const [h, m] = heure.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return heure;
  return m ? `${h}${INSECABLE}h${INSECABLE}${String(m).padStart(2, "0")}` : `${h}${INSECABLE}h`;
}

/** Une valeur de réglage telle qu'on la lit : « 3 000 F », « 20 % », « 30 min », « le samedi et le dimanche ». */
export function valeurReglageEnClair(chemin: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "rien";
  const unite = CHAMPS_REGLAGES_OFFRES.get(chemin)?.unite;
  if (unite === "jours" && Array.isArray(valeur)) return joursEnClair(valeur.filter((j): j is number => typeof j === "number"));
  if (unite === "jour" && typeof valeur === "number") return NOMS_JOURS[valeur] ?? String(valeur);
  if (unite === "heure" && typeof valeur === "string") return heureEnClair(valeur);
  if (typeof valeur !== "number") return String(valeur);
  switch (unite) {
    case "F":
      return montantF(valeur);
    case "%":
      return `${nombreFr.format(Math.round(valeur * 10000) / 100)}${INSECABLE}%`;
    case "min":
      return `${nombreFr.format(valeur)}${INSECABLE}min`;
    case "km":
      return `${nombreFr.format(valeur)}${INSECABLE}km`;
    case "personnes":
      return `${nombreFr.format(valeur)}${INSECABLE}personne${valeur > 1 ? "s" : ""}`;
    default:
      return nombreFr.format(valeur);
  }
}

/** Le nom d'un réglage pour le journal : « Road trip en groupe · Départ ». */
export function nomDuReglage(chemin: string): string {
  const rubrique = RUBRIQUES_REGLAGES_OFFRES.find((r) => r.champs.some((champ) => champ.chemin === chemin));
  const champ = CHAMPS_REGLAGES_OFFRES.get(chemin);
  if (!rubrique || !champ) return chemin;
  return `${rubrique.titre} · ${champ.libelle}`;
}
