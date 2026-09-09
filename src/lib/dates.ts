/**
 * Utilitaires de dates de location.
 *
 * Convention du projet : une date de location est une date *civile* sans
 * heure ni fuseau, sérialisée en `YYYY-MM-DD`. On évite ainsi les décalages
 * de un jour entre le serveur (UTC) et le navigateur (UTC+1 au Bénin).
 *
 * `endDate` est le dernier jour d'utilisation **inclus** : une location du
 * 12 au 14 dure trois jours et le vélo est rendu le 14 au soir.
 */

export type DateISO = string;

const UN_JOUR_MS = 86_400_000;

export function aujourdhui(): DateISO {
  return versISO(new Date());
}

export function versISO(date: Date): DateISO {
  return date.toISOString().slice(0, 10);
}

export function versDateUTC(iso: DateISO): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function estDateISOValide(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && versISO(date) === valeur;
}

export function ajouterJours(iso: DateISO, jours: number): DateISO {
  return versISO(new Date(versDateUTC(iso).getTime() + jours * UN_JOUR_MS));
}

/** Nombre de jours facturés, bornes incluses. */
export function nombreDeJours(debut: DateISO, fin: DateISO): number {
  const diff = versDateUTC(fin).getTime() - versDateUTC(debut).getTime();
  return Math.floor(diff / UN_JOUR_MS) + 1;
}

/**
 * Deux périodes se chevauchent-elles ? Bornes incluses des deux côtés,
 * puisque le vélo est immobilisé le jour du retour.
 *
 * C'est la brique qui empêche la double réservation (§2.1, §5).
 */
export function periodesSeChevauchent(
  debutA: DateISO,
  finA: DateISO,
  debutB: DateISO,
  finB: DateISO,
): boolean {
  return debutA <= finB && debutB <= finA;
}

export function listerJours(debut: DateISO, fin: DateISO): DateISO[] {
  const jours: DateISO[] = [];
  for (let jour = debut; jour <= fin; jour = ajouterJours(jour, 1)) {
    jours.push(jour);
  }
  return jours;
}

export function moisDe(iso: DateISO): string {
  return iso.slice(0, 7);
}

/** Saison touristique : la saison sèche (novembre → mars) au Bénin. */
export function estHauteSaison(iso: DateISO): boolean {
  const mois = Number(iso.slice(5, 7));
  return mois >= 11 || mois <= 3;
}
