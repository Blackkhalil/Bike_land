import Link from "next/link";

import { sessionAdminValide } from "@/lib/admin";

/**
 * Bandeau discret affiché sur le site public quand une session
 * d'exploitation est ouverte.
 *
 * Il répond à un besoin simple : voir exactement ce que voit le client,
 * et sauter à l'écran de gestion correspondant sans repasser par le
 * tableau de bord.
 *
 * C'est un composant serveur, et la session est vérifiée côté serveur :
 * un visiteur non connecté ne reçoit tout simplement pas ce balisage,
 * il n'est pas seulement masqué en CSS.
 */
export async function BandeauAdmin() {
  if (!(await sessionAdminValide())) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-orange-signal/40 bg-noir-releve/95 px-4 py-2.5 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[0.82rem] text-craie">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-orange-signal" />
          Vous naviguez en tant qu&apos;exploitant
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/admin/aujourdhui" className="lien-souligne font-semibold">
            La sortie du jour
          </Link>
          <Link href="/admin/velos" className="lien-souligne font-semibold">
            Gérer le parc
          </Link>
          <Link href="/admin" className="lien-souligne font-semibold text-orange-signal">
            Tableau de bord
          </Link>
        </span>
      </div>
    </div>
  );
}
