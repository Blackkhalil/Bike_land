// Le chatbot des offres de groupe (décisions 22 et 23) : la machine à états
// pure de src/lib/offres-groupe/conversation.ts, sans navigateur ni réseau.
// Chaque chemin des trois offres jusqu'au paiement, chaque autre choix
// proposé quand le moteur refuse (budget, parc, stock, minimum, délai, date
// limite, jour, heure), les variantes « C'est un peu cher pour nous », les
// demandes envoyées au serveur (contrat commun, schémas zod), chaque réponse
// d'erreur du serveur, la reprise après un rechargement, et le ton des textes
// (montants avec espaces, aucun tiret long).
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const c = await charger("src/lib/offres-groupe/conversation.ts");
const n = await charger("src/lib/offres-groupe/negociation.ts");
const t = await charger("src/lib/offres-groupe/textes-chat.ts");
const api = await charger("src/lib/offres-groupe/api.ts");
const m = await charger("src/lib/offres/index.ts");
const { REGLAGES_OFFRES_PAR_DEFAUT: R } = await charger("src/data/reglages-offres.ts");

let echecs = 0;
// Les espaces insécables des montants et des heures (U+00A0, U+202F) se lisent comme des espaces.
const ESPACES_INSECABLES = new RegExp("[\\u00a0\\u202f]", "g");
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(ESPACES_INSECABLES, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};

/* Le décor : lundi 9 novembre 2026, 10 h à Cotonou ; 18 vélos en état. */
const heureBenin = (date: string, heure: string) => Date.parse(`${date}T${heure}:00.000Z`) - 3600_000;
const LUNDI = "2026-11-09";
const LUNDI_10H = heureBenin(LUNDI, "10:00");
const MERCREDI = "2026-11-11";
const SAMEDI = "2026-11-14";
const DIMANCHE = "2026-11-15";
const VENDREDI_20H = heureBenin("2026-11-13", "20:00");
const PAR_GAMME = { CLASSIQUE: 10, PREMIUM: 6, PRESTIGE: 2 };
const FAITS = { reglages: R, velosEnEtat: 18, parGamme: PAR_GAMME };

type Etat = Record<string, any>;
// Tous les états traversés, pour contrôler les textes à la fin.
const traverses: Etat[] = [];
const agir = (etat: Etat, action: Record<string, unknown>, maintenant = LUNDI_10H, faits = FAITS): Etat => {
  const suivant = c.reduire(etat, { ...action, maintenant }, faits);
  traverses.push(suivant);
  return suivant;
};
const suite = (actions: Record<string, unknown>[], maintenant = LUNDI_10H, depart: Etat = c.etatInitial(), faits = FAITS): Etat =>
  actions.reduce((etat, action) => agir(etat, action, maintenant, faits), depart);
const derniers = (etat: Etat, combien = 1) => etat.messages.slice(-combien).map((message: { texte: string }) => message.texte).join(" | ");
const ctx = (date: string, maintenant = LUNDI_10H, velos = 18) => ({
  canal: "en-ligne",
  date,
  maintenant,
  velosDisponibles: velos,
  stockParGamme: PAR_GAMME,
});

/** La réponse que ferait la route du devis : le même moteur, la commission SasPay (3,25 %, arrondie au franc supérieur). */
const reponseDevis = (issue: Record<string, any>, plus: Record<string, unknown> = {}) => ({
  ok: true,
  issue,
  capacite: { velosLibres: 18, parGamme: PAR_GAMME },
  prochainCreneau: null,
  ...(issue.ok
    ? { commissionXof: Math.ceil(issue.resultat.totalXof * 0.0325), montantADebiterXof: issue.resultat.totalXof + Math.ceil(issue.resultat.totalXof * 0.0325) }
    : {}),
  ...plus,
});
const devisRecu = (etat: Etat, corps: unknown, statut = 200) => {
  const demande = c.demandeDevisCourante(etat);
  return agir(etat, { type: "devis-recu", signature: c.signatureDe(demande), statut, corps });
};
const CLIENT = { prenom: "Awa", nom: "Houngbo", email: "awa.test@example.com", telephone: "+229 97 00 00 00" };

/* ------------------------------------------------ Bike for All, par budget */

