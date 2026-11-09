import { NextResponse } from "next/server";
import { z } from "zod";

import { schemaReglagesOffres } from "@/data/reglages-offres";
import { sessionAdminValide } from "@/lib/admin";
import { auteurAdmin } from "@/lib/journal";
import { rafraichirSitePublic } from "@/lib/rafraichir";
import { enregistrerReglagesOffres } from "@/lib/reglages-offres";
import { champsEnErreur, erreursEnFrancais, schemaPrenom } from "@/lib/saisie-admin";

/**
 * Enregistrer les réglages des offres de groupe, depuis la rubrique
 * « Réglages des offres » : les prix, les frais, les horaires, les
 * minimums, ce qui est offert (cocos, eau), le délai minimum et la date
 * limite de la réservation en ligne, la règle de retard.
 *
 * Tout le jeu de réglages arrive d'un coup et passe le schéma du contrat
 * (`schemaReglagesOffres`) avant d'être rangé : un prix ou une heure
 * impossible n'atteint jamais le calcul. Le prénom de qui enregistre signe
 * la ligne du journal, qui garde ce qui a changé. Le site public se
 * régénère ensuite. Les réservations déjà payées gardent leur prix.
 */
const schema = z.object({
  reglages: schemaReglagesOffres,
  prenom: schemaPrenom,
});

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null), { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    return NextResponse.json(
      {
        erreur: "Certains réglages ne conviennent pas : voyez les cases signalées.",
        champs: champsEnErreur(analyse.error, "reglages"),
      },
      { status: 422 },
    );
  }

  let changements: number;
  try {
    const resultat = await enregistrerReglagesOffres(analyse.data.reglages, auteurAdmin(analyse.data.prenom));
    changements = resultat.changements.length;
  } catch (erreur) {
    console.error("[admin/reglages-offres] enregistrement impossible", erreur);
    return NextResponse.json(
      { erreur: "Les réglages n'ont pas pu être enregistrés. Réessayez dans un instant." },
      { status: 500 },
    );
  }

  await rafraichirSitePublic();
  return NextResponse.json({ ok: true, reglages: analyse.data.reglages, changements });
}
