/**
 * Génération d'un historique de réservations cohérent pour le mode démo.
 *
 * Le tableau de bord du §2.3 n'a d'intérêt que s'il a de la matière :
 * saisonnalité, mix de moyens de paiement, annulations, clients récurrents.
 * Ce module fabrique ces données de façon **déterministe** (générateur
 * pseudo-aléatoire à graine fixe) : deux exécutions produisent exactement
 * le même historique, donc les chiffres du tableau de bord ne bougent pas
 * d'un rechargement à l'autre.
 */

import { optionsLocation, velos } from "@/data/catalogue";
import { ajouterJours, estHauteSaison, nombreDeJours, versISO, type DateISO } from "../dates";
import { calculerDevis } from "../tarification";
import type {
  Client,
  MoyenPaiement,
  Reservation,
  StatutReservation,
} from "../types";

/** Générateur mulberry32 : rapide, reproductible, suffisant pour du jeu d'essai. */
function generateur(graine: number) {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prenoms = [
  "Mariam", "Koffi", "Aïcha", "Sylvain", "Fatou", "Thomas", "Élodie", "Rachidi",
  "Nadia", "Jean-Baptiste", "Sonia", "Ismaël", "Chantal", "Hugo", "Bintou",
  "Rodrigue", "Léa", "Abdoulaye", "Céline", "Mathieu", "Grâce", "Serge",
  "Amina", "Pauline", "Yannick", "Estelle", "Boubacar", "Clara",
];

const noms = [
  "Agbodjan", "Dossou", "Houngbédji", "Sanni", "Ahouandjinou", "Renard", "Kponou",
  "Toffa", "Adjovi", "Martin", "Zinsou", "Bio", "Lokossou", "Gnonlonfoun",
  "Sagbo", "Da Silva", "Amoussou", "Tchibozo", "Aïnadou", "Kouassi",
];

const villes = [
  "Cotonou", "Porto-Novo", "Parakou", "Natitingou", "Abomey-Calavi",
  "Paris, France", "Lomé, Togo", "Lagos, Nigéria", "Bruxelles, Belgique", "Ouidah",
];

const moyens: MoyenPaiement[] = ["MTN_MONEY", "MOOV_MONEY", "CARTE_BANCAIRE", "ESPECES"];
// Le Mobile Money domine largement au Bénin (§7.2) : la répartition du jeu
// de démonstration reflète cette réalité de marché.
const poidsMoyens = [0.46, 0.27, 0.22, 0.05];

export interface HistoriqueDemo {
  clients: Client[];
  reservations: Reservation[];
}

export function construireHistorique(aujourdHuiISO: DateISO): HistoriqueDemo {
  const hasard = generateur(20260908);
  const clients: Client[] = [];
  const clientsParEmail = new Map<string, Client>();
  const reservations: Reservation[] = [];

  // Occupation par vélo, pour ne jamais fabriquer deux locations
  // qui se chevauchent sur un même vélo — la règle centrale du §2.1.
  const occupation = new Map<string, { debut: DateISO; fin: DateISO }[]>();
  for (const velo of velos) occupation.set(velo.id, []);

  const debutHistorique = ajouterJours(aujourdHuiISO, -420);
  const finHistorique = ajouterJours(aujourdHuiISO, 45);
  const totalJours = nombreDeJours(debutHistorique, finHistorique);

  let compteur = 0;

  for (let offset = 0; offset < totalJours; offset += 1) {
    const jour = ajouterJours(debutHistorique, offset);

    // Volume quotidien : plus élevé en haute saison et le week-end.
    const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay();
    let intensite = estHauteSaison(jour) ? 1.5 : 0.85;
    if (jourSemaine === 5 || jourSemaine === 6) intensite *= 1.35;
    // Croissance douce de l'activité sur la période.
    intensite *= 0.7 + (offset / totalJours) * 0.7;

    const nombre = tirageDePoisson(hasard, intensite);

    for (let i = 0; i < nombre; i += 1) {
      const reservation = fabriquerReservation({
        hasard,
        jourReservation: jour,
        aujourdHuiISO,
        occupation,
        clients,
        clientsParEmail,
        index: compteur,
      });
      if (reservation) {
        reservations.push(reservation);
        compteur += 1;
      }
    }
  }

  return { clients, reservations };
}

function fabriquerReservation(contexte: {
  hasard: () => number;
  jourReservation: DateISO;
  aujourdHuiISO: DateISO;
  occupation: Map<string, { debut: DateISO; fin: DateISO }[]>;
  clients: Client[];
  clientsParEmail: Map<string, Client>;
  index: number;
}): Reservation | null {
  const { hasard, jourReservation, aujourdHuiISO, occupation, clients, clientsParEmail, index } = contexte;

  const veloxDisponibles = velos.filter((velo) => velo.statut !== "RETIRE");
  const velo = veloxDisponibles[Math.floor(hasard() * veloxDisponibles.length)];

  // Délai entre la réservation et le départ : de la veille à deux mois.
  const delai = Math.floor(hasard() ** 2 * 55) + 1;
  const dateDebut = ajouterJours(jourReservation, delai);
  const jours = choisirDuree(hasard);
  const dateFin = ajouterJours(dateDebut, jours - 1);

  if (dateFin > ajouterJours(aujourdHuiISO, 60)) return null;

  const creneaux = occupation.get(velo.id)!;
  const chevauche = creneaux.some((c) => dateDebut <= c.fin && c.debut <= dateFin);
  if (chevauche) return null;

  const optionsChoisies = choisirOptions(hasard);
  const devis = calculerDevis(velo, dateDebut, dateFin, optionsChoisies);

  const client = obtenirClient(hasard, clients, clientsParEmail, jourReservation);
  const moyen = choisirMoyenPaiement(hasard);
  const statut = deduireStatut(hasard, dateDebut, dateFin, aujourdHuiISO);

  if (statut !== "ANNULEE") {
    creneaux.push({ debut: dateDebut, fin: dateFin });
  }

  const reference = `BL-D${String(index + 1).padStart(4, "0")}`;

  const reservation: Reservation = {
    id: `res-demo-${index + 1}`,
    reference,
    statut,
    clientId: client.id,
    client,
    pointDeRetraitId: velo.pointDeRetraitId,
    dateDebut,
    dateFin,
    jours: devis.jours,
    lignes: [
      {
        veloId: velo.id,
        veloNom: velo.nom,
        veloSlug: velo.slug,
        prixUnitaireXof: velo.prixJourXof,
        totalLigneXof: devis.sousTotalXof,
      },
    ],
    options: devis.optionsDetaillees.map((ligne) => ({
      code: ligne.option.code,
      libelle: ligne.option.libelle,
      prixXof: ligne.montantXof,
      quantite: ligne.quantite,
    })),
    sousTotalXof: devis.sousTotalXof,
    optionsXof: devis.optionsXof,
    remiseXof: devis.remiseXof,
    cautionXof: devis.cautionXof,
    totalXof: devis.totalXof,
    paiements:
      statut === "ANNULEE"
        ? []
        : [
            {
              id: `pay-demo-${index + 1}`,
              fournisseur: moyen === "ESPECES" ? "ESPECES" : hasard() > 0.5 ? "FEDAPAY" : "KKIAPAY",
              moyen,
              statut: "REUSSI",
              montantXof: devis.totalXof,
              referenceFournisseur: `TX${String(900000 + index)}`,
              estCaution: false,
              creeLe: `${jourReservation}T10:00:00.000Z`,
            },
            ...(devis.cautionXof > 0
              ? [
                  {
                    id: `pay-caution-${index + 1}`,
                    fournisseur: (moyen === "ESPECES" ? "ESPECES" : "FEDAPAY") as "ESPECES" | "FEDAPAY",
                    moyen,
                    statut: (statut === "TERMINEE" ? "REMBOURSE" : "REUSSI") as "REMBOURSE" | "REUSSI",
                    montantXof: devis.cautionXof,
                    estCaution: true,
                    rembourseLe: statut === "TERMINEE" ? `${ajouterJours(dateFin, 2)}T12:00:00.000Z` : undefined,
                    creeLe: `${jourReservation}T10:00:00.000Z`,
                  },
                ]
              : []),
          ],
    creeLe: `${jourReservation}T10:00:00.000Z`,
    confirmeLe: statut === "ANNULEE" ? undefined : `${jourReservation}T10:02:00.000Z`,
    annuleLe: statut === "ANNULEE" ? `${ajouterJours(jourReservation, 2)}T09:00:00.000Z` : undefined,
    note: statut === "TERMINEE" && hasard() > 0.55 ? (hasard() > 0.25 ? 5 : 4) : undefined,
  };

  return reservation;
}

function choisirDuree(hasard: () => number): number {
  const tirage = hasard();
  if (tirage < 0.3) return 1 + Math.floor(hasard() * 2); // 1 – 2 jours
  if (tirage < 0.68) return 3 + Math.floor(hasard() * 4); // 3 – 6 jours
  if (tirage < 0.93) return 7 + Math.floor(hasard() * 5); // 7 – 11 jours
  return 14 + Math.floor(hasard() * 5); // grand raid
}

function choisirOptions(hasard: () => number): { code: string; quantite: number }[] {
  const choix: { code: string; quantite: number }[] = [];
  for (const option of optionsLocation) {
    const probabilite =
      option.code === "assurance" ? 0.42 : option.code === "accompagnement" ? 0.08 : 0.2;
    if (hasard() < probabilite) {
      choix.push({ code: option.code, quantite: option.quantifiable ? 1 + Math.floor(hasard() * 2) : 1 });
    }
  }
  return choix;
}

function choisirMoyenPaiement(hasard: () => number): MoyenPaiement {
  const tirage = hasard();
  let cumul = 0;
  for (let i = 0; i < moyens.length; i += 1) {
    cumul += poidsMoyens[i];
    if (tirage < cumul) return moyens[i];
  }
  return "MTN_MONEY";
}

function deduireStatut(
  hasard: () => number,
  dateDebut: DateISO,
  dateFin: DateISO,
  aujourdHuiISO: DateISO,
): StatutReservation {
  // Taux d'annulation d'environ 7 %, indicateur suivi au §2.3.
  if (hasard() < 0.07) return "ANNULEE";
  if (dateFin < aujourdHuiISO) return "TERMINEE";
  if (dateDebut <= aujourdHuiISO && dateFin >= aujourdHuiISO) return "EN_COURS";
  return "CONFIRMEE";
}

function obtenirClient(
  hasard: () => number,
  clients: Client[],
  clientsParEmail: Map<string, Client>,
  jour: DateISO,
): Client {
  // 28 % des locations sont le fait d'un client déjà connu : c'est
  // l'indicateur « nouveaux clients vs récurrents » du §2.3.
  if (clients.length > 12 && hasard() < 0.28) {
    return clients[Math.floor(hasard() * clients.length)];
  }

  const prenom = prenoms[Math.floor(hasard() * prenoms.length)];
  const nom = noms[Math.floor(hasard() * noms.length)];
  const ville = villes[Math.floor(hasard() * villes.length)];
  const base = `${prenom}.${nom}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z.]/g, "");
  let email = `${base}@exemple.bj`;
  let suffixe = 2;
  while (clientsParEmail.has(email)) {
    email = `${base}${suffixe}@exemple.bj`;
    suffixe += 1;
  }

  const client: Client = {
    id: `cli-demo-${clients.length + 1}`,
    email,
    prenom,
    nom: `${nom}${ville.includes(",") ? "" : ""}`,
    telephone: `+229 0${Math.floor(hasard() * 3) + 1} ${Math.floor(10 + hasard() * 89)} ${Math.floor(
      10 + hasard() * 89,
    )} ${Math.floor(10 + hasard() * 89)}`,
    creeLe: `${jour}T10:00:00.000Z`,
  };

  clients.push(client);
  clientsParEmail.set(email, client);
  return client;
}

/** Tirage de Poisson par la méthode de Knuth, pour un volume quotidien réaliste. */
function tirageDePoisson(hasard: () => number, lambda: number): number {
  const limite = Math.exp(-lambda);
  let k = 0;
  let produit = 1;
  do {
    k += 1;
    produit *= hasard();
  } while (produit > limite);
  return k - 1;
}

export const aujourdHuiDemo = (): DateISO => versISO(new Date());