let e = c.etatInitial();
verifier("accueil : on choisit d'abord la sortie", [e.etape, e.messages.length], ["offre", 1]);
e = suite([{ type: "choisir-offre", offre: "bike-for-all" }], LUNDI_10H, e);
verifier("Bike for All : la question du groupe, minimum des réglages", [e.etape, derniers(e)], [
  "personnes",
  "Vous serez combien ? Un vélo par personne, 10 personnes au moins.",
]);
e = agir(e, { type: "choisir-personnes", personnes: 10 });
verifier("le jour ensuite", e.etape, "date");
verifier(
  "puces des jours de Bike for All : tous les jours, aujourd'hui compris (départs encore possibles)",
  n.joursProposes("bike-for-all", FAITS, LUNDI_10H, 4),
  [LUNDI, "2026-11-10", MERCREDI, "2026-11-12"],
);
e = agir(e, { type: "choisir-date", date: SAMEDI });
verifier("puis l'heure", [e.etape, derniers(e)], ["heure", "À quelle heure partez-vous ? Départs de 8 h à 21 h 30, retour des vélos à 22 h au plus tard."]);
const departsSamedi = n.departsProposes(SAMEDI, FAITS, LUNDI_10H);
verifier("départs du samedi : au quart d'heure, de 8 h à 21 h 30", [departsSamedi.length, departsSamedi[0], departsSamedi[1], departsSamedi.at(-1)], [55, "08:00", "08:15", "21:30"]);
verifier("départs d'aujourd'hui : pas avant 2 h de délai (12 h à 10 h)", n.departsProposes(LUNDI, FAITS, LUNDI_10H)[0], "12:00");
e = agir(e, { type: "choisir-heure", depart: "08:00" });
verifier("la question du budget, qui dit à quoi servent les deux réponses", [e.etape, derniers(e)], [
  "mode",
  "Vous avez un budget en tête ? Donnez-le-moi et je calcule votre temps de vélo. Sinon, choisissez la durée et je vous donne le prix.",
]);
e = agir(e, { type: "choisir-mode", mode: "budget" });
verifier("le budget commence au minimum du moteur pour ce groupe", [e.etape, derniers(e)], [
  "budget",
  "Quel budget pour tout le groupe ? Pour 10 personnes, il commence à 5 000 F.",
]);
verifier(
  "puces de budget : le minimum puis des montants ronds, chacun avec ce qu'il achète",
  n.budgetsProposes(e.choix, FAITS, LUNDI_10H).slice(0, 3),
  [
    { budgetXof: 5000, minutes: 30, coco: "aucun" },
    { budgetXof: 10000, minutes: 45, coco: "petit" },
    { budgetXof: 15000, minutes: 75, coco: "grand" },
  ],
);
e = agir(e, { type: "choisir-budget", budgetXof: 10000 });
verifier("ce que le budget achète (cas 2 du cahier)", derniers(e, 2), [
  "Avec 10 000 F, votre groupe roule 45 minutes, de 8 h à 8 h 45, avec un petit coco chacun. Prix habituel : 17 250 F. | Des gâteaux pour le groupe ? 150 F le gâteau.",
].join(""));
verifier("les gâteaux ensuite", e.etape, "gateaux");
e = agir(e, { type: "choisir-gateaux", gateauxParPersonne: 0 });
verifier("l'accompagnateur, avec son prix du moteur (10 personnes, 45 min : 2 500 F)", [e.etape, derniers(e)], [
  "accompagnateur",
  "Un accompagnateur Bike Land pour vous montrer le circuit et rouler avec vous ? Pour votre groupe, c'est 2 500 F.",
]);
e = agir(e, { type: "choisir-accompagnateur", accompagnateur: false });
verifier("l'offre", [e.etape, derniers(e)], ["proposition", "Voici votre offre, ligne par ligne :"]);
let offre = c.offreAffichee(e, FAITS, LUNDI_10H);
verifier("offre du moteur dans le navigateur, à confirmer (cas 2 : 11 250 F, barré 17 250 F)", [
  offre.confirme,
  offre.resultat.totalXof,
  offre.resultat.prixBarreXof,
  offre.resultat.lignes.map((l: { code: string }) => l.code),
], [false, 11250, 17250, ["budget", "frais-paiement"]]);
verifier("pas de réservation avant la confirmation du serveur", [c.devisConfirme(e), c.reduire(e, { type: "reserver", maintenant: LUNDI_10H }, FAITS).etape], [false, "proposition"]);
verifier("le prix attend la confirmation du serveur : Bike Land « écrit »", c.botEcrit(e), true);
const demandeBudget = c.demandeDevisAttendue(e);
verifier("la demande de devis suit le contrat commun", demandeBudget, {
  offre: "bike-for-all",
  date: SAMEDI,
  saisie: { mode: "budget", personnes: 10, budgetXof: 10000, depart: "08:00", gateauxParPersonne: 0, accompagnateur: false },
});
verifier("la demande de devis passe le schéma du contrat", api.schemaDemandeDevis.safeParse(demandeBudget).success, true);
const issueBudget = m.calculerBikeForAllBudget({ personnes: 10, budgetXof: 10000, depart: "08:00" }, R, ctx(SAMEDI));
e = devisRecu(e, reponseDevis(issueBudget));
offre = c.offreAffichee(e, FAITS, LUNDI_10H);
verifier("le serveur confirme : commission de l'opérateur et montant débité (décision 3)", [
  offre.confirme,
  offre.commissionXof,
  offre.montantADebiterXof,
  c.devisConfirme(e),
  c.demandeDevisAttendue(e),
], [true, 366, 11616, true, null]);
verifier("le prix confirmé : Bike Land n'écrit plus", c.botEcrit(e), false);
verifier("ce que comprend l'offre", c.inclusDans(offre.resultat, R), [
  "Toute notre gamme de vélos (Classique, Premium, Prestige) et nos casques",
  "Un petit coco par personne (10 cocos)",
]);
verifier("la règle de retard des réglages", t.regleRetard(R), "Merci de rendre les vélos à l'heure : 7 minutes de marge, puis 1 000 F par minute de retard pour le groupe, à régler en espèces au retour.");
e = agir(e, { type: "reserver" });
verifier("les coordonnées", e.etape, "coordonnees");
verifier("les coordonnées, une question à la fois : d'abord le prénom", [c.champDemande(e.client), derniers(e, 3)], [
  "prenom",
  "Je réserve | Parfait ! Il me faut quelques coordonnées pour la réservation, une par une. | Votre prénom ?",
]);
{
  // Chaque réponse se tape dans la barre du bas et devient une bulle du client.
  let un = agir(e, { type: "saisir-champ", champ: "prenom", valeur: "  Awa " });
  verifier("le prénom devient une bulle du client, puis le nom, avec un merci", [un.client.prenom, derniers(un, 2), c.champDemande(un.client)], [
    "Awa",
    "Awa | Merci Awa ! Votre nom ?",
    "nom",
  ]);
  verifier("une réponse pour un autre champ que celui demandé est ignorée", agir(un, { type: "saisir-champ", champ: "email", valeur: "awa@example.com" }), un);
  verifier("une réponse vide est ignorée", agir(un, { type: "saisir-champ", champ: "nom", valeur: "   " }), un);
  un = agir(un, { type: "saisir-champ", champ: "nom", valeur: "Houngbo" });
  verifier("puis l'email, avec à quoi il sert", derniers(un), "Votre email ? (pour le récapitulatif, la facture et le lien de suivi)");
  const emailIncomplet = agir(un, { type: "saisir-champ", champ: "email", valeur: "awa@exemple" });
  verifier("un email incomplet : sa bulle, une correction chaleureuse, puis la même question", [
    emailIncomplet.etape,
    c.champDemande(emailIncomplet.client),
    derniers(emailIncomplet, 3),
  ], [
    "coordonnees",
    "email",
    "awa@exemple | Il manque quelque chose dans cette adresse, je crois. Elle s'écrit comme nom@exemple.com. | Votre email ? (pour le récapitulatif, la facture et le lien de suivi)",
  ]);
  verifier(
    "les règles de l'email sont celles du serveur (schemaClient)",
    ["awa@exemple.c", "awa..test@example.com", "awa test@example.com", "awa.test@example.com"].map((x) => [c.champValide("email", x), api.schemaClient.shape.email.safeParse(x).success]),
    [[false, false], [false, false], [false, false], [true, true]],
  );
  un = agir(emailIncomplet, { type: "saisir-champ", champ: "email", valeur: "awa.test@example.com" });
  verifier("puis le numéro Mobile Money, qui reçoit la demande de paiement", derniers(un, 2), "awa.test@example.com | Votre numéro Mobile Money ? (la demande de paiement part sur ce numéro)");
  const numeroCourt = agir(un, { type: "saisir-champ", champ: "telephone", valeur: "97 00" });
  verifier("un numéro trop court : corrigé avec un exemple, même question", [numeroCourt.etape, derniers(numeroCourt, 2)], [
    "coordonnees",
    "Ce numéro ne passe pas. Écrivez-le en chiffres, par exemple 01 97 00 00 00. | Votre numéro Mobile Money ? (la demande de paiement part sur ce numéro)",
  ]);
  verifier("des lettres dans le numéro : refusées", [c.champValide("telephone", "+229 97 AB 00 00"), c.champValide("telephone", "01 97 00 00 00")], [false, true]);
  un = agir(numeroCourt, { type: "saisir-champ", champ: "telephone", valeur: "+229 97 00 00 00" });
  verifier("tout est là : le réseau Mobile Money, comme après le formulaire", [un.etape, un.client, derniers(un, 2)], [
    "moyen",
    CLIENT,
    "+229 97 00 00 00 | Avec quel réseau Mobile Money payez-vous ?",
  ]);
  verifier("saisir-champ hors de l'étape des coordonnées : ignoré", agir(un, { type: "saisir-champ", champ: "prenom", valeur: "Zoé" }), un);
  const tropLong = agir(e, { type: "saisir-champ", champ: "prenom", valeur: "A".repeat(61) });
  verifier("un prénom de plus de 60 lettres : corrigé, pas gardé", [tropLong.client.prenom, derniers(tropLong, 2)], [
    "",
    "Ce prénom est un peu long pour notre fiche : 60 lettres au plus, s'il vous plaît. | Votre prénom ?",
  ]);
  const modifie = agir(un, { type: "modifier-coordonnees" });
  verifier("modifier ses coordonnées avant de payer : on les reprend depuis le prénom", [modifie.etape, modifie.client, modifie.moyen, derniers(modifie, 2)], [
    "coordonnees",
    { prenom: "", nom: "", email: "", telephone: "" },
    null,
    "Je modifie mes coordonnées | Votre prénom ?",
  ]);
  verifier("modifier ses coordonnées pendant qu'on les donne : ignoré", agir(e, { type: "modifier-coordonnees" }), e);
  const parLeChat = c.demandeReservationDe(agir(agir(un, { type: "choisir-moyen", moyen: "MTN_MONEY" }), { type: "accepter-cgv", acceptees: true }));
  verifier("les coordonnées tapées une par une partent dans la demande de réservation", [parLeChat?.client, api.schemaDemandeReservation.safeParse(parLeChat).success], [CLIENT, true]);
}
verifier("email obligatoire : sans lui, rien ne passe", agir(e, { type: "saisir-coordonnees", client: { ...CLIENT, email: "" } }).etape, "coordonnees");
verifier("téléphone trop court refusé", agir(e, { type: "saisir-coordonnees", client: { ...CLIENT, telephone: "97 00" } }).etape, "coordonnees");
e = agir(e, { type: "saisir-coordonnees", client: CLIENT });
verifier("le réseau Mobile Money", [e.etape, derniers(e, 2)], ["moyen", "Awa Houngbo | Avec quel réseau Mobile Money payez-vous ?"]);
e = agir(e, { type: "choisir-moyen", moyen: "MTN_MONEY" });
verifier("les CGV puis le paiement", e.etape, "payer");
verifier("sans les CGV, pas de demande de réservation", c.demandeReservationDe(e), null);
e = agir(e, { type: "accepter-cgv", acceptees: true });
const pretAPayer = e;
const demandeResa = c.demandeReservationDe(e);
verifier("la demande de réservation : client, réseau, CGV, total vu", [demandeResa.client, demandeResa.moyenPaiement, demandeResa.cgvAcceptees, demandeResa.attendu], [
  CLIENT,
  "MTN_MONEY",
  true,
  { totalXof: 11250 },
]);
verifier("la demande de réservation passe le schéma du contrat", api.schemaDemandeReservation.safeParse(demandeResa).success, true);
e = agir(e, { type: "reservation-envoi" });
verifier("envoi en cours", e.envoi, "reservation");
const lienSuivi = "https://bike-land.vercel.app/reservation/jeton-abc_123";
const reponse201 = (paiement: Record<string, unknown>, plus: Record<string, unknown> = {}) => ({
  ok: true,
  reference: "BL-T2K9QX",
  lienSuivi,
  totalXof: 11250,
  montantADebiterXof: 11616,
  paiement,
  ...plus,
});
const enAttente = agir(e, {
  type: "reservation-recue",
  statut: 201,
  corps: reponse201({ statut: "EN_ATTENTE", suivi: { paiementId: "pay_123", moyen: "MTN_MONEY", telephone: "+229 97 00 00 00" } }),
});
verifier("201 : le paiement attend dans le chat, avec le jeton du lien de suivi", [
  enAttente.etape,
  enAttente.envoi,
  enAttente.reservation.token,
  enAttente.reservation.suivi.paiementId,
  derniers(enAttente),
], [
  "attente",
  null,
  "jeton-abc_123",
  "pay_123",
  "La demande de paiement de 11 616 F est partie sur le +229 97 00 00 00. Validez-la avec votre code secret. Vos vélos sont gardés 30 minutes.",
]);
verifier("un paiement en cours ne s'interrompt pas", agir(enAttente, { type: "demarrer", offre: "gbashi-groupe" }).etape, "attente");
const apresReservation = agir(agir(enAttente, { type: "paiement-confirme" }), { type: "demarrer", offre: "bike-for-all" });
verifier("après une réservation, un bouton de page repart de zéro, même sur la même offre", [
  apresReservation.etape,
  apresReservation.choix.personnes,
  apresReservation.reservation,
  apresReservation.client.email,
], ["personnes", null, null, CLIENT.email]);
const confirmee = agir(enAttente, { type: "paiement-confirme" });
verifier("paiement validé : bulle de confirmation", [confirmee.etape, derniers(confirmee)], [
  "confirmee",
  "C'est réservé, merci ! Votre référence : BL-T2K9QX. Le récapitulatif et la facture partent sur awa.test@example.com. Votre lien de suivi est juste en dessous.",
]);
const echoue = agir(enAttente, { type: "paiement-echoue", message: "Solde insuffisant" });
verifier("paiement refusé : diagnostic et reprise depuis le lien de suivi", [
  echoue.etape,
  derniers(echoue).startsWith("Solde insuffisant."),
  c.lienRepriseDuPaiement(echoue.reservation),
], ["echec", true, `${lienSuivi}?nouvelle=1&echec=solde_insuffisant`]);

