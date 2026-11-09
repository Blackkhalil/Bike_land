import { NextResponse } from "next/server";
import { z } from "zod";

import { heureAuBenin } from "@/data/offres";
import { schemaReglagesPadel } from "@/data/reglages";
import { sessionAdminValide } from "@/lib/admin";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { enregistrerReglages } from "@/lib/reglages";

/**
 * Enregistrer les réglages d'un produit, depuis la page Réglages des
 * produits : l'heure, les jours, le prix, le nombre de personnes, la date
 * d'ouverture, le délai de réservation.
 *
 * Le réglage est validé ici, champ par champ, avant d'être rangé : un prix
 * ou une heure impossible ne doit jamais atteindre le site. Ensuite, le site
 * public se régénère, pour que le nouveau réglage s'y voie tout de suite.
 * Les réservations déjà prises gardent l'horaire et le prix payés.
 */
const schema = z.discriminatedUnion("produit", [
  z.object({ produit: z.literal("padel"), reglages: schemaReglagesPadel }),
]);

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) {
    const champs: Record<string, string> = {};
    for (const probleme of analyse.error.errors) {
      const champ = probleme.path.slice(1).join(".") || "general";
      champs[champ] ??= probleme.message;
    }
    return NextResponse.json(
      { erreur: "Certains réglages ne conviennent pas : voyez les champs signalés.", champs },
      { status: 422 },
    );
  }

  // Les dates programmées déjà passées ne servent plus : on ne les garde pas.
  const aujourdhui = heureAuBenin().date;
  const reglages = { ...analyse.data.reglages, dates: analyse.data.reglages.dates.filter((date) => date >= aujourdhui) };

  try {
    await enregistrerReglages(analyse.data.produit, reglages);
  } catch (erreur) {
    console.error("[admin/reglages] enregistrement impossible", erreur);
    return NextResponse.json(
      { erreur: "Le réglage n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  await rafraichirSitePublic();
  return NextResponse.json({ ok: true, reglages });
}
