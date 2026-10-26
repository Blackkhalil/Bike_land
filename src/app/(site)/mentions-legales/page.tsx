import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import { site } from "@/lib/site";
import { metadonneesPage } from "@/lib/seo";

export const metadata: Metadata = metadonneesPage({
  titre: "Mentions légales",
  description:
    "Mentions légales du site Bike Land, location de vélos à Cotonou : éditeur, hébergement, " +
    "propriété intellectuelle et réutilisation des contenus.",
  chemin: "/mentions-legales",
});

export default function PageMentionsLegales() {
  return (
    <PageLegale
      titre="Mentions légales"
      miseAJour="8 septembre 2026"
      sousTitre="Les informations que tout visiteur doit pouvoir trouver sur l'éditeur de ce site."
    >
      <ArticleLegal titre="Éditeur du site">
        <p>
          {site.nom}, entreprise de location de cycles.
          <br />
          Siège : {site.adresse.ville}, {site.adresse.pays}.
          {site.immatriculation.rccm ? (
            <>
              <br />
              Registre du commerce et du crédit mobilier (RCCM) : {site.immatriculation.rccm}.
            </>
          ) : null}
          {site.immatriculation.ifu ? (
            <>
              <br />
              Identifiant fiscal unique (IFU) : {site.immatriculation.ifu}.
            </>
          ) : null}
        </p>
        {!site.immatriculation.rccm || !site.immatriculation.ifu ? (
          <p>
            Les numéros d&apos;immatriculation au registre du commerce et du crédit mobilier et
            d&apos;identifiant fiscal unique seront publiés sur cette page dès leur attribution.
          </p>
        ) : null}
        <p>
          Téléphone&nbsp;: <span className="whitespace-nowrap">{site.telephone}</span>. Courriel&nbsp;: {site.email}
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Directeur de la publication">
        <p>Le représentant légal de {site.nom}.</p>
      </ArticleLegal>

      <ArticleLegal titre="Hébergement">
        <p>
          Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.
          La base de données est hébergée par Supabase, sur une infrastructure Amazon Web Services
          située à Londres, au Royaume-Uni.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Propriété intellectuelle">
        <p>
          L&apos;ensemble des contenus de ce site, textes, photos, vidéos, affiches,
          illustrations, mise en page, identité visuelle, tarifs et descriptifs des vélos, est la
          propriété de {site.nom}, sauf mention contraire. Toute reproduction ou représentation,
          totale ou partielle, sans autorisation écrite préalable est interdite.
        </p>
        <p>
          Sont également interdites, sans cette autorisation, la copie automatisée du site
          (aspiration, « scraping »), l&apos;extraction de tout ou partie de ses contenus et leur
          utilisation pour entraîner ou alimenter un système d&apos;intelligence artificielle. Les
          robots d&apos;indexation des moteurs de recherche restent les bienvenus.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Liens externes">
        <p>
          Les liens vers des sites tiers sont proposés à titre d&apos;information.{" "}
          {site.nom} n&apos;exerce aucun contrôle sur leur contenu et ne saurait être tenu
          responsable de ce qui y figure.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Signalement">
        <p>
          Pour signaler un contenu inexact ou faire valoir un droit, écrivez à {site.email}. Nous
          accusons réception sous 48 heures ouvrées.
        </p>
      </ArticleLegal>
    </PageLegale>
  );
}
