/**
 * Les textes du chatbot des offres de groupe (décisions 22 et 23) : les
 * questions, les réponses du client telles qu'elles s'affichent dans la
 * discussion, et les petites mises en forme (jours, heures, durées).
 *
 * Aucun montant n'est calculé ici. Les montants cités viennent tels quels
 * du moteur (src/lib/offres) ou des réglages des offres : le chatbot n'en
 * invente jamais un. Ton chaleureux et simple, phrases courtes, aucun tiret
 * long.
 */

import type { ReglagesOffres } from "@/data/reglages-offres";
import { comptesBikeLand } from "@/lib/agent-ia/comptes";
import type { DateISO } from "@/lib/dates";
import {
  formatMontant,
  formatPourcentage,
  heureEnClair,
  NOMS_GAMMES,
  ORDRE_GAMMES,
  type Coco,
  type CodeOffreGroupe,
  type GammeVelo,
  type HeureMinute,
} from "@/lib/offres";
import { dureeEnClair, joursEnClair, NOMS_JOURS } from "@/lib/offres/calendrier";

import { CODES_OFFRES_GROUPE, estCodeOffreGroupe } from "./ouverture-chat";

export { dureeEnClair, heureEnClair };

/** Le nom des trois offres, comme le client les lit. */
export const NOMS_OFFRES: Record<CodeOffreGroupe, string> = {
  "bike-for-all": "Bike for All",
  "road-trip-groupe": "Road trip en groupe",
  "gbashi-groupe": "Gbashi Bike",
};

/** L'ordre des offres dans la discussion. */
export const ORDRE_OFFRES: readonly CodeOffreGroupe[] = CODES_OFFRES_GROUPE;

export { estCodeOffreGroupe };

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const FORMAT_JOUR_COURT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Le liant invisible (U+2060, « word joiner ») : aucune coupure de ligne à cet endroit. */
const LIANT = String.fromCharCode(0x2060);
/** L'espace insécable (U+00A0) : les deux mots qu'elle sépare restent sur la même ligne. */
const INSECABLE = String.fromCharCode(0xa0);

/**
 * La typographie française à l'affichage : une espace insécable avant « ? »,
 * « ! », « : », « ; » et « » », et après « « ». Sur un téléphone étroit, le
 * point d'interrogation ne part plus seul à la ligne. Un nombre reste collé
 * au mot qui le suit (« 10 personnes », « 25 km », « 14 novembre »), et une
 * référence de réservation (« BL-T2K9QX ») ne se coupe pas à son tiret.
 */
export function insecables(texte: string): string {
  return (
    texte
      .replace(/(\d) (?=[a-zàâäçéèêëîïôöûùüÿœ])/g, `$1${INSECABLE}`)
      .replace(/ ([?!:;»])/g, " $1")
      .replace(/« /g, "« ")
      .replace(/\b([A-Z]{2})-(?=[A-Z0-9]{4,}\b)/g, `$1-${LIANT}`)
  );
}

/** Un numéro de téléphone ou un nom court (« MTN MoMo ») qui ne se coupe jamais en fin de ligne. */
export function sansCoupure(texte: string): string {
  return texte.trim().replace(/ /g, INSECABLE);
}

/** « Samedi », « samedi » : la première lettre en capitale. */
export function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « samedi 14 novembre ». */
export function jourEnClair(date: DateISO): string {
  return FORMAT_JOUR.format(new Date(`${date}T12:00:00.000Z`));
}

/** « sam. 14 nov. », pour une puce. */
export function jourCourt(date: DateISO): string {
  return FORMAT_JOUR_COURT.format(new Date(`${date}T12:00:00.000Z`));
}

/** « 1 personne », « 12 personnes », le nombre jamais séparé de son mot (espace insécable). */
export function personnesEnClair(nombre: number): string {
  return `${nombre}${INSECABLE}personne${nombre > 1 ? "s" : ""}`;
}

/** « petit coco », « grand coco », « sans coco ». */
export function cocoEnClair(coco: Coco): string {
  if (coco === "aucun") return "sans coco";
  return `${coco} coco`;
}

/** « Sans gâteau », « 1 gâteau par personne », « 2 gâteaux par personne ». */
export function gateauxEnClair(parPersonne: number): string {
  if (parPersonne <= 0) return "Sans gâteau";
  return `${parPersonne} gâteau${parPersonne > 1 ? "x" : ""} par personne`;
}

/** « 4 Classique et 2 Premium » : la répartition des vélos de Gbashi Bike. */
export function velosEnClair(velos: Partial<Record<GammeVelo, number>>): string {
  const morceaux = ORDRE_GAMMES.filter((gamme) => (velos[gamme] ?? 0) > 0).map(
    (gamme) => `${velos[gamme]} ${NOMS_GAMMES[gamme]}`,
  );
  if (morceaux.length <= 1) return morceaux.join("");
  return `${morceaux.slice(0, -1).join(", ")} et ${morceaux[morceaux.length - 1]}`;
}

