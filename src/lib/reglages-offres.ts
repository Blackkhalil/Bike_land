/**
 * Les réglages des offres de groupe, côté serveur : lus dans la base
 * (table ParametreAdmin, clé « reglages:offres-groupe ») sur les valeurs de
 * départ de src/data/reglages-offres.ts, et enregistrés depuis
 * l'administration, rubrique « Réglages des offres ».
 *
 * La lecture dit d'où viennent les réglages : les valeurs de départ (rien
 * d'enregistré), les valeurs enregistrées, ou « illisible » quand
 * l'enregistrement ne passe plus le schéma. Dans ce dernier cas, la vente
 * des offres de groupe est refusée et l'administration le dit en tête de
 * page : on ne vend jamais en silence au prix par défaut.
 *
 * Chaque enregistrement s'écrit au journal, avec ce qui a changé.
 */

import {
  CLE_REGLAGES_OFFRES,
  lireReglagesOffresAvec,
  REGLAGES_OFFRES_PAR_DEFAUT,
  type LectureReglagesOffres,
  type ReglagesOffres,
} from "@/data/reglages-offres";
import { differencesReglagesOffres, type ChangementReglage } from "@/data/libelles-reglages-offres";
import { depot } from "@/lib/db";

/** Les réglages des offres de groupe, et d'où ils viennent. Une base injoignable fait échouer la lecture. */
export function lireReglagesOffres(): Promise<LectureReglagesOffres> {
  return lireReglagesOffresAvec((cle) => depot.lireParametreAdmin(cle));
}

/**
 * Enregistre les réglages des offres, déjà validés par
 * `schemaReglagesOffres`, puis écrit au journal ce qui a changé, signé de
 * `auteur` (« admin (Koffi) »). Renvoie la liste des changements.
 *
 * Le journal vient après l'écriture : s'il échoue, le réglage reste
 * enregistré (c'est lui qui compte pour la vente) et l'échec est noté dans
 * les journaux du serveur.
 */
export async function enregistrerReglagesOffres(
  reglages: ReglagesOffres,
  auteur: string,
): Promise<{ changements: ChangementReglage[] }> {
  // Ce qui était en vigueur avant : les valeurs de départ quand rien ne se
  // lisait, pour que le journal dise ce que le site appliquait vraiment.
  const avant = await lireReglagesOffres().catch(() => null);
  await depot.ecrireParametreAdmin(CLE_REGLAGES_OFFRES, JSON.stringify(reglages));
  const changements = differencesReglagesOffres(avant?.reglages ?? REGLAGES_OFFRES_PAR_DEFAUT, reglages);
  try {
    await depot.journaliser({
      type: "reglages-offres",
      details: { changements, sourceAvant: avant?.source ?? "inconnue" },
      auteur,
    });
  } catch (erreur) {
    console.error("[reglages-offres] enregistrés, mais le journal n'a pas pu être écrit", erreur);
  }
  return { changements };
}
