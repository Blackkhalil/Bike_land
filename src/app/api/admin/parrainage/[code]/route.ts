import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";

type Params = Promise<{ code: string }>;

/**
 * Active ou désactive un code de parrainage.
 *
 * Désactiver plutôt que supprimer est le geste normal : le code cesse
 * immédiatement de valoir, et tout ce qu'il a apporté reste comptabilisé
 * au partenaire.
 */
export async function PATCH(requete: Request, { params }: { params: Params }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { code } = await params;
  const corps = (await requete.json().catch(() => ({}))) as { actif?: unknown };

  if (typeof corps.actif !== "boolean") {
    return NextResponse.json(
      { erreur: "Champ « actif » attendu, vrai ou faux." },
      { status: 422 },
    );
  }

  const resultat = await depot.majCodeParrainage(decodeURIComponent(code), { actif: corps.actif });
  if (!resultat) {
    return NextResponse.json({ erreur: "Code introuvable." }, { status: 404 });
  }

  return NextResponse.json({ code: resultat.code, actif: resultat.actif });
}

/**
 * Supprime définitivement un code.
 *
 * Refusé dès qu'il a servi. Effacer un code utilisé effacerait en cascade
 * ses utilisations, et donc la seule trace de ce que le partenaire a
 * apporté, la statistique qui justifie toute la fonctionnalité. Un code
 * qu'on ne veut plus voir servir se désactive.
 */
export async function DELETE(_requete: Request, { params }: { params: Params }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }

  const { code } = await params;
  const resultat = await depot.supprimerCodeParrainage(decodeURIComponent(code));

  if (resultat.raison === "deja-utilise") {
    return NextResponse.json(
      {
        erreur:
          "Ce code a déjà servi : le supprimer effacerait les utilisations comptées à son " +
          "partenaire. Désactivez-le, il cessera de valoir immédiatement.",
        code: "DEJA_UTILISE",
      },
      { status: 409 },
    );
  }

  if (!resultat.supprime) {
    return NextResponse.json({ erreur: "Code introuvable." }, { status: 404 });
  }

  return NextResponse.json({ supprime: true });
}
