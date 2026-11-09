import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { BoutonLien } from "@/components/Bouton";
import { EnSaisonOctobreRose } from "@/components/EnSaisonOctobreRose";
import { GalerieAffiches } from "@/components/GalerieAffiches";
import { SelonInscriptionsOctobreRose } from "@/components/SelonInscriptionsOctobreRose";
import { LienChoixProduit } from "@/components/LienChoixProduit";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { AFFICHES_GBASHI, AFFICHES_PADEL, AFFICHES_ROAD_TRIP } from "@/data/affiches";
import { itineraireOctobreRose, itineraires } from "@/data/contenus";
import { formatHoraire, OCTOBRE_ROSE, texteOffertOctobreRose } from "@/data/octobre-rose";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  departsComplets,
  DUREE_MAX_LOCATION_LIBRE,
  DUREE_PADEL_HEURES,
  DERNIER_DEPART_HEURE,
  FERMETURE_HEURE,
  formatHeure,
  GAMMES,
  gammesDuDepart,
  GRILLE_HORAIRE,
  OFFRES,
  PRIX_MINIMUM_HEURE_XOF,
  PRIX_GBASHI_BIKE_XOF,
  PRIX_MINIMUM_GBASHI_BIKE_XOF,
  PRIX_MINIMUM_ROAD_TRIP_XOF,
  PERSONNES_MIN_ROAD_TRIP,
  PRIX_PADEL_BIKE_XOF,
  PRIX_ROAD_TRIP_XOF,
  roadTripPossible,
  velosEnEtatDe,
} from "@/data/offres";
import {
  CRENEAU_GBASHI_BIKE,
  CRENEAU_ROAD_TRIP,
  inscriptionsOctobreRoseOuvertes,
  jourDeLaSortie,
  jourOctobreRose,
  MESSAGES_WHATSAPP,
  octobreRoseEnCours,
  placesRestantes,
  tarifOctobreRose,
} from "@/data/produits";
import { depot } from "@/lib/db";
import { formatDateAvecJour, formatXof } from "@/lib/format";
import { etatsSortiesOctobreRose, lireOuverture } from "@/lib/ouverture";
import { lienWhatsApp, site } from "@/lib/site";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { filDAriane } from "@/lib/donnees-structurees";
import { metadonneesPage } from "@/lib/seo";

/** L'heure de vélo la moins chère, toutes gammes confondues. */
const PRIX_HEURE_MINIMUM = Math.min(...Object.values(GRILLE_HORAIRE).map((grille) => grille[0].prixXof));

export const metadata: Metadata = metadonneesPage({
  titre: "Road trip, Padel bike, Gbashi bike et location",
  description:
    `Road trip le samedi dès ${formatXof(PRIX_MINIMUM_ROAD_TRIP_XOF)} et location à l'heure dès ` +
    `${formatXof(PRIX_HEURE_MINIMUM)} à Cotonou. Sur commande : Padel bike à ${formatXof(PRIX_PADEL_BIKE_XOF)}, ` +
    `Gbashi bike dès ${formatXof(PRIX_MINIMUM_GBASHI_BIKE_XOF)}.`,
  chemin: "/produits",
});

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

