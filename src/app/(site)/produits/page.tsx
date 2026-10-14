import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BoutonLien } from "@/components/Bouton";
import { EnSaisonOctobreRose } from "@/components/EnSaisonOctobreRose";
import { LienChoixProduit } from "@/components/LienChoixProduit";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { itineraires } from "@/data/contenus";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  DUREE_MAX_LOCATION_LIBRE,
  FERMETURE_HEURE,
  formatHeure,
  GRILLE_HORAIRE,
  OFFRES,
  PRIX_MINIMUM_HEURE_XOF,
  PRIX_MINIMUM_ROAD_TRIP_XOF,
} from "@/data/offres";
import {
  CRENEAU_GBASHI_BIKE,
  CRENEAU_ROAD_TRIP,
  MESSAGES_WHATSAPP,
  OCTOBRE_ROSE,
  octobreRoseEnCours,
  rendezVousOctobreRose,
  tarifOctobreRose,
} from "@/data/produits";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { lireOuverture } from "@/lib/ouverture";
import { lienWhatsApp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Nos produits",
  description:
    "Gbashi bike, le road trip du dimanche avec séance de sport devant la plage, le road trip encadré du samedi et la location libre à l'heure, sur la route des Pêches à Cotonou.",
  alternates: { canonical: "/produits" },
};

/**
 * Régénérée au plus une fois par minute, à la demande, comme les fiches
 * vélo : la page lit les départs ouverts dans le tableau de bord, et la
 * saison d'Octobre rose à l'heure du Bénin. Un changement d'ouverture la
 * rafraîchit aussitôt. Une copie plus ancienne peut encore être servie
 * ou préchargée : la saison est donc relue dans le navigateur
 * (EnSaisonOctobreRose).
 */
export const revalidate = 60;

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** L'heure de départ d'un créneau encadré, telle que fixée dans les offres. */
function heureDuCreneau(code: string): string {
  const creneau = CRENEAUX_ROAD_TRIP.find((c) => c.code === code) ?? CRENEAUX_ROAD_TRIP[0];
  return formatHeure(creneau.heureDebut);
}

/** Une ligne de repères : le terme à gauche, la valeur à droite. */
function Repere({ terme, children }: { terme: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-current/15 py-3.5 first:border-t">
      <dt className="shrink-0 text-[0.85rem]">{terme}</dt>
      <dd className="text-right text-[0.95rem] font-semibold">{children}</dd>
    </div>
  );
}

/**
 * La photo d'un produit, en grand bloc arrondi. Les photos de sortie
 * remplissent leur cadre ; la photo d'atelier d'un vélo, sur fond blanc,
 * y tient entière.
 */
function PhotoProduit({
  src,
  alt,
  format = "aspect-[4/3] lg:aspect-[4/5]",
  cadrage = "object-center",
  entiere = false,
  className = "",
}: {
  src: string;
  alt: string;
  format?: string;
  cadrage?: string;
  entiere?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-bloc)] ${
        entiere ? "bg-white" : "bg-noir-releve"
      } ${format} ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw"
        className={entiere ? "object-contain p-6 sm:p-10" : `object-cover ${cadrage}`}
      />
    </div>
  );
}

/**
 * Nos produits : les façons de rouler, côte à côte (voir src/data/produits.ts).
 *
 * Gbashi bike et le road trip se réservent en ligne tant que leur départ
 * est ouvert dans le tableau de bord ; fermé, leur bouton passe à
 * WhatsApp plutôt que de mener à un départ introuvable. Octobre rose ne
 * paraît qu'en octobre, en tête de page.
 */