/* ------------------------------------------------ Bike for All, par durée */

let d = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 15 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-heure", depart: "08:00" },
  { type: "choisir-mode", mode: "duree" },
]);
verifier("mode durée : la question de la durée", [d.etape, derniers(d)], ["duree", "Combien de temps voulez-vous rouler ?"]);
const durees = n.dureesProposees(d.choix, FAITS, LUNDI_10H);
verifier("durées proposées : au pas réglé, de 30 min jusqu'au retour à 22 h", [durees[0], durees[1], durees.at(-1), durees.length], [30, 45, 840, 55]);
d = agir(d, { type: "choisir-duree", minutes: 60 });
verifier("puis le coco, aux prix des réglages", [d.etape, derniers(d)], ["coco", "Un coco pour chacun ? Le petit est à 175 F, le grand à 275 F, par personne."]);
d = suite([
  { type: "choisir-coco", coco: "petit" },
  { type: "choisir-gateaux", gateauxParPersonne: 1 },
  { type: "choisir-accompagnateur", accompagnateur: false },
], LUNDI_10H, d);
offre = c.offreAffichee(d, FAITS, LUNDI_10H);
verifier("cas 6 du cahier : 15 personnes, 60 min, petit coco, 1 gâteau", [d.etape, offre.resultat.totalXof, offre.resultat.prixBarreXof], ["proposition", 19750, 32250]);
verifier("la demande de devis en mode durée", c.demandeDevisAttendue(d).saisie, {
  mode: "duree",
  personnes: 15,
  minutes: 60,
  depart: "08:00",
  coco: "petit",
  gateauxParPersonne: 1,
  accompagnateur: false,
});

/* ------------------------------------------------ Road trip en groupe */

let r = suite([
  { type: "choisir-offre", offre: "road-trip-groupe" },
  { type: "choisir-personnes", personnes: 10 },
]);
verifier("road trip : les jours proposés sont le samedi et le dimanche", n.joursProposes("road-trip-groupe", FAITS, LUNDI_10H, 3), [SAMEDI, DIMANCHE, "2026-11-21"]);
r = agir(r, { type: "choisir-date", date: SAMEDI });
verifier("road trip : pas d'heure à choisir, les gâteaux tout de suite", r.etape, "gateaux");
verifier("le serveur vérifie déjà le parc du jour", c.demandeDevisAttendue(r), { offre: "road-trip-groupe", date: SAMEDI, saisie: { personnes: 10, gateauxParPersonne: 0 } });
r = agir(r, { type: "choisir-gateaux", gateauxParPersonne: 0 });
verifier("la question de la réduction, mot pour mot", [r.etape, derniers(r)], [
  "reduction",
  "Voulez-vous une réduction de 4 % ? Abonnez-vous à nos réseaux ou recommandez-nous en story.",
]);
const sansReduction = agir(r, { type: "repondre-reduction", veut: false });
offre = c.offreAffichee(sansReduction, FAITS, LUNDI_10H);
verifier("cas 7 : 10 personnes sans réduction, 31 250 F, pas de prix barré", [sansReduction.etape, offre.resultat.totalXof, offre.resultat.prixBarreXof], ["proposition", 31250, null]);
let p = agir(r, { type: "repondre-reduction", veut: true });
verifier("les preuves acceptées : Instagram, TikTok, story Instagram", [p.etape, derniers(p)], [
  "preuve",
  "Envoyez une seule capture d'écran, au choix : le profil Instagram @bikeland_bj, avec « Abonné(e) » et votre nom d'utilisateur ; le profil TikTok @bikelandbj, avec « Abonné(e) » et votre nom d'utilisateur ; votre story Instagram qui identifie @bikeland_bj. Il nous faut aussi votre téléphone et votre email, pour vous répondre.",
]);
p = agir(p, { type: "preuve-envoi", telephone: " +229 97 00 00 00 ", email: "awa.test@example.com" });
verifier("l'envoi de la capture garde le téléphone et l'email pour la suite", [p.envoi, p.choix.reduction.etat, p.client.telephone, p.client.email], [
  "preuve",
  "envoi",
  "+229 97 00 00 00",
  "awa.test@example.com",
]);
const validee = agir(p, { type: "preuve-recue", statut: 201, corps: { ok: true, preuveId: "pr_1", statut: "validee", message: "Capture validée." } });
offre = c.offreAffichee(validee, FAITS, LUNDI_10H);
verifier("capture validée : la réduction s'applique (cas 8 : 30 050 F, barré 31 250 F)", [
  validee.etape,
  validee.envoi,
  derniers(validee, 2).split(" | ")[0],
  offre.resultat.totalXof,
  offre.resultat.prixBarreXof,
], ["proposition", null, "C'est validé ! La réduction de 4 % s'applique à votre road trip.", 30050, 31250]);
verifier("la preuve part dans la demande, jamais un booléen", c.demandeDevisDe(validee.choix).saisie, { personnes: 10, gateauxParPersonne: 0, preuveId: "pr_1" });
const attente = agir(p, { type: "preuve-recue", statut: 201, corps: { ok: true, preuveId: "pr_2", statut: "en_attente", message: "" } });
verifier("capture en vérification : le message du cahier, et on peut réserver sans", [attente.etape, derniers(attente)], [
  "preuve-statut",
  "Nous vérifions votre capture et vous écrivons très vite. Vous pouvez aussi réserver maintenant sans la réduction.",
]);
verifier("en vérification, pas de réduction dans la demande", c.demandeDevisDe(attente.choix).saisie.preuveId, undefined);
const verification = agir(attente, { type: "verifier-preuve" });
verifier("« Est-ce validé ? » redemande l'état au serveur", verification.choix.reduction, { etat: "a-verifier", preuveId: "pr_2" });
const sansEnAttente = agir(attente, { type: "reduction-sans" });
verifier("réserver sans la réduction pendant la vérification", [sansEnAttente.etape, c.offreAffichee(sansEnAttente, FAITS, LUNDI_10H).resultat.totalXof], ["proposition", 31250]);
const refusee = agir(p, { type: "preuve-recue", statut: 201, corps: { ok: true, preuveId: "pr_3", statut: "refusee", message: "On ne voit pas la mention « Abonné(e) »." } });
verifier("capture refusée : message poli, nouvel essai possible", [refusee.etape, derniers(refusee)], [
  "preuve-statut",
  "On ne voit pas la mention « Abonné(e) ». Vous pouvez en envoyer une autre, ou réserver sans la réduction.",
]);
verifier("renvoyer une capture", agir(refusee, { type: "renvoyer-preuve" }).etape, "preuve");
const tropLourde = agir(p, { type: "preuve-recue", statut: 413, corps: { ok: false, code: "SAISIE", message: "Image trop lourde." } });
verifier("capture refusée par la route (taille) : on reste à l'envoi", [tropLourde.etape, tropLourde.envoi, derniers(tropLourde)], [
  "preuve",
  null,
  "Image trop lourde. Envoyez une image JPG, PNG ou WebP de 4 Mo au plus.",
]);

