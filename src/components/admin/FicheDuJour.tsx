"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatDate, formatXof, resumeOffre } from "@/lib/format";
import type { Reservation } from "@/lib/types";

/**
 * Ce que le coordinateur doit faire concrètement, selon la formule et
 * selon le sens du mouvement.
 *
 * C'est le cœur de la fiche : les deux formules n'engagent pas les mêmes
 * gestes. Un road trip demande de préparer des cocos et des eaux ; une
 * location libre demande de réclamer une pièce d'identité, un engagement
 * signé et une caution en espèces, et de les rendre au retour.
 */
function consignes(reservation: Reservation, sens: "depart" | "retour"): string[] {
  if (reservation.offre === "road-trip") {
    if (sens === "retour") return ["Récupérer le vélo, le casque et le kit."];
    const n = reservation.nombrePersonnes;
    return [
      `Préparer ${n} vélo${n > 1 ? "s" : ""}, ${n} casque${n > 1 ? "s" : ""} et le kit de réparation.`,
      `Prévoir ${n} coco${n > 1 ? "s" : ""} et ${n} eau${n > 1 ? "x" : ""}.`,
      "Aucune caution : le matériel reste sous votre garde pendant la sortie.",
    ];
  }

  if (sens === "retour") {
    return [
      "Contrôler l'état du vélo avant de rendre quoi que ce soit.",
      `Rendre la caution de ${formatXof(reservation.cautionXof)} et la pièce d'identité.`,
    ];
  }
  return [
    "Vérifier la pièce d'identité (CIP) et la garder jusqu'au retour du vélo.",
    "Faire signer l'engagement de restitution sur papier.",
    `Encaisser la caution de ${formatXof(reservation.cautionXof)} en espèces.`,
    `Retour attendu après ${reservation.dureeHeures ?? "?"} h.`,
  ];
}

/**
 * Une ligne de la fiche du jour.
 *
 * Conçue pour un téléphone tenu d'une main : le nom en gros, le numéro
 * appelable d'un geste, et un seul bouton d'action à la fois, celui de
 * l'étape où en est réellement la réservation.
 */
