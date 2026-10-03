import type { Metadata } from "next";

import { Pastille } from "@/components/ui";
import { depot } from "@/lib/db";
import { formatDate, formatNombre } from "@/lib/format";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Messages de contact" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

/**
 * Les messages reçus par le formulaire de contact.
 *
 * Chaque message part aussi par email vers la boîte de Bike Land, avec
 * l'adresse du visiteur en `replyTo` : répondre depuis la boîte suffit,
 * et c'est la voie normale. Cet écran sert à autre chose, retrouver un
 * message ancien, vérifier qu'une demande est bien arrivée quand
 * quelqu'un appelle pour s'en assurer, ou relire une question après
 * avoir vidé sa boîte.
 *
 * Il existait un trou avant cette page : les messages étaient enregistrés
 * en base, l'email de notification pointait vers `/admin/messages`, et
 * cette adresse ne menait nulle part. Les messages étaient donc écrits
 * sans que rien ne permette de les relire.
 *
 * Le message est affiché en entier, sans repli. Un formulaire de contact
 * reçoit quelques messages par semaine, pas des milliers : les tronquer
 * obligerait à cliquer pour lire ce qui tient à l'écran.
 */
export default async function PageMessagesAdmin({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;
  const recherche = typeof parametres.q === "string" ? parametres.q.trim().toLowerCase() : "";

  const messages = await depot.listerMessagesContact();

  const retenus = messages
    .filter((message) =>
      recherche
        ? `${message.nom} ${message.email} ${message.sujet} ${message.message}`
            .toLowerCase()
            .includes(recherche)
        : true,
    )
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiquette opacity-75">Exploitation</p>
          <h1 className="titre-editorial mt-3 text-[2rem]">Messages de contact</h1>
          <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
            {formatNombre(messages.length)}{" "}
            {messages.length > 1 ? "messages reçus" : "message reçu"} par le formulaire du site.
            Chacun est aussi arrivé dans la boîte {site.email}, d&apos;où vous pouvez répondre
            directement au visiteur.
          </p>
        </div>

        <form method="get" className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom, email ou mot du message"
            aria-label="Rechercher un message"
            className="h-9 min-w-0 flex-1 rounded-full border border-noir-piste/20 px-4 text-[0.85rem] sm:w-64 sm:flex-none"
          />
          <button
            type="submit"
            className="h-9 rounded-full bg-noir-piste px-5 text-[0.82rem] font-semibold text-craie"
          >
            Chercher
          </button>
        </form>
      </header>

      <div className="mt-8 grid gap-4">
        {retenus.map((message) => (
          <article
            key={message.id}
            className="rounded-[var(--radius-carte)] bg-white p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[1.05rem] font-bold uppercase leading-tight">
                  {message.sujet}
                </h2>
                <p className="mt-2 text-[0.85rem] text-gris-cadre">
                  {message.nom}
                  {" · "}
                  <a href={`mailto:${message.email}`} className="lien-souligne cible-elargie break-all">
                    {message.email}
                  </a>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[0.8rem] text-gris-cadre">{formatDate(message.creeLe)}</span>
                {message.traiteLe ? (
                  <Pastille ton="succes">Traité</Pastille>
                ) : (
                  <Pastille ton="neutre">À traiter</Pastille>
                )}
              </div>
            </div>

            <p className="mt-4 whitespace-pre-line border-t border-noir-piste/12 pt-4 text-[0.9rem] leading-relaxed">
              {message.message}
            </p>

            <a
              href={`mailto:${message.email}?subject=${encodeURIComponent(`Re : ${message.sujet}`)}`}
              className="mt-5 inline-block rounded-[var(--radius-bouton)] border border-noir-piste/25 px-5 py-2.5 text-[0.85rem] font-semibold transition-colors hover:bg-noir-piste/5"
            >
              Répondre à {message.nom}
            </a>
          </article>
        ))}
      </div>

      {retenus.length === 0 && (
        <p className="mt-8 rounded-[var(--radius-carte)] bg-white py-12 text-center text-[0.9rem] text-gris-cadre">
          {recherche
            ? "Aucun message ne correspond à cette recherche."
            : "Aucun message pour le moment."}
        </p>
      )}

      <p className="mt-6 rounded-[var(--radius-carte)] border border-noir-piste/12 p-6 text-[0.85rem] leading-relaxed text-gris-cadre">
        Ces messages contiennent des données personnelles. Ils sont conservés le temps de traiter
        la demande, puis supprimés. Toute demande de suppression reçue à l&apos;adresse de contact
        doit être traitée sous trente jours, conformément à la réglementation béninoise sur les
        données à caractère personnel.
      </p>
    </div>
  );
}
