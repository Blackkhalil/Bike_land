"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * La mesure d'audience, enveloppée pour respecter deux choses.
 *
 * **« Ne pas me pister ».** Vercel Web Analytics ne regarde pas ce
 * réglage : vérifié dans le paquet, aucune mention de `doNotTrack`. Un
 * visiteur qui a pris la peine de l'activer est pourtant explicite, et
 * la page sur les données personnelles lui promet qu'on l'écoute. Le
 * filtre ci-dessous tient cette promesse, ce que la bibliothèque seule
 * ne ferait pas.
 *
 * **L'espace d'exploitation.** Les pages `/admin` ne sont pas du trafic
 * de visiteurs : ce sont les allées et venues de l'exploitant dans son
 * propre outil. Les compter gonflerait les chiffres de pages que
 * personne ne consulte de l'extérieur, et rendrait la mesure inutile
 * pour décider quoi que ce soit.
 *
 * Les jetons de suivi de réservation sont aussi effacés de l'adresse
 * mesurée. Un lien `/reservation/BL-XXXX.signature` vaut mot de passe :
 * il n'a rien à faire dans un tableau de statistiques, même chez notre
 * hébergeur.
 */
export function MesureAudience() {
  return (
    <Analytics
      beforeSend={(evenement) => {
        if (typeof window !== "undefined") {
          const navigateur = window.navigator as Navigator & { msDoNotTrack?: string };
          const refus =
            navigateur.doNotTrack === "1" ||
            navigateur.msDoNotTrack === "1" ||
            (window as Window & { doNotTrack?: string }).doNotTrack === "1";
          if (refus) return null;
        }

        if (evenement.url.includes("/admin")) return null;

        // Le jeton est remplacé, pas la page : on garde l'information
        // « quelqu'un a consulté une réservation », on jette laquelle.
        const anonyme = evenement.url.replace(
          /\/reservation\/[^/?#]+/,
          "/reservation/[jeton]",
        );
        return { ...evenement, url: anonyme };
      }}
    />
  );
}
