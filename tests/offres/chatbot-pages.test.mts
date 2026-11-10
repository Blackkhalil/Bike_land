// Le chatbot des offres de groupe côté pages, en démonstration (aucune base
// réelle, aucun email, aucun paiement) : la bulle n'est rendue qu'avec
// l'interrupteur ouvert et des réglages lisibles ; le lien de l'email
// (/?reserver-en-groupe=<offre>&preuve=<id>) ; les conditions générales et la
// page des données personnelles, interrupteur coupé ou ouvert, agent IA
// activé ou non (décision 21), rendues sans base réelle.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const nom of ["DATABASE_URL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "SASPAY_API_KEY", "ANTHROPIC_API_KEY"]) {
  delete process.env[nom];
}
const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const { renderToStaticMarkup } = await import("react-dom/server");
const { depot } = await charger("src/lib/db/index.ts");
const vitrine = await charger("src/lib/offres-groupe/vitrine.ts");
const lien = await charger("src/lib/offres-groupe/ouverture-chat.ts");
const { CLE_REGLAGES_OFFRES, CODE_INTERRUPTEUR_OFFRES, REGLAGES_OFFRES_PAR_DEFAUT } = await charger("src/data/reglages-offres.ts");
const cgv = await charger("src/app/(site)/cgv/page.tsx");
const donnees = await charger("src/app/(site)/donnees-personnelles/page.tsx");

let echecs = 0;
const ESPACES_INSECABLES = new RegExp("[\\u00a0\\u202f]", "g");
const normaliser = (v: unknown) => JSON.stringify(v)?.replace(ESPACES_INSECABLES, " ");
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = normaliser(obtenu) === normaliser(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${normaliser(obtenu)} au lieu de ${normaliser(attendu)}`}`);
};
/** Le texte d'une page rendue, sans balises, espaces insécables lues comme des espaces. */
const texte = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(ESPACES_INSECABLES, " ")
    .replace(/\s+/g, " ");
const rendreCgv = async () => texte(renderToStaticMarkup(await cgv.default()));
const rendreDonnees = () => texte(renderToStaticMarkup(donnees.default()));

/* ------------------------------------------------ La bulle et l'interrupteur */

verifier("interrupteur coupé par défaut : pas de chatbot, pas d'offre en vente", [
  await vitrine.faitsDuChat(),
  await vitrine.offresGroupeEnVente(),
  await vitrine.interrupteurOffresGroupeOuvert(),
], [null, null, false]);

await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, true);
const faits = await vitrine.faitsDuChat();
verifier("interrupteur ouvert : le chatbot reçoit les réglages et le parc en état", [
  faits?.reglages.roadTrip.prixPersonneXof,
  faits?.velosEnEtat > 0,
  faits ? faits.parGamme.CLASSIQUE + faits.parGamme.PREMIUM + faits.parGamme.PRESTIGE : null,
], [REGLAGES_OFFRES_PAR_DEFAUT.roadTrip.prixPersonneXof, true, faits?.velosEnEtat]);
const parc = await depot.listerVelos();
verifier("le parc en état exclut l'atelier et les vélos retirés", faits?.velosEnEtat, parc.filter((v: { statut: string }) => v.statut !== "MAINTENANCE" && v.statut !== "RETIRE").length);

await depot.ecrireParametreAdmin(CLE_REGLAGES_OFFRES, "{pas du json");
verifier("réglages illisibles : jamais de vente aux valeurs par défaut, la bulle reste cachée", [
  await vitrine.faitsDuChat(),
  await vitrine.offresGroupeEnVente(),
  await vitrine.interrupteurOffresGroupeOuvert(),
], [null, null, true]);
await depot.effacerParametreAdmin(CLE_REGLAGES_OFFRES);

/* ------------------------------------------------ Le lien de l'email */

verifier("le lien de l'email après une vérification à la main", lien.lienChatGroupe("road-trip-groupe", "pr_9"), "/?reserver-en-groupe=road-trip-groupe&preuve=pr_9");
verifier("l'adresse ouvre le chatbot sur l'offre, avec la preuve", lien.demandeDeLAdresse("?reserver-en-groupe=road-trip-groupe&preuve=pr_9&utm=x"), {
  offre: "road-trip-groupe",
  preuveId: "pr_9",
});
verifier("une offre inconnue ou une preuve illisible sont ignorées", [
  lien.demandeDeLAdresse("?reserver-en-groupe=velo-magique&preuve=<script>"),
  lien.demandeDeLAdresse("?autre=1"),
  lien.demandeDeLAdresse("?reserver-en-groupe="),
], [{}, null, {}]);
verifier("les paramètres du chatbot quittent l'adresse, le reste demeure", lien.adresseSansChat("/produits", "?reserver-en-groupe=gbashi-groupe&preuve=p&utm=x", "#gbashi-bike"), "/produits?utm=x#gbashi-bike");
verifier("un bouton de page ouvre sans adresse : un lien relatif à la page", lien.lienChatGroupe("gbashi-groupe", undefined, ""), "?reserver-en-groupe=gbashi-groupe");

