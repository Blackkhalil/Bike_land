import {
  GAMMES,
  GRILLE_HORAIRE,
  PRIX_GBASHI_BIKE_XOF,
  PRIX_ROAD_TRIP_XOF,
  prixRoadTripMinimum,
} from "@/data/offres";
import type { SortieOctobreRose } from "@/data/octobre-rose";
import { formatXof } from "@/lib/format";
import { IMAGE_PARTAGE } from "@/lib/seo";
import { site } from "@/lib/site";
import type { Itineraire, Velo } from "@/lib/types";

/**
 * Données structurées schema.org (JSON-LD), lues par Google pour
 * comprendre qui est Bike Land et ce que décrit chaque page. Rendues par
 * le composant DonneesStructurees.
 *
 * Deux règles :
 *  - rien qui ne soit sur le site : l'adresse précise et le point de
 *    départ restent réservés aux clients (src/lib/site.ts), seules la
 *    ville et le pays sont donnés ;
 *  - les notes ne viennent que d'avis réels de clients, et ne sont
 *    publiées que lorsqu'il y en a.
 */

const ID_ENTREPRISE = `${site.url}/#entreprise`;
const ID_SITE = `${site.url}/#site`;

/**
 * L'entreprise nommée en quelques mots, pour les pages autres que
 * l'accueil : Google ne relie pas un `@id` d'une page à l'autre, il lui
 * faut au moins le nom et l'adresse du site sur place.
 */
const REFERENCE_ENTREPRISE = { "@type": "LocalBusiness", "@id": ID_ENTREPRISE, name: site.nom, url: site.url };

/** Une adresse du site rendue complète, comme schema.org l'attend. */
export function adresseComplete(chemin: string): string {
  return /^https?:\/\//.test(chemin) ? chemin : `${site.url}${chemin}`;
}

/** Location à l'heure : l'offre est une mise à disposition, pas une vente. */
const LOCATION = "http://purl.org/goodrelations/v1#LeaseOut";

/** Du plus petit au plus grand prix affiché sur le site, en FCFA. */
function fourchetteDePrix(): string {
  const prix = [
    ...Object.values(GRILLE_HORAIRE).flatMap((grille) => grille.map((palier) => palier.prixXof)),
    ...Object.values(PRIX_ROAD_TRIP_XOF),
    ...Object.values(PRIX_GBASHI_BIKE_XOF),
  ];
  return `${formatXof(Math.min(...prix))} – ${formatXof(Math.max(...prix))}`;
}

/** L'entreprise, telle que Google peut l'afficher (fiche, logo, contacts). */
export function entreprise() {
  return {
    "@type": "LocalBusiness",
    "@id": ID_ENTREPRISE,
    name: site.nom,
    description: site.description,
    url: site.url,
    logo: adresseComplete("/logo/bikeland-carre.svg"),
    image: adresseComplete(IMAGE_PARTAGE.url),
    telephone: site.telephone,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: site.adresse.ville,
      addressCountry: "BJ",
    },
    areaServed: { "@type": "City", name: site.adresse.ville },
    priceRange: fourchetteDePrix(),
    currenciesAccepted: "XOF",
    paymentAccepted: "Mobile Money (MTN, Moov, Celtiis), espèces",
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: site.horairesOuverture.jours,
      opens: site.horairesOuverture.ouverture,
      closes: site.horairesOuverture.fermeture,
    },
    // Les comptes du gérant ; le lien WhatsApp n'est pas un profil.
    sameAs: site.reseaux.filter((reseau) => reseau.nom !== "WhatsApp").map((reseau) => reseau.url),
  };
}

/** L'accueil : le site et l'entreprise qui l'édite. */
export function accueil() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": ID_SITE,
        url: site.url,
        name: site.nom,
        inLanguage: "fr-BJ",
        publisher: { "@id": ID_ENTREPRISE },
      },
      entreprise(),
    ],
  };
}

/**
 * Le fil d'Ariane d'une page, que Google affiche à la place de l'adresse
 * dans ses résultats. L'accueil en est toujours le premier maillon.
 */
