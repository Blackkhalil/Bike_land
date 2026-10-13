import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { sessionAdminValide } from "@/lib/admin";

/**
 * Autorise le navigateur de l'exploitant à déposer une photo ou une vidéo
 * de vélo dans Vercel Blob.
 *
 * Le fichier ne transite pas par ce serveur : le navigateur l'envoie
 * directement au stockage, avec un jeton que cette route délivre. C'est
 * ce qui permet d'envoyer une vidéo de plusieurs dizaines de mégaoctets,
 * qu'une fonction Vercel refuserait au-delà de 4,5 Mo.
 *
 * Le jeton n'est délivré qu'à une session d'administration ouverte, pour
 * un dossier `velos/`, des images ou des vidéos, et 100 Mo au plus.
 */
/** Le stockage est-il branché ? Le formulaire le dit avant tout dépôt. */
export async function GET() {
  if (!(await sessionAdminValide())) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 401 });
  }
  return NextResponse.json({ actif: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

export async function POST(requete: Request) {
  const corps = (await requete.json().catch(() => null)) as HandleUploadBody | null;
  if (!corps) return NextResponse.json({ erreur: "Demande illisible." }, { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        erreur:
          "Le stockage des photos n'est pas branché sur ce projet. Dans Vercel : Storage, ouvrez le stockage bikeland-photos, puis connectez-le au projet de l'administration.",
      },
      { status: 503 },
    );
  }

  try {
    const reponse = await handleUpload({
      body: corps,
      request: requete,
      onBeforeGenerateToken: async (chemin) => {
        if (!(await sessionAdminValide())) throw new Error("Accès refusé.");
        if (!chemin.startsWith("velos/")) throw new Error("Dossier non autorisé.");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(reponse);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Dépôt refusé.";
    return NextResponse.json({ erreur: message }, { status: message === "Accès refusé." ? 401 : 400 });
  }
}
