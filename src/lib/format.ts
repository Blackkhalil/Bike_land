/**
 * Formatage des montants et des dates.
 *
 * Les montants sont manipulés en FCFA entiers dans tout le projet : le franc
 * CFA n'a pas de subdivision utilisée, donc aucun arrondi flottant à gérer.
 */

const formatteurMontant = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

export function formatXof(montant: number): string {
  return `${formatteurMontant.format(Math.round(montant))} FCFA`;
}

export function formatXofCourt(montant: number): string {
  if (montant >= 1_000_000) {
    const millions = montant / 1_000_000;
    return `${formatteurMontant.format(Number(millions.toFixed(millions < 10 ? 1 : 0)))} M`;
  }
  if (montant >= 1_000) {
    return `${formatteurMontant.format(Math.round(montant / 1000))} k`;
  }
  return formatteurMontant.format(montant);
}

const formatteurDateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatteurDateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const formatteurJourMois = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatDate(valeur: string | Date): string {
  return formatteurDateLongue.format(versDate(valeur));
}

export function formatDateCourte(valeur: string | Date): string {
  return formatteurDateCourte.format(versDate(valeur));
}

export function formatDateAvecJour(valeur: string | Date): string {
  return formatteurJourMois.format(versDate(valeur));
}

export function formatPeriode(debut: string | Date, fin: string | Date): string {
  const d = versDate(debut);
  const f = versDate(fin);
  if (d.getUTCFullYear() === f.getUTCFullYear() && d.getUTCMonth() === f.getUTCMonth()) {
    return `${d.getUTCDate()} – ${formatDate(f)}`;
  }
  return `${formatDateCourte(d)} – ${formatDate(f)}`;
}

export function formatNombre(valeur: number, decimales = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur);
}

export function formatPourcentage(valeur: number, decimales = 0): string {
  return `${formatNombre(valeur, decimales)} %`;
}

function versDate(valeur: string | Date): Date {
  return typeof valeur === "string" ? new Date(`${valeur.slice(0, 10)}T00:00:00Z`) : valeur;
}

/**
 * Résume une réservation en une ligne : sa formule et ce qui la
 * dimensionne.
 *
 * Remplace l'ancien « N jours », qui ne veut plus rien dire — toutes les
 * sorties tiennent dans la journée. Ce qui distingue deux réservations,
 * c'est désormais la formule, et le nombre de participants ou la durée.
 */
export function resumeOffre(reservation: {
  offre: "road-trip" | "location-libre";
  nombrePersonnes: number;
  dureeHeures?: number;
}): string {
  if (reservation.offre === "road-trip") {
    const n = reservation.nombrePersonnes;
    return `Road trip · ${n} personne${n > 1 ? "s" : ""}`;
  }
  return `Location libre · ${reservation.dureeHeures ?? "?"} h`;
}