/* ------------------------------------------------ Les conditions générales */

await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, false);
let page = await rendreCgv();
verifier("CGV, interrupteur coupé : les textes d'avant, sans article 12", [
  page.includes("Article 12"),
  page.includes("Aucun autre supplément n'est appliqué."),
  page.includes("se commande sur WhatsApp"),
  page.includes("intelligence artificielle"),
], [false, true, true, false]);

await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, true);
page = await rendreCgv();
verifier("CGV, interrupteur ouvert : article 12, article 3 corrigé, Gbashi sur réservation", [
  page.includes("Article 12. Conditions particulières des offres de groupe"),
  page.includes("Aucun autre supplément n'est appliqué, sauf, pour les offres de groupe, les frais de paiement électronique décrits à l'article 12."),
  page.includes("se réserve en ligne uniquement sur réservation"),
  page.includes("se commande sur WhatsApp"),
], [true, true, true, false]);
verifier("CGV : les preuves de la réduction, la story sur Instagram seulement", page.includes(
  "au choix : le profil Instagram @bikeland_bj, avec « Abonné(e) » et votre nom d'utilisateur, le profil TikTok @bikelandbj, avec « Abonné(e) » et votre nom d'utilisateur ou votre story Instagram qui identifie @bikeland_bj.",
), true);
verifier("CGV, agent IA pas activé : vérification à la main, pas un mot d'IA", [page.includes("intelligence artificielle"), page.includes("Notre équipe vérifie chaque capture à la main")], [false, true]);
verifier("CGV : les chiffres des réglages (frais de paiement, retard)", [page.includes("de 125 FCFA par personne"), page.includes("1 000 FCFA par minute")], [true, true]);
process.env.ANTHROPIC_API_KEY = "cle-de-test-factice";
page = await rendreCgv();
verifier("CGV, agent IA activé : la vérification automatique est annoncée", page.includes("vérifiée automatiquement par un assistant d'intelligence artificielle"), true);
delete process.env.ANTHROPIC_API_KEY;
const metaCgv = await cgv.generateMetadata();
verifier("CGV : la description parle des offres de groupe seulement interrupteur ouvert", String(metaCgv.description).includes("offres de groupe"), true);
await depot.reglerCreneau(CODE_INTERRUPTEUR_OFFRES, false);
verifier("CGV : interrupteur coupé, description d'avant", String((await cgv.generateMetadata()).description).includes("offres de groupe"), false);

/* ------------------------------------------------ Les données personnelles */

page = rendreDonnees();
verifier("données personnelles, agent IA pas activé : ni Anthropic ni IA", [page.includes("Anthropic"), page.includes("intelligence artificielle"), page.includes("assistant d'IA")], [false, false, false]);
verifier("la capture vérifiée à la main, stockage privé, supprimée dès la décision, 30 jours au plus", [
  page.includes("vérifiée à la main par l'équipe de Bike Land"),
  page.includes("espace de stockage privé"),
  page.includes("supprimée dès que la décision est prise, et au plus tard 30 jours après son envoi"),
], [true, true, true]);
verifier("la discussion du chatbot gardée dans le navigateur, le temps de la visite", page.includes("le temps de votre visite, coordonnées comprises"), true);
verifier("description sans IA", String(donnees.generateMetadata().description).includes("IA"), false);
process.env.ANTHROPIC_API_KEY = "cle-de-test-factice";
page = rendreDonnees();
verifier("données personnelles, agent IA activé : le paragraphe Anthropic revient", [page.includes("Anthropic"), page.includes("Assistant d'intelligence artificielle (offres de groupe)")], [true, true]);
verifier("description avec l'IA", String(donnees.generateMetadata().description).includes("assistant d'IA"), true);
verifier("la clé n'apparaît jamais dans la page", page.includes("cle-de-test-factice"), false);
delete process.env.ANTHROPIC_API_KEY;

const tirets = [await rendreCgv(), rendreDonnees()].filter((x) => /—|–/.test(x));
verifier("aucun tiret long dans les pages légales", tirets.length, 0);

if (echecs) {
  console.log(`\n${echecs} vérification(s) fausse(s).`);
  process.exit(1);
}