export function filDAriane(maillons: { nom: string; chemin: string }[]) {
  const etapes = [{ nom: "Accueil", chemin: "/" }, ...maillons];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: etapes.map((etape, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: etape.nom,
      item: etape.chemin === "/" ? site.url : adresseComplete(etape.chemin),
    })),
  };
}

/**
 * Un vélo du parc, proposé à la location : à l'heure (prix de la première
 * heure) et en road trip (prix par personne du jour le moins cher).
 */
export function veloALouer(velo: Velo) {
  const gamme = GAMMES.find((g) => g.code === velo.gamme);
  const url = adresseComplete(`/velos/${velo.slug}`);
  const disponible = velo.statut !== "MAINTENANCE" && velo.statut !== "RETIRE";
  const offre = (nom: string, prix: number, unite?: "HUR") => ({
    "@type": "Offer",
    name: nom,
    price: prix,
    priceCurrency: "XOF",
    businessFunction: LOCATION,
    availability: disponible ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    url,
    seller: REFERENCE_ENTREPRISE,
    ...(unite
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: prix,
            priceCurrency: "XOF",
            unitCode: unite,
            referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: unite },
          },
        }
      : {}),
  });

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: velo.nom,
    description: velo.description || velo.accroche,
    category: gamme ? `Vélo ${gamme.nom}` : "Vélo",
    ...(velo.photo ? { image: adresseComplete(velo.photo) } : {}),
    url,
    offers: [
      offre("Location à l'heure", GRILLE_HORAIRE[velo.gamme][0].prixXof, "HUR"),
      offre("Road trip encadré, par personne", prixRoadTripMinimum(velo.gamme)),
    ],
    // Des avis réels de clients, et seulement s'il y en a.
    ...(velo.nombreAvis > 0 && velo.noteMoyenne > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: velo.noteMoyenne,
            reviewCount: velo.nombreAvis,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** Un circuit à vélo, encadré par Bike Land. */
export function circuit(itineraire: Itineraire) {
  return {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: itineraire.titre,
    description: itineraire.resume,
    url: adresseComplete(`/itineraires/${itineraire.slug}`),
    touristType: "Cyclisme",
    ...(itineraire.photo ? { image: adresseComplete(itineraire.photo) } : {}),
    provider: REFERENCE_ENTREPRISE,
    itinerary: {
      "@type": "ItemList",
      itemListElement: itineraire.etapes.map((etape, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: etape.titre,
      })),
    },
  };
}

/** « 2026-10-24 » et « 16:30 » deviennent une date ISO à l'heure du Bénin. */
function instantAuBenin(date: string, horaire: string): string {
  return `${date}T${horaire}:00+01:00`;
}

/**
 * Les sorties Octobre rose encore à venir, en événements que Google peut
 * afficher (date, lieu, prix). Une sortie passée n'en produit plus : la
 * page reste en ligne toute l'année sans annoncer de date écoulée.
 */
export function sortiesOctobreRose(sorties: readonly SortieOctobreRose[], maintenant: Date) {
  return sorties
    .filter((sortie) => new Date(instantAuBenin(sortie.date, sortie.depart)) > maintenant)
    .map((sortie) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Octobre rose à vélo avec Bike Land",
      description:
        "Une balade à vélo tout en rose, à Cotonou, pour rappeler qu'un dépistage à temps du cancer du sein peut sauver des vies.",
      startDate: instantAuBenin(sortie.date, sortie.depart),
      endDate: instantAuBenin(sortie.date, sortie.retour),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: site.adresse.ville,
        address: { "@type": "PostalAddress", addressLocality: site.adresse.ville, addressCountry: "BJ" },
      },
      image: adresseComplete(IMAGE_PARTAGE.url),
      organizer: REFERENCE_ENTREPRISE,
      offers: {
        "@type": "Offer",
        price: sortie.prixXof,
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
        url: adresseComplete("/octobre-rose"),
      },
    }));
}
