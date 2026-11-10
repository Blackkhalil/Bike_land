import { NextResponse } from "next/server";
import { z } from "zod";

import { CHAMPS_REGLAGES_OFFRES } from "@/data/libelles-reglages-offres";
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

/** Une fraction en pour cent, à la française : 0,5 → « 50 », 0,035 → « 3,5 ». */
function pourCent(fraction: number): string {
  return String(Math.round(fraction * 10_000) / 100).replace(".", ",");
}

/**
 * Les cases en pourcentage se tapent en pour cent (60) et partent en
 * fraction (0,6) : la borne du schéma est une fraction. Le message la redit
 * en pour cent, comme la case : « 50 % au plus. », jamais « 1 au plus. ».
 */
function bornesEnPourCent(erreur: z.ZodError, champs: Record<string, string>): Record<string, string> {
  for (const probleme of erreur.errors) {
    if (probleme.path[0] !== "reglages") continue;
    const chemin = probleme.path.slice(1).join(".");
    if (CHAMPS_REGLAGES_OFFRES.get(chemin)?.unite !== "%") continue;
    if (probleme.code === z.ZodIssueCode.too_big && probleme.type === "number") {
      champs[chemin] = `${pourCent(Number(probleme.maximum))} % au plus.`;
    } else if (probleme.code === z.ZodIssueCode.too_small && probleme.type === "number") {
      champs[chemin] = `${pourCent(Number(probleme.minimum))} % au moins.`;
    }
  }
  return champs;
}

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const analyse = schema.safeParse(await requete.json().catch(() => null), { errorMap: erreursEnFrancais });
  if (!analyse.success) {
    return NextResponse.json(
      {
        erreur: "Certains réglages ne conviennent pas : voyez les cases signalées.",
        champs: bornesEnPourCent(analyse.error, champsEnErreur(analyse.error, "reglages")),
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