// Le lien de l'email après une vérification à la main : /?reserver-en-groupe=road-trip-groupe&preuve=<id>.
let lien = agir(c.etatInitial(), { type: "demarrer", offre: "road-trip-groupe", preuveId: "pr_9" });
verifier("lien de l'email : le chat s'ouvre sur le road trip et vérifie la capture", [lien.choix.offre, lien.choix.reduction, lien.etape], [
  "road-trip-groupe",
  { etat: "a-verifier", preuveId: "pr_9" },
  "personnes",
]);
const nombreMessages = lien.messages.length;
lien = agir(lien, { type: "preuve-recue", statut: 200, corps: { ok: true, preuveId: "pr_9", statut: "validee", message: "" } });
verifier("capture validée en chemin : la question du groupe n'est pas reposée", [lien.etape, lien.messages.length - nombreMessages, lien.choix.reduction.etat], ["personnes", 1, "validee"]);
lien = suite([
  { type: "choisir-personnes", personnes: 10 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-gateaux", gateauxParPersonne: 0 },
], LUNDI_10H, lien);
verifier("avec la capture validée, la réduction n'est plus demandée", [lien.etape, c.offreAffichee(lien, FAITS, LUNDI_10H).resultat.totalXof], ["proposition", 30050]);
const inconnue = agir(agir(c.etatInitial(), { type: "demarrer", offre: "road-trip-groupe", preuveId: "pr_x" }), { type: "preuve-recue", statut: 404, corps: { ok: false } });
verifier("capture introuvable : on reposera la question de la réduction", inconnue.choix.reduction, { etat: "a-demander" });
// Le devis dit la vérité sur la preuve.
const dejaUtilisee = devisRecu(validee, reponseDevis(m.calculerRoadTrip({ personnes: 10 }, R, ctx(SAMEDI)), { preuve: "deja-utilisee" }));
verifier("une capture déjà utilisée : sans réduction, et on le dit", [dejaUtilisee.choix.reduction, derniers(dejaUtilisee, 2).split(" | ")[0]], [
  { etat: "sans" },
  "Cette capture a déjà servi pour une réservation : la réduction vaut une fois par groupe.",
]);
{
  // Le téléphone et l'email donnés avec la capture ne sont pas redemandés.
  const rtConfirme = devisRecu(validee, reponseDevis(m.calculerRoadTrip({ personnes: 10, reductionValidee: true }, R, ctx(SAMEDI)), { preuve: "validee" }));
  let connu = agir(rtConfirme, { type: "reserver" });
  verifier("road trip avec capture : seuls le prénom et le nom sont demandés", [c.devisConfirme(rtConfirme), connu.etape, c.champDemande(connu.client), derniers(connu)], [
    true,
    "coordonnees",
    "prenom",
    "Votre prénom ?",
  ]);
  connu = suite([
    { type: "saisir-champ", champ: "prenom", valeur: "Awa" },
    { type: "saisir-champ", champ: "nom", valeur: "Houngbo" },
  ], LUNDI_10H, connu);
  verifier("prénom et nom suffisent : on passe au réseau Mobile Money", [connu.etape, connu.client, derniers(connu, 2)], [
    "moyen",
    CLIENT,
    "Houngbo | Avec quel réseau Mobile Money payez-vous ?",
  ]);
}

/* ------------------------------------------------ Gbashi Bike */

let g = suite([
  { type: "choisir-offre", offre: "gbashi-groupe" },
  { type: "choisir-personnes", personnes: 5 },
]);
verifier("Gbashi Bike : seulement le dimanche", n.joursProposes("gbashi-groupe", FAITS, LUNDI_10H, 2), [DIMANCHE, "2026-11-22"]);
g = agir(g, { type: "choisir-date", date: DIMANCHE });
verifier("puis les vélos par gamme", [g.etape, derniers(g)], ["velos", "Sur quels vélos ? Répartissez vos 5 personnes entre les gammes, un vélo par personne."]);
verifier("une demande provisoire pour connaître ce qu'il reste", c.demandeDevisAttendue(g), {
  offre: "gbashi-groupe",
  date: DIMANCHE,
  saisie: { velos: { CLASSIQUE: 5 }, gateauxParPersonne: 0 },
});
verifier("avant la réponse : le parc en état, à confirmer", c.stockGbashi(g, FAITS), { stock: PAR_GAMME, confirme: false });
g = devisRecu(g, reponseDevis(m.calculerGbashi({ velos: { CLASSIQUE: 5 } }, R, { ...ctx(DIMANCHE), stockParGamme: { CLASSIQUE: 3, PREMIUM: 6, PRESTIGE: 2 } }), {
  capacite: { velosLibres: 11, parGamme: { CLASSIQUE: 3, PREMIUM: 6, PRESTIGE: 2 } },
}));
verifier("ce qu'il reste ce dimanche, confirmé par le serveur ; le refus provisoire est ignoré", [c.stockGbashi(g, FAITS), g.etape], [
  { stock: { CLASSIQUE: 3, PREMIUM: 6, PRESTIGE: 2 }, confirme: true },
  "velos",
]);
verifier("répartition proposée : les moins chers d'abord, dans le stock", n.repartitionParDefaut(5, { CLASSIQUE: 3, PREMIUM: 6, PRESTIGE: 2 }, FAITS), { CLASSIQUE: 3, PREMIUM: 2, PRESTIGE: 0 });
{
  // Dimanche presque plein : moins de vélos libres que le minimum du groupe.
  let plein = suite([
    { type: "choisir-offre", offre: "gbashi-groupe" },
    { type: "choisir-personnes", personnes: 6 },
    { type: "choisir-date", date: DIMANCHE },
  ]);
  plein = devisRecu(
    plein,
    reponseDevis(m.calculerGbashi({ velos: { CLASSIQUE: 6 } }, R, { ...ctx(DIMANCHE, LUNDI_10H, 3), stockParGamme: { CLASSIQUE: 2, PREMIUM: 1, PRESTIGE: 0 } }), {
      capacite: { velosLibres: 3, parGamme: { CLASSIQUE: 2, PREMIUM: 1, PRESTIGE: 0 } },
      prochainCreneau: { date: "2026-11-22", depart: "07:00" },
    }),
  );
  verifier(
    "3 vélos libres pour un minimum de 5 : le refus du serveur, et le dimanche suivant proposé",
    [plein.etape, plein.alternatives.some((a: { libelle: string }) => /22 novembre/.test(a.libelle))],
    ["refus", true],
  );
}
g = agir(g, { type: "choisir-velos", velos: { CLASSIQUE: 2, PREMIUM: 2, PRESTIGE: 1 } });
verifier("les vélos choisis, puis les gâteaux", [g.etape, g.choix.personnes, derniers(g, 2).split(" | ")[0]], ["gateaux", 5, "2 Classique, 2 Premium et 1 Prestige"]);
g = agir(g, { type: "choisir-gateaux", gateauxParPersonne: 0 });
offre = c.offreAffichee(g, FAITS, LUNDI_10H);
verifier("cas 9 : Gbashi Bike, 2 Classique, 2 Premium, 1 Prestige : 20 125 F", [g.etape, offre.resultat.totalXof, offre.resultat.prixBarreXof], ["proposition", 20125, null]);
verifier("Gbashi Bike : un coco et une eau par personne, séance encadrée", c.inclusDans(offre.resultat, R), [
  "Votre vélo et un casque",
  "La séance de muscu encadrée par nos coachs",
  "1 coco et 1 bouteille d'eau par personne",
]);
const ligneGbashi = t.ligneDeLOffre("gbashi-groupe", R);
verifier("la carte Gbashi du cahier", normaliser(ligneGbashi).endsWith("Uniquement sur réservation : minimum 5 personnes, réservation au plus tard le vendredi à 19 h.\""), true);
const stock = devisRecu(g, reponseDevis({ ok: false, refus: { code: "STOCK_GAMME", champ: "velos", gamme: "PRESTIGE", maximum: 0, message: "Il ne nous reste plus de vélo Prestige libre ce jour-là : choisissez une autre gamme." } }));
verifier("refus du stock d'une gamme : on revoit la répartition", [stock.etape, stock.alternatives.map((a: { cle: string }) => a.cle).slice(0, 1)], ["refus", ["velos"]]);
const repartir = agir(stock, { type: "appliquer", alternative: stock.alternatives[0] });
verifier("revoir la répartition ramène aux vélos", repartir.etape, "velos");

/* ------------------------------------------------ Quand le moteur refuse */

const refusDe = (etat: Etat) => [etat.etape, etat.refus?.refus.code, etat.alternatives.map((a: { libelle: string }) => a.libelle)];
const bfa = (personnes: number, budgetXof: number, depart = "08:00", date = SAMEDI, maintenant = LUNDI_10H, faits = FAITS) =>
  suite([
    { type: "choisir-offre", offre: "bike-for-all" },
    { type: "choisir-personnes", personnes },
    { type: "choisir-date", date },
    { type: "choisir-heure", depart },
    { type: "choisir-mode", mode: "budget" },
    { type: "choisir-budget", budgetXof },
  ], maintenant, c.etatInitial(), faits);

const insuffisant = bfa(18, 5000);
verifier("18 personnes et 5 000 F : refus tout de suite, minimum 8 200 F proposé", refusDe(insuffisant), [
  "refus",
  "BUDGET_INSUFFISANT",
  ["Budget de 8 200 F, 30 minutes de vélo : 10 450 F"],
]);
verifier("le message du moteur, tel quel", insuffisant.messages.at(-2).texte, "Avec 5 000 F, votre groupe de 18 personnes ne peut pas rouler les 30 minutes du minimum. Il faut un budget de 8 200 F au moins.");
const applique = agir(insuffisant, { type: "appliquer", alternative: insuffisant.alternatives[0] });
verifier("choisir le minimum reprend la discussion aux gâteaux", [applique.etape, applique.choix.budgetXof], ["gateaux", 8200]);
verifier("dans le trou du seuil des 15 000 F, les deux montants", refusDe(bfa(34, 15000, "08:00", SAMEDI, LUNDI_10H, { ...FAITS, velosEnEtat: 40 })), [
  "refus",
  "BUDGET_INSUFFISANT",
  ["Budget de 14 600 F, 30 minutes de vélo : 18 850 F", "Budget de 15 600 F, 30 minutes de vélo : 19 850 F"],
]);
const delai = bfa(10, 10000, "10:30", LUNDI);
verifier("départ trop proche aujourd'hui : le premier départ encore possible, ou un autre jour", refusDe(delai), [
  "refus",
  "DELAI",
  ["Partir à 12 h : 11 250 F", "Mardi 10 novembre : 11 250 F", "Mercredi 11 novembre : 11 250 F", "Choisir une autre date"],
]);
const heure = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 10 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-heure", depart: "21:30" },
  { type: "choisir-mode", mode: "duree" },
  { type: "choisir-duree", minutes: 60 },
]);
verifier("retour après 22 h : le dernier départ, ou plus court", refusDe(heure).slice(0, 2).concat([heure.alternatives.slice(0, 2).map((a: { libelle: string }) => a.libelle)]), [
  "refus",
  "HEURE",
  ["Partir à 21 h : 10 250 F", "Rouler 30 minutes : 6 250 F"],
]);
const rt = (date: string, maintenant = LUNDI_10H, personnes = 10) =>
  suite([
    { type: "choisir-offre", offre: "road-trip-groupe" },
    { type: "choisir-personnes", personnes },
    { type: "choisir-date", date },
  ], maintenant);
