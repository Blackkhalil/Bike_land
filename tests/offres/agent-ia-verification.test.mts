// Le contrôle du texte de l'agent IA (src/lib/agent-ia/verification.ts),
// avant tout envoi au client : chaque montant vient du calcul, chaque autre
// nombre des faits, aucun nombre en lettres, aucun tiret long, ni texte vide
// ou trop long. Le cas pris est le cas 2 du suivi : Bike for All, 10
// personnes, 10 000 F de budget, petit coco, 45 minutes, 11 250 F au lieu de
// 17 250 F.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const v = await charger("src/lib/agent-ia/verification.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

type Lu = { genre: string; valeur: number };
const lus = (texte: string) => (v.lireNombres(texte) as Lu[]).map((n) => [n.genre, n.valeur]);
type Verification = { ok: boolean; motif?: string; detail?: string };
const controle = (texte: string, attendus = ATTENDUS) => {
  const r = v.verifierTexteIa(texte, attendus) as Verification;
  return r.ok ? "ok" : r.motif;
};

const FAITS = [
  { libelle: "Total à payer", valeur: "11 250 F", obligatoire: true },
  { libelle: "Prix sans l'offre", valeur: "17 250 F" },
  { libelle: "Personnes", valeur: "10" },
  { libelle: "Date", valeur: "samedi 21 novembre 2026" },
  { libelle: "Horaires", valeur: "de 8 h à 8 h 45" },
  { libelle: "Durée de vélo", valeur: "45 minutes" },
  { libelle: "Cocos", valeur: "petit format, 1 par personne" },
  { libelle: "Paiement électronique", valeur: "1 250 F" },
  { libelle: "Retard", valeur: "7 minutes de tolérance, puis 1 000 F par minute pour tout le groupe", obligatoire: true },
];
const MODELE =
  "BIKE FOR ALL : Cher client, pour votre groupe de 10 personnes, vous paierez 11 250 F au lieu de 17 250 F, " +
  "pour 45 minutes de vélo de 08h00 à 08h45. Vous profitez de toute notre gamme de vélos (Classique, Premium, " +
  "Prestige) et de nos casques. Vous aurez 10 cocos petit format inclus dans le prix, à raison de 1 par personne." +
  "\n\nLe retour des vélos doit être expressément respecté. Vous avez une marge de retard de 7 minutes ; au-delà, " +
  "le groupe paiera 1 000 F par minute.\n\nMerci de faire confiance à Bike Land !";
const ATTENDUS = { totalXof: 11250, montantsXof: [11250, 17250, 1250, 1000], faits: FAITS, texteModele: MODELE };
const BON =
  "Bonjour Awa,\n\nMerci pour votre réservation Bike for All du samedi 21 novembre 2026 ! Votre groupe de 10 " +
  "personnes roulera 45 minutes, de 8 h à 8 h 45, avec toute notre gamme de vélos et nos casques. Un petit coco " +
  "par personne est compris.\n\nLe total à payer est de 11 250 F au lieu de 17 250 F. Merci de rendre les vélos à " +
  "l'heure : vous avez 7 minutes de marge, puis le groupe paie 1 000 F par minute de retard.\n\nMerci de votre " +
  "confiance, à très vite chez Bike Land !";

console.log("\n— Lecture des montants sous toutes leurs formes");
verifier("espace simple : 11 250 F", lus("11 250 F"), [["montant", 11250]]);
verifier("espace insécable et FCFA : 11 250 FCFA", lus("11 250 FCFA"), [["montant", 11250]]);
verifier("espace fine insécable, comme Intl fr-FR", lus(`${new Intl.NumberFormat("fr-FR").format(11250)} F`), [["montant", 11250]]);
verifier("collé : 11250F", lus("11250F"), [["montant", 11250]]);
verifier("point des milliers : 11.250 F", lus("11.250 F"), [["montant", 11250]]);
verifier("virgule des milliers : 11,250 francs", lus("11,250 francs"), [["montant", 11250]]);
verifier("F CFA en deux mots", lus("11 250 F CFA."), [["montant", 11250]]);
verifier("sans unité : un simple nombre", lus("11 250"), [["nombre", 11250]]);
verifier("collé à un point : lu quand même", lus("10 personnes.15000 F"), [["nombre", 10], ["montant", 15000]]);
verifier("caractère invisible au milieu : lu comme un seul nombre", lus("11​250 F"), [["montant", 11250]]);
verifier("décimal : 1,5 reste 1,5", lus("1,5 heure"), [["nombre", 1.5]]);
verifier("heures : 8 h, 08h00, 8 h 45, 08:45", lus("8 h, 08h00, 8 h 45, 08:45"), [["heure", 480], ["heure", 480], ["heure", 525], ["heure", 525]]);
verifier("« 8 heures » et « 10 hommes » ne sont pas des heures", lus("8 heures, 10 hommes"), [["nombre", 8], ["nombre", 10]]);
verifier("« 10 Fidjrossè » n'est pas un montant", lus("10 Fidjrossè"), [["nombre", 10]]);

