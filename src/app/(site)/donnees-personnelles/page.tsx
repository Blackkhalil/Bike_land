import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import { agentIaActif, interrupteurOffresGroupeOuvert } from "@/lib/offres-groupe/vitrine";
import { site } from "@/lib/site";
import { metadonneesPage } from "@/lib/seo";

/**
 * Les offres de groupe (capture de la réduction, assistant de réservation)
 * ne sont citées qu'interrupteur ouvert, comme dans les CGV : coupé, la page
 * est celle d'avant, mot pour mot. Une base muette compte comme coupé : la
 * page s'affiche toujours. L'assistant d'IA n'est cité que s'il est activé
 * (décision 21 : pas au lancement) ; la clé se lit sur le serveur et n'en
 * sort jamais.
 */
async function quoiCiter(): Promise<{ groupe: boolean; iaActive: boolean }> {
  const groupe = await interrupteurOffresGroupeOuvert();
  return { groupe, iaActive: groupe && agentIaActif() };
}

export async function generateMetadata(): Promise<Metadata> {
  const { iaActive } = await quoiCiter();
  return metadonneesPage({
    titre: "Protection des données personnelles",
    description: iaActive
      ? "Quelles données Bike Land collecte, pourquoi, combien de temps elles sont conservées, ce qui est confié " +
        "à un assistant d'IA et comment exercer vos droits auprès de l'APDP."
      : "Quelles données Bike Land collecte, pourquoi, combien de temps elles sont conservées et comment " +
        "exercer vos droits auprès de l'APDP, l'autorité béninoise.",
    chemin: "/donnees-personnelles",
  });
}

/**
 * Les durées de l'agent IA des offres de groupe (src/lib/agent-ia/) : chez
 * Anthropic, la conservation exigée par le modèle Claude Fable 5.1 (30 jours,
 * selon la référence de l'API Claude) ; chez Bike Land, la capture est
 * supprimée dès la décision, au plus tard après 30 jours (décision technique
 * du 9 novembre 2026, voir docs/bike-land/SUIVI.md).
 */
const CONSERVATION_ANTHROPIC_JOURS = 30;
const CONSERVATION_CAPTURE_JOURS = 30;
/**
 * Le numéro et l'email donnés avec une capture : effacés 30 jours après la
 * décision, ou dès qu'elle a servi (src/lib/offres-groupe/preuves.ts,
 * JOURS_CONSERVATION_CONTACT ; le test des preuves vérifie qu'ils concordent).
 */
const CONSERVATION_CONTACT_CAPTURE_JOURS = 30;

