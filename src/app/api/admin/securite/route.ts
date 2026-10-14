import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { adresseApplication, chiffrer, dechiffrer, nouveauSecret } from "@/lib/double-authentification";
import {
  CLE_SECRET_ACTIF,
  CLE_SECRET_EN_ATTENTE,
  CODES_PAGE_SECURITE,
  etatDoubleAuthentification,
  verifierCode,
} from "@/lib/securite-admin";

/**
 * Activer ou désactiver la double authentification, depuis la page
 * Sécurité de l'admin.
 *
 *  - `preparer` : tire un nouveau secret, le garde en attente (chiffré)
 *    et renvoie le QR code à scanner. Rien ne change tant que le premier
 *    code n'est pas confirmé : un QR code mal scanné n'enferme personne
 *    dehors.
 *  - `activer` : le code saisi prouve que l'application est bien réglée ;
 *    le secret en attente devient le secret actif.
 *  - `desactiver` : exige un code valide, pour qu'une session restée
 *    ouverte sur un autre appareil ne suffise pas à retirer la protection.
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preparer") }),
  z.object({ action: z.literal("activer"), code: z.string().trim().min(6).max(8) }),
  z.object({ action: z.literal("desactiver"), code: z.string().trim().min(6).max(8) }),
]);

/**
 * Code refusé : faux, déjà servi, ou trop d'essais. Les essais de cette
 * page ont leur propre compteur (`CODES_PAGE_SECURITE`) : les épuiser ne
 * bloque pas la connexion.
 */
function refusDuCode(verdict: "refuse" | "bloque", activation: boolean) {
  if (verdict === "bloque") {
    return NextResponse.json(
      { erreur: "Trop de codes incorrects. Réessayez dans un quart d'heure." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  return NextResponse.json(
    {
      erreur: activation
        ? "Code incorrect ou déjà utilisé. Vérifiez que le téléphone est à l'heure, puis attendez le code suivant."
        : "Code incorrect ou déjà utilisé. Attendez le code suivant.",
    },
    { status: 422 },
  );
}

export async function GET() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const etat = await etatDoubleAuthentification();
  return NextResponse.json({ active: etat.etat === "active" });
}

export async function POST(requete: Request) {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  const analyse = schema.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) return NextResponse.json({ erreur: "Demande incomplète." }, { status: 422 });
  const demande = analyse.data;

  try {
    if (demande.action === "preparer" || demande.action === "activer") {
      // Déjà active, elle ne se remplace pas : il faut d'abord la
      // désactiver, ce qui exige un code de l'application actuelle. Sans
      // ce verrou, un cookie de session volé suffirait à y substituer un
      // secret choisi par le voleur.
      const actuelle = await etatDoubleAuthentification();
      if (actuelle.etat !== "inactive") {
        return NextResponse.json(
          { erreur: "La double authentification est déjà active : désactivez-la d'abord avec un code de l'application." },
          { status: 409 },
        );
      }
    }

    if (demande.action === "preparer") {
      const secret = nouveauSecret();
      await depot.ecrireParametreAdmin(CLE_SECRET_EN_ATTENTE, chiffrer(secret));
      const compte = process.env.ADMIN_EMAIL || "exploitant";
      const qr = await QRCode.toDataURL(adresseApplication(secret, compte), { margin: 1, width: 240 });
      return NextResponse.json({ qr, secret });
    }

    if (demande.action === "activer") {
      const enAttente = await depot.lireParametreAdmin(CLE_SECRET_EN_ATTENTE);
      const secret = enAttente ? dechiffrer(enAttente) : null;
      if (!enAttente || !secret) {
        return NextResponse.json({ erreur: "Recommencez : affichez un nouveau QR code." }, { status: 409 });
      }
      const verdict = await verifierCode(secret, demande.code, CODES_PAGE_SECURITE);
      if (verdict !== "accepte") return refusDuCode(verdict, true);
      await depot.ecrireParametreAdmin(CLE_SECRET_ACTIF, enAttente);
      await depot.effacerParametreAdmin(CLE_SECRET_EN_ATTENTE);
      return NextResponse.json({ active: true });
    }

    const etat = await etatDoubleAuthentification();
    if (etat.etat === "indeterminee") {
      return NextResponse.json(
        { erreur: "L'état de la double authentification ne peut pas être lu. Réessayez dans un instant." },
        { status: 503 },
      );
    }
    if (etat.etat !== "active") return NextResponse.json({ active: false });
    const verdict = await verifierCode(etat.secret, demande.code, CODES_PAGE_SECURITE);
    if (verdict !== "accepte") return refusDuCode(verdict, false);
    await depot.effacerParametreAdmin(CLE_SECRET_ACTIF);
    return NextResponse.json({ active: false });
  } catch (erreur) {
    console.error("[securite] réglage impossible", erreur);
    return NextResponse.json(
      { erreur: "Le réglage n'a pas pu être enregistré. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
