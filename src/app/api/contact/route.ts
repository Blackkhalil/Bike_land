import { NextResponse } from "next/server";

import { identifiantAppelant } from "@/lib/anti-force-brute";
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

  // Le formulaire fait partir des emails de la boîte Gmail de Bike Land,
  // vers l'adresse saisie : sans limite, n'importe qui l'utiliserait pour
  // écrire à n'importe qui, jusqu'à épuiser le quota quotidien de Gmail,
  // et les confirmations de réservation et les rappels ne partiraient
  // plus. D'où trois plafonds, comptés en base pour tous les serveurs :
  // cinq messages par heure et par appelant, et par jour, au plus
  // cinquante accusés de réception et cent notifications à l'équipe.
  const jour = new Date().toISOString().slice(0, 10);
  let parAppelant: number;
  try {
    parAppelant = await depot.compterEssai(`contact:${identifiantAppelant(requete)}`, 60 * 60);
  } catch {
    parAppelant = 0;
  }
  if (parAppelant > 5) {
    return NextResponse.json(
      { erreur: "Vous avez déjà envoyé plusieurs messages. Réessayez dans une heure, ou appelez-nous." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  await depot.enregistrerMessageContact(message);

  const sous = async (cle: string, plafond: number) => {
    try {
      return (await depot.compterEssai(cle, 24 * 60 * 60)) <= plafond;
    } catch {
      return false;
    }
  };
  const [notifier, accuser] = await Promise.all([sous(`contact-notifications:${jour}`, 100), sous(`contact-accuses:${jour}`, 50)]);

  // Les envois sont tentés en parallèle et aucun ne peut faire échouer la
  // réponse : le message est déjà enregistré, et dire au visiteur que son
  // envoi a échoué l'amènerait à le renvoyer. Au-delà des plafonds, le
  // message reste lisible dans l'admin.
  await Promise.allSettled([
    notifier ? envoyerMessageContactAdmin(message) : Promise.resolve(),
    accuser ? envoyerAccuseContact(message.nom, message.email) : Promise.resolve(),
  ]);

  return NextResponse.json({ recu: true }, { status: 201 });
}