verifier("road trip un mercredi : les prochains week-ends", refusDe(rt(MERCREDI)), [
  "refus",
  "JOUR",
  ["Samedi 14 novembre : 31 250 F", "Dimanche 15 novembre : 31 250 F", "Choisir une autre date"],
]);
verifier("après le vendredi 19 h : le week-end suivant", refusDe(rt(SAMEDI, VENDREDI_20H)), [
  "refus",
  "DATE_LIMITE",
  ["Samedi 21 novembre : 31 250 F", "Dimanche 22 novembre : 31 250 F", "Choisir une autre date"],
]);
const gbashiSamedi = suite([
  { type: "choisir-offre", offre: "gbashi-groupe" },
  { type: "choisir-personnes", personnes: 5 },
  { type: "choisir-date", date: SAMEDI },
]);
verifier("Gbashi Bike un samedi : refusé dès le jour, avant les vélos, les dimanches proposés", refusDe(gbashiSamedi), [
  "refus",
  "JOUR",
  ["Dimanche 15 novembre", "Dimanche 22 novembre", "Choisir une autre date"],
]);
const bfaApresLimite = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 10 },
  { type: "choisir-date", date: SAMEDI },
], VENDREDI_20H);
verifier("Bike for All un samedi après le vendredi 19 h : refusé dès le jour, avant l'heure et le budget", [bfaApresLimite.etape, bfaApresLimite.refus?.refus.code], ["refus", "DATE_LIMITE"]);
const autreDate = agir(rt(MERCREDI), { type: "appliquer", alternative: { cle: "autre-date", libelle: "Choisir une autre date", changement: { date: null } } });
verifier("« Choisir une autre date » repose la question du jour", autreDate.etape, "date");

// Le parc du jour, mesuré par le serveur (décision 10).
let parc = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 16 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-heure", depart: "08:00" },
  { type: "choisir-mode", mode: "budget" },
  { type: "choisir-budget", budgetXof: 10000 },
]);
parc = devisRecu(parc, reponseDevis(m.calculerBikeForAllBudget({ personnes: 16, budgetXof: 10000, depart: "08:00" }, R, ctx(SAMEDI, LUNDI_10H, 15)), {
  capacite: { velosLibres: 15, parGamme: { CLASSIQUE: 8, PREMIUM: 5, PRESTIGE: 2 } },
  prochainCreneau: { date: SAMEDI, depart: "09:30" },
}));
verifier("parc de 15 vélos, groupe de 16 : moins de personnes, le créneau libre le plus proche, un autre jour", refusDe(parc), [
  "refus",
  "PARC",
  [
    "Passer à 15 personnes : 11 875 F",
    "Samedi 14 novembre à 9 h 30 : 12 000 F",
    "Dimanche 15 novembre : 12 000 F",
    "Lundi 16 novembre : 12 000 F",
    "Choisir une autre date",
  ],
]);
const creneau = agir(parc, { type: "appliquer", alternative: parc.alternatives[1] });
verifier("prendre le créneau libre le plus proche", [creneau.choix.date, creneau.choix.depart, creneau.etape], [SAMEDI, "09:30", "gateaux"]);
const minimum = agir(c.etatInitial(), { type: "choisir-offre", offre: "bike-for-all" });
const refusMin = n.alternativesDuRefus({ ...minimum.choix, personnes: 8, date: SAMEDI, depart: "08:00", mode: "budget", budgetXof: 10000 }, { code: "PERSONNES_MIN", message: "Bike for All se réserve pour 10 personnes au moins, un vélo par personne." }, null, FAITS, LUNDI_10H);
verifier("moins que le minimum : passer au minimum de l'offre", refusMin.map((a: { libelle: string }) => a.libelle), ["Passer à 10 personnes : 11 250 F"]);

/* ------------------------------------------------ « C'est un peu cher pour nous » */

