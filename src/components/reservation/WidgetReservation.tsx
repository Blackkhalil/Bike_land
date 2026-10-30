"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { creneauDuJour, formatHeure, GAMMES, GRILLE_HORAIRE, prixRoadTripMinimum, type GammeVelo } from "@/data/offres";
import { CLE_CHOIX_PRODUIT } from "@/data/produits";
import { formatDate, formatXof } from "@/lib/format";
import type { CodeOffre } from "@/lib/types";
import type { DateISO } from "@/lib/dates";
import { Calendrier, type PeriodeOccupee } from "./Calendrier";
import type { CreneauProposable } from "./TunnelReservation";
import { DepartComplet, departsDansLOrdre, premierDepart } from "./DepartComplet";
import { NoteHoraires, useReservationsOuvertes } from "./NoteHoraires";
import { site } from "@/lib/site";

/**
 * Encart de réservation d'une gamme.
 *
 * Le client choisit une gamme, pas un vélo : un vélo libre de la gamme lui
 * est attribué à la réservation, et réglé à sa taille au départ. Il ne
 * reste qu'à dire comment et quand, et « quand » ne veut pas dire la même
 * chose selon la formule, d'où le choix en tête d'encart :
 *
 *  - **Road trip** : la sortie est encadrée et part en groupe. Il n'y a
 *    donc rien à choisir d'autre que le créneau, samedi ou dimanche matin
 *    (le dimanche, c'est Gbashi bike) : un calendrier laisserait croire
 *    qu'on peut partir un mardi.
 *  - **Location libre** : le calendrier a tout son sens. Un jour n'y est
 *    barré que si tous les vélos de la gamme sont pris. L'heure de départ
 *    se choisit à l'étape suivante, une fois la durée connue.
 */
