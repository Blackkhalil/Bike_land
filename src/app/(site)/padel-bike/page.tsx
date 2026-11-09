import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BoutonLien } from "@/components/Bouton";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { GalerieAffiches } from "@/components/GalerieAffiches";
import { ReservationPadelBike } from "@/components/reservation/ReservationPadelBike";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { AFFICHES_PADEL } from "@/data/affiches";
import { heureAuBenin } from "@/data/offres";
import {
  delaiPadelEnClair,
  horairePadel,
  jourOuverturePadel,
  joursPadelReservables,
  padelBikeOuvert,
  quandPadel,
} from "@/data/padel-bike";
import { MESSAGES_WHATSAPP } from "@/data/produits";
import { formatDureeHeures, formatHeureMinute, REGLAGES_PADEL_PAR_DEFAUT } from "@/data/reglages";
import { depot } from "@/lib/db";
import { filDAriane } from "@/lib/donnees-structurees";
import { formatXof } from "@/lib/format";
import { lireOuverture, padelBikeOuvertEnLigne } from "@/lib/ouverture";
import { lireReglages } from "@/lib/reglages";
import { metadonneesPage } from "@/lib/seo";
import { lienWhatsApp, site } from "@/lib/site";

/** Le prix et l'heure du moment, réglés dans l'administration. */
export async function generateMetadata(): Promise<Metadata> {
  const padel = await lireReglages()
    .then((reglages) => reglages.padel)
    .catch(() => REGLAGES_PADEL_PAR_DEFAUT);
  return metadonneesPage({
    titre: "Padel bike à Cotonou",
    description:
      `Padel bike à Cotonou : à vélo en groupe jusqu'au terrain de padel, à ${formatHeureMinute(padel.depart)}, ` +
      `puis ${formatDureeHeures(padel.dureePadelHeures)} de padel. ${formatXof(padel.prixXof)} par personne, vélo compris.`,
    chemin: "/padel-bike",
  });
}

/**
 * Régénérée au plus toutes les minutes, et tout de suite après un réglage
 * dans l'administration : elle dit l'heure, le prix, les jours, et si la
 * réservation en ligne est fermée depuis le tableau de bord. L'ouverture et
 * la clôture de chaque départ sont relues dans le navigateur
 * (ReservationPadelBike), les vélos libres demandés au serveur, qui refait
 * tous les contrôles.
 */
export const revalidate = 60;

