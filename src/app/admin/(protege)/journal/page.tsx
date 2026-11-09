import type { Metadata } from "next";
import Link from "next/link";

import { exigerSessionAdmin } from "@/lib/admin";
import { dateAuBenin } from "@/lib/dates";
import { depot } from "@/lib/db";
import { formatDateComplete, formatHeureAuBenin } from "@/lib/format";
import { libelleEvenement, prenomDeAuteur, resumeEvenement, TYPES_EVENEMENT } from "@/lib/journal";
import type { EvenementJournal } from "@/lib/types";

export const metadata: Metadata = { title: "Journal" };

type Recherche = Promise<Record<string, string | string[] | undefined>>;

/** Combien d'événements l'écran montre au plus. */
const LIMITE = 200;

/** « Lundi 9 novembre 2026 » en tête de journée. */
function jourAvecMajuscule(date: string): string {
  const texte = formatDateComplete(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Le journal des événements : ce qui a été fait dans l'administration et
 * autour des offres de groupe, par qui et quand. Réglages des offres
 * changés (avec l'avant et l'après), interrupteur, vélos indisponibles,
 * retards, remboursements. Rien ne s'y modifie ni ne s'y efface : c'est la
 * mémoire de l'exploitation, à relire quand un client conteste un prix ou
 * qu'on se demande qui a changé un réglage.
 *
 * Il n'y a qu'un compte d'administration : l'auteur est le prénom saisi au
 * moment du geste. « Le site » signale ce qu'il a fait de lui-même.
 */
export default async function PageJournal({ searchParams }: { searchParams: Recherche }) {
  await exigerSessionAdmin();
  const parametres = await searchParams;
  const type = typeof parametres.type === "string" ? parametres.type.trim().slice(0, 60) : "";
  const reference = typeof parametres.reference === "string" ? parametres.reference.trim().slice(0, 40) : "";

  const evenements = await depot.listerJournal({
    type: type || undefined,
    reference: reference || undefined,
    limite: LIMITE,
  });

  // Une journée par bloc, à l'heure de Cotonou.
  const parJour = new Map<string, EvenementJournal[]>();
  for (const evenement of evenements) {
    const jour = dateAuBenin(evenement.creeLe);
    parJour.set(jour, [...(parJour.get(jour) ?? []), evenement]);
  }
  const filtre = Boolean(type || reference);

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Exploitation</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Journal</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          Ce qui a été fait, par qui et quand : réglages des offres, offres de groupe montrées ou
          cachées, vélos indisponibles, retards, remboursements. Rien ne s&apos;y modifie ni ne
          s&apos;y efface. Les {LIMITE} événements les plus récents d&apos;abord.
        </p>
      </header>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <label className="block w-full sm:w-auto">
          <span className="sr-only">Type d&apos;événement</span>
          <select
            name="type"
            defaultValue={type}
            aria-label="Type d'événement"
            className="h-11 w-full rounded-full border border-noir-piste/20 bg-white px-4 text-[0.85rem] sm:h-9 sm:w-60"
          >
            <option value="">Tous les événements</option>
            {Object.entries(TYPES_EVENEMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
            {type && !(type in TYPES_EVENEMENT) && <option value={type}>{type}</option>}
          </select>
        </label>
        <input
          type="search"
          name="reference"
          defaultValue={reference}
          placeholder="Référence BL-…"
          aria-label="Référence d'une réservation"
          className="h-11 min-w-0 flex-1 rounded-full border border-noir-piste/20 bg-white px-4 text-[0.85rem] sm:h-9 sm:w-48 sm:flex-none"
        />
        <button type="submit" className="h-11 rounded-full bg-noir-piste px-5 text-[0.82rem] font-semibold text-craie sm:h-9">
          Filtrer
        </button>
        {filtre && (
          <Link href="/admin/journal" className="lien-souligne cible-elargie px-2 text-[0.82rem] font-semibold">
            Tout voir
          </Link>
        )}
      </form>

      {evenements.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-carte)] bg-white px-5 py-10 text-center text-[0.9rem] text-gris-cadre">
          {filtre ? "Aucun événement ne correspond à ce filtre." : "Rien au journal pour l'instant."}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {[...parJour.entries()].map(([jour, lignes]) => (
            <section key={jour} aria-label={jourAvecMajuscule(jour)}>
              <h2 className="font-display text-[0.95rem] font-bold uppercase tracking-tight">{jourAvecMajuscule(jour)}</h2>
              <ul className="mt-3 space-y-2">
                {lignes.map((evenement) => {
                  const resume = resumeEvenement(evenement);
                  return (
                    <li key={evenement.id} className="rounded-[var(--radius-carte)] bg-white p-4 text-[0.86rem]">
                      <p className="text-[0.76rem] text-gris-cadre">
                        <span className="tabular-nums">{formatHeureAuBenin(evenement.creeLe)}</span> ·{" "}
                        {libelleEvenement(evenement.type)} · {prenomDeAuteur(evenement.auteur)}
                        {evenement.reference && (
                          <>
                            {" · "}
                            <Link
                              href={`/admin/reservations?detail=${encodeURIComponent(evenement.reference)}`}
                              className="lien-souligne font-mono"
                            >
                              {evenement.reference}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className="mt-1 font-semibold">{resume.titre}</p>
                      {resume.lignes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 break-words text-[0.8rem] leading-relaxed text-gris-cadre">
                          {resume.lignes.map((ligne, index) => (
                            <li key={index}>{ligne}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
