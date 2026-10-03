"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Bouton } from "@/components/Bouton";
import { formatHeure, PRIX_ROAD_TRIP_XOF, GRILLE_HORAIRE } from "@/data/offres";
import { formatDate, formatXof } from "@/lib/format";
import type { CodeOffre, Velo } from "@/lib/types";
import type { DateISO } from "@/lib/dates";
import { Calendrier, type PeriodeOccupee } from "./Calendrier";
import type { CreneauProposable } from "./TunnelReservation";
import { NoteHoraires, useReservationsOuvertes } from "./NoteHoraires";
import { site } from "@/lib/site";

/**
 * Encart de réservation de la fiche produit.
 *
 * Le vélo est déjà choisi puisqu'on est sur sa fiche : il ne reste qu'à
 * dire quand. Et « quand » ne veut pas dire la même chose selon la
 * formule, d'où le choix en tête d'encart :
 *
 *  - **Road trip** : la sortie est encadrée et part en groupe. Il n'y a
 *    donc rien à choisir d'autre que le créneau du samedi matin,
 *    un calendrier laisserait croire qu'on peut partir un mardi.
 *  - **Location libre** : le vélo est à vous, le calendrier a tout son
 *    sens. L'heure de départ se choisit à l'étape suivante, une fois la
 *    durée connue.
 */
