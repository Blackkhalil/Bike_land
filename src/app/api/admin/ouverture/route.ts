import { NextResponse } from "next/server";
import { z } from "zod";

import { codeOctobreRose, OCTOBRE_ROSE } from "@/data/octobre-rose";
import { CRENEAUX_ROAD_TRIP, heureAuBenin } from "@/data/offres";
import { CODE_PADEL_BIKE } from "@/data/padel-bike";
import { CODE_INTERRUPTEUR_OFFRES } from "@/data/reglages-offres";
import { sessionAdminValide } from "@/lib/admin";
import { estDateISOValide } from "@/lib/dates";
import { depot } from "@/lib/db";
import { auteurAdmin } from "@/lib/journal";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { schemaPrenom } from "@/lib/saisie-admin";

/**
 * Ouvrir ou fermer la réservation, depuis le tableau de bord.
 *
 * Trois gestes : ouvrir ou fermer un créneau de road trip pour toutes les
 * semaines (ou l'inscription en ligne à une sortie Octobre rose, chacune
 * sous son propre code, daté, ou la réservation en ligne de Padel bike, ou
 * l'interrupteur des offres de groupe, écrit au journal), fermer un jour
 * précis quand il est complet, et le rouvrir.
 *
 * Les fiches des vélos sont mises en cache. Après chaque changement, on
 * demande à Next de les reconstruire à la prochaine visite : sans cela,
 * un départ fermé resterait proposé jusqu'à une minute de plus.
 */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("creneau"),
    // Chaque sortie Octobre rose se règle sous son propre code : fermer un
    // jour laisse les autres ouverts. Un départ sur commande (Gbashi bike)
    // ne se règle pas : il ne se réserve jamais en ligne. Padel bike se
    // règle sous son propre code.
    code: z.enum([
      CODE_PADEL_BIKE,
      // L'interrupteur des trois offres de groupe, désactivé par défaut.
      CODE_INTERRUPTEUR_OFFRES,
      ...CRENEAUX_ROAD_TRIP.filter((c) => c.enLigne).map((c) => c.code),
      ...OCTOBRE_ROSE.sorties.map((sortie) => codeOctobreRose(sortie)),
    ]),
    actif: z.boolean(),
    // Le prénom retenu sur ce téléphone, s'il y en a un : il signe la ligne
    // du journal de l'interrupteur. Facultatif, ignoré s'il ne se lit pas.
    prenom: z.string().max(80).optional(),
  }),
  z.object({
    action: z.literal("fermer"),
    date: z.string().refine(estDateISOValide, "Date attendue au format AAAA-MM-JJ."),
    formule: z.enum(["road-trip", "location-libre", "toutes"]),
    motif: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("rouvrir"),
    id: z.string().min(1).max(60),
  }),
]);

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) {
    return NextResponse.json(
      { erreur: analyse.error.errors[0]?.message ?? "Demande invalide." },
      { status: 422 },
    );
  }
  const demande = analyse.data;

  try {
    if (demande.action === "creneau") {
      await depot.reglerCreneau(demande.code, demande.actif);
      // Montrer ou cacher les offres de groupe aux clients se trace au journal.
      if (demande.code === CODE_INTERRUPTEUR_OFFRES) {
        const prenom = schemaPrenom.safeParse(demande.prenom);
        await depot
          .journaliser({
            type: "interrupteur-offres",
            details: { actif: demande.actif },
            auteur: auteurAdmin(prenom.success ? prenom.data : undefined),
          })
          .catch((erreur) => console.error("[ouverture] interrupteur réglé, journal non écrit", erreur));
      }
    } else if (demande.action === "fermer") {
      // Fermer un jour passé n'aurait aucun effet, et l'encombrerait.
      if (demande.date < heureAuBenin().date) {
        return NextResponse.json({ erreur: "Ce jour est déjà passé." }, { status: 422 });
      }
      await depot.fermerJour({
        date: demande.date,
        formule: demande.formule,
        motif: demande.motif || undefined,
      });
    } else {
      const rouvert = await depot.rouvrirJour(demande.id);
      if (!rouvert) {
        return NextResponse.json({ erreur: "Ce jour n'était plus fermé." }, { status: 404 });
      }
    }
  } catch (erreur) {
    console.error("[ouverture] réglage impossible", erreur);
    return NextResponse.json(
      { erreur: "Le réglage n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  await rafraichirSitePublic();
  return NextResponse.json({ ok: true });
}