/** « 9 h 15 », pour un départ. */
export function departEnClair(depart: HeureMinute): string {
  return heureEnClair(depart);
}

/* ------------------------------------------------------------ Les offres */

/**
 * La ligne de présentation de chaque offre, tirée des cartes du cahier des
 * charges (étape 2), avec les chiffres des réglages en vigueur.
 */
export function ligneDeLOffre(offre: CodeOffreGroupe, reglages: ReglagesOffres): string {
  const limite = reglages.dateLimiteWeekend;
  if (offre === "bike-for-all") {
    const bfa = reglages.bikeForAll;
    return (
      `Vous donnez votre budget, nous calculons votre temps de vélo. Tous les jours, ` +
      `${bfa.personnesMin} personnes minimum, dès ${formatMontant(bfa.budgetMinXof)} pour le groupe.`
    );
  }
  if (offre === "road-trip-groupe") {
    const rt = reglages.roadTrip;
    return (
      `Balade de ${rt.distanceKm} km, ${joursEnClair(rt.jours)} de ${heureEnClair(rt.depart)} à ${heureEnClair(rt.retour)}, ` +
      `${formatMontant(rt.prixPersonneXof)} par personne plus ${formatMontant(reglages.paiement.fraisParPersonneXof)} de frais de paiement, ` +
      `${rt.personnesMin} personnes minimum.`
    );
  }
  const gb = reglages.gbashi;
  return (
    `Vélo et séance de muscu en bord de mer avec nos coachs, ${joursEnClair(gb.jours)} de ${heureEnClair(gb.depart)} à ` +
    `${heureEnClair(gb.retour)}. Uniquement sur réservation : minimum ${gb.personnesMin} personnes, réservation au plus ` +
    `tard le ${NOMS_JOURS[limite.jour]} à ${heureEnClair(limite.heure)}.`
  );
}

/* ------------------------------------------------------------ Les questions */

export const MESSAGE_ACCUEIL =
  "Bonjour ! Je calcule le prix de votre sortie en groupe et je la réserve avec vous, en quelques questions. Quelle sortie vous tente ?";

/** L'accueil quand la discussion s'ouvre sans offre choisie : la liste des trois sorties suit. */
export const MESSAGE_ACCUEIL_OFFRES =
  "Bonjour ! Je calcule le prix de votre sortie en groupe et je la réserve avec vous, en quelques questions. Voici nos trois sorties :";

/** Après « Recommencer » : la liste des trois sorties suit. */
export const MESSAGE_RECOMMENCER = "On recommence ! Voici nos trois sorties :";

/** La question qui suit la liste des trois sorties. */
export const QUESTION_OFFRE = "Laquelle vous tente ?";

/** Ce que le chatbot dit de l'offre choisie, avant la première question. */
export function presentationOffre(offre: CodeOffreGroupe, reglages: ReglagesOffres): string {
  if (offre === "bike-for-all") {
    return "Bike for All : toute notre gamme de vélos et nos casques, au prix de votre budget.";
  }
  if (offre === "road-trip-groupe") {
    const rt = reglages.roadTrip;
    return `Le road trip en groupe : ${rt.distanceKm} km de balade, de ${heureEnClair(rt.depart)} à ${heureEnClair(rt.retour)}.`;
  }
  return "Gbashi Bike : du vélo jusqu'au bord de mer, puis une séance de muscu avec nos coachs.";
}

/** Le minimum de personnes de chaque offre, d'après les réglages. */
export function personnesMinDe(offre: CodeOffreGroupe, reglages: ReglagesOffres): number {
  if (offre === "bike-for-all") return reglages.bikeForAll.personnesMin;
  if (offre === "road-trip-groupe") return reglages.roadTrip.personnesMin;
  return reglages.gbashi.personnesMin;
}

export function questionPersonnes(offre: CodeOffreGroupe, reglages: ReglagesOffres, maximum: number): string {
  const minimum = personnesMinDe(offre, reglages);
  if (maximum < minimum) {
    return `Il nous faut ${minimum} vélos libres pour un groupe, et nous n'en avons pas assez en ce moment. Écrivez-nous sur WhatsApp : nous trouvons une solution avec vous.`;
  }
  return `Vous serez combien ? Un vélo par personne, ${minimum} personnes au moins.`;
}

/** Un groupe plus petit que le minimum de l'offre, tapé par le client. */
export function correctionPersonnesMin(offre: CodeOffreGroupe, minimum: number): string {
  return `Il faut au moins ${minimum} personnes pour ${NOMS_OFFRES[offre]}, un vélo par personne. Vous serez combien ?`;
}

