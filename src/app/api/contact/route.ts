import { NextResponse } from "next/server";

import { identifiantAppelant } from "@/lib/anti-force-brute";
import { depot } from "@/lib/db";
import { envoyerAccuseContact, envoyerAlertePlafondContact, envoyerMessageContactAdmin } from "@/lib/email";
import { erreursParChamp, schemaContact } from "@/lib/validation";

/** Formulaire de contact (§2.1) : enregistrement, puis accusé de réception. */
export async function POST(requete: Request) {
  // Seul le formulaire du site écrit ici : il envoie du JSON, depuis la même
  // origine. Une page d'un autre site ne peut envoyer du JSON qu'après une
  // pré-vérification que cette route n'accorde pas : exiger ce type lui
  // ferme la porte, et chacun de ses visiteurs ne lui apporte plus cinq
  // envois par heure. Sec-Fetch-Site le dit en clair aux navigateurs
  // récents ; son absence (anciens navigateurs, outils) n'est pas un refus.
  const type = (requete.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    return NextResponse.json({ erreur: "Format non pris en charge." }, { status: 415 });
  }
  if (requete.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ erreur: "Origine refusée." }, { status: 403 });
  }

  const corps = await requete.json().catch(() => null);
  const analyse = schemaContact.safeParse(corps);

  if (!analyse.success) {
    return NextResponse.json(
      { erreur: "Formulaire incomplet.", champs: erreursParChamp(analyse.error) },
      { status: 422 },
    );
  }

  const { siteWeb, ...message } = analyse.data;
  // Le champ piège n'est jamais visible : s'il est rempli, on répond comme
  // à un vrai envoi, sans rien enregistrer, pour ne rien apprendre au robot.
  if (siteWeb) return NextResponse.json({ recu: true, accuse: true }, { status: 201 });

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
  } catch (erreur) {
    console.error("[contact] compteur par appelant injoignable", erreur);
    parAppelant = 0;
  }
  if (parAppelant > 5) {
    return NextResponse.json(
      { erreur: "Vous avez déjà envoyé plusieurs messages. Réessayez dans une heure, ou appelez-nous." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  await depot.enregistrerMessageContact(message);

  // Le premier dépassement du jour se dit : dans le journal, et pour les
  // notifications par un seul email à l'équipe. Sans cela, les messages
  // suivants arrivaient dans l'admin sans que personne en soit averti.
  const sous = async (cle: string, plafond: number) => {
    try {
      const nombre = await depot.compterEssai(cle, 24 * 60 * 60);
      if (nombre === plafond + 1) {
        console.warn(`[contact] plafond du jour atteint (${cle}) : les messages suivants sont dans l'admin, sans email.`);
      }
      return { permis: nombre <= plafond, premierDepassement: nombre === plafond + 1 };
    } catch (erreur) {
      console.error("[contact] compteur du jour injoignable", erreur);
      return { permis: false, premierDepassement: false };
    }
  };
  const [notifier, accuser] = await Promise.all([
    sous(`contact-notifications:${jour}`, 100),
    sous(`contact-accuses:${jour}`, 50),
  ]);

  // Les envois sont tentés en parallèle et aucun ne peut faire échouer la
  // réponse : le message est déjà enregistré, et dire au visiteur que son
  // envoi a échoué l'amènerait à le renvoyer. Au-delà des plafonds, le
  // message reste lisible dans l'admin.
  const [, envoiAccuse] = await Promise.allSettled([
    notifier.permis
      ? envoyerMessageContactAdmin(message)
      : notifier.premierDepassement
        ? envoyerAlertePlafondContact()
        : Promise.resolve(),
    accuser.permis ? envoyerAccuseContact(message.email) : Promise.resolve({ envoye: false }),
  ]);

  // Le formulaire n'annonce un accusé de réception que s'il est vraiment parti.
  const accuse = envoiAccuse.status === "fulfilled" && envoiAccuse.value.envoye;
  return NextResponse.json({ recu: true, accuse }, { status: 201 });
}
