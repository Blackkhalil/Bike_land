import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Protection des données personnelles",
  description:
    "Quelles données Bike Land collecte, pourquoi, combien de temps, et comment exercer vos droits auprès de l'APDP au Bénin.",
  alternates: { canonical: "/donnees-personnelles" },
};

export default function PageDonneesPersonnelles() {
  return (
    <PageLegale
      titre="Protection des données personnelles"
      miseAJour="8 septembre 2026"
      sousTitre="Nous collectons le strict nécessaire à la location, et rien de plus. Cette page dit précisément quoi, pourquoi et pour combien de temps."
    >
      <ArticleLegal titre="Responsable du traitement">
        <p>
          {site.nom}, {site.adresse.ville}, {site.adresse.pays}. Contact :{" "}
          {site.email}.
        </p>
        <p>
          Le traitement est réalisé conformément à la loi béninoise sur la protection des données
          à caractère personnel, sous le contrôle de l&apos;Autorité de protection des données
          personnelles (APDP).
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Données collectées et finalités">
        <p>Nous traitons uniquement les données suivantes :</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Identité et contact</strong> : prénom, nom, adresse email, numéro de
            téléphone. Finalité : établir le contrat de location, envoyer la confirmation, la
            facture et le lien de suivi, vous joindre en cas d&apos;imprévu.
          </li>
          <li>
            <strong>Réservation</strong> : vélo, dates, options, point de départ, montant.
            Finalité : exécuter la location et tenir la comptabilité.
          </li>
          <li>
            <strong>Paiement</strong> : identifiant de transaction et moyen utilisé.{" "}
            <em>Aucune coordonnée bancaire n&apos;est reçue ni stockée par Bike Land</em> : elles
            sont traitées par l&apos;agrégateur de paiement.
          </li>
          <li>
            <strong>Message libre</strong> : le texte que vous nous adressez, s&apos;il y a lieu.
          </li>
        </ul>
        <p>
          Aucun compte n&apos;est créé : votre fiche client se constitue à partir de votre
          première réservation, et sert à vous reconnaître si vous revenez.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Base légale">
        <p>
          L&apos;exécution du contrat de location pour les données de réservation et de contact ;
          le respect d&apos;obligations légales, notamment comptables, pour les factures ; votre
          consentement pour toute communication non liée à une location en cours.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Durée de conservation">
        <ul className="ml-5 list-disc space-y-2">
          <li>Données de réservation : 3 ans après la fin de la location.</li>
          <li>Factures et pièces comptables : 10 ans, conformément aux obligations fiscales.</li>
          <li>Messages du formulaire de contact : 12 mois après la dernière réponse.</li>
        </ul>
      </ArticleLegal>

      <ArticleLegal titre="Destinataires">
        <p>
          Les données ne sont ni vendues, ni louées, ni cédées. Elles sont accessibles à
          l&apos;équipe de {site.nom} et à nos sous-traitants techniques, strictement pour ce qui
          leur incombe : l&apos;hébergeur du site et de la base de données, l&apos;agrégateur de
          paiement et le service d&apos;envoi des emails transactionnels.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Mesure d'audience">
        <p>
          Nous comptons les pages consultées, pour savoir ce qui intéresse nos visiteurs et où
          ils abandonnent une réservation. Cette mesure est assurée par Vercel Web Analytics,
          l&apos;hébergeur du site.
        </p>
        <p>
          <strong>Aucun cookie n&apos;est déposé</strong> et aucun identifiant durable ne vous
          est attribué : vous n&apos;êtes pas suivi d&apos;une visite à l&apos;autre, ni d&apos;un
          site à l&apos;autre. Ce qui est enregistré est agrégé : la page consultée, la page
          d&apos;où vous venez, le type d&apos;appareil, le navigateur et le pays. Votre adresse
          IP sert uniquement à déterminer le pays, puis elle est écartée ; elle n&apos;est pas
          conservée.
        </p>
        <p>
          C&apos;est aussi pour cette raison que ce site ne vous impose aucune bannière de
          consentement : il n&apos;y a rien à consentir. Si vous souhaitez malgré tout ne pas
          être compté, activez l&apos;option « Ne pas me pister » de votre navigateur, elle est
          respectée.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Sécurité">
        <p>
          Les échanges sont chiffrés (HTTPS). Les liens de suivi de réservation reposent sur un
          jeton signé dont seule l&apos;empreinte est conservée en base : une copie de la base ne
          permet pas de fabriquer un lien valide. Les accès à l&apos;espace d&apos;administration
          sont protégés par mot de passe.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Vos droits">
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
          d&apos;opposition et de portabilité. Écrivez à {site.email} : nous répondons sous 30
          jours. Une pièce d&apos;identité peut vous être demandée en cas de doute sérieux sur
          l&apos;identité du demandeur.
        </p>
        <p>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir l&apos;APDP, autorité de
          contrôle compétente au Bénin.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Traceurs">
        <p>
          Ce site ne dépose aucun cookie publicitaire ni traceur d&apos;audience tiers. Seuls des
          cookies strictement nécessaires au fonctionnement peuvent être utilisés, notamment pour
          l&apos;accès à l&apos;espace d&apos;administration.
        </p>
      </ArticleLegal>
    </PageLegale>
  );
}
