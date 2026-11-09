import { NextResponse } from "next/server";
import { z } from "zod";

import { sessionAdminValide } from "@/lib/admin";
import { depot, RETARD_MAX_MINUTES } from "@/lib/db";
import { auteurAdmin } from "@/lib/journal";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";

/**
 * Les minutes de retard au retour des vélos d'une offre de groupe, saisies
 * depuis la fiche de la réservation (cahier des charges, étape 9). Le
 * serveur calcule la pénalité avec les réglages du moment (tolérance, puis
 * un montant par minute pour tout le groupe), la range sur la réservation
 * et l'écrit au journal. Elle se paie en espèces au retour (décision du
 * responsable n° 9). Une nouvelle saisie corrige la précédente ; zéro
 * efface la pénalité.
 */
const schema = z.object({
  minutes: z
    .number({ invalid_type_error: "Nombre de minutes attendu." })
    .int("Minutes entières.")
    .min(0, "Zéro au moins.")
    .max(RETARD_MAX_MINUTES, "Douze heures au plus."),
  prenom: schemaPrenom,
});

const REFUS = {
  introuvable: { statut: 404, erreur: "Réservation introuvable." },
  offre: { statut: 422, erreur: "La pénalité de retard ne vaut que pour les offres de groupe." },
  statut: { statut: 422, erreur: "Cette réservation n'est pas payée, ou elle est annulée : aucun retard à noter." },
  reglages: {
    statut: 409,
    erreur:
      "Les réglages des offres ne se lisent plus : corrigez-les dans Réglages des produits, puis notez le retard.",
  },
} as const;

export async function POST(requete: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { reference } = await params;
  const analyse = schema.safeParse(await requete.json().catch(() => null), { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    const champs = champsEnErreur(analyse.error);
    return NextResponse.json({ erreur: Object.values(champs)[0] ?? "Demande invalide.", champs }, { status: 422 });
  }

  try {
    const resultat = await depot.enregistrerRetard(reference, analyse.data.minutes, auteurAdmin(analyse.data.prenom));
    if (!resultat.ok) {
      const refus = REFUS[resultat.raison];
      return NextResponse.json({ erreur: refus.erreur, code: resultat.raison }, { status: refus.statut });
    }
    return NextResponse.json({ ok: true, reference: resultat.reservation.reference, retard: resultat.reservation.retard });
  } catch (erreur) {
    console.error("[admin/retard] enregistrement impossible", erreur);
    return NextResponse.json(
      { erreur: "Le retard n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
