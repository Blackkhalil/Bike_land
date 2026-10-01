import type { Metadata } from "next";
import Link from "next/link";

import { ControlesAvis } from "@/components/admin/ControlesAvis";
import { Etoiles, Pastille } from "@/components/ui";
import { depot } from "@/lib/db";
import { formatDate, formatNombre } from "@/lib/format";

export const metadata: Metadata = { title: "Avis clients" };

export const dynamic = "force-dynamic";

/**
 * Relecture des avis clients.
 *
 * Chaque avis vient d'une réservation payée et terminée : il n'y a pas
 * de formulaire public, donc personne ne peut noter un vélo sans l'avoir
 * loué. Reste la relecture, qui n'est pas là pour filtrer les critiques
 * mais pour ce qui n'a rien à faire sur une fiche produit.
 *
 * Les avis en attente sont en tête : c'est la seule chose qui demande
 * une action sur cet écran.
 */
export default async function PageAvisAdmin() {
  const avis = await depot.listerAvis();

  const enAttente = avis.filter((element) => !element.publie);
  const publies = avis.filter((element) => element.publie);

  const moyenne = avis.length
    ? avis.reduce((total, element) => total + element.note, 0) / avis.length
    : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titre-editorial text-[1.9rem]">Avis clients</h1>
          <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-gris-cadre">
            Chaque avis vient d&apos;une sortie réellement faite et payée. Il ne paraît sur la
            fiche du vélo qu&apos;une fois relu ici.
          </p>
        </div>

        {avis.length > 0 && (
          <p className="flex items-center gap-3 text-[0.9rem] text-gris-cadre">
            <Etoiles note={moyenne} className="text-orange-signal" />
            <span className="font-semibold text-noir-piste tabular-nums">
              {moyenne.toLocaleString("fr-FR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{" "}
              / 5
            </span>
            <span className="opacity-70">sur {formatNombre(avis.length)}</span>
          </p>
        )}
      </div>

      {avis.length === 0 ? (
        <p className="mt-10 rounded-[var(--radius-bloc)] border border-noir-piste/12 p-8 text-[0.9rem] leading-relaxed text-gris-cadre">
          Aucun avis pour le moment. Le formulaire apparaît sur le lien de suivi du client dès
          que sa sortie est marquée <strong className="text-noir-piste">terminée</strong> depuis
          la fiche du jour.
        </p>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="titre-editorial text-[1.3rem]">
              À relire{" "}
              {enAttente.length > 0 && (
                <span className="font-display text-orange-sourd">({enAttente.length})</span>
              )}
            </h2>
            {enAttente.length === 0 ? (
              <p className="mt-3 text-[0.88rem] text-gris-cadre">
                Rien en attente : tous les avis reçus ont été relus.
              </p>
            ) : (
              <div className="mt-5 grid gap-4">
                {enAttente.map((element) => (
                  <CarteAvis key={element.id} avis={element} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-12">
            <h2 className="titre-editorial text-[1.3rem]">
              Publiés <span className="font-display text-gris-cadre">({publies.length})</span>
            </h2>
            {publies.length === 0 ? (
              <p className="mt-3 text-[0.88rem] text-gris-cadre">
                Aucun avis publié pour l&apos;instant.
              </p>
            ) : (
              <div className="mt-5 grid gap-4">
                {publies.map((element) => (
                  <CarteAvis key={element.id} avis={element} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CarteAvis({
  avis,
}: {
  avis: {
    id: string;
    veloNom: string;
    reference: string;
    auteur: string;
    note: number;
    titre?: string;
    commentaire?: string;
    publie: boolean;
    creeLe: string;
  };
}) {
  return (
    <article className="rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Etoiles note={avis.note} className="text-orange-signal" />
          {avis.titre && <p className="mt-3 titre-editorial text-[1.15rem]">{avis.titre}</p>}
        </div>
        <Pastille ton={avis.publie ? "succes" : "neutre"}>
          {avis.publie ? "Publié" : "À relire"}
        </Pastille>
      </div>

      {avis.commentaire ? (
        <p className="mt-4 text-[0.92rem] leading-relaxed text-gris-cadre">{avis.commentaire}</p>
      ) : (
        <p className="mt-4 text-[0.88rem] italic text-gris-cadre">
          Note seule, sans commentaire.
        </p>
      )}

      <p className="mt-5 border-t border-noir-piste/10 pt-4 text-[0.82rem] text-gris-cadre">
        <span className="font-semibold text-noir-piste">{avis.auteur}</span> · {avis.veloNom} ·{" "}
        {formatDate(avis.creeLe)} ·{" "}
        <Link
          href={`/admin/reservations?reference=${encodeURIComponent(avis.reference)}`}
          className="lien-souligne font-semibold text-orange-sourd"
        >
          {avis.reference}
        </Link>
      </p>

      <ControlesAvis id={avis.id} publie={avis.publie} />
    </article>
  );
}