console.log("\n— Textes acceptés");
verifier("le bon texte passe", controle(BON), "ok");
verifier(
  "montants écrits avec l'espace fine d'Intl : passent",
  controle(BON.replace("11 250 F", "11 250 F").replace("17 250 F", "17 250 FCFA")),
  "ok",
);
verifier("heures écrites autrement (08h00 à 08h45) : passent", controle(BON.replace("de 8 h à 8 h 45", "de 08h00 à 08h45")), "ok");
verifier("un nombre absent des faits et du texte modèle (25 km) : refusé", controle(`${BON} Balade de 25 km.`), "montant-inconnu");
verifier(
  "un nombre du texte modèle seulement (10 cocos) : admis, il vient du même calcul",
  controle(BON.replace("Un petit coco par personne est compris.", "Vos 10 cocos petit format sont compris.")),
  "ok",
);
verifier("« un » et « une » restent permis : ce sont des articles", controle(BON.replace("Un petit coco", "Une boisson et un petit coco")), "ok");

console.log("\n— Montants et nombres qui ne viennent pas du calcul");
verifier("faux total : 11 500 F", controle(BON.replace("11 250 F", "11 500 F")), "montant-inconnu");
verifier("montant inventé ajouté : 500 F", controle(BON.replace("compris.", "compris pour 500 F.")), "montant-inconnu");
verifier("nombre inconnu : 12 personnes", controle(BON.replace("10 personnes", "12 personnes")), "montant-inconnu");
verifier("heure inconnue : 9 h", controle(BON.replace("de 8 h à", "de 9 h à")), "montant-inconnu");
verifier("total absent", controle(BON.replace("Le total à payer est de 11 250 F au lieu de 17 250 F.", "Le prix normal est de 17 250 F.")), "montant-inconnu");
verifier(
  "règle de retard (fait obligatoire) oubliée",
  controle(BON.replace(" Merci de rendre les vélos à l'heure : vous avez 7 minutes de marge, puis le groupe paie 1 000 F par minute de retard.", "")),
  "montant-inconnu",
);
verifier(
  "pénalité donnée sans son unité : refusée",
  controle(BON.replace("1 000 F par minute de retard", "1 000 par minute de retard")),
  "montant-inconnu",
);
verifier("total collé à un point, faux : 15000 F", controle(BON.replace("compris.", "compris.15000 F")), "montant-inconnu");

console.log("\n— Nombres en lettres");
verifier("« dix personnes »", controle(BON.replace("10 personnes", "dix personnes")), "format");
verifier("« onze mille deux cent cinquante francs »", controle(`${BON} Soit onze mille deux cent cinquante francs.`), "format");
verifier("« deux cents »", controle(`${BON} Deux cents mercis.`), "format");
verifier("« une demi-heure »", controle(BON.replace("45 minutes", "une demi-heure")), "format");
verifier("« le deuxième groupe »", controle(`${BON} Vous êtes le deuxième groupe.`), "format");
verifier("chiffres d'une autre écriture : « ½ »", controle(`${BON} ½`), "format");
verifier("chiffres pleine chasse : « １０ »", controle(BON.replace("10 personnes", "１０ personnes")), "format");

console.log("\n— Forme");
verifier("tiret long « — »", controle(BON.replace("Bonjour Awa,", "Bonjour Awa —")), "format");
verifier("tiret demi-cadratin « – »", controle(BON.replace("Bonjour Awa,", "Bonjour Awa –")), "format");
verifier("double tiret « -- »", controle(BON.replace("Bonjour Awa,", "Bonjour Awa --")), "format");
verifier("texte vide", controle("   "), "format");
verifier("texte trop court", controle("Total 11 250 F."), "format");
verifier("texte trop long", controle(`${BON} ${"Merci encore. ".repeat(120)}`), "format");
verifier("lien", controle(`${BON} Voir https://bike-land.vercel.app.`), "format");
verifier("adresse ou nom de compte (@)", controle(`${BON} Suivez @bikeland_bj.`), "format");
verifier("modèle à trous oublié : {total}", controle(BON.replace("11 250 F au lieu", "{total} F, soit 11 250 F au lieu")), "format");
verifier("mise en forme Markdown", controle(BON.replace("Le total", "**Le total**")), "format");
verifier("emoji", controle(`${BON} \u{1F6B2}`), "format");

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