/** Un groupe plus grand que les vélos en état, tapé par le client. */
export function correctionPersonnesMax(maximum: number): string {
  return `Nous avons ${maximum} vélos en état en ce moment, donc ${maximum} personnes au plus. Pour un groupe plus grand, écrivez-nous sur WhatsApp. Vous serez combien ?`;
}

export function questionDate(offre: CodeOffreGroupe, reglages: ReglagesOffres): string {
  const limite = reglages.dateLimiteWeekend;
  const weekend = `Pour le week-end, on réserve au plus tard le ${NOMS_JOURS[limite.jour]} à ${heureEnClair(limite.heure)}.`;
  if (offre === "bike-for-all") return `Quel jour ? ${weekend}`;
  if (offre === "road-trip-groupe") {
    const rt = reglages.roadTrip;
    return `Quel jour ? Le road trip part ${joursEnClair(rt.jours)} à ${heureEnClair(rt.depart)}. ${weekend}`;
  }
  const gb = reglages.gbashi;
  return `Quel jour ? Gbashi Bike part ${joursEnClair(gb.jours)} à ${heureEnClair(gb.depart)}. ${weekend}`;
}

export function questionHeure(reglages: ReglagesOffres): string {
  const bfa = reglages.bikeForAll;
  return `À quelle heure partez-vous ? Départs de ${heureEnClair(bfa.premierDepart)} à ${heureEnClair(bfa.dernierDepart)}, retour des vélos à ${heureEnClair(bfa.retourAuPlusTard)} au plus tard.`;
}

export const QUESTION_MODE =
  "Vous avez un budget en tête ? Donnez-le-moi et je calcule votre temps de vélo. Sinon, choisissez la durée et je vous donne le prix.";

export function questionBudget(personnes: number, minimumXof: number): string {
  return `Quel budget pour tout le groupe ? Pour ${personnesEnClair(personnes)}, il commence à ${formatMontant(minimumXof)}.`;
}

export const QUESTION_DUREE = "Combien de temps voulez-vous rouler ?";

export function questionCoco(reglages: ReglagesOffres): string {
  const { cocoPetitXof, cocoGrandXof } = reglages.consommables;
  return `Un coco pour chacun ? Le petit est à ${formatMontant(cocoPetitXof)}, le grand à ${formatMontant(cocoGrandXof)}, par personne.`;
}

export function questionGateaux(reglages: ReglagesOffres): string {
  return `Des gâteaux pour le groupe ? ${formatMontant(reglages.consommables.gateauPrixXof)} le gâteau.`;
}

export function questionAccompagnateur(prixXof: number): string {
  return `Un accompagnateur Bike Land pour vous montrer le circuit et rouler avec vous ? Pour votre groupe, c'est ${formatMontant(prixXof)}.`;
}

/** La question de la réduction, mot pour mot celle du cahier des charges (étape 6). */
export function questionReduction(reglages: ReglagesOffres): string {
  return `Voulez-vous une réduction de ${formatPourcentage(reglages.roadTrip.reduction)} ? Abonnez-vous à nos réseaux ou recommandez-nous en story.`;
}

/**
 * Les preuves acceptées pour la réduction, d'après les comptes de Bike Land
 * (src/lib/agent-ia/comptes.ts) : un profil abonné, sur Instagram ou sur
 * TikTok, ou une story Instagram qui identifie le compte. Une seule suffit.
 */
export function preuvesAcceptees(): string[] {
  const comptes = comptesBikeLand().filter(
    (compte) => (compte.reseau === "instagram" || compte.reseau === "tiktok") && compte.identifiant,
  );
  const preuves = comptes.map(
    (compte) =>
      `le profil ${compte.reseau === "instagram" ? "Instagram" : "TikTok"} @${compte.identifiant}, avec « Abonné(e) » et votre nom d'utilisateur`,
  );
  const instagram = comptes.find((compte) => compte.reseau === "instagram");
  if (instagram) preuves.push(`votre story Instagram qui identifie @${instagram.identifiant}`);
  return preuves;
}

export function consignesPreuve(): string {
  return `Envoyez une seule capture d'écran, au choix : ${preuvesAcceptees().join(" ; ")}. Il nous faut aussi votre téléphone et votre email, pour vous répondre.`;
}

export function questionVelos(personnes: number): string {
  return `Sur quels vélos ? Répartissez vos ${personnesEnClair(personnes)} entre les gammes, un vélo par personne.`;
}

export const QUESTION_COORDONNEES = "Parfait ! Il me faut quelques coordonnées pour la réservation, une par une.";

/** Les coordonnées, dans l'ordre où le chatbot les demande. */
export type ChampCoordonnees = "prenom" | "nom" | "email" | "telephone";

