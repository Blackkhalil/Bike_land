"use client";

/**
 * Ouverture de la fenêtre de paiement KkiaPay.
 *
 * KkiaPay s'intègre par un script qui installe des fonctions globales sur
 * `window`. Deux pièges, contournés ici :
 *
 *  1. **Les écouteurs s'empilent.** `addSuccessListener` ajoute un
 *     écouteur à chaque appel, sans jamais remplacer le précédent. Un
 *     client qui réessaie après un échec déclencherait donc deux, puis
 *     trois confirmations pour un seul paiement. On ne les pose qu'une
 *     fois par page, et on dirige l'événement vers le paiement en cours.
 *
 *  2. **Aucun événement de fermeture n'est documenté.** Si le client
 *     ferme la fenêtre sans payer, rien ne revient. L'interface ne doit
 *     donc jamais rester bloquée sur « paiement en cours » : d'où des
 *     rappels plutôt qu'une promesse, et un bouton pour rouvrir.
 *
 * La clé transmise ici est la clé **publique**, faite pour être lue par
 * le navigateur. Les clés privée et secrète ne quittent jamais le serveur,
 * qui est seul à vérifier la transaction auprès de KkiaPay.
 */

export interface ConfigurationWidget {
  clePublique: string;
  sandbox: boolean;
  montantXof: number;
  reference: string;
  methodes: string[];
  nom: string;
  email: string;
  telephone?: string;
}

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void;
    addSuccessListener?: (rappel: (reponse: { transactionId?: string }) => void) => void;
    addFailedListener?: (rappel: (erreur: unknown) => void) => void;
  }
}

const URL_SCRIPT = "https://cdn.kkiapay.me/k.js";

let chargement: Promise<void> | null = null;

function chargerScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Hors navigateur."));
  if (window.openKkiapayWidget) return Promise.resolve();

  chargement ??= new Promise<void>((resoudre, rejeter) => {
    const existant = document.querySelector<HTMLScriptElement>(`script[src="${URL_SCRIPT}"]`);
    const balise = existant ?? document.createElement("script");

    balise.addEventListener("load", () => resoudre());
    balise.addEventListener("error", () => {
      // Le prochain essai doit pouvoir retenter le chargement.
      chargement = null;
      rejeter(new Error("Le script de paiement n'a pas pu être chargé."));
    });

    if (!existant) {
      balise.src = URL_SCRIPT;
      balise.async = true;
      document.head.appendChild(balise);
    }
  });

  return chargement;
}

interface Rappels {
  onSucces: (transactionId: string) => void;
  onEchec: (message: string) => void;
}

let ecouteursPoses = false;
let paiementEnCours: Rappels | null = null;

function poserEcouteurs() {
  if (ecouteursPoses) return;

  window.addSuccessListener?.((reponse) => {
    const rappels = paiementEnCours;
    paiementEnCours = null;
    if (!rappels) return;

    const transactionId = reponse?.transactionId;
    if (typeof transactionId === "string" && transactionId.length > 0) {
      rappels.onSucces(transactionId);
    } else {
      // Paiement peut-être passé, mais sans identifiant exploitable : le
      // webhook prendra le relais, on ne dit surtout pas « échec ».
      rappels.onEchec(
        "Paiement reçu sans identifiant. Rechargez la page dans une minute : " +
          "votre réservation sera confirmée automatiquement.",
      );
    }
  });

  window.addFailedListener?.(() => {
    const rappels = paiementEnCours;
    paiementEnCours = null;
    rappels?.onEchec("Le paiement n'a pas abouti. Vous pouvez réessayer.");
  });

  ecouteursPoses = true;
}

export async function ouvrirPaiementKkiapay(
  configuration: ConfigurationWidget,
  rappels: Rappels,
): Promise<void> {
  try {
    await chargerScript();
  } catch {
    rappels.onEchec(
      "Impossible de charger la fenêtre de paiement. Vérifiez votre connexion et réessayez.",
    );
    return;
  }

  poserEcouteurs();
  paiementEnCours = rappels;

  window.openKkiapayWidget?.({
    amount: configuration.montantXof,
    key: configuration.clePublique,
    sandbox: configuration.sandbox,
    // Notre référence de réservation : KkiaPay nous la renvoie, et le
    // serveur vérifie qu'elle correspond bien avant de confirmer.
    partnerId: configuration.reference,
    data: configuration.reference,
    paymentmethod: configuration.methodes,
    countries: ["BJ"],
    position: "center",
    theme: "#f25c05",
    name: configuration.nom,
    email: configuration.email,
    ...(configuration.telephone ? { phone: configuration.telephone } : {}),
  });
}