export default async function PageDonneesPersonnelles() {
  const { groupe, iaActive } = await quoiCiter();
  return (
    <PageLegale
      titre="Protection des données personnelles"
      miseAJour={groupe ? "10 novembre 2026" : "14 octobre 2026"}
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
          {groupe && (
            <li>
              <strong>Capture d&apos;écran pour la réduction</strong> (Road trip en groupe) : si vous demandez
              la réduction, la capture que vous envoyez, qui montre votre abonnement à l&apos;un de nos
              comptes ou votre story. Finalité : vérifier que la réduction vous est due. Elle peut faire
              apparaître votre nom d&apos;utilisateur et votre photo de profil : envoyez seulement l&apos;écran
              demandé.
            </li>
          )}
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
        {groupe && (
          <p>
            La capture d&apos;écran pour la réduction repose sur votre choix : rien ne vous oblige à
            l&apos;envoyer, et sans elle vous réservez simplement au prix sans réduction.
          </p>
        )}
      </ArticleLegal>

      <ArticleLegal titre="Durée de conservation">
        <ul className="ml-5 list-disc space-y-2">
          <li>Données de réservation&nbsp;: 3&nbsp;ans après la fin de la location.</li>
          <li>Factures et pièces comptables&nbsp;: 10&nbsp;ans, conformément aux obligations fiscales.</li>
          <li>Messages du formulaire de contact&nbsp;: 12&nbsp;mois après la dernière réponse.</li>
          {groupe && (
            <li>
              Capture d&apos;écran pour la réduction&nbsp;: supprimée dès que la décision est prise, et au
              plus tard {CONSERVATION_CAPTURE_JOURS}&nbsp;jours après son envoi
              {iaActive ? (
                <>
                  {" "}; {CONSERVATION_ANTHROPIC_JOURS}&nbsp;jours chez Anthropic (voir plus bas).
                </>
              ) : (
                "."
              )}{" "}
              Le numéro et l&apos;email envoyés avec elle sont effacés {CONSERVATION_CONTACT_CAPTURE_JOURS}&nbsp;jours
              après la décision, ou dès que la capture a servi à une réservation, qui garde ses propres
              coordonnées. Ces coordonnées de réservation nous servent aussi à n&apos;accorder la réduction
              qu&apos;une fois par client.
            </li>
          )}
        </ul>
      </ArticleLegal>

      <ArticleLegal titre="Destinataires">
        <p>
          Les données ne sont ni vendues, ni louées, ni cédées. Elles sont accessibles à
          l&apos;équipe de {site.nom} et à nos sous-traitants techniques, strictement pour ce qui
          leur incombe : l&apos;hébergeur du site et de la base de données, l&apos;agrégateur de
          {iaActive ? (
            <>
              paiement, le service d&apos;envoi des emails transactionnels et, pour les offres de groupe,
              l&apos;assistant d&apos;intelligence artificielle décrit ci-dessous.
            </>
          ) : (
            <>paiement et le service d&apos;envoi des emails transactionnels.</>
          )}
        </p>
      </ArticleLegal>

      {groupe && !iaActive && (
        <ArticleLegal titre="Capture d'écran de la réduction (offres de groupe)">
          <p>
            Si vous demandez la réduction du Road trip en groupe, votre capture d&apos;écran est vérifiée
            à la main par l&apos;équipe de {site.nom}. Nous ne consultons jamais la liste de nos abonnés, et
            la réduction n&apos;est jamais accordée par défaut.
          </p>
          <p>
            La capture est rangée dans un espace de stockage privé, qui n&apos;est pas public, et notre
            équipe ne la regarde que pour cette vérification. Elle est supprimée dès que la décision est
            prise, et au plus tard {CONSERVATION_CAPTURE_JOURS}&nbsp;jours après son envoi.
          </p>
        </ArticleLegal>
      )}

      {iaActive && (
      <ArticleLegal titre="Assistant d'intelligence artificielle (offres de groupe)">
        <p>
          Pour les offres de groupe (Bike for All, Road trip en groupe et Gbashi Bike), nous faisons
          appel à Claude, un assistant d&apos;intelligence artificielle de la société Anthropic, pour deux
          tâches seulement :
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Vérifier la capture d&apos;écran de la réduction.</strong> L&apos;image est transmise à
            Anthropic, et Claude nous dit si elle montre un abonnement à l&apos;un de nos comptes ou une
            story qui nous identifie. Nous ne consultons jamais la liste de nos abonnés. En cas de doute,
            notre équipe vérifie la capture à la main ; la réduction n&apos;est jamais accordée par défaut.
            Si le résultat vous semble faux, écrivez-nous à {site.email} : une personne de notre équipe
            regardera votre capture.
          </li>
          <li>
            <strong>Rédiger le message récapitulatif de votre réservation.</strong> Nous transmettons
            votre prénom et les détails de la réservation : offre, date, horaires, nombre de personnes et
            montants calculés par notre site. Jamais votre nom, votre téléphone ni votre email. Claude ne
            calcule rien : le site vérifie chaque montant du message avant de l&apos;envoyer, et au
            moindre écart c&apos;est notre texte habituel qui part.
          </li>
        </ul>
        <p>
          <strong>Transfert hors du Bénin.</strong> Anthropic est établie aux États-Unis : ces données
          quittent donc le Bénin pour y être traitées. Anthropic agit pour le compte de {site.nom}, comme
          sous-traitant, selon ses conditions commerciales.
        </p>
        <p>
          <strong>Combien de temps.</strong> Chez Anthropic, ces données sont conservées{" "}
          {CONSERVATION_ANTHROPIC_JOURS}&nbsp;jours, durée exigée pour ce modèle, puis effacées.
          Anthropic peut les garder plus longtemps seulement si la loi l&apos;y oblige ou pour la sécurité
          de son service, par exemple en cas d&apos;utilisation abusive, selon ses propres règles. Chez{" "}
          {site.nom}, la capture est rangée dans un espace de stockage privé, qui n&apos;est pas public.
          Notre équipe ne la regarde que pour une vérification à la main. Elle est supprimée dès que la
          décision est prise, et au plus tard {CONSERVATION_CAPTURE_JOURS}&nbsp;jours après son envoi.
        </p>
      </ArticleLegal>
      )}

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
          être compté, activez l&apos;option «&nbsp;Ne pas me pister&nbsp;» de votre navigateur, elle est
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
        <p>
          Quand vous fermez une annonce de saison, comme celle d&apos;Octobre rose, votre navigateur
          retient sur votre appareil que vous l&apos;avez vue, pour ne pas vous la remontrer. Le
          temps de votre visite, il retient aussi le produit que vous avez choisi, pour ouvrir la
          réservation dessus.{" "}
          {groupe ? (
            <>
              Si vous utilisez notre assistant de réservation de groupe, il garde aussi vos réponses le
              temps de votre visite, coordonnées comprises, pour reprendre la discussion si la page se
              recharge ; elles ne nous parviennent qu&apos;au moment où vous demandez un prix ou réservez.
              Ces informations ne nous sont pas transmises autrement, et vous pouvez les effacer en
              vidant les données du site dans votre navigateur.
            </>
          ) : (
            <>
              Ces informations ne nous sont pas transmises, et vous pouvez les effacer en vidant les
              données du site dans votre navigateur.
            </>
          )}
        </p>
      </ArticleLegal>
    </PageLegale>
  );
}
