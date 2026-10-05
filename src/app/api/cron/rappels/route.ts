import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ajouterJours, aujourdhui } from "@/lib/dates";
import { depot } from "@/lib/db";
import { envoyerRappel } from "@/lib/email";
import { lienDeSuivi } from "@/lib/lien-suivi";

/** Quelques rappels par soir, envoyés l'un après l'autre par Gmail. */
export const maxDuration = 60;

/**
 * Rappel de la veille, appelé chaque soir par la tâche planifiée de
 * Vercel (voir vercel.json : 17 h UTC, soit 18 h au Bénin).
 *
 * Il écrit à chaque client qui part le lendemain, paiement confirmé.
 * Chaque rappel est retenu en base avant d'être envoyé : appelée deux
 * fois, la tâche n'écrit pas deux fois au même client.
 *
 * Quand CRON_SECRET est défini sur Vercel, Vercel l'envoie dans l'en-tête
 * Authorization, et toute autre requête est refusée. Sans lui, l'adresse
 * reste appelable mais sans danger : elle n'envoie que les rappels du
 * lendemain qui ne sont pas encore partis, une seule fois chacun.
 */
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && !egaux(requete.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const demain = ajouterJours(aujourdhui(), 1);
  const reservations = await depot.listerRappelsAEnvoyer(demain);

  let envoyes = 0;
  let echecs = 0;
  for (const reservation of reservations) {
    if (!(await depot.retenirRappel(reservation.id))) continue;

    const resultat = await envoyerRappel(reservation, await lienDeSuivi(reservation.reference)).catch(
      () => ({ envoye: false }),
    );
    if (resultat.envoye) {
      envoyes += 1;
    } else {
      // Rendu, pour qu'un nouvel appel de la tâche puisse réessayer.
      await depot.libererRappel(reservation.id);
      echecs += 1;
      console.error(`[rappels] ${reservation.reference} : envoi du rappel échoué.`);
    }
  }

  console.info(`[rappels] départs du ${demain} : ${envoyes} rappel(s) envoyé(s), ${echecs} échec(s).`);
  return NextResponse.json({ date: demain, envoyes, echecs });
}

/** Comparaison en temps constant, pour ne rien laisser deviner du secret. */
function egaux(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
