import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";

type Params = Promise<{ id: string }>;

/**
 * Active ou désactive un partenaire.
 *
 * C'est le geste normal quand un partenariat s'arrête : ses codes ne
 * sont plus proposés à la création, mais tout ce qu'il a apporté et tout
 * ce qu'on lui doit reste lisible.
 */
export async function PATCH(requete: Request, { params }: { params: Params }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const corps = (await requete.json().catch(() => ({}))) as { actif?: unknown };
  if (typeof corps.actif !== "boolean") {
    return NextResponse.json({ erreur: "Champ « actif » attendu." }, { status: 422 });
  }
  const { id } = await params;
  const partenaire = await depot.majPartenaire(id, { actif: corps.actif });
  if (!partenaire) {
    return NextResponse.json({ erreur: "Partenaire introuvable." }, { status: 404 });
  }
  return NextResponse.json({ partenaire });
}

/**
 * Supprime un partenaire et ses codes.
 *
 * Refusé dès qu'une commission lui est comptée, ou qu'un client attend
 * encore de payer avec l'un de ses codes : la suppression effacerait en
 * cascade ces utilisations, et donc ce qu'on lui doit. Le message dit
 * quoi faire à la place.
 */
export async function DELETE(_requete: Request, { params }: { params: Params }) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const { id } = await params;
  const resultat = await depot.supprimerPartenaire(id);

  if (resultat.raison === "commissions") {
    return NextResponse.json(
      {
        erreur:
          "Ce partenaire a déjà amené des clients qui ont payé : le supprimer effacerait les " +
          "commissions qui lui sont dues. Désactivez-le, il ne sera plus proposé, et son " +
          "historique reste lisible.",
        code: "COMMISSIONS",
      },
      { status: 409 },
    );
  }
  if (resultat.raison === "en-attente") {
    return NextResponse.json(
      {
        erreur:
          "Un client est en train de payer avec un code de ce partenaire. Réessayez dans une " +
          "demi-heure, une fois le paiement abouti ou le panier expiré, ou désactivez-le.",
        code: "EN_ATTENTE",
      },
      { status: 409 },
    );
  }
  if (!resultat.supprime) {
    return NextResponse.json({ erreur: "Partenaire introuvable." }, { status: 404 });
  }
  return NextResponse.json({ supprime: true, codes: resultat.codes ?? 0 });
}
