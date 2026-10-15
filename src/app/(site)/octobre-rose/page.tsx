import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BoutonLien } from "@/components/Bouton";
import { InscriptionOctobreRose } from "@/components/reservation/InscriptionOctobreRose";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { itineraireOctobreRose } from "@/data/contenus";
import {
  creneauOctobreRose,
  departOctobreRose,
  formatHoraire,
  OCTOBRE_ROSE,
  PLACES_MAX_PAR_INSCRIPTION,
} from "@/data/octobre-rose";
import { inscriptionsOctobreRoseOuvertes, jourOctobreRose, MESSAGES_WHATSAPP } from "@/data/produits";
import { depot } from "@/lib/db";
import { formatXof } from "@/lib/format";
import { lireOuverture, octobreRoseOuvertEnLigne } from "@/lib/ouverture";
import { estEnAttente } from "@/lib/reservations";
import { lienWhatsApp } from "@/lib/site";

export const metadata: Metadata = {
  title: "Octobre rose",
  description:
    "Une sortie à vélo en rose pour soutenir la lutte contre le cancer du sein, sur la route des Pêches jusqu'à l'Amazone. Un prix réduit, le même pour tous les vélos : on s'inscrit et on paie en ligne.",
  alternates: { canonical: "/octobre-rose" },
};

/**
 * Régénérée au plus toutes les trente secondes : elle compte les places
 * (les vélos encore libres sur la sortie), que chaque inscription fait
 * baisser. Le serveur recompte de toute façon à l'inscription, et l'heure
 * limite est relue dans le navigateur (InscriptionOctobreRose).
 */
export const revalidate = 30;

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
 * La sortie Octobre rose : ce qu'elle est, et l'inscription, payée en ligne
 * d'un seul geste (voir src/data/octobre-rose.ts).
 */