const cher = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 15 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-heure", depart: "08:00" },
  { type: "choisir-mode", mode: "duree" },
  { type: "choisir-duree", minutes: 60 },
  { type: "choisir-coco", coco: "grand" },
  { type: "choisir-gateaux", gateauxParPersonne: 2 },
  { type: "choisir-accompagnateur", accompagnateur: true },
]);
verifier("offre de départ (15 pers., 1 h, grand coco, 2 gâteaux, accompagnateur)", c.offreAffichee(cher, FAITS, LUNDI_10H).resultat.totalXof, 27000);
const negociation = agir(cher, { type: "trop-cher" });
verifier("des variantes moins chères, chacune avec son total du moteur, les plus proches d'abord", [negociation.etape, negociation.alternatives.map((a: { libelle: string }) => a.libelle)], [
  "negociation",
  [
    "Petit coco au lieu du grand : 25 500 F",
    "Un gâteau par personne : 24 750 F",
    "45 minutes de vélo au lieu de 1 h : 24 000 F",
    "Sans accompagnateur : 23 500 F",
    "Sans coco : 22 875 F",
    "Sans gâteaux : 22 500 F",
    "30 minutes de vélo : 21 000 F",
  ],
]);
const sansGuide = negociation.alternatives.find((a: { cle: string }) => a.cle === "sans-accompagnateur");
const moinsCher = agir(negociation, { type: "appliquer", alternative: sansGuide });
verifier("choisir une variante : la nouvelle offre, avec l'ancien prix", [moinsCher.etape, moinsCher.choix.accompagnateur, derniers(moinsCher)], [
  "proposition",
  false,
  "Voici la nouvelle offre : 23 500 F au lieu de 27 000 F.",
]);
verifier("garder l'offre", agir(negociation, { type: "garder-offre" }).etape, "proposition");
const cherBudget = suite([
  { type: "choisir-offre", offre: "bike-for-all" },
  { type: "choisir-personnes", personnes: 12 },
  { type: "choisir-date", date: SAMEDI },
  { type: "choisir-heure", depart: "08:00" },
  { type: "choisir-mode", mode: "budget" },
  { type: "choisir-budget", budgetXof: 20000 },
  { type: "choisir-gateaux", gateauxParPersonne: 0 },
  { type: "choisir-accompagnateur", accompagnateur: true },
]);
verifier("cas 5 : 12 personnes, 20 000 F, accompagnateur : 24 650 F", c.offreAffichee(cherBudget, FAITS, LUNDI_10H).resultat.totalXof, 24650);
verifier("en mode budget : un budget plus petit, ou sans accompagnateur", agir(cherBudget, { type: "trop-cher" }).alternatives.map((a: { libelle: string }) => a.libelle), [
  "Sans accompagnateur : 21 500 F",
  "Budget de 15 000 F : 19 400 F",
  "Budget de 5 800 F : 10 200 F",
]);
const cherRoadTrip = suite([{ type: "choisir-gateaux", gateauxParPersonne: 1 }, { type: "repondre-reduction", veut: false }], LUNDI_10H, rt(SAMEDI));
const variantesRt = agir(cherRoadTrip, { type: "trop-cher" }).alternatives;
verifier("road trip : la réduction (capture à envoyer) ou sans gâteaux", variantesRt.map((a: { libelle: string }) => a.libelle), [
  "Avec la réduction de 4 %, une capture d'abonnement à envoyer : 31 550 F",
  "Sans gâteaux : 31 250 F",
]);
verifier("la réduction proposée reprend la question, jamais accordée d'office", agir(cherRoadTrip, { type: "appliquer", alternative: variantesRt[0] }).etape, "reduction");
const cherGbashi = suite([
  { type: "choisir-offre", offre: "gbashi-groupe" },
  { type: "choisir-personnes", personnes: 5 },
  { type: "choisir-date", date: DIMANCHE },
  { type: "choisir-velos", velos: { PREMIUM: 3, PRESTIGE: 2 } },
  { type: "choisir-gateaux", gateauxParPersonne: 0 },
]);
verifier("Gbashi Bike : des vélos moins chers", agir(cherGbashi, { type: "trop-cher" }).alternatives.map((a: { libelle: string }) => a.libelle), ["5 Classique : 18 125 F"]);
const auPlusBas = suite([{ type: "choisir-gateaux", gateauxParPersonne: 0 }, { type: "repondre-reduction", veut: false }], LUNDI_10H, rt(SAMEDI));
const dejaBas = agir(auPlusBas, { type: "trop-cher" });
verifier("rien de moins cher sans changer le groupe : on le dit, et WhatsApp reste là", [dejaBas.etape, dejaBas.alternatives.length > 0], ["negociation", true]);
const vraimentBas = n.variantesMoinsCheres({ ...auPlusBas.choix, reduction: { etat: "validee", preuveId: "pr_1" } }, FAITS, LUNDI_10H);
verifier("road trip déjà réduit, sans gâteaux : aucune variante", vraimentBas, []);

/* ------------------------------------------------ Les réponses d'erreur */

const ferme = devisRecu(d, { ok: false, code: "FERME", message: "Les offres de groupe sont fermées." }, 403);
verifier("devis 403 : fermé, on renvoie vers WhatsApp", [ferme.etape, derniers(ferme)], ["ferme", "Les offres de groupe sont fermées."]);
verifier("devis 503 : réglages illisibles, en pause", devisRecu(d, { ok: false, code: "REGLAGES_ILLISIBLES", message: "" }, 503).etape, "ferme");
const trop = devisRecu(d, { ok: false, code: "TROP_DE_DEMANDES", message: "" }, 429);
verifier("devis 429 : patienter, puis relancer", [trop.etape, derniers(trop), c.demandeDevisAttendue(trop), c.demandeDevisAttendue(agir(trop, { type: "relancer-devis" })) !== null], [
  "proposition",
  "Beaucoup de demandes en même temps : patientez une minute, puis réessayez.",
  null,
  true,
]);
const coupe = agir(d, { type: "devis-echec", signature: c.signatureDe(c.demandeDevisCourante(d)) });
verifier("devis sans réseau : message une fois, relance possible", [derniers(coupe).startsWith("La connexion est instable"), c.demandeDevisAttendue(coupe)], [true, null]);
verifier("une réponse à une demande dépassée est ignorée", agir(d, { type: "devis-recu", signature: "{}", statut: 200, corps: reponseDevis(issueBudget) }), d);
const mauvaise = devisRecu(d, { ok: true, issue: { ok: true } }, 200);
verifier("un devis mal formé ne vaut pas confirmation", [c.devisConfirme(mauvaise), mauvaise.devisEnEchec !== null], [false, true]);
const misAJour = devisRecu(d, reponseDevis({ ok: true, resultat: { ...c.offreAffichee(d, FAITS, LUNDI_10H).resultat, totalXof: 20500 } }));
verifier("le serveur trouve un autre prix : il fait foi, et on le dit", [c.offreAffichee(misAJour, FAITS, LUNDI_10H).resultat.totalXof, derniers(misAJour)], [
  20500,
  "Le prix vient d'être mis à jour par Bike Land : 20 500 F.",
]);

