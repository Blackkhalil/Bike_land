import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sessionAdminValide } from "@/lib/admin";
import { depot } from "@/lib/db";
import { adresseApplication, chiffrer, codeValide, dechiffrer, nouveauSecret } from "@/lib/double-authentification";
import { CLE_SECRET_ACTIF, CLE_SECRET_EN_ATTENTE, etatDoubleAuthentification } from "@/lib/securite-admin";

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
      if (!codeValide(secret, demande.code)) {
        return NextResponse.json(
          { erreur: "Code incorrect. Vérifiez que l'heure du téléphone est à l'heure, puis réessayez." },
          { status: 422 },
        );
      }
      await depot.ecrireParametreAdmin(CLE_SECRET_ACTIF, enAttente);
      await depot.effacerParametreAdmin(CLE_SECRET_EN_ATTENTE);
      return NextResponse.json({ active: true });
    }

    const etat = await etatDoubleAuthentification();
    if (etat.etat !== "active") return NextResponse.json({ active: false });
    if (!codeValide(etat.secret, demande.code)) {
      return NextResponse.json({ erreur: "Code incorrect." }, { status: 422 });
    }
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