export function WidgetReservation({
  gamme,
  periodesOccupees,
  creneaux,
  complets,
  aucunVelo = false,
}: {
  gamme: GammeVelo;
  /** Les heures où plus aucun vélo de la gamme n'est libre (`occupationsDeLaGamme`). */
  periodesOccupees: PeriodeOccupee[];
  /** Les départs encadrés, calculés côté serveur : le samedi, aujourd'hui. */
  creneaux: CreneauProposable[];
  /** Les départs fermés par l'exploitant, montrés « Sold out » (voir `departsComplets`). */
  complets: CreneauProposable[];
  /** Tous les vélos de la gamme sont à l'atelier : rien à réserver. */
  aucunVelo?: boolean;
}) {
  const routeur = useRouter();
  const nom = GAMMES.find((entree) => entree.code === gamme)?.nom ?? gamme;

  /**
   * Jour pré-rempli, lu dans l'adresse, paramètre `debut`.
   *
   * Lu ici, dans le navigateur, et non dans la page : un composant
   * serveur qui consulte les paramètres d'URL force Next à reconstruire
   * la page à chaque visite. Pour deux paramètres facultatifs, la page
   * cessait d'être cachable et s'effondrait sous la charge.
   */
  const parametres = useSearchParams();
  const jourDemande = parametres.get("debut");
  const [offre, setOffre] = useState<CodeOffre>("road-trip");
  const [jour, setJour] = useState<DateISO | null>(jourDemande);
  // Un jour demandé qui tombe sur un départ encadré le présélectionne :
  // `?debut=` d'un dimanche ouvre l'encart sur Gbashi bike. S'il n'est
  // plus proposé (complet, ou clos la veille à 22 h), c'est le même
  // créneau la semaine suivante, et non le premier de la liste : un
  // dimanche ne doit pas devenir un samedi, qui n'est pas le même produit.
  const codeDemande = jourDemande
    ? (creneaux.find((item) => item.date === jourDemande) ??
        creneaux.find((item) => item.code === creneauDuJour(jourDemande)?.code))?.code
    : undefined;
  const [creneauChoisi, setCreneauChoisi] = useState<string>(
    codeDemande ?? premierDepart(creneaux)?.code ?? "",
  );

  // Le produit choisi sur la page Nos produits, ou ici sur une autre gamme,
  // retenu le temps de la visite. Lu après le premier rendu : le serveur
  // n'en sait rien. Un jour dans l'adresse garde la main sur le départ.
  useEffect(() => {
    const lecture = setTimeout(() => {
      let choix: string | null = null;
      try {
        choix = window.sessionStorage.getItem(CLE_CHOIX_PRODUIT);
      } catch {
        return;
      }
      if (choix === "location-libre") setOffre("location-libre");
      else if (!codeDemande && choix && creneaux.some((item) => item.code === choix)) {
        setCreneauChoisi(choix);
      }
    }, 0);
    return () => clearTimeout(lecture);
  }, [codeDemande, creneaux]);

  const retenir = (choix: string) => {
    try {
      window.sessionStorage.setItem(CLE_CHOIX_PRODUIT, choix);
    } catch {
      // Stockage indisponible : le choix vaut pour cette page seulement.
    }
  };
  const ouvertes = useReservationsOuvertes();
  // Seul le road trip ferme la nuit : la location libre se réserve à
  // toute heure.
  const fermeLaNuit = offre === "road-trip" && ouvertes === false;
  const [redirection, setRedirection] = useState(false);

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

    routeur.push(`/reservation?gamme=${gamme.toLowerCase()}&offre=${offre}&${parametres}`);
  };

  return (
    <div className="rounded-[var(--radius-bloc)] border border-noir-piste/10 bg-white p-6 text-noir-piste sm:p-7">
      {aucunVelo ? (
        <div className="rounded-[var(--radius-carte)] bg-orange-signal/15 p-5 text-[0.9rem] leading-relaxed text-orange-sourd">
          Tous les vélos {nom} sont à l&apos;atelier en ce moment. Choisissez une autre gamme, ou
          écrivez-nous pour savoir quand ils repartent.
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
                    detail: `dès ${formatXof(prixRoadTripMinimum(gamme))} / pers., encadré`,
                  },
                  {
                    code: "location-libre" as const,
                    titre: "Location libre",
                    detail: `dès ${formatXof(GRILLE_HORAIRE[gamme][0].prixXof)} l'heure`,
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
                      onChange={() => {
                        setOffre(item.code);
                        retenir(item.code === "location-libre" ? item.code : creneauChoisi);
                      }}
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
                    {complets.length > 0
                      ? "Les prochains départs de road trip sont sold out. "
                      : "Aucun départ de road trip n'est ouvert à la réservation en ce moment : les prochaines sorties sont complètes. "}
                    La location libre reste possible, ou appelez-nous au {site.telephone}.
                  </p>
                )}
                {departsDansLOrdre(creneaux, complets).map(({ depart: item, complet }) => {
                  if (complet) {
                    return <DepartComplet key={`complet-${item.code}-${item.date}`} depart={item} />;
                  }
                  const actif = creneauChoisi === item.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setCreneauChoisi(item.code);
                        retenir(item.code);
                      }}
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
                        {item.produit && ` · ${item.produit}, sport devant la plage`}
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

          <NoteHoraires offre={offre} className="mt-6" />

          <Bouton
            onClick={continuer}
            disabled={!pretAContinuer || redirection || fermeLaNuit}
            taille="lg"
            className="mt-3 w-full"
          >
            {redirection
              ? "Un instant…"
              : offre === "road-trip" && creneaux.length === 0 && complets.length > 0
                ? "Sold out"
                : fermeLaNuit
                  ? "Réservations fermées"
                  : offre === "road-trip" && creneaux.length === 0
                    ? "Aucun départ ouvert"
                    : !pretAContinuer
                      ? "Choisissez un jour"
                      : `Réserver un vélo ${nom}`}
          </Bouton>

          <p className="mt-3 text-center text-[0.76rem] text-gris-cadre">
            Aucun compte à créer. Durée, heure, nombre de vélos et paiement à l&apos;étape suivante.
          </p>
        </>
      )}
    </div>
  );
}