function Ligne({
  reservation,
  sens,
  onFait,
}: {
  reservation: Reservation;
  sens: "depart" | "retour";
  onFait: (reference: string, action: "depart" | "retour") => void;
}) {
  const velos = reservation.lignes.map((ligne) => ligne.veloNom).join(", ");
  const telephone = reservation.client.telephone;
  const aFaire = consignes(reservation, sens);
  const locationLibre = reservation.offre === "location-libre";

  // L'action proposée dépend de l'état réel, jamais des dates : une
  // réservation confirmée attend un départ, une en cours attend un
  // retour, une terminée n'attend plus rien.
  const action =
    reservation.statut === "CONFIRMEE"
      ? ("depart" as const)
      : reservation.statut === "EN_COURS"
        ? ("retour" as const)
        : null;

  return (
    <li className="rounded-[var(--radius-carte)] border border-noir-piste/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="titre-editorial text-[1.35rem]">
            {reservation.client.prenom} {reservation.client.nom}
          </p>
          <p className="mt-1 text-[0.9rem] font-semibold">{resumeOffre(reservation)}</p>
          <p className="mt-0.5 text-[0.9rem] text-gris-cadre">{velos}</p>
          <p className="mt-0.5 font-mono text-[0.78rem] text-gris-cadre">
            {reservation.reference}
          </p>
        </div>

        {reservation.statut === "TERMINEE" && (
          <span className="rounded-full bg-vert-lagune/15 px-3 py-1 text-[0.75rem] font-semibold text-vert-lagune">
            Rendu
          </span>
        )}
        {reservation.statut === "EN_COURS" && (
          <span className="rounded-full bg-orange-signal/15 px-3 py-1 text-[0.75rem] font-semibold text-orange-sourd">
            Sorti
          </span>
        )}
      </div>

      {/* La location libre engage du liquide et une pièce d'identité : elle
          est signalée d'un liseré orange pour qu'on ne la confonde pas, en
          plein soleil et à une main, avec un simple road trip. */}
      <ul
        className={`mt-3 space-y-1.5 rounded-[var(--radius-bouton)] px-3 py-2.5 text-[0.85rem] leading-relaxed ${
          locationLibre ? "border-l-4 border-orange-signal bg-orange-signal/10" : "bg-craie"
        }`}
      >
        {aFaire.map((consigne) => (
          <li key={consigne} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-[0.15rem] shrink-0 text-gris-cadre">
              •
            </span>
            {consigne}
          </li>
        ))}
      </ul>

      {reservation.message && (
        <p className="mt-3 rounded-[var(--radius-bouton)] bg-craie px-3 py-2 text-[0.85rem] leading-relaxed">
          <span className="text-gris-cadre">Message : </span>
          {reservation.message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {telephone && (
          <a
            href={`tel:${telephone.replace(/\s/g, "")}`}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 px-4 text-[0.88rem] font-semibold"
          >
            Appeler
          </a>
        )}
        {action && (
          <button
            type="button"
            onClick={() => onFait(reservation.reference, action)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-bouton)] bg-orange-signal px-5 text-[0.9rem] font-semibold text-noir-piste transition-colors hover:bg-orange-vif"
          >
            {action === "depart" ? "Vélo remis au client" : "Vélo rendu"}
          </button>
        )}
      </div>
    </li>
  );
}

export function FicheDuJour({
  jour,
  departs,
  retours,
}: {
  jour: string;
  departs: Reservation[];
  retours: Reservation[];
}) {
  const routeur = useRouter();
  const [enCours, demarrerTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const marquer = async (reference: string, action: "depart" | "retour") => {
    setErreur(null);
    try {
      const reponse = await fetch(`/api/admin/reservations/${reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.erreur ?? "L'enregistrement a échoué.");
        return;
      }
      // Le serveur est la seule source de vérité : on relit plutôt que
      // de deviner le nouvel état côté navigateur.
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    }
  };

  const rien = departs.length === 0 && retours.length === 0;

  return (
    <div className={enCours ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <header>
        <h1 className="titre-editorial text-[2rem]">La sortie du jour</h1>
        <p className="mt-2 text-[0.92rem] text-gris-cadre">{formatDate(jour)}</p>
      </header>

      {erreur && (
        <p
          role="alert"
          className="mt-6 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-white px-4 py-3 text-[0.9rem]"
        >
          {erreur}
        </p>
      )}

      {rien ? (
        <p className="mt-8 rounded-[var(--radius-carte)] border border-noir-piste/10 bg-white px-5 py-10 text-center text-[0.95rem] leading-relaxed text-gris-cadre">
          Aucun départ ni retour aujourd&apos;hui.
          <br />
          Rien à préparer.
        </p>
      ) : (
        <>
          {departs.length > 0 && (
            <section className="mt-8" aria-labelledby="titre-departs">
              <h2 id="titre-departs" className="titre-editorial text-[1.3rem]">
                À remettre ({departs.length})
              </h2>
              <ul className="mt-4 space-y-3">
                {departs.map((reservation) => (
                  <Ligne
                    key={reservation.id}
                    reservation={reservation}
                    sens="depart"
                    onFait={marquer}
                  />
                ))}
              </ul>
            </section>
          )}

          {retours.length > 0 && (
            <section className="mt-10" aria-labelledby="titre-retours">
              <h2 id="titre-retours" className="titre-editorial text-[1.3rem]">
                À récupérer ({retours.length})
              </h2>
              <ul className="mt-4 space-y-3">
                {retours.map((reservation) => (
                  <Ligne
                    key={reservation.id}
                    reservation={reservation}
                    sens="retour"
                    onFait={marquer}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