/** Une ligne de repères : le terme à gauche, la valeur à droite. */
function Repere({ terme, children }: { terme: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-current/20 py-3.5 first:border-t">
      <dt className="shrink-0 text-[0.88rem]">{terme}</dt>
      <dd className="text-right text-[0.98rem] font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Padel bike, produit à part entière de Bike Land : sa présentation et sa
 * réservation, payée en ligne d'un seul geste (voir src/data/padel-bike.ts).
 * Tout ce qui le règle vient de l'administration (Réglages des produits).
 * Avant l'ouverture, la page est déjà en ligne : la réservation y annonce
 * sa date et renvoie vers WhatsApp.
 */
export default async function PagePadelBike() {
  const [ouverture, parc, reglages] = await Promise.all([lireOuverture(), depot.listerVelos(), lireReglages()]);
  const padel = reglages.padel;
  const maintenant = new Date();
  const lance = padelBikeOuvert(padel, maintenant);
  // Réservable en ligne pour de vrai : ouvert, pas fermé depuis le tableau de
  // bord, et au moins un jour programmé qui se réserve encore.
  const reservable = lance && padelBikeOuvertEnLigne(ouverture) && joursPadelReservables(padel, maintenant).length > 0;
  const aujourdhui = heureAuBenin(maintenant).date;
  // Les jours fermés à toutes les formules depuis le tableau de bord.
  const joursFermes = ouverture.joursFermes
    .filter((jour) => jour.formule === "toutes" && jour.date >= aujourdhui)
    .map((jour) => jour.date);
  const velosEnEtat = parc.filter((velo) => velo.statut !== "RETIRE" && velo.statut !== "MAINTENANCE").length;

  // Le déroulé d'une sortie, du départ au retour des vélos.
  const etapes = [
    {
      titre: `Le départ à vélo, à ${horairePadel(padel)}`,
      detail: "Rendez-vous au point de départ un quart d'heure avant : un vélo et un casque pour chacun.",
    },
    { titre: "La balade jusqu'au padel", detail: "On roule ensemble, dans la bonne humeur : c'est l'échauffement." },
    {
      titre: `${formatDureeHeures(padel.dureePadelHeures)} de padel`,
      detail: "Sur le terrain, entre amis, à votre rythme.",
    },
    {
      titre: "Le retour",
      detail: `On rentre à vélo, ensemble : les vélos sont rendus vers ${formatHeureMinute(padel.retour)}.`,
    },
  ];

  return (
    <>
      <DonneesStructurees donnees={filDAriane([{ nom: "Padel bike", chemin: "/padel-bike" }])} />
      <Section fond="noir" className="pb-16 pt-32 sm:pt-40">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="flex flex-wrap gap-2">
              <Pastille ton="succes">Nouveau</Pastille>
              {!lance && <Pastille ton="neutre">En ligne dès le {jourOuverturePadel(padel)}</Pastille>}
            </div>
            <TitreSection as="h1" taille="lg" className="mt-5">
              Padel bike
            </TitreSection>
            <p className="mt-3 font-display text-[1.5rem] leading-tight">
              Le vélo pour y aller, le padel pour jouer
            </p>
            <p className="mt-6 max-w-xl text-[1.02rem] leading-relaxed text-craie/80">
              Le concept est simple&nbsp;: on démarre à vélo pour s&apos;échauffer, tous ensemble et
              dans la bonne humeur, jusqu&apos;au terrain de padel. Sur place,{" "}
              {formatDureeHeures(padel.dureePadelHeures)} de padel entre amis.
            </p>
            <dl className="mt-8 max-w-xl">
              <Repere terme="Quand">
                {quandPadel(padel, maintenant)}
              </Repere>
              <Repere terme="Programme">À vélo, puis {formatDureeHeures(padel.dureePadelHeures)} de padel</Repere>
              <Repere terme="Tarif">
                <span className="font-display text-[1.25rem] text-orange-signal">{formatXof(padel.prixXof)}</span>{" "}
                par personne
              </Repere>
              <Repere terme="Compris">Le vélo et le casque</Repere>
              <Repere terme="Groupe">
                {padel.personnesMin === padel.personnesMax
                  ? `${padel.personnesMin} personnes`
                  : `De ${padel.personnesMin} à ${padel.personnesMax} personnes`}
              </Repere>
              <Repere terme="Réservation">
                {reservable
                  ? `En ligne, ${delaiPadelEnClair(padel)}`
                  : lance
                    ? "Dates bientôt annoncées"
                    : `En ligne dès le ${jourOuverturePadel(padel)}`}
              </Repere>
            </dl>
            <BoutonLien href="#reservation" variante="primaire" taille="lg" className="mt-8">
              {reservable ? "Réserver ma sortie" : "Voir la réservation"}
            </BoutonLien>
          </div>
          <div className="min-w-0">
            <GalerieAffiches
              affiches={AFFICHES_PADEL}
              titre="Les vidéos de Padel bike"
              nom={{ singulier: "vidéo", pluriel: "vidéos" }}
            />
          </div>
        </div>
      </Section>

      <Section fond="craie" className="py-16 sm:py-20">
        <div id="reservation" className="grid scroll-mt-[72px] gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ReservationPadelBike
              reglages={padel}
              ouvertEnLigne={padelBikeOuvertEnLigne(ouverture)}
              joursFermes={joursFermes}
              velosEnEtat={velosEnEtat}
              maintenantAuServeur={maintenant.getTime()}
            />
          </div>

          <aside className="space-y-6 lg:col-span-5">
            <div className="rounded-[var(--radius-bloc)] bg-white p-6">
              <p className="etiquette opacity-75">Comment ça se passe</p>
              <ol className="mt-4 space-y-3 text-[0.9rem]">
                {etapes.map((etape) => (
                  <li key={etape.titre} className="border-l-2 border-orange-signal pl-3">
                    <span className="font-semibold">{etape.titre}</span>
                    <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-gris-cadre">
                      {etape.detail}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-[var(--radius-bloc)] bg-white p-6">
              <p className="etiquette opacity-75">Bon à savoir</p>
              <ul className="mt-3 space-y-2.5 text-[0.9rem] leading-relaxed">
                <li>Un vélo vous est attribué : le prix est le même pour tous nos vélos.</li>
                <li>Venez en tenue de sport, prêt à pédaler puis à jouer.</li>
                <li>Sans caution&nbsp;: la sortie est encadrée.</li>
                <li>
                  On réserve en ligne {delaiPadelEnClair(padel)}. Après, écrivez-nous sur WhatsApp.
                </li>
                <li>Le point de départ exact et la facture arrivent par email dès le paiement.</li>
                <li>Annulation gratuite jusqu&apos;à 72 h avant le départ, selon nos conditions de vente.</li>
              </ul>
              <p className="mt-4 text-[0.85rem] text-gris-cadre">
                Une question&nbsp;? Écrivez-nous sur WhatsApp au{" "}
                <a
                  href={lienWhatsApp(MESSAGES_WHATSAPP.padelBike)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="lien-souligne whitespace-nowrap font-semibold text-noir-piste tabular-nums"
                >
                  {site.whatsapp[1].numero}
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
