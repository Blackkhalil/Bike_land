import { NextResponse } from "next/server";

import { depot } from "@/lib/db";
import { envoyerAccuseContact, envoyerMessageContactAdmin } from "@/lib/email";
import { erreursParChamp, schemaContact } from "@/lib/validation";

/** Formulaire de contact (§2.1) : enregistrement, puis accusé de réception. */
export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const analyse = schemaContact.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const { siteWeb, ...message } = analyse.data;
  // Le champ piège n'est jamais visible : s'il est rempli, on répond 200
  // sans rien enregistrer, pour ne pas renseigner le robot.
  if (siteWeb) return NextResponse.json({ recu: true });

  await depot.enregistrerMessageContact(message);

  // Les deux envois sont tentés en parallèle et aucun ne peut faire
  // échouer la réponse : le message est déjà enregistré, et dire au
  // visiteur que son envoi a échoué l'amènerait à le renvoyer.
  await Promise.allSettled([
    envoyerMessageContactAdmin(message),
    envoyerAccuseContact(message.nom, message.email),
  ]);

  return NextResponse.json({ recu: true }, { status: 201 });
}