export default async function PageProduits() {
  const ouverture = await lireOuverture();
  const maintenant = new Date();
  const departs = creneauxDisponibles(maintenant, ouverture);
  const dimanche = departs.find((depart) => depart.code === CRENEAU_GBASHI_BIKE);
  const samedi = departs.find((depart) => depart.code === CRENEAU_ROAD_TRIP);
  const avecOctobreRose = octobreRoseEnCours(maintenant);
  const rendezVous = rendezVousOctobreRose();

  const roadTrip = OFFRES.find((offre) => offre.code === "road-trip");
  const locationLibre = OFFRES.find((offre) => offre.code === "location-libre");
  const forfait = GRILLE_HORAIRE.CLASSIQUE[GRILLE_HORAIRE.CLASSIQUE.length - 1];

  const sommaire = [
    { id: "gbashi-bike", nom: "Gbashi bike" },
    { id: "road-trip", nom: "Road trip" },
    { id: "location-libre", nom: "Location libre" },
  ];
  const classeAncre =
    "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-bouton)] border border-craie/25 px-4 text-[0.85rem] font-semibold text-craie transition-colors hover:border-craie/60";

  // Tout ce qui touche à Octobre rose est envoyé à chaque fois, et passe
  // par EnSaisonOctobreRose : une copie en cache de la veille de la
  // bascule est corrigée dans le navigateur, dans un sens comme dans l'autre.
  return (
    <>
      <Section fond="noir" className="pb-14 pt-32 sm:pt-40">
        <TitreSection as="h1" taille="lg" className="max-w-4xl">
          Une seule route,
          <br />
          plusieurs envies
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-craie/70">
          En groupe le samedi, version sport le dimanche, ou en solo à l&apos;heure&nbsp;: tout part de
          la route des Pêches, à Fidjrossè.
          <EnSaisonOctobreRose enSaisonAuServeur={avecOctobreRose}>
            {" Et ce mois-ci, une sortie aux couleurs d'Octobre rose."}
          </EnSaisonOctobreRose>
        </p>
        <nav aria-label="Nos produits" className="mt-10 flex flex-wrap gap-2">
          <EnSaisonOctobreRose enSaisonAuServeur={avecOctobreRose}>
            <a href="#octobre-rose" className={classeAncre}>
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-octobre" />
              Octobre rose
            </a>
          </EnSaisonOctobreRose>
          {sommaire.map((produit) => (
            <a key={produit.id} href={`#${produit.id}`} className={classeAncre}>
              {produit.nom}
            </a>
          ))}
        </nav>
      </Section>

      {/* ------------------------------------------------ Octobre rose */}
      <EnSaisonOctobreRose enSaisonAuServeur={avecOctobreRose}>
        <Section id="octobre-rose" fond="rose" className="scroll-mt-[72px] py-20 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <PhotoProduit
              src="/images/produits/octobre-rose.jpg"
              alt="Deux cyclistes roulent côte à côte en souriant, sur la route des Pêches"
              cadrage="object-[50%_30%]"
              className="lg:order-last"
            />
            <div>
              <Pastille ton="sombre">En octobre seulement</Pastille>
              <TitreSection className="mt-5">Octobre rose</TitreSection>
              <p className="mt-3 font-display text-[1.4rem] leading-tight">Roulez en rose avec nous</p>
              <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed">
                Une sortie à vélo aux couleurs d&apos;Octobre rose, le mois de sensibilisation au
                cancer du sein. On roule ensemble, en rose, pour rappeler qu&apos;un dépistage
                précoce sauve des vies.
              </p>
              <dl className="mt-8 max-w-md">
                <Repere terme="Quand">
                  {rendezVous ? majuscule(rendezVous) : "Date annoncée très bientôt"}
                </Repere>
                <Repere terme="Tarif">
                  {tarifOctobreRose() ?? (OCTOBRE_ROSE.date ? "Sur demande" : "Annoncé avec la date")}
                </Repere>
                <Repere terme="Inscription">Sur WhatsApp</Repere>
              </dl>
              <div className="mt-8">
                <BoutonLien
                  href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
                  target="_blank"
                  rel="noreferrer noopener"
                  variante="sombre"
                  taille="lg"
                >
                  Je veux participer
                </BoutonLien>
                <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed">
                  {OCTOBRE_ROSE.date
                    ? "Écrivez-nous sur WhatsApp pour vous inscrire."
                    : "Écrivez-nous sur WhatsApp\u00a0: nous vous envoyons la date dès qu'elle est fixée."}
                </p>
              </div>
            </div>
          </div>
        </Section>
      </EnSaisonOctobreRose>

      {/* ------------------------------------------------- Gbashi bike */}
      <Section id="gbashi-bike" fond="lagune" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <PhotoProduit
            src="/images/produits/gbashi-bike.jpg"
            alt="Un cycliste et son vélo au pied d'un cocotier, sur le sable, face à la mer"
            cadrage="object-[50%_62%]"
          />
          <div>
            <Pastille ton="sombre">Le dimanche</Pastille>
            <TitreSection className="mt-5">Gbashi bike</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">
              Le road trip du dimanche, version sport
            </p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-craie/85">
              On roule ensemble jusqu&apos;à la plage, un coordinateur en tête. À l&apos;arrivée,
              place au sport&nbsp;: des exercices et des poids, comme à la salle, mais devant la plage.
              Puis eau et coco frais pour tout le monde, et retour en groupe.
            </p>
            <dl className="mt-8 max-w-md">
              <Repere terme="Départ">Le dimanche à {heureDuCreneau(CRENEAU_GBASHI_BIKE)}, en groupe</Repere>
              <Repere terme="Prochain départ">
                {dimanche ? majuscule(formatDateAvecJour(dimanche.date)) : "Pas ouvert en ligne en ce moment"}
              </Repere>
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem]">dès {formatXof(PRIX_MINIMUM_ROAD_TRIP_XOF)}</span>{" "}
                par personne
              </Repere>
              <Repere terme="Compris">Vélo, casque, antivol, kit, eau et coco frais</Repere>
              <Repere terme="À prévoir">Une tenue de sport, et quinze minutes d&apos;avance</Repere>
            </dl>
            <div className="mt-8">
              {dimanche ? (
                <>
                  <LienChoixProduit href="/velos" choix={CRENEAU_GBASHI_BIKE} variante="clair" taille="lg">
                    Réserver mon dimanche
                  </LienChoixProduit>
                  <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-craie/85">
                    Choisissez votre vélo&nbsp;: le départ du dimanche y sera déjà sélectionné. Le
                    prix dépend de la gamme du vélo.
                  </p>
                </>
              ) : (
                <>
                  <BoutonLien
                    href={lienWhatsApp(MESSAGES_WHATSAPP.gbashiBike)}
                    target="_blank"
                    rel="noreferrer noopener"
                    variante="clair"
                    taille="lg"
                  >
                    Réserver sur WhatsApp
                  </BoutonLien>
                  <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-craie/85">
                    Le départ du dimanche ne se réserve pas en ligne en ce moment&nbsp;: écrivez-nous.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------- Road trip */}
      <Section id="road-trip" fond="noir" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <PhotoProduit
            src="/images/produits/road-trip.jpg"
            alt="Un groupe de cyclistes Bike Land pose avec ses vélos sur la route des Pêches"
            format="aspect-[3/2]"
            className="lg:order-last"
          />
          <div>
            <Pastille ton="succes">Le samedi</Pastille>
            <TitreSection className="mt-5">Road trip</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">{roadTrip?.accroche}</p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-craie/75">
              Un de nos deux circuits, roulé ensemble avec un coordinateur qui ouvre la route, au
              rythme du groupe. Aucune caution n&apos;est demandée.
            </p>
            <dl className="mt-8 max-w-md">
              <Repere terme="Départ">Le samedi à {heureDuCreneau(CRENEAU_ROAD_TRIP)}, en groupe</Repere>
              <Repere terme="Prochain départ">
                {samedi ? majuscule(formatDateAvecJour(samedi.date)) : "Pas ouvert en ligne en ce moment"}
              </Repere>
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem] text-orange-signal">
                  dès {formatXof(PRIX_MINIMUM_ROAD_TRIP_XOF)}
                </span>{" "}
                par personne
              </Repere>
              <Repere terme="Compris">Vélo, casque, antivol, kit, eau et coco frais</Repere>
            </dl>
            <ul className="mt-6 max-w-md space-y-2 text-[0.88rem] text-craie/75">
              {itineraires.map((itineraire) => (
                <li key={itineraire.slug}>
                  <Link
                    href={`/itineraires/${itineraire.slug}`}
                    className="lien-souligne cible-elargie font-semibold text-craie"
                  >
                    {itineraire.titre}
                  </Link>
                  {` · ${itineraire.distanceKm} km · ${itineraire.duree.toLowerCase()}`}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              {samedi ? (
                <LienChoixProduit href="/velos" choix={CRENEAU_ROAD_TRIP} variante="primaire" taille="lg">
                  Choisir mon vélo
                </LienChoixProduit>
              ) : (
                <BoutonLien
                  href={lienWhatsApp(MESSAGES_WHATSAPP.roadTrip)}
                  target="_blank"
                  rel="noreferrer noopener"
                  variante="primaire"
                  taille="lg"
                >
                  Réserver sur WhatsApp
                </BoutonLien>
              )}
              <BoutonLien href="/itineraires" variante="contour" taille="lg" className="text-craie">
                Voir les circuits
              </BoutonLien>
            </div>
            {!samedi && (
              <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-craie/75">
                Le départ du samedi ne se réserve pas en ligne en ce moment&nbsp;: écrivez-nous.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------- Location libre */}
      <Section id="location-libre" fond="craie" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <PhotoProduit
            src="/images/produits/location-libre.jpg"
            alt="Un VTT tout-suspendu rouge et jaune du parc Bike Land"
            format="aspect-[4/3]"
            entiere
          />
          <div>
            <Pastille ton="neutre">À l&apos;heure</Pastille>
            <TitreSection className="mt-5">Location libre</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">{locationLibre?.accroche}</p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-gris-cadre">
              Vous prenez le vélo et vous roulez où vous voulez, à votre rythme, de 1 à{" "}
              {DUREE_MAX_LOCATION_LIBRE} heures. Le vélo revient à l&apos;atelier avant{" "}
              {formatHeure(FERMETURE_HEURE)}.
            </p>
            <dl className="mt-8 max-w-md">
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem] text-orange-sourd">
                  dès {formatXof(PRIX_MINIMUM_HEURE_XOF)}
                </span>{" "}
                l&apos;heure
              </Repere>
              <Repere terme={`Forfait ${forfait.heures} h`}>dès {formatXof(forfait.prixXof)}, le plus avantageux</Repere>
              <Repere terme="Au départ">Pièce d&apos;identité (CIP) et engagement signé</Repere>
              <Repere terme="Caution">{formatXof(CAUTION_LOCATION_LIBRE_XOF)}, rendue au retour</Repere>
            </dl>
            <div className="mt-8">
              <LienChoixProduit href="/velos" choix="location-libre" variante="primaire" taille="lg">
                Choisir mon vélo
              </LienChoixProduit>
            </div>
          </div>
        </div>
      </Section>

      <Section fond="noir-releve" className="py-20">
        <div className="mx-auto max-w-2xl text-center">
          <TitreSection>Une question avant de choisir&nbsp;?</TitreSection>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-craie/70">
            Le choix du vélo, une sortie en groupe, un horaire&nbsp;: écrivez-nous ou appelez,
            quelqu&apos;un vous répond.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <BoutonLien
              href={lienWhatsApp(MESSAGES_WHATSAPP.question)}
              target="_blank"
              rel="noreferrer noopener"
              variante="clair"
            >
              Écrire sur WhatsApp
            </BoutonLien>
            <BoutonLien
              href={`tel:${site.telephoneLien}`}
              variante="contour"
              className="border-craie/30 text-craie hover:bg-craie/10"
            >
              Appeler le {site.telephone}
            </BoutonLien>
          </div>
          <p className="mt-10 text-[0.8rem] leading-relaxed text-craie/60">
            Tarifs de la réservation en ligne. Le montant exact à régler s&apos;affiche avant le
            paiement.
          </p>
        </div>
      </Section>
    </>
  );
}
