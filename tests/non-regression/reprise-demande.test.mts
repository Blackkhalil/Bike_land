// La demande qui attend son paiement, gardée dans l'onglet (sessionStorage) :
// le client revenu de son application Mobile Money, l'onglet rechargé,
// retrouve « Reprendre ma demande » au lieu d'un formulaire vide (décision 27 :
// aucun email avant le paiement). Un faux navigateur suffit : un stockage
// en mémoire, puis un stockage qui refuse tout.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projet = fileURLToPath(new URL("../../", import.meta.url));
const charger = (f: string) => import(pathToFileURL(join(projet, f)).href);
const D = await charger("src/lib/demande-en-attente.ts");

let echecs = 0;
const verifier = (nom: string, obtenu: unknown, attendu: unknown) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK  " : "FAUX"} ${nom}${ok ? "" : ` : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`}`);
};

console.log("\n— Hors navigateur : rien, sans erreur");
verifier("aucune demande gardée", D.texteDemandeEnAttente(), null);
D.retenirDemande({ reference: "BL-T2K9QX", token: "BL-T2K9QX.abc.def", expireLe: Date.now() + 60_000 });
D.oublierDemande();
verifier("garder et oublier ne lèvent rien", D.texteDemandeEnAttente(), null);

console.log("\n— Dans un onglet");
const memoire = new Map<string, string>();
const evenements: string[] = [];
(globalThis as Record<string, unknown>).window = {
  sessionStorage: {
    getItem: (cle: string) => memoire.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void memoire.set(cle, valeur),
    removeItem: (cle: string) => void memoire.delete(cle),
  },
  dispatchEvent: (evenement: Event) => {
    evenements.push(evenement.type);
    return true;
  },
};
const demande = { reference: "BL-T2K9QX", token: "BL-T2K9QX.x_y-z.Abc_123-d", expireLe: Date.now() + 10 * 60_000 };
D.retenirDemande(demande);
verifier("gardée, et l'onglet est prévenu", [D.lireDemande(D.texteDemandeEnAttente()), evenements.at(-1)], [demande, D.EVENEMENT_DEMANDE_EN_ATTENTE]);
verifier("la même valeur d'un rendu à l'autre (React la compare)", D.texteDemandeEnAttente() === D.texteDemandeEnAttente(), true);
verifier("passé son délai : plus rien à reprendre", D.texteDemandeEnAttente(demande.expireLe + 1), null);
D.oublierDemande("BL-TAUTRE");
verifier("oublier une autre demande ne l'efface pas", D.lireDemande(D.texteDemandeEnAttente())?.reference, "BL-T2K9QX");
D.oublierDemande("BL-T2K9QX");
verifier("oubliée une fois payée", D.texteDemandeEnAttente(), null);

console.log("\n— Ce qui ne se garde pas");
D.retenirDemande({ reference: "BL-T2K9QX", token: "javascript:alert(1)", expireLe: Date.now() + 60_000 });
verifier("un jeton qui n'en est pas un : refusé", D.texteDemandeEnAttente(), null);
D.retenirDemande({ reference: "BL-T2K9QX", token: "BL-TAUTRE.abc.def", expireLe: Date.now() + 60_000 });
verifier("le jeton d'une autre référence : refusé", D.texteDemandeEnAttente(), null);
memoire.set(D.CLE_DEMANDE_EN_ATTENTE, "{pas du json");
verifier("un texte abîmé se lit comme rien", [D.texteDemandeEnAttente(), D.lireDemande("{pas du json")], [null, null]);

console.log("\n— Un navigateur qui refuse le stockage (navigation privée)");
(globalThis as Record<string, unknown>).window = {
  get sessionStorage(): Storage {
    throw new Error("SecurityError");
  },
  dispatchEvent: () => true,
};
D.retenirDemande(demande);
D.oublierDemande();
verifier("rien ne lève, rien n'est gardé : la réservation reste possible", D.texteDemandeEnAttente(), null);

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