export function WidgetReservation({
  velo,
  periodesOccupees,
  creneaux,
}: {
  velo: Velo;
  periodesOccupees: PeriodeOccupee[];
  /** Les départs encadrés, calculés côté serveur : le samedi, aujourd'hui. */
  creneaux: CreneauProposable[];
}) {
  const routeur = useRouter();

  /**
   * Jour pré-rempli, lu dans l'adresse, paramètre `debut`.
   *
   * Lu ici, dans le navigateur, et non dans la page : un composant
   * serveur qui consulte les paramètres d'URL force Next à reconstruire
   * la page à chaque visite. Pour deux paramètres facultatifs, la fiche
   * vélo cessait d'être cachable et s'effondrait sous la charge.
   */
  const parametres = useSearchParams();
  const jourDemande = parametres.get("debut");
  const [offre, setOffre] = useState<CodeOffre>("road-trip");
  const [jour, setJour] = useState<DateISO | null>(jourDemande);
  const [creneauChoisi, setCreneauChoisi] = useState<string>(creneaux[0]?.code ?? "");
  const ouvertes = useReservationsOuvertes();
  const [redirection, setRedirection] = useState(false);

  const indisponible = velo.statut === "MAINTENANCE" || velo.statut === "RETIRE";
  const creneau = creneaux.find((item) => item.code === creneauChoisi);

  // Ce qu'il manque encore pour pouvoir continuer, selon la formule.
  const pretAContinuer = offre === "road-trip" ? Boolean(creneau) : Boolean(jour);

  const continuer = () => {
    if (!pretAContinuer) return;
    setRedirection(true);

    // On transmet la formule autant que la date : sans elle, l'étape
    // suivante retomberait sur sa valeur par défaut et déplacerait le
    // client sur un autre jour que celui qu'il vient de choisir.
    const parametres =
      offre === "road-trip" && creneau
        ? `debut=${creneau.date}&fin=${creneau.date}&heure=${creneau.heureDebut}`
        : `debut=${jour}&fin=${jour}`;

    routeur.push(`/reservation?velo=${velo.slug}&offre=${offre}&${parametres}`);
  };

  return (
    <div className="rounded-[var(--radius-bloc)] border border-noir-piste/10 bg-white p-6 sm:p-7">
      {indisponible ? (
        <div className="rounded-[var(--radius-carte)] bg-orange-signal/15 p-5 text-[0.9rem] leading-relaxed text-orange-sourd">
          Ce vélo est actuellement à l&apos;atelier. Écrivez-nous pour connaître sa date de retour
          ou pour qu&apos;on vous propose un modèle équivalent.
        </div>
      ) : (
        <>
          {/* ----------------------------------------- Choix de formule */}
          <fieldset>
            <legend className="text-[0.95rem] font-semibold">Comment voulez-vous rouler ?</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    code: "road-trip" as const,
                    titre: "Road trip",
                    detail: `${formatXof(PRIX_ROAD_TRIP_XOF[velo.gamme])} / pers., encadré`,
                  },
                  {
                    code: "location-libre" as const,
                    titre: "Location libre",
                    detail: `dès ${formatXof(GRILLE_HORAIRE[velo.gamme][0].prixXof)} l'heure`,
                  },
                ]
              ).map((item) => {
                const actif = offre === item.code;
                return (
                  <label
                    key={item.code}
                    className={`cursor-pointer rounded-[var(--radius-bouton)] border px-4 py-3 transition-colors ${
                      actif
                        ? "border-orange-signal bg-orange-signal/10"
                        : "border-noir-piste/20 bg-craie hover:border-noir-piste/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="formule"
                      checked={actif}
                      onChange={() => setOffre(item.code)}
                      className="sr-only"
                    />
                    <span className="block font-semibold">{item.titre}</span>
                    <span className="mt-0.5 block text-[0.76rem] text-gris-cadre">{item.detail}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ------------------------------- Road trip : créneaux fixes */}
          {offre === "road-trip" ? (
            <fieldset className="mt-6">
              <legend className="text-[0.95rem] font-semibold">Quel départ ?</legend>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-gris-cadre">
                La sortie part en groupe, avec un coordinateur qui ouvre la route.
              </p>
              <div className="mt-3 space-y-2">
                {creneaux.length === 0 && (
                  <p className="rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white px-4 py-3 text-[0.85rem] leading-relaxed">
                    Aucun départ de road trip n&apos;est ouvert à la réservation en ce moment :
                    les prochaines sorties sont complètes. La location libre reste possible, ou
                    appelez-nous au {site.telephone}.
                  </p>
                )}
                {creneaux.map((item) => {
                  const actif = creneauChoisi === item.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setCreneauChoisi(item.code)}
                      aria-pressed={actif}
                      className={`w-full rounded-[var(--radius-bouton)] border px-4 py-3 text-left transition-colors ${
                        actif
                          ? "border-orange-signal bg-orange-signal text-noir-piste"
                          : "border-noir-piste/20 bg-craie hover:border-noir-piste/50"
                      }`}
                    >
                      <span className="block font-semibold">
                        {item.libelle} {formatDate(item.date)}
                      </span>
                      <span className="mt-0.5 block text-[0.78rem] opacity-75">
                        {formatHeure(item.heureDebut)} - {formatHeure(item.heureFin)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <div className="mt-6">
              <p className="text-[0.95rem] font-semibold">Quel jour voulez-vous rouler ?</p>
              <div className="mt-4">
                <Calendrier
                  periodesOccupees={periodesOccupees}
                  debut={jour}
                  fin={null}
                  nombreDeMois={1}
                  onChange={(nouveauJour) => setJour(nouveauJour)}
                />
              </div>
            </div>
          )}

          <NoteHoraires className="mt-6" />

          <Bouton
            onClick={continuer}
            disabled={!pretAContinuer || redirection || ouvertes === false}
            taille="lg"
            className="mt-3 w-full"
          >
            {redirection
              ? "Un instant…"
              : ouvertes === false
                ? "Réservations fermées"
                : offre === "road-trip" && creneaux.length === 0
                  ? "Aucun départ ouvert"
                  : !pretAContinuer
                    ? "Choisissez un jour"
                  : "Réserver ce vélo"}
          </Bouton>

          <p className="mt-3 text-center text-[0.76rem] text-gris-cadre">
            Aucun compte à créer. Durée, heure et paiement à l&apos;étape suivante.
          </p>
        </>
      )}
    </div>
  );
}
