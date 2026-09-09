import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergement et propriété intellectuelle du site Bike Land.",
  alternates: { canonical: "/mentions-legales" },
};

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
          Siège : {site.adresse.ligne}, {site.adresse.ville}, {site.adresse.pays}.
          <br />
          Registre du commerce et du crédit mobilier (RCCM) : à compléter avant la mise en ligne.
          <br />
          Identifiant fiscal unique (IFU) : à compléter avant la mise en ligne.
        </p>
        <p>
          Téléphone : {site.telephone} — Courriel : {site.email}
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Directeur de la publication">
        <p>Le représentant légal de {site.nom}.</p>
      </ArticleLegal>

      <ArticleLegal titre="Hébergement">
        <p>
          Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.
          La base de données est hébergée dans l&apos;Union européenne par le fournisseur retenu au
          moment du déploiement.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Propriété intellectuelle">
        <p>
          L&apos;ensemble des contenus de ce site — textes, illustrations, mise en page,
          identité visuelle — est la propriété de {site.nom}, sauf mention contraire. Toute
          reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable
          est interdite.
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
