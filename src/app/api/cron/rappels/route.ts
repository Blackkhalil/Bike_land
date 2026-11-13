import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ajouterJours, aujourdhui } from "@/lib/dates";
import { depot } from "@/lib/db";
import { envoyerRappel } from "@/lib/email";
import { lienDeSuivi } from "@/lib/lien-suivi";
import { effacerContactsPreuves, effacerFichiersPreuves } from "@/lib/offres-groupe/preuves";
import { stockagePreuves } from "@/lib/offres-groupe/stockage-preuves";
import { limiteEffacementDemandes } from "@/lib/reservations";

/** Quelques rappels par soir, envoyés l'un après l'autre par Gmail. */
export const maxDuration = 60;

/** Les demandes jamais payées effacées par soir, une transaction chacune : de quoi tenir dans la minute. */
const DEMANDES_PAR_PASSAGE = 100;

/**
 * Rappel de la veille, appelé chaque soir par la tâche planifiée de
 * Vercel (voir vercel.json : 17 h UTC, soit 18 h au Bénin).
 *
 * Il écrit à chaque client qui part le lendemain, paiement confirmé.
 * Chaque rappel est retenu en base avant d'être envoyé : appelée deux
 * fois, la tâche n'écrit pas deux fois au même client.
 *
 * Vercel envoie CRON_SECRET dans l'en-tête Authorization ; toute autre
 * requête est refusée. Sans CRON_SECRET, la tâche ne tourne pas du tout :
 * un serveur de développement branché sur la vraie base ne doit jamais
 * pouvoir écrire aux clients.
 *
 * C'est la seule tâche planifiée (forfait Vercel gratuit) : elle efface
 * aussi les captures envoyées pour la réduction des offres de groupe,
 * celles déjà décidées dont le fichier serait resté, et toutes celles
 * reçues il y a plus de 30 jours (lot 5b) ; le contact donné avec une
 * capture, 30 jours après un refus, ou quand la réservation qu'elle a
 * réduite est payée (celle-ci le garde), jamais tant qu'une capture validée
 * n'a pas servi ; et les
 * compteurs d'essais expirés. Ce ménage passe en premier, à part : une
 * panne des rappels ne l'empêche pas.
 *
 * Elle efface enfin, après les rappels, les demandes jamais payées
 * (décision 27) : la note technique qui retenait les vélos pendant le
 * paiement, avec ses tentatives de paiement et la fiche du client s'il n'a
 * rien d'autre, 48 heures après la fin du délai de paiement
 * (`DELAI_EFFACEMENT_DEMANDES_HEURES`). Rien de ce qui a été payé, remboursé
 * ou reçu n'est touché.
 */
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET absent : rappels désactivés." }, { status: 503 });
  }
  if (!egaux(requete.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  // Les captures de réduction d'abord, chacune à part : un échec ici ne
  // retient pas les rappels, et la tâche de demain reprendra ce qui reste.
  const maintenant = () => Date.now();
  let preuves: { effaces: number; echecs: number; expirees: number } | null = null;
  try {
    preuves = await effacerFichiersPreuves({ depot, stockage: stockagePreuves({ depot }), maintenant });
    if (preuves.effaces || preuves.echecs) {
      console.info(`[rappels] captures de réduction : ${preuves.effaces} effacée(s), ${preuves.echecs} échec(s).`);
    }
  } catch (erreur) {
    console.error("[rappels] effacement des captures de réduction impossible", erreur);
  }
  let contacts: number | null = null;
  try {
    contacts = await effacerContactsPreuves({ depot, maintenant });
  } catch (erreur) {
    console.error("[rappels] effacement du contact des captures impossible", erreur);
  }
  let compteurs: number | null = null;
  try {
    compteurs = await depot.purgerCompteursExpires();
  } catch (erreur) {
    console.error("[rappels] ménage des compteurs d'essais impossible", erreur);
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

  // Les demandes jamais payées en dernier, une fois les rappels partis : elles
  // ne pressent pas, et un premier passage pourrait en trouver beaucoup. Au
  // plus `DEMANDES_PAR_PASSAGE` par soir, la tâche du lendemain reprend le reste.
  // Une demande effacée ne retenait plus aucun vélo depuis longtemps : les
  // places du site ne changent pas, rien à rafraîchir.
  let demandes: { effacees: number; clients: number } | null = null;
  try {
    const effacement = await depot.purgerDemandesNonPayees(limiteEffacementDemandes(maintenant()), DEMANDES_PAR_PASSAGE);
    demandes = { effacees: effacement.references.length, clients: effacement.clients };
    if (demandes.effacees) {
      console.info(`[rappels] demandes jamais payées : ${demandes.effacees} effacée(s), ${demandes.clients} fiche(s) client.`);
    }
  } catch (erreur) {
    console.error("[rappels] effacement des demandes jamais payées impossible", erreur);
  }

  return NextResponse.json({ date: demain, envoyes, echecs, preuves, contacts, compteurs, demandes });
}

/** Comparaison en temps constant, pour ne rien laisser deviner du secret. */
function egaux(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
