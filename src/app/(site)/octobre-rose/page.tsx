import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BoutonLien } from "@/components/Bouton";
import { InscriptionOctobreRose } from "@/components/reservation/InscriptionOctobreRose";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { itineraireOctobreRose } from "@/data/contenus";
import {
  formatHoraire,
  OCTOBRE_ROSE,
  PLACES_MAX_PAR_INSCRIPTION,
  texteOffertOctobreRose,
} from "@/data/octobre-rose";
import { horaireDeLaSortie, jourOctobreRose, MESSAGES_WHATSAPP, tarifOctobreRose } from "@/data/produits";
import { etatsSortiesOctobreRose } from "@/lib/ouverture";
import { lienWhatsApp } from "@/lib/site";

const joursDeLaCampagne = jourOctobreRose();

export const metadata: Metadata = {
  title: "Octobre rose",
  description:
    `Des sorties à vélo en rose${joursDeLaCampagne ? `, ${joursDeLaCampagne.toLowerCase()},` : ""} ` +
    "pour soutenir la lutte contre le cancer du sein. " +
    "Un prix forfaitaire, le même pour tous les vélos : on choisit son jour, on s'inscrit et on paie en ligne.",
  alternates: { canonical: "/octobre-rose" },
};

/**
 * Régénérée au plus toutes les trente secondes : elle compte les places de
 * chaque jour (les vélos encore libres sur sa sortie), que chaque
 * inscription fait baisser. Le serveur recompte de toute façon à
 * l'inscription, et les heures limites sont relues dans le navigateur
 * (InscriptionOctobreRose).
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
 * Les sorties Octobre rose : ce qu'elles sont, et l'inscription, payée en
 * ligne d'un seul geste, le client choisissant son jour (voir
 * src/data/octobre-rose.ts).
 */
export default async function PageOctobreRose() {
  // Les sorties partagent leurs horaires : la première les dit pour toutes.
  const sortie = OCTOBRE_ROSE.sorties[0] ?? null;
  const circuit = itineraireOctobreRose();
  const maintenant = new Date();

  // Sans sortie fixée, ou une fois le dernier groupe parti : la page reste
  // en ligne pour qui suit un ancien lien, sans rien à vendre.
  const etats = await etatsSortiesOctobreRose(maintenant);
  const payants = etats.filter((etat) => etat.sortie.prixXof > 0);

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
              Octobre rose est le mois de la lutte contre le cancer du sein. Bike Land soutient cette
              noble cause qu&apos;est la sensibilisation contre le cancer du sein. Ainsi, nous
              organisons une sortie à vélo, tous en rose, pour rappeler qu&apos;un dépistage à temps
              peut sauver des vies.
            </p>
            <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed">
              Le prix de la balade est forfaitaire afin de faire participer un maximum de personnes.
              Alors inscrivez-vous pour apporter votre pierre à l&apos;édifice.
            </p>
            {sortie ? (
              <dl className="mt-8 max-w-xl">
                <Repere terme="Date">{jourOctobreRose()}</Repere>
                <Repere terme="Rassemblement">{formatHoraire(sortie.rassemblement)}, au point de départ</Repere>
                <Repere terme="Départ et retour">{horaireDeLaSortie(sortie)}</Repere>
                <Repere terme="Dress code">{sortie.tenue}</Repere>
                {circuit && (
                  <Repere terme="Itinéraire">
                    {circuit.region}, {circuit.distanceKm} km
                  </Repere>
                )}
                <Repere terme="Tarif">
                  <span className="font-display text-[1.25rem]">{tarifOctobreRose()}</span>, tous&nbsp;vélos
                </Repere>
                <Repere terme="Compris">Vélo et casque</Repere>
                <Repere terme="Offert à chacun">{texteOffertOctobreRose()}</Repere>
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
            {payants.length > 0 ? (
              <InscriptionOctobreRose
                jours={payants.map((etat) => ({
                  date: etat.sortie.date,
                  places: etat.places,
                  placesEnAttente: etat.placesEnAttente,
                  ouvertEnLigne: etat.ouverteEnLigne,
                }))}
                maxParInscription={PLACES_MAX_PAR_INSCRIPTION}
                maintenantAuServeur={maintenant.getTime()}
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
                  {/* Sans la durée habituelle du circuit : celle de la sortie se lit
                      dans ses heures, du départ au retour. */}
                  {circuit.distanceKm} km aller-retour · niveau{" "}
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
                  className="lien-souligne cible-elargie mt-4 inline-block text-[0.85rem] font-semibold"
                >
                  Voir l&apos;itinéraire en détail
                </Link>
              </div>
            )}

            <div className="rounded-[var(--radius-bloc)] bg-white p-6">
              <p className="etiquette opacity-75">Bon à savoir</p>
              <ul className="mt-3 space-y-2.5 text-[0.9rem] leading-relaxed">
                <li>Un vélo vous est attribué : le prix est le même pour tous nos vélos.</li>
                <li>
                  Vélo et casque fournis, {texteOffertOctobreRose()} offerts à chacun, sans caution&nbsp;: la
                  sortie est encadrée.
                </li>
                <li>D&apos;autres créneaux pourront ouvrir selon la demande.</li>
                <li>
                  Le point de départ exact et la facture arrivent par email dès le paiement.
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