// Les réponses de la réservation, à partir de l'étape du paiement.
const pret = agir(pretAPayer, { type: "reservation-envoi" });
const recue = (statut: number, corps: unknown) => agir(pret, { type: "reservation-recue", statut, corps });
const nouveauDevis = reponseDevis({ ok: true, resultat: { ...issueBudget.resultat, totalXof: 11500, lignes: issueBudget.resultat.lignes } });
const reglages409 = recue(409, { ok: false, code: "REGLAGES", message: "Le prix vient de changer.", devis: nouveauDevis });
verifier("409 REGLAGES : la nouvelle offre, à confirmer de nouveau au nouveau prix", [
  reglages409.etape,
  reglages409.envoi,
  derniers(reglages409),
  c.offreAffichee(reglages409, FAITS, LUNDI_10H).resultat.totalXof,
], ["proposition", null, "Le prix vient de changer. Voici l'offre à jour : 11 500 F. Confirmez pour réserver à ce prix.", 11500]);
verifier("confirmer après 409 REGLAGES envoie le nouveau total", c.demandeReservationDe(agir(reglages409, { type: "reserver" }))?.attendu ?? c.demandeReservationDe(reglages409).attendu, { totalXof: 11500 });
const toutConnu = agir(reglages409, { type: "reserver" });
verifier("coordonnées déjà toutes connues : rappelées, pas redemandées, puis le réseau", [toutConnu.etape, derniers(toutConnu, 3)], [
  "moyen",
  "Je réserve | Je reprends vos coordonnées : Awa Houngbo, awa.test@example.com, +229 97 00 00 00. | Avec quel réseau Mobile Money payez-vous ?",
]);
const dispo = recue(409, { ok: false, code: "DISPO", message: "Ces vélos viennent d'être réservés.", prochainCreneau: { date: SAMEDI, depart: "10:00" } });
verifier("409 DISPO : le créneau libre le plus proche", [dispo.etape, dispo.alternatives[0]?.libelle, dispo.messages.at(-2).texte], [
  "refus",
  "Samedi 14 novembre à 10 h : 11 250 F",
  "Ces vélos viennent d'être réservés. Aucun montant n'a été prélevé.",
]);
const doublon = recue(409, { ok: false, code: "EN_ATTENTE", message: "" });
verifier("409 EN_ATTENTE : une demande attend déjà sur le téléphone", [doublon.etape, derniers(doublon).startsWith("Une demande de paiement à votre nom attend déjà")], ["echec", true]);
const refus422 = recue(422, { ok: false, code: "REFUS", refus: { code: "DATE_LIMITE", champ: "date", message: "Les réservations du week-end se font au plus tard le vendredi à 19 h." } });
verifier("422 REFUS : le message du moteur et d'autres jours", [refus422.etape, refus422.alternatives.map((a: { cle: string }) => a.cle)], [
  "refus",
  ["jour-2026-11-15", "jour-2026-11-16", "autre-date"],
]);
verifier("403 FERME", recue(403, { ok: false, code: "FERME", message: "Fermé pour le moment." }).etape, "ferme");
const trop429 = recue(429, { ok: false, code: "TROP_DE_DEMANDES", message: "Trop de demandes." });
verifier("429 : on reste au paiement, on patiente", [trop429.etape, derniers(trop429)], ["payer", "Trop de demandes."]);
const paiement502 = recue(502, { ok: false, code: "PAIEMENT", message: "" });
verifier("502 : la demande de paiement n'est pas partie, rien n'est prélevé", [paiement502.etape, derniers(paiement502)], [
  "payer",
  "La demande de paiement n'a pas pu partir. Aucun montant n'a été prélevé : réessayez dans un instant.",
]);
verifier("400 SAISIE : retour aux coordonnées", recue(400, { ok: false, code: "SAISIE", message: "Email invalide." }).etape, "coordonnees");
const saisie400 = recue(400, { ok: false, code: "SAISIE", message: "Email invalide." });
verifier("400 SAISIE : le message du serveur, puis toutes les coordonnées reprises une par une", [saisie400.client, c.champDemande(saisie400.client), derniers(saisie400, 3)], [
  { prenom: "", nom: "", email: "", telephone: "" },
  "prenom",
  "Email invalide. | Reprenons vos coordonnées, une par une. | Votre prénom ?",
]);
verifier("201 REUSSI (démonstration) : confirmé tout de suite", recue(201, reponse201({ statut: "REUSSI" })).etape, "confirmee");
const partiePas = recue(201, reponse201({ statut: "ECHOUE", message: "Numéro de téléphone invalide pour ce pays" }));
verifier("201 ECHOUE : reprise depuis le lien de suivi, avec le diagnostic", [partiePas.etape, c.lienRepriseDuPaiement(partiePas.reservation)], [
  "echec",
  `${lienSuivi}?nouvelle=1&echec=numero_invalide`,
]);
verifier("201 sans jeton dans le lien : pas d'attente impossible à suivre", recue(201, reponse201({ statut: "EN_ATTENTE", suivi: { paiementId: "p", moyen: "MTN_MONEY", telephone: "97" } }, { lienSuivi: "https://bike-land.vercel.app/reservation/suivi" })).etape, "echec");
const sansReseau = agir(pret, { type: "reservation-echec" });
verifier("coupure pendant l'envoi : on prévient avant de réessayer", [sansReseau.etape, sansReseau.envoi, derniers(sansReseau).includes("email de Bike Land")], ["payer", null, true]);
verifier("Bike Land « écrit » pendant l'envoi de la réservation, d'une capture, ou la vérification d'une capture", [
  c.botEcrit(pret),
  c.botEcrit(p),
  c.botEcrit(verification),
  c.botEcrit(sansReseau),
], [true, true, true, false]);
verifier("une question qui attend sa réponse : pas de petits points, même si le prix se vérifie en silence", [r.etape, c.demandeDevisAttendue(r) !== null, c.botEcrit(r)], [
  "reduction",
  true,
  false,
]);
verifier("le jeton d'un lien de suivi", [c.jetonDuLien(lienSuivi), c.jetonDuLien("/reservation/suivi"), c.jetonDuLien("https://x.test/reservation/a%20b/"), c.jetonDuLien("pas un lien")], [
  "jeton-abc_123",
  null,
  "a b",
  null,
]);

/* ------------------------------------------------ Recommencer, WhatsApp, rechargement */

const recommence = agir(cher, { type: "recommencer" });
verifier("recommencer : tout repart de zéro, les coordonnées restent", [recommence.etape, recommence.choix.offre, recommence.messages.length, recommence.client], ["offre", null, 2, cher.client]);
verifier("le message WhatsApp résume les choix", c.messageWhatsApp(cher, FAITS, LUNDI_10H), [
  "Bonjour Bike Land, je prépare une sortie en groupe avec l'assistant du site.",
  "Formule : Bike for All",
  "Groupe : 15 personnes",
  "Jour : samedi 14 novembre, départ à 8 h",
  "Durée : 1 h, grand coco",
  "Gâteaux : 2 gâteaux par personne",
  "Avec un accompagnateur",
  "Prix calculé : 27 000 F",
  "Pouvez-vous m'aider ?",
].join("\n"));
const texte = c.sauvegarder(pretAPayer, true, LUNDI_10H);
const relu = c.relireSauvegarde(texte, LUNDI_10H + 60_000);
verifier("rechargement : la conversation revient, le devis sera redemandé", [relu.ouvert, relu.etat.etape, relu.etat.choix, relu.etat.devis, relu.etat.messages.length], [
  true,
  pretAPayer.etape,
  pretAPayer.choix,
  null,
  pretAPayer.messages.length,
]);
verifier("trop ancienne (plus de 12 h) : on repart de zéro", c.relireSauvegarde(texte, LUNDI_10H + 13 * 3600_000), null);
verifier("illisible ou d'une autre version : on repart de zéro", [c.relireSauvegarde("{pas du json", LUNDI_10H), c.relireSauvegarde(texte.replace('"version":1', '"version":9'), LUNDI_10H), c.relireSauvegarde(null, LUNDI_10H)], [null, null, null]);
const rechargeEnvoi = c.relireSauvegarde(c.sauvegarder(pret, true, LUNDI_10H), LUNDI_10H + 1000);
verifier("rechargé pendant l'envoi de la réservation : on prévient, on revient au paiement", [rechargeEnvoi.etat.etape, rechargeEnvoi.etat.envoi], ["payer", null]);
const rechargeAttente = c.relireSauvegarde(c.sauvegarder(enAttente, true, LUNDI_10H), LUNDI_10H + 40 * 60_000);
verifier("attente de paiement plus vieille que la garde des vélos : expirée", rechargeAttente.etat.etape, "echec");
verifier("attente de paiement récente : le suivi reprend", c.relireSauvegarde(c.sauvegarder(enAttente, true, LUNDI_10H), LUNDI_10H + 60_000).etat.etape, "attente");
verifier("rechargé pendant l'envoi : l'avertissement porte l'heure de la relecture", rechargeEnvoi.etat.messages.at(-1).a, LUNDI_10H + 1000);

/* ------------------------------------------------ Comme sur un téléphone */

