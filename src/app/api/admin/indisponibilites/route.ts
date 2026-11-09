import { NextResponse } from "next/server";
import { z } from "zod";

import { heureAuBenin } from "@/data/offres";
import { sessionAdminValide } from "@/lib/admin";
import { ajouterJours, estDateISOValide } from "@/lib/dates";
import { depot } from "@/lib/db";
import { auteurAdmin } from "@/lib/journal";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";

/**
 * Les vélos indisponibles un jour précis, depuis la page du parc : en
 * réparation le samedi, prêté pour la journée. Le vélo sort du parc ce
 * jour-là seulement ; son statut ne change pas (cahier des charges des
 * offres de groupe, étape 1).
 *
 * Deux gestes : déclarer (vélo, jour, motif) et rendre le vélo au parc.
 * Chacun s'écrit au journal, signé du prénom saisi. Déclarer un vélo déjà
 * réservé et payé ce jour-là n'annule rien : la réponse liste ces
 * réservations, et le tableau de bord les affiche, pour que Bike Land
 * appelle les clients.
 */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ajouter"),
    veloId: z.string().min(1, "Choisissez un vélo.").max(80),
    date: z.string().refine(estDateISOValide, "Date attendue au format AAAA-MM-JJ."),
    motif: z.string().trim().max(120, "120 caractères au plus.").optional(),
    prenom: schemaPrenom,
  }),
  z.object({
    action: z.literal("retirer"),
    id: z.string().min(1).max(80),
    prenom: schemaPrenom,
  }),
]);

/** On ne déclare pas plus d'un an à l'avance : au-delà, ce n'est plus une réparation. */
const JOURS_A_L_AVANCE_MAX = 365;

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null), { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    const champs = champsEnErreur(analyse.error);
    return NextResponse.json(
      { erreur: Object.values(champs)[0] ?? "Demande invalide.", champs },
      { status: 422 },
    );
  }
  const demande = analyse.data;
  const auteur = auteurAdmin(demande.prenom);

  try {
    if (demande.action === "ajouter") {
      const aujourdhui = heureAuBenin().date;
      // Déclarer un jour passé ne changerait rien, et l'encombrerait.
      if (demande.date < aujourdhui) {
        return NextResponse.json({ erreur: "Ce jour est déjà passé.", champs: { date: "Ce jour est déjà passé." } }, { status: 422 });
      }
      if (demande.date > ajouterJours(aujourdhui, JOURS_A_L_AVANCE_MAX)) {
        return NextResponse.json(
          { erreur: "Un an à l'avance au plus.", champs: { date: "Un an à l'avance au plus." } },
          { status: 422 },
        );
      }
      const indisponibilite = await depot.ajouterIndisponibilite({
        veloId: demande.veloId,
        date: demande.date,
        motif: demande.motif || undefined,
        par: auteur,
      });
      if (!indisponibilite) {
        return NextResponse.json({ erreur: "Vélo introuvable." }, { status: 404 });
      }
      // Les réservations payées de ce vélo ce jour-là : à appeler.
      const touchees = (await depot.reservationsTouchees(demande.date)).filter(
        (r) => r.dateDebut <= demande.date && r.velos.some((v) => v.veloId === demande.veloId),
      );
      await rafraichirSitePublic();
      return NextResponse.json({ ok: true, indisponibilite, touchees });
    }

    const retire = await depot.retirerIndisponibilite(demande.id, auteur);
    if (!retire) {
      return NextResponse.json({ erreur: "Ce vélo n'était plus déclaré indisponible." }, { status: 404 });
    }
  } catch (erreur) {
    console.error("[admin/indisponibilites] enregistrement impossible", erreur);
    return NextResponse.json(
      { erreur: "L'enregistrement n'a pas pu se faire. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  await rafraichirSitePublic();
  return NextResponse.json({ ok: true });
}