/** La mention d'un départ plein, fermé par l'exploitant dans le tableau de bord. */
function SoldOut({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-[var(--radius-bouton)] bg-craie px-2 py-0.5 align-middle text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-noir-piste ${className}`}
    >
      Sold out
    </span>
  );
}

/**
 * Les repères de départ d'une sortie du week-end : le prochain départ, et
 * s'il est « Sold out », la prochaine date encore ouverte.
 */
function ReperesDepart({
  complet,
  ouvert,
}: {
  complet?: { date: string };
  ouvert?: { date: string };
}) {
  if (complet) {
    return (
      <>
        <Repere terme="Prochain départ">
          {majuscule(formatDateAvecJour(complet.date))} <SoldOut className="ml-1" />
        </Repere>
        {ouvert && <Repere terme="Places disponibles">{majuscule(formatDateAvecJour(ouvert.date))}</Repere>}
      </>
    );
  }
  return (
    <Repere terme="Prochain départ">
      {ouvert ? majuscule(formatDateAvecJour(ouvert.date)) : "Pas ouvert en ligne en ce moment"}
    </Repere>
  );
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
 * Le numéro WhatsApp de l'équipe, en clair, pour un produit sur commande :
 * on peut l'enregistrer ou le recopier. Le toucher ouvre la discussion,
 * message déjà écrit, comme le bouton.
 */
function NumeroWhatsApp({ message }: { message: string }) {
  return (
    <a
      href={lienWhatsApp(message)}
      target="_blank"
      rel="noreferrer noopener"
      className="lien-souligne whitespace-nowrap tabular-nums"
    >
      {site.whatsapp[1].numero}
    </a>
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
 * Le road trip se réserve en ligne tant que son départ est ouvert dans le
 * tableau de bord. Fermé, son prochain départ reste affiché, « Sold out »,
 * avec la date suivante encore ouverte s'il y en a une ; sinon son bouton
 * passe à WhatsApp plutôt que de mener à un départ introuvable. Padel bike
 * et Gbashi bike se commandent sur WhatsApp : bouton et numéro en clair.
 * Octobre rose ne paraît qu'en octobre, en tête de page.
 */
export default async function PageProduits() {
  const [ouverture, parc] = await Promise.all([lireOuverture(), depot.listerVelos()]);
  // Le road trip du samedi se fait en groupe de dix au moins, un vélo par
  // personne, tous de la gamme choisie : seules les gammes qui ont ce prix
  // et assez de vélos en état le proposent (le Premium ; le Prestige n'a
  // qu'un vélo).
  const gammesDuGroupe = GAMMES.filter(
    (gamme) => PRIX_ROAD_TRIP_XOF[gamme.code] !== undefined && velosEnEtatDe(gamme.code, parc) >= PERSONNES_MIN_ROAD_TRIP,
  );
  const maintenant = new Date();
  const departs = creneauxDisponibles(maintenant, ouverture);
  const samedi = departs.find((depart) => depart.code === CRENEAU_ROAD_TRIP);
  // Un départ fermé dans le tableau de bord reste affiché, « Sold out ».
  const complets = departsComplets(maintenant, ouverture);
  const samediComplet = complets.find((depart) => depart.code === CRENEAU_ROAD_TRIP);
  const avecOctobreRose = octobreRoseEnCours(maintenant);
  // Octobre rose se réserve sur sa propre page. Ici, on dit seulement s'il
  // reste des places, jour par jour : quand plus aucun jour à venir n'en a,
  // complets ou fermés depuis le tableau de bord, la carte affiche « Sold
  // out » et renvoie vers WhatsApp. Les sorties partagent leurs horaires :
  // la première les dit pour toutes.
  const sortie = OCTOBRE_ROSE.sorties[0] ?? null;
  const joursRose = avecOctobreRose
    ? (await etatsSortiesOctobreRose(maintenant, ouverture)).filter((etat) => !etat.partie)
    : [];
  // Des sorties fixées, payantes, s'inscrivent en ligne. Les heures
  // limites, elles, se relisent dans le navigateur
  // (SelonInscriptionsOctobreRose) : la page peut dater d'avant.
  const roseEnLigne = OCTOBRE_ROSE.sorties.some((sortieRose) => sortieRose.prixXof > 0);
  const roseComplete = joursRose.every((etat) => !etat.inscriptionsOuvertes || etat.complete || etat.places === 0);
  const roseOuverteAuServeur = inscriptionsOctobreRoseOuvertes(maintenant);
  const circuitRose = itineraireOctobreRose();

  const roadTrip = OFFRES.find((offre) => offre.code === "road-trip");
  const locationLibre = OFFRES.find((offre) => offre.code === "location-libre");
  const forfait = GRILLE_HORAIRE.CLASSIQUE[GRILLE_HORAIRE.CLASSIQUE.length - 1];

  const sommaire = [
    { id: "padel-bike", nom: "Padel bike" },
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
      <DonneesStructurees donnees={filDAriane([{ nom: "Nos produits", chemin: "/produits" }])} />
      <Section fond="noir" className="pb-14 pt-32 sm:pt-40">
        <TitreSection as="h1" taille="lg" className="max-w-4xl">
          Une seule route,
          <br />
          plusieurs envies
        </TitreSection>
        <p className="mt-6 max-w-2xl text-[1.02rem] leading-relaxed text-craie/70">
          À vélo jusqu&apos;au padel, en groupe le samedi, version sport le dimanche, ou en solo à
          l&apos;heure&nbsp;: tout part de la route des Pêches, à Fidjrossè.
          <EnSaisonOctobreRose enSaisonAuServeur={avecOctobreRose}>
            {" Et ce mois-ci, des sorties aux couleurs d'Octobre rose."}
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
              <div className="flex flex-wrap gap-2">
                <Pastille ton="sombre">En octobre seulement</Pastille>
                {roseEnLigne && (
                  <SelonInscriptionsOctobreRose
                    ouvertesAuServeur={roseOuverteAuServeur}
                    ouvertes={roseComplete ? <Pastille ton="neutre">Sold out</Pastille> : null}
                    closes={<Pastille ton="neutre">Inscriptions closes</Pastille>}
                  />
                )}
              </div>
              <TitreSection className="mt-5">Octobre rose</TitreSection>
              <p className="mt-3 font-display text-[1.4rem] leading-tight">Roulez en rose avec nous</p>
              <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed">
                Des sorties à vélo aux couleurs d&apos;Octobre rose, le mois de sensibilisation au
                cancer du sein. Bike Land soutient la cause&nbsp;: un prix forfaitaire, le même pour
                tous nos vélos. On roule ensemble, tous en rose.
              </p>
              <dl className="mt-8 max-w-md">
                {sortie ? (
                  <>
                    <Repere terme="Quand">{jourOctobreRose()}</Repere>
                    <Repere terme="Rassemblement">
                      {formatHoraire(sortie.rassemblement)}, départ {formatHoraire(sortie.depart)}
                    </Repere>
                    <Repere terme="Retour">Vers {formatHoraire(sortie.retour)}</Repere>
                    <Repere terme="Dress code">{sortie.tenue}</Repere>
                    {circuitRose && (
                      <Repere terme="Itinéraire">
                        {circuitRose.region}, {circuitRose.distanceKm} km
                      </Repere>
                    )}
                    <Repere terme="Tarif">{tarifOctobreRose()}, tous&nbsp;vélos</Repere>
                    <Repere terme="Compris">Vélo et casque</Repere>
                    <Repere terme="Offert à chacun">{texteOffertOctobreRose()}</Repere>
                  </>
                ) : (
                  <>
                    <Repere terme="Quand">Date annoncée très bientôt</Repere>
                    <Repere terme="Inscription">Sur WhatsApp</Repere>
                  </>
                )}
              </dl>
              <div className="mt-8">
                {roseEnLigne ? (
                  <SelonInscriptionsOctobreRose
                    ouvertesAuServeur={roseOuverteAuServeur}
                    ouvertes={
                      roseComplete ? (
                        <>
                        <BoutonLien
                          href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
                          target="_blank"
                          rel="noreferrer noopener"
                          variante="sombre"
                          taille="lg"
                        >
                          Écrire sur WhatsApp
                        </BoutonLien>
                        <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed">
                          Les places en ligne sont parties&nbsp;: écrivez-nous, si une place se libère, nous vous la gardons.
                        </p>
                      </>
                      ) : (
                        <>
                          <BoutonLien href="/octobre-rose#inscription" variante="sombre" taille="lg">
                            Je réserve ma place
                          </BoutonLien>
                          <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed">
                            Pas de vélo à choisir&nbsp;: choisissez votre jour, dites combien vous êtes
                            et payez par Mobile Money.
                          </p>
                          <ul className="mt-2 max-w-md space-y-0.5 text-[0.85rem]">
                            {joursRose.map((etat) => (
                              <li key={etat.sortie.date}>
                                <span className="font-semibold">{jourDeLaSortie(etat.sortie)}</span>&nbsp;:{" "}
                                {etat.inscriptionsOuvertes && !etat.complete && etat.places > 0
                                  ? placesRestantes(etat.places)
                                  : "plus de place en ligne."}
                              </li>
                            ))}
                          </ul>
                        </>
                      )
                    }
                    closes={
                      <>
                        <BoutonLien
                          href={lienWhatsApp(MESSAGES_WHATSAPP.octobreRose)}
                          target="_blank"
                          rel="noreferrer noopener"
                          variante="sombre"
                          taille="lg"
                        >
                          Écrire sur WhatsApp
                        </BoutonLien>
                        <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed">
                          Les inscriptions en ligne sont closes&nbsp;: il reste peut-être un vélo, écrivez-nous avant le rassemblement.
                        </p>
                      </>
                    }
                  />
                ) : (
                  <>
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
                          Écrivez-nous sur WhatsApp&nbsp;: nous vous envoyons la date dès qu&apos;elle est fixée.
                        </p>
                      </>
                )}
              </div>
            </div>
          </div>
        </Section>
      </EnSaisonOctobreRose>

      {/* -------------------------------------------------- Padel bike */}
      {/* Le nouveau produit, en tête : sur commande, sur WhatsApp, tant que
          ses jours et ses heures ne sont pas fixés. */}
      <Section id="padel-bike" fond="craie" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0 lg:order-last">
            <GalerieAffiches
              affiches={AFFICHES_PADEL}
              titre="Les images de Padel bike"
              nom={{ singulier: "image", pluriel: "images" }}
            />
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              <Pastille ton="succes">Nouveau</Pastille>
              <Pastille ton="neutre">Sur commande</Pastille>
            </div>
            <TitreSection className="mt-5">Padel bike</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">
              Le vélo pour y aller, le padel pour jouer
            </p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-gris-cadre">
              Le concept est simple&nbsp;: on démarre à vélo pour s&apos;échauffer, tous ensemble et
              dans la bonne humeur, jusqu&apos;au terrain de padel. Sur place, {DUREE_PADEL_HEURES}{" "}
              heures de padel entre amis.
            </p>
            <dl className="mt-8 max-w-md">
              <Repere terme="Programme">
                À vélo, puis {DUREE_PADEL_HEURES}&nbsp;h de padel
              </Repere>
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem] text-orange-sourd">
                  {formatXof(PRIX_PADEL_BIKE_XOF)}
                </span>{" "}
                par personne
              </Repere>
              <Repere terme="Réservation">Sur commande, sur WhatsApp</Repere>
              <Repere terme="WhatsApp">
                <NumeroWhatsApp message={MESSAGES_WHATSAPP.padelBike} />
              </Repere>
            </dl>
            <div className="mt-8">
              <BoutonLien
                href={lienWhatsApp(MESSAGES_WHATSAPP.padelBike)}
                target="_blank"
                rel="noreferrer noopener"
                variante="primaire"
                taille="lg"
              >
                Commander sur WhatsApp
              </BoutonLien>
              <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-gris-cadre">
                Dites-nous le jour qui vous arrange et le nombre de personnes&nbsp;: nous organisons
                la sortie.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------- Gbashi bike */}
      {/* Sur commande depuis novembre 2026 : plus de réservation en ligne,
          le numéro WhatsApp en clair à côté du bouton. */}
      <Section id="gbashi-bike" fond="lagune" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <GalerieAffiches affiches={AFFICHES_GBASHI} titre="Les affiches de Gbashi bike" />
          <div>
            <div className="flex flex-wrap gap-2">
              <Pastille ton="sombre">Le dimanche</Pastille>
              <Pastille ton="neutre">Sur commande</Pastille>
            </div>
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
              <Repere terme="Réservation">Sur commande, sur WhatsApp</Repere>
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem]">dès {formatXof(PRIX_MINIMUM_GBASHI_BIKE_XOF)}</span>{" "}
                par personne
                <span className="block text-[0.82rem] font-normal opacity-80">
                  {/* Chaque gamme reste avec son prix, en bout de ligne aussi. */}
                  {GAMMES.map((gamme, index) => (
                    <Fragment key={gamme.code}>
                      {index > 0 && " · "}
                      <span className="whitespace-nowrap">
                        {gamme.nom} {formatXof(PRIX_GBASHI_BIKE_XOF[gamme.code])}
                      </span>
                    </Fragment>
                  ))}
                </span>
              </Repere>
              <Repere terme="Compris">Vélo, casque, antivol, kit, eau et coco frais</Repere>
              <Repere terme="À prévoir">Une tenue de sport, et quinze minutes d&apos;avance</Repere>
              <Repere terme="WhatsApp">
                <NumeroWhatsApp message={MESSAGES_WHATSAPP.gbashiBike} />
              </Repere>
            </dl>
            <div className="mt-8">
              <BoutonLien
                href={lienWhatsApp(MESSAGES_WHATSAPP.gbashiBike)}
                target="_blank"
                rel="noreferrer noopener"
                variante="clair"
                taille="lg"
              >
                Commander sur WhatsApp
              </BoutonLien>
              <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-craie/85">
                Gbashi bike ne se réserve plus en ligne&nbsp;: dites-nous le dimanche choisi et le
                nombre de personnes, nous organisons la sortie. Le prix dépend de la gamme.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------- Road trip */}
      <Section id="road-trip" fond="noir" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0 lg:order-last">
            <GalerieAffiches affiches={AFFICHES_ROAD_TRIP} titre="Les affiches du road trip" />
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              <Pastille ton="succes">Le samedi</Pastille>
              {samediComplet && <Pastille ton="neutre">Sold out</Pastille>}
            </div>
            <TitreSection className="mt-5">Road trip</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">{roadTrip?.accroche}</p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-craie/75">
              Un de nos deux circuits, roulé ensemble avec un coordinateur qui ouvre la route, au
              rythme du groupe&nbsp;: {PERSONNES_MIN_ROAD_TRIP} personnes au moins. Aucune caution
              n&apos;est demandée.
            </p>
            <dl className="mt-8 max-w-md">
              <Repere terme="Départ">Le samedi à {heureDuCreneau(CRENEAU_ROAD_TRIP)}, en groupe</Repere>
              <Repere terme="Groupe">{PERSONNES_MIN_ROAD_TRIP} personnes minimum</Repere>
              <ReperesDepart complet={samediComplet} ouvert={samedi} />
              <Repere terme="Tarif">
                <span className="font-display text-[1.2rem] text-orange-signal">
                  dès {formatXof(PRIX_MINIMUM_ROAD_TRIP_XOF)}
                </span>{" "}
                par personne
              </Repere>
              {/* Le samedi se roule en Premium ou Prestige, un vélo par
                  personne : seules les gammes qui ont assez de vélos pour un
                  groupe sont nommées. Le Classique a la location libre, et
                  Gbashi bike le dimanche, sur commande. */}
              <Repere terme="Vélos">
                {gammesDuGroupe.length > 0
                  ? gammesDuGroupe.map((gamme) => gamme.nom).join(" ou ")
                  : gammesDuDepart(CRENEAU_ROAD_TRIP)}
                , un par personne
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
                  {` · ${itineraire.distanceKm} km · ${itineraire.duree.toLowerCase()}`}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              {samedi && gammesDuGroupe.some((gamme) => roadTripPossible(gamme.code, samedi.date)) ? (
                // Un bouton par gamme qui peut emmener un groupe ce samedi,
                // plutôt que les trois gammes.
                gammesDuGroupe.filter((gamme) => roadTripPossible(gamme.code, samedi.date)).map((gamme, index) => (
                  <LienChoixProduit
                    key={gamme.code}
                    href={`/reserver/${gamme.code.toLowerCase()}`}
                    choix={CRENEAU_ROAD_TRIP}
                    variante={index === 0 ? "primaire" : "contour"}
                    taille="lg"
                    className={index === 0 ? undefined : "text-craie"}
                  >
                    Road trip en {gamme.nom}
                  </LienChoixProduit>
                ))
              ) : (
                <BoutonLien
                  href={lienWhatsApp(MESSAGES_WHATSAPP.roadTrip)}
                  target="_blank"
                  rel="noreferrer noopener"
                  variante="primaire"
                  taille="lg"
                >
                  Écrire sur WhatsApp
                </BoutonLien>
              )}
              <BoutonLien href="/itineraires" variante="contour" taille="lg" className="text-craie">
                Voir les circuits
              </BoutonLien>
            </div>
            {!samedi && (
              <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-craie/75">
                {samediComplet
                  ? "Le prochain samedi est sold out : écrivez-nous pour les suivants."
                  : "Le départ du samedi ne se réserve pas en ligne en ce moment : écrivez-nous."}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------- Location libre */}
      <Section id="location-libre" fond="craie" className="scroll-mt-[72px] py-20 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Un vélo Premium du parc, la gamme la plus prise (choix de
              l'exploitant, novembre 2026) : le Muddyfox, tiré de sa fiche. */}
          <PhotoProduit
            src="/images/produits/location-libre-premium.jpg"
            alt="Le Muddyfox noir et bleu, VTT tout-suspendu de la gamme Premium du parc Bike Land"
            format="aspect-[4/3]"
            entiere
          />
          <div>
            <Pastille ton="neutre">À l&apos;heure</Pastille>
            <TitreSection className="mt-5">Location libre</TitreSection>
            <p className="mt-3 font-display text-[1.4rem] leading-tight">{locationLibre?.accroche}</p>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-gris-cadre">
              Vous prenez le vélo et vous roulez où vous voulez, à votre rythme, de 1 à{" "}
              {DUREE_MAX_LOCATION_LIBRE} heures. Départs jusqu&apos;à {formatHeure(DERNIER_DEPART_HEURE)}, le vélo
              revient à l&apos;atelier à {formatHeure(FERMETURE_HEURE)} au plus tard.
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
                Choisir ma gamme
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
            Tarifs de la réservation en ligne&nbsp;: le montant exact à régler s&apos;affiche avant le
            paiement. Padel bike et Gbashi bike se commandent sur WhatsApp, au{" "}
            <span className="whitespace-nowrap">{site.whatsapp[1].numero}</span>.
          </p>
        </div>
      </Section>
    </>
  );
}