const h = await charger("src/lib/offres-groupe/heure-chat.ts");
const accueil = c.etatInitial(undefined, FAITS, LUNDI_10H);
verifier("accueil depuis la bulle : les trois sorties et leur présentation des réglages, puis la question", [
  accueil.etape,
  accueil.messages.length,
  accueil.messages[0].texte,
  accueil.messages[0].points.map((point: { titre: string }) => point.titre),
  accueil.messages[0].points.map((point: { texte: string }) => point.texte),
  accueil.messages[1].texte,
  accueil.prochainId,
], [
  "offre",
  2,
  "Bonjour ! Je calcule le prix de votre sortie en groupe et je la réserve avec vous, en quelques questions. Voici nos trois sorties :",
  ["Bike for All", "Road trip en groupe", "Gbashi Bike"],
  t.ORDRE_OFFRES.map((offreCode: string) => t.ligneDeLOffre(offreCode, R)),
  "Laquelle vous tente ?",
  3,
]);
verifier("les bulles de l'accueil portent l'heure de l'ouverture", accueil.messages.map((message: { a?: number }) => message.a), [LUNDI_10H, LUNDI_10H]);
const CINQ_MINUTES_PLUS_TARD = LUNDI_10H + 5 * 60_000;
const choisie = agir(accueil, { type: "choisir-offre", offre: "road-trip-groupe" }, CINQ_MINUTES_PLUS_TARD);
verifier("chaque nouvelle bulle porte l'heure de l'action, les anciennes gardent la leur", [
  choisie.messages.slice(0, 2).map((message: { a?: number }) => message.a),
  choisie.messages.length > 2,
  choisie.messages.slice(2).every((message: { a?: number }) => message.a === CINQ_MINUTES_PLUS_TARD),
], [[LUNDI_10H, LUNDI_10H], true, true]);
const sansHeures = { ...c.etatInitial(), messages: [{ id: 1, de: "bot", texte: "Bonjour, ancienne discussion." }] };
const apresSansHeures = agir(sansHeures, { type: "choisir-offre", offre: "bike-for-all" }, CINQ_MINUTES_PLUS_TARD);
verifier("une discussion rangée avant les heures : ses bulles restent sans heure, les nouvelles en ont une", [
  "a" in apresSansHeures.messages[0],
  apresSansHeures.messages.at(-1).a,
], [false, CINQ_MINUTES_PLUS_TARD]);
const UNE_MINUTE_APRES = CINQ_MINUTES_PLUS_TARD + 60_000;
const recommenceTel = agir(choisie, { type: "recommencer" }, UNE_MINUTE_APRES);
verifier("recommencer : les trois sorties de nouveau, à l'heure du clic", [
  recommenceTel.messages.length,
  recommenceTel.messages[0].texte,
  recommenceTel.messages[0].points.length,
  recommenceTel.messages[1].texte,
  recommenceTel.messages.map((message: { a?: number }) => message.a),
], [2, "On recommence ! Voici nos trois sorties :", 3, "Laquelle vous tente ?", [UNE_MINUTE_APRES, UNE_MINUTE_APRES]]);
const rangee = c.relireSauvegarde(c.sauvegarder(choisie, true, CINQ_MINUTES_PLUS_TARD), CINQ_MINUTES_PLUS_TARD + 1000);
verifier("rechargement : les heures et la liste des sorties reviennent", [
  rangee.etat.messages.map((message: { a?: number }) => message.a),
  rangee.etat.messages[0].points,
], [choisie.messages.map((message: { a?: number }) => message.a), choisie.messages[0].points]);
const abimee = JSON.parse(c.sauvegarder(choisie, true, CINQ_MINUTES_PLUS_TARD));
abimee.etat.messages.push(
  { id: 90, de: "bot", texte: "Heure abîmée", a: "midi" },
  { id: 91, de: "robot", texte: "Auteur inconnu" },
  null,
  { id: 92, de: "client", texte: "Liste abîmée", points: [{ titre: 3 }], ton: "rouge" },
);
verifier("bulles rangées abîmées : écartées, ou sans leur heure, leur liste ou leur ton", c.relireSauvegarde(JSON.stringify(abimee), CINQ_MINUTES_PLUS_TARD + 1000).etat.messages.slice(-2), [
  { id: 90, de: "bot", texte: "Heure abîmée" },
  { id: 92, de: "client", texte: "Liste abîmée" },
]);

// L'heure sous chaque bulle, à l'heure du Bénin ; le jour au-dessus.
verifier("l'heure d'une bulle, à l'heure du Bénin", [
  h.heureDuMessage(LUNDI_10H),
  h.heureDuMessage(heureBenin(LUNDI, "09:05")),
  h.heureDuMessage(heureBenin(LUNDI, "23:59")),
  h.heureDuMessage(heureBenin("2026-11-10", "00:30")),
  h.heureDuMessage(undefined),
  h.heureDuMessage(Number.NaN),
  h.heureDuMessage("10:00"),
], ["10:00", "09:05", "23:59", "00:30", null, null, null]);
verifier("le jour au-dessus des bulles", [
  h.jourDuMessage(LUNDI_10H, LUNDI_10H + 3600_000),
  h.jourDuMessage(heureBenin("2026-11-08", "23:30"), LUNDI_10H),
  h.jourDuMessage(heureBenin("2026-11-07", "12:00"), LUNDI_10H),
  h.jourDuMessage(undefined, LUNDI_10H),
], ["Aujourd'hui", "Hier", "Samedi 7 novembre", "Aujourd'hui"]);
verifier("deux bulles du même jour au Bénin (minuit à Cotonou, pas à Londres)", [
  h.memeJourAuBenin(heureBenin(LUNDI, "00:10"), heureBenin(LUNDI, "23:50")),
  h.memeJourAuBenin(heureBenin("2026-11-08", "23:50"), heureBenin(LUNDI, "00:10")),
  h.memeJourAuBenin(undefined, LUNDI_10H),
], [true, false, true]);

// Le nombre de personnes tapé dans la barre du bas.
const groupeBfa = agir(c.etatInitial(), { type: "choisir-offre", offre: "bike-for-all" });
const tropPeu = agir(groupeBfa, { type: "choisir-personnes", personnes: 4 });
verifier("4 personnes tapées pour Bike for All : leur bulle, le minimum rappelé, la question reste", [tropPeu.etape, tropPeu.choix.personnes, derniers(tropPeu, 2)], [
  "personnes",
  null,
  "4 personnes | Il faut au moins 10 personnes pour Bike for All, un vélo par personne. Vous serez combien ?",
]);
const tropNombreux = agir(groupeBfa, { type: "choisir-personnes", personnes: 25 });
verifier("25 personnes pour 18 vélos en état : on le dit, WhatsApp pour un groupe plus grand", [tropNombreux.etape, tropNombreux.choix.personnes, derniers(tropNombreux)], [
  "personnes",
  null,
  "Nous avons 18 vélos en état en ce moment, donc 18 personnes au plus. Pour un groupe plus grand, écrivez-nous sur WhatsApp. Vous serez combien ?",
]);
verifier("Gbashi Bike, 3 personnes (minimum 5) : corrigé aussi", derniers(agir(agir(c.etatInitial(), { type: "choisir-offre", offre: "gbashi-groupe" }), { type: "choisir-personnes", personnes: 3 })), "Il faut au moins 5 personnes pour Gbashi Bike, un vélo par personne. Vous serez combien ?");
verifier("un nombre correct après une correction : la discussion continue", agir(tropPeu, { type: "choisir-personnes", personnes: 12 }).etape, "date");

/* ------------------------------------------------ Le ton des textes */

const AVEC_INSECABLES = t.insecables("Quelle sortie vous tente ? C'est validé ! Prix : 11 250 F ; « Abonné(e) » 08:00");
verifier("typographie à l'affichage : espace insécable avant ? ! : ; » et après «, pas dans une heure", [
  AVEC_INSECABLES.includes("tente ?"),
  AVEC_INSECABLES.includes("validé !"),
  AVEC_INSECABLES.includes("Prix :"),
  AVEC_INSECABLES.includes("F ;"),
  AVEC_INSECABLES.includes("« Abonné(e) »"),
  AVEC_INSECABLES.includes("08:00"),
], [true, true, true, true, true, true]);

const textes = traverses.flatMap((etat) => [
  ...etat.messages.map((message: { texte: string }) => message.texte),
  ...etat.messages.flatMap((message: { points?: { titre: string; texte: string }[] }) => (message.points ?? []).flatMap((point) => [point.titre, point.texte])),
  ...etat.alternatives.map((alternative: { libelle: string }) => alternative.libelle),
]);
textes.push(
  ...t.ORDRE_OFFRES.map((offreCode: string) => t.ligneDeLOffre(offreCode, R)),
  t.consignesPreuve(),
  t.regleRetard(R),
  ...Object.values(t.QUESTIONS_CHAMPS as Record<string, string>),
  ...Object.values(t.CORRECTIONS_CHAMPS as Record<string, string>),
);
verifier("aucun tiret long dans les textes du chatbot", textes.filter((x: string) => /—|–|--/.test(x)), []);
verifier("montants écrits avec une espace : 11 250 F, jamais 11250 F", textes.filter((x: string) => /\d{4,} ?F\b/.test(x.replace(ESPACES_INSECABLES, " ").replace(/\d{1,3}( \d{3})+/g, "N"))), []);
verifier("aucune tournure d'assistant artificiel", textes.filter((x: string) => /en tant qu'|intelligence artificielle|je suis (un|votre) assistant|n'hésitez pas/i.test(x)), []);
verifier(`textes contrôlés (${textes.length})`, textes.length > 200, true);

if (echecs) {
  console.log(`\n${echecs} vérification(s) fausse(s).`);
  process.exit(1);
}