export default async function PageOctobreRose() {
  const sortie = OCTOBRE_ROSE.sortie;
  const creneau = creneauOctobreRose();
  const circuit = itineraireOctobreRose();
  const maintenant = new Date();

  // Sans sortie fixée, ou une fois le groupe parti : la page reste en ligne
  // pour qui suit un ancien lien, sans rien à vendre.
  const [ouverture, libres, enAttente] = await Promise.all([
    lireOuverture(),
    creneau ? depot.velosLibres(creneau.date, creneau.heureDebut, creneau.heureFin) : Promise.resolve([]),
    creneau
      ? depot.listerReservations({ statut: "EN_ATTENTE_PAIEMENT", depuis: creneau.date, jusqua: creneau.date })
      : Promise.resolve([]),
  ]);
  // Les vélos retenus le temps d'un paiement : une sortie sans place libre
  // n'est pas « Sold out » tant que ces inscriptions peuvent encore expirer.
  const placesEnAttente = enAttente
    .filter((reservation) => reservation.offre === "octobre-rose" && estEnAttente(reservation))
    .reduce((total, reservation) => total + reservation.lignes.length, 0);
  const depart = departOctobreRose();

  return (
    <>
      <Section fond="rose" className="pb-16 pt-32 sm:pt-40">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <Pastille ton="sombre">Octobre rose {OCTOBRE_ROSE.annee}</Pastille>
            <TitreSection as="h1" taille="lg" className="mt-5">
              Roulez en rose avec nous
            </TitreSection>
            <p className="mt-6 max-w-xl text-[1.02rem] leading-relaxed">
              Octobre rose est le mois de la lutte contre le cancer du sein. Bike Land soutient la
              cause avec une sortie à vélo, tous en rose, pour rappeler qu&apos;un dépistage précoce
              sauve des vies. Le prix est réduit, et c&apos;est le même pour tous nos vélos&nbsp;: rien à
              choisir, on s&apos;inscrit et on paie.
            </p>
            {sortie ? (
              <dl className="mt-8 max-w-xl">
                <Repere terme="Date">{jourOctobreRose()}</Repere>
                <Repere terme="Rassemblement">{formatHoraire(sortie.rassemblement)}, au point de départ</Repere>
                <Repere terme="Départ et retour">
                  {formatHoraire(sortie.depart)} - {formatHoraire(sortie.retour)}
                </Repere>
                <Repere terme="Dress code">{sortie.tenue}</Repere>
                {circuit && (
                  <Repere terme="Itinéraire">
                    {circuit.region}, {circuit.distanceKm} km
                  </Repere>
                )}
                <Repere terme="Tarif">
                  <span className="font-display text-[1.25rem]">{formatXof(sortie.prixXof)}</span> par
                  personne, tous vélos
                </Repere>
                <Repere terme="Compris">Vélo et casque, sans caution</Repere>
              </dl>
            ) : (
              <p className="mt-8 max-w-xl text-[0.98rem] font-semibold">
                Date et programme annoncés très bientôt.
              </p>
            )}
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-bloc)] bg-noir-releve">
            <Image
              src="/images/produits/octobre-rose.jpg"
              alt="Deux cyclistes roulent côte à côte en souriant, sur la route des Pêches"
              fill
              priority
              sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw"
              className="object-cover object-[50%_30%]"
            />
          </div>
        </div>
      </Section>

      <Section fond="craie" className="py-16 sm:py-20">
        <div id="inscription" className="grid scroll-mt-[72px] gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {sortie && sortie.prixXof > 0 && creneau ? (
              <InscriptionOctobreRose
                prixXof={sortie.prixXof}
                placesInitiales={libres.length}
                placesEnAttente={placesEnAttente}
                maxParInscription={PLACES_MAX_PAR_INSCRIPTION}
                ouvertAuServeur={inscriptionsOctobreRoseOuvertes(maintenant)}
                partiAuServeur={depart !== null && maintenant.getTime() >= depart}
                ouvertEnLigne={octobreRoseOuvertEnLigne(ouverture)}
              />
            ) : (
              <div className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8">
                <h2 className="titre-editorial text-[1.6rem]">Inscription sur WhatsApp</h2>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-gris-cadre">
                  Écrivez-nous : nous vous envoyons la date et le programme dès qu&apos;ils sont fixés.
                </p>
                <BoutonLien
                  href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
                  target="_blank"
                  rel="noreferrer noopener"
                  variante="sombre"
                  taille="lg"
                  className="mt-6"
                >
                  Écrire sur WhatsApp
                </BoutonLien>
              </div>
            )}
          </div>

          <aside className="space-y-6 lg:col-span-5">
            {circuit && (
              <div className="rounded-[var(--radius-bloc)] bg-white p-6">
                <p className="etiquette opacity-75">Le parcours</p>
                <p className="mt-2 font-display text-[1.25rem] font-bold leading-tight">{circuit.titre}</p>
                <p className="mt-1 text-[0.85rem] text-gris-cadre">
                  {circuit.distanceKm} km aller-retour · {circuit.duree.toLowerCase()} · niveau{" "}
                  {circuit.niveau.toLowerCase()}
                </p>
                <ol className="mt-4 space-y-3 text-[0.9rem]">
                  {circuit.etapes.map((etape) => (
                    <li key={etape.titre} className="border-l-2 border-rose-octobre pl-3">
                      <span className="font-semibold">{etape.titre}</span>
                      <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-gris-cadre">
                        {etape.detail}
                      </span>
                    </li>
                  ))}
                </ol>
                <Link
                  href={`/itineraires/${circuit.slug}`}
                  className="lien-souligne mt-4 inline-block text-[0.85rem] font-semibold"
                >
                  Voir l&apos;itinéraire en détail
                </Link>
              </div>
            )}

            <div className="rounded-[var(--radius-bloc)] bg-white p-6">
              <p className="etiquette opacity-75">Bon à savoir</p>
              <ul className="mt-3 space-y-2.5 text-[0.9rem] leading-relaxed">
                <li>Un vélo vous est attribué : le prix est le même pour tous nos vélos.</li>
                <li>Vélo et casque fournis, sans caution : la sortie est encadrée.</li>
                <li>
                  Le point de départ exact, la facture et l&apos;itinéraire arrivent par email dès le
                  paiement.
                </li>
                <li>Annulation gratuite jusqu&apos;à 72 h avant la sortie, selon nos conditions de vente.</li>
              </ul>
              <p className="mt-4 text-[0.85rem] text-gris-cadre">
                Une question&nbsp;?{" "}
                <a
                  href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="lien-souligne font-semibold text-noir-piste"
                >
                  Écrivez-nous sur WhatsApp
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