/** La question de chaque coordonnée, posée seule, comme dans une vraie discussion. */
export const QUESTIONS_CHAMPS: Record<ChampCoordonnees, string> = {
  prenom: "Votre prénom ?",
  nom: "Votre nom ?",
  email: "Votre email ? (pour le récapitulatif, la facture et le lien de suivi)",
  telephone: "Votre numéro Mobile Money ? (la demande de paiement part sur ce numéro)",
};

/** Ce que dit le chatbot quand une coordonnée ne passe pas, avant de reposer la question. */
export const CORRECTIONS_CHAMPS: Record<ChampCoordonnees, string> = {
  prenom: "Ce prénom est un peu long pour notre fiche : 60 lettres au plus, s'il vous plaît.",
  nom: "Ce nom est un peu long pour notre fiche : 60 lettres au plus, s'il vous plaît.",
  email: "Il manque quelque chose dans cette adresse, je crois. Elle s'écrit comme nom@exemple.com.",
  telephone: "Ce numéro ne passe pas. Écrivez-le en chiffres, par exemple 01 97 00 00 00.",
};

/** Après le prénom, la question du nom remercie le client par son prénom. */
export function questionChamp(champ: ChampCoordonnees, prenom = ""): string {
  if (champ === "nom" && prenom.trim()) return `Merci ${prenom.trim()} ! ${QUESTIONS_CHAMPS.nom}`;
  return QUESTIONS_CHAMPS[champ];
}

/** Les coordonnées déjà connues (une réservation précédente, la capture de la réduction), rappelées avant de payer. */
export function rappelCoordonnees(client: Record<ChampCoordonnees, string>): string {
  return `Je reprends vos coordonnées : ${client.prenom.trim()} ${client.nom.trim()}, ${client.email.trim()}, ${client.telephone.trim()}.`;
}

/** Quand le serveur refuse les coordonnées : on les reprend toutes. */
export const MESSAGE_REPRISE_COORDONNEES = "Reprenons vos coordonnées, une par une.";

/** Les réponses « Modifier mes coordonnées » : le client dit laquelle, seule celle-là est redemandée. */
export const LIBELLES_CHAMPS: Record<ChampCoordonnees, string> = {
  prenom: "Mon prénom",
  nom: "Mon nom",
  email: "Mon email",
  telephone: "Mon numéro",
};

/** La question qui suit « Je modifie mes coordonnées », avec ce qui est noté. */
export function questionModifier(client: Record<ChampCoordonnees, string>): string {
  return `Que voulez-vous modifier ? J'ai noté : ${client.prenom.trim()} ${client.nom.trim()}, ${client.email.trim()}, ${client.telephone.trim()}.`;
}

/** « Recommencer » touché en pleine discussion : Bike Land demande d'abord. */
export function questionRecommencer(reservee: boolean): string {
  return reservee
    ? "Tout recommencer ? Votre réservation reste confirmée : son lien de suivi est aussi dans votre email."
    : "Tout recommencer ? Vos réponses seront effacées.";
}

/** Le client ne recommence pas finalement : la discussion continue, ou reste telle quelle une fois finie. */
export function messageOnContinue(terminee: boolean): string {
  return terminee ? "Très bien, je garde tout." : "Très bien, on continue.";
}

/**
 * Bike for All : plus assez de vélos libres à l'heure demandée, mais un autre
 * départ le même jour en a. Le moteur dit « ce jour-là » ; le chatbot dit
 * l'heure, puisqu'il propose ensuite le même jour à une autre heure.
 */
export function refusCreneauPlein(depart: HeureMinute, velosLibres: number, personnesMin: number): string {
  const heure = heureEnClair(depart);
  if (velosLibres >= personnesMin) {
    return `Je viens de vérifier : il reste ${velosLibres} vélos libres pour un départ à ${heure}, donc ${personnesEnClair(velosLibres)} au plus.`;
  }
  return `Je viens de vérifier : il n'y a plus assez de vélos libres pour un départ à ${heure}.`;
}

export const QUESTION_MOYEN = "Avec quel réseau Mobile Money payez-vous ?";

/** Le paiement lancé : la bulle du client, avec le montant débité quand le serveur l'a donné. */
export function messageJePaie(montantXof: number | null): string {
  return montantXof === null ? "Je paie" : `Je paie ${formatMontant(montantXof)}`;
}

export const QUESTION_PAYER =
  "Dernière étape : acceptez nos conditions générales de vente, puis lancez le paiement. La demande arrive sur votre téléphone.";

/** La règle de retard, avant le paiement (cahier des charges, étape 9). */
export function regleRetard(reglages: ReglagesOffres): string {
  const { toleranceMinutes, penaliteParMinuteXof } = reglages.retard;
  return `Merci de rendre les vélos à l'heure : ${toleranceMinutes} minute${toleranceMinutes > 1 ? "s" : ""} de marge, puis ${formatMontant(penaliteParMinuteXof)} par minute de retard pour le groupe, à régler en espèces au retour.`;
}
