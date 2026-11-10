"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Bandeau discret affiché sur le site public quand une session
 * d'exploitation est ouverte.
 *
 * Il répond à un besoin simple : voir exactement ce que voit le client,
 * et sauter à l'écran de gestion correspondant sans repasser par le
 * tableau de bord.
 *
 * **Composant client, et c'est délibéré.** Il lisait auparavant le
 * cookie de session côté serveur, depuis la mise en page du site. Or
 * lire un cookie pendant le rendu rend la page dynamique : Next devait
 * alors reconstruire **chaque** page à **chaque** visite, y compris
 * celles qui ne consultent aucune donnée. Mesuré sur un build de
 * production, le site s'effondrait à soixante visiteurs simultanés,
 * cinquante et une requêtes sur soixante en erreur, le pool de
 * connexions PostgreSQL épuisé.
 *
 * En déplaçant la question dans une requête du navigateur, les pages
 * publiques redeviennent cachables. Le visiteur ordinaire paie une
 * requête minuscule qui répond « non » et n'affiche rien ; l'exploitant
 * voit son bandeau apparaître une fraction de seconde après la page.
 */
export function BandeauAdmin() {
  const [ouverte, setOuverte] = useState(false);

  useEffect(() => {
    let vivant = true;
    // Un échec ne se signale pas : l'absence de bandeau est le
    // comportement normal pour l'immense majorité des visiteurs.
    fetch("/api/admin/session")
      .then((reponse) => (reponse.ok ? reponse.json() : { ouverte: false }))
      .then((donnees) => {
        if (vivant) setOuverte(Boolean(donnees.ouverte));
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  if (!ouverte) return null;

  return (
    <div data-evite-bulle className="fixed inset-x-0 bottom-0 z-[60] border-t border-orange-signal/40 bg-noir-releve/95 px-4 py-2.5 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[0.82rem] text-craie">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-orange-signal" />
          Vous naviguez en tant qu&apos;exploitant
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/admin/aujourdhui" className="lien-souligne cible-elargie font-semibold">
            La sortie du jour
          </Link>
          <Link href="/admin/velos" className="lien-souligne cible-elargie font-semibold">
            Gérer le parc
          </Link>
          <Link href="/admin" className="lien-souligne cible-elargie font-semibold text-orange-signal">
            Tableau de bord
          </Link>
        </span>
      </div>
    </div>
  );
}
