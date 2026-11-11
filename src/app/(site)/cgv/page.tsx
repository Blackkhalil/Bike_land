import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  DUREE_MAX_LOCATION_LIBRE,
  EXPIRATION_PANIER_MINUTES,
  gammesDuDepart,
  PERSONNES_MIN_ROAD_TRIP,
  PRIX_MINIMUM_GBASHI_BIKE_XOF,
  PRIX_MINIMUM_ROAD_TRIP_XOF,
} from "@/data/offres";
import { formatHeureMinute, NOMS_JOURS } from "@/data/reglages";
import { lireReglagesOffresAvec, type ReglagesOffres } from "@/data/reglages-offres";
import { depot } from "@/lib/db";
import { formatXof } from "@/lib/format";
import { penaliteRetardXof } from "@/lib/offres/retard";
import { preuvesAcceptees } from "@/lib/offres-groupe/textes-chat";
import { agentIaActif, interrupteurOffresGroupeOuvert } from "@/lib/offres-groupe/vitrine";
import { site } from "@/lib/site";
import { metadonneesPage } from "@/lib/seo";

/**
 * La description ne parle des offres de groupe que quand elles se vendent :
 * interrupteur coupé, ce sont les conditions d'avant.
 */
export async function generateMetadata(): Promise<Metadata> {
  const groupe = await interrupteurOffresGroupeOuvert();
  return metadonneesPage({
    titre: "Conditions générales de vente",
    description: groupe
      ? "Conditions de vente Bike Land : réservation en ligne, paiement Mobile Money, road trips encadrés, " +
        "offres de groupe, location à l'heure, caution, annulation et responsabilité."
      : "Conditions de vente Bike Land : réservation en ligne, paiement Mobile Money, road trips encadrés, " +
        "location à l'heure, caution, annulation et responsabilité.",
    chemin: "/cgv",
  });
}

/**
 * Régénérée au plus toutes les cinq minutes, et tout de suite après un
 * réglage dans l'administration (rafraichirSitePublic) : les conditions des
 * offres de groupe citent les chiffres des réglages en vigueur, et ne
 * paraissent qu'interrupteur « Offres de groupe » ouvert. Sans base, la page
 * s'affiche comme interrupteur coupé.
 */
export const revalidate = 300;

/** L'espace insécable entre un nombre et son unité. */
const INSECABLE = String.fromCharCode(0xa0);

/**
 * Les réglages des offres de groupe en vigueur, ou `null` quand ils sont
 * illisibles ou que la base ne répond pas : les clauses s'écrivent alors sans
 * chiffres, jamais avec des valeurs que la vente n'appliquerait pas (la vente
 * est elle-même refusée dans ce cas). Sans base (mode démonstration), ce sont
 * les valeurs de départ, celles qu'applique alors le calcul.
 */
async function reglagesEnVigueur(): Promise<ReglagesOffres | null> {
  try {
    const lecture = await lireReglagesOffresAvec((cle) => depot.lireParametreAdmin(cle));
    return lecture.source === "illisible" ? null : lecture.reglages;
  } catch {
    return null;
  }
}

/** « 7 minutes », « 1 minute ». */
function minutesEnClair(minutes: number): string {
  return `${minutes}${INSECABLE}minute${minutes > 1 ? "s" : ""}`;
}

/** « 2 heures », « 1 h 30 », « 45 minutes ». */
function dureeEnClair(minutes: number): string {
  if (minutes < 60) return minutesEnClair(minutes);
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (!reste) return `${heures}${INSECABLE}heure${heures > 1 ? "s" : ""}`;
  return `${heures}${INSECABLE}h${INSECABLE}${String(reste).padStart(2, "0")}`;
}

/** « 4 % », « 3,5 % ». */
function pourcentage(taux: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(taux * 100)}${INSECABLE}%`;
}

/**
 * Les preuves qui ouvrent droit à la réduction, une seule suffit : celles que
 * le chatbot demande (src/lib/offres-groupe/textes-chat.ts), d'après les
 * comptes de Bike Land. La story, sur Instagram seulement.
 */
function preuvesEnClair(): string {
  const preuves = preuvesAcceptees();
  return preuves.length > 1 ? `${preuves.slice(0, -1).join(", ")} ou ${preuves[preuves.length - 1]}` : (preuves[0] ?? "");
}

/**
 * Les conditions particulières des offres de groupe (décisions du
 * responsable du 9 novembre 2026, voir docs/bike-land/SUIVI.md), avec les
 * chiffres des réglages en vigueur, ou sans chiffres quand ils sont illisibles.
 * L'agent IA n'y est cité que s'il est activé (décision 21) : au lancement,
 * chaque capture est vérifiée à la main.
 */
function ConditionsOffresDeGroupe({ reglages, iaActive }: { reglages: ReglagesOffres | null; iaActive: boolean }) {
  const r = reglages;
  const baremeAffiche = "selon le barème affiché au moment de la réservation";
  const exempleRetard = r ? r.retard.toleranceMinutes + 3 : 0;
  return (
    <ArticleLegal titre="Article 12. Conditions particulières des offres de groupe">
      <p>
        Bike for All, Road trip en groupe et Gbashi Bike se réservent pour tout un groupe, en une seule
        fois. Les conditions qui suivent complètent les articles précédents. Le prix exact de votre
        réservation, ligne par ligne, vous est toujours affiché avant le paiement.
      </p>
      <p>
        <strong>Quand réserver.</strong>{" "}
        {r && r.delaiMinimumMinutes > 0 ? (
          <>
            En ligne, réservez au moins {dureeEnClair(r.delaiMinimumMinutes)} avant l&apos;heure de départ :
            c&apos;est le temps qu&apos;il nous faut pour préparer les vélos, les cocos et les gâteaux.
          </>
        ) : r ? (
          <>En ligne, réservez avant l&apos;heure de départ.</>
        ) : (
          <>
            En ligne, réservez avant l&apos;heure de départ, en respectant le délai indiqué sur la page de
            l&apos;offre : c&apos;est le temps qu&apos;il nous faut pour préparer les vélos, les cocos et les
            gâteaux.
          </>
        )}{" "}
        {r ? (
          <>
            Pour un départ le samedi ou le dimanche, réservez au plus tard le{" "}
            {NOMS_JOURS[r.dateLimiteWeekend.jour]} à {formatHeureMinute(r.dateLimiteWeekend.heure)} qui
            précède.
          </>
        ) : (
          <>
            Pour un départ le samedi ou le dimanche, réservez au plus tard à la date limite indiquée sur la
            page de l&apos;offre.
          </>
        )}{" "}
        Au comptoir, ces délais ne s&apos;appliquent pas, dans la limite des vélos disponibles.
      </p>
      <p>
        <strong>Vos coordonnées.</strong> Votre adresse email est obligatoire : nous y envoyons le
        récapitulatif de votre réservation, votre facture et votre lien de suivi.
      </p>
      <p>
        <strong>Paiement.</strong> Le paiement se fait en entier à la réservation : en ligne par Mobile
        Money, au comptoir aussi en espèces. En ligne, des frais de paiement électronique{" "}
        {r ? (
          <>
            de <span className="whitespace-nowrap">{formatXof(r.paiement.fraisParPersonneXof)}</span> par
            personne s&apos;ajoutent au prix de l&apos;offre
          </>
        ) : (
          <>par personne s&apos;ajoutent au prix de l&apos;offre, {baremeAffiche}</>
        )}{" "}
        ; ils figurent sur une ligne à part, avant le paiement. Au comptoir, ces frais ne sont pas
        demandés.
      </p>
      <p>
        Pendant que vous payez, les vélos de votre groupe vous sont gardés{" "}
        {minutesEnClair(EXPIRATION_PANIER_MINUTES)}. Un paiement reçu après ce délai confirme la
        réservation si les vélos sont encore libres. Sinon, nous vous prévenons par email et le montant
        payé vous est remboursé sous 48 heures, par Mobile Money.
      </p>
      {(!r || r.roadTrip.reduction > 0) && (
        <p>
          <strong>
            Réduction{r ? ` de ${pourcentage(r.roadTrip.reduction)}` : ""} sur le Road trip en groupe.
          </strong>{" "}
          Elle remercie le groupe qui fait connaître {site.nom}, sur une seule capture d&apos;écran, au
          choix : {preuvesEnClair()}.{" "}
          {r ? null : <>Son taux est celui affiché au moment de la réservation. </>}
          Elle porte sur le prix du road trip, hors frais de paiement électronique, et ne s&apos;applique
          qu&apos;une fois par client, reconnu à son numéro ou à son email : une seule réservation, même avec
          une nouvelle capture. Une capture validée ne sert qu&apos;à la personne qui l&apos;a envoyée (la
          réservation porte son numéro ou son email), et reste valable tant qu&apos;elle n&apos;a pas servi.{" "}
          {iaActive ? (
            <>
              La capture est vérifiée automatiquement par un assistant d&apos;intelligence artificielle (voir
              notre page Protection des données) ; en cas de doute, notre équipe la vérifie à la main.
            </>
          ) : (
            <>
              Notre équipe vérifie chaque capture à la main et vous répond par email ; vous pouvez aussi
              réserver sans attendre, au prix normal : la réduction ne s&apos;ajoute pas ensuite à cette
              réservation.
            </>
          )}{" "}
          La réduction n&apos;est jamais appliquée par défaut : tant qu&apos;elle n&apos;est pas validée, le
          prix s&apos;entend sans réduction. À la remise des vélos, l&apos;équipe peut demander au responsable
          du groupe de montrer son téléphone ; s&apos;il n&apos;est pas abonné, il peut s&apos;abonner sur place
          ou régler la différence.
        </p>
      )}
      <p>
        <strong>Retard au retour.</strong> Un groupe en retard bloque les vélos du groupe suivant : merci
        de rentrer à l&apos;heure prévue.{" "}
        {r && r.retard.penaliteParMinuteXof > 0 ? (
          <>
            Vous disposez d&apos;une marge de {minutesEnClair(r.retard.toleranceMinutes)} ; au-delà, le
            groupe paie{" "}
            <span className="whitespace-nowrap">{formatXof(r.retard.penaliteParMinuteXof)}</span> par minute
            de retard, pour tout le groupe (par exemple{" "}
            <span className="whitespace-nowrap">{formatXof(penaliteRetardXof(exempleRetard, r))}</span> pour{" "}
            {minutesEnClair(exempleRetard)} de retard). Cette pénalité se règle en espèces au retour des
            vélos.
          </>
        ) : r ? null : (
          <>
            Vous disposez d&apos;une marge de tolérance ; au-delà, le groupe paie une pénalité par minute de
            retard, pour tout le groupe, {baremeAffiche}. Cette pénalité se règle en espèces au retour des
            vélos.
          </>
        )}
      </p>
    </ArticleLegal>
  );
}

export default async function PageCGV() {
  const [groupe, reglagesOffres] = await Promise.all([interrupteurOffresGroupeOuvert(), reglagesEnVigueur()]);
  // La clé de l'agent IA se lit ici, sur le serveur : elle ne quitte jamais le serveur.
  const iaActive = agentIaActif();
  return (
    <PageLegale
      titre="Conditions générales de vente"
      miseAJour="11 novembre 2026"
      sousTitre="Ce que nous nous engageons à faire, et ce que nous vous demandons en retour. Elles s'appliquent à toute réservation effectuée sur ce site."
    >
      <ArticleLegal titre="Article 1. Objet">
        <p>
          Les présentes conditions régissent la location de cycles proposée par {site.nom} aux
          particuliers et aux professionnels, au départ de la route
          des Pêches, à Cotonou.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 2. Réservation">
        <p>
          La réservation s&apos;effectue en ligne, sans création de compte. Elle devient ferme à
          la validation du paiement. Un email de confirmation, une facture et un lien de suivi
          personnel sont envoyés immédiatement après.
        </p>
        <p>
          Le locataire doit être âgé d&apos;au moins 18 ans. Pour un mineur, la réservation est
          faite par un représentant légal, présent au retrait.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 3. Offres et tarifs">
        {groupe ? (
          // Décision 1 : le road trip par gamme est remplacé par le road trip en groupe.
          <p>
            {site.nom} propose deux offres distinctes. Le <strong>road trip</strong> est une sortie
            en groupe sur l&apos;un de nos circuits, encadrée par un coordinateur, le samedi et le
            dimanche matin&nbsp;: il se réserve pour tout le groupe, sur toute notre gamme de vélos, comme
            offre de groupe (Road trip en groupe, article 12). La{" "}
            <strong>location libre</strong> est la mise à disposition d&apos;un vélo sans
            accompagnement, facturée à l&apos;heure selon la grille publiée sur le site, de une à{" "}
            {DUREE_MAX_LOCATION_LIBRE} heures.
          </p>
        ) : (
          <p>
            {site.nom} propose deux offres distinctes. Le <strong>road trip</strong> est une sortie
            en groupe sur l&apos;un de nos circuits, encadrée par un coordinateur, au forfait par
            personne selon la gamme de vélo&nbsp;: dès {formatXof(PRIX_MINIMUM_ROAD_TRIP_XOF)} le samedi et le
            dimanche matin, en vélo {gammesDuDepart("samedi-matin")}, eau et coco compris. Une réservation de road trip
            compte {PERSONNES_MIN_ROAD_TRIP} personnes au moins, un vélo de la gamme choisie par
            personne. La{" "}
            <strong>location libre</strong> est la mise à disposition d&apos;un vélo sans
            accompagnement, facturée à l&apos;heure selon la grille publiée sur le site, de une à{" "}
            {DUREE_MAX_LOCATION_LIBRE} heures.
          </p>
        )}
        <p>
          <strong>Padel bike</strong> est une sortie en groupe, à vélo jusqu&apos;au terrain de padel
          puis une session de padel, au prix unique par personne annoncé sur sa page, quel que soit
          le vélo. Elle se réserve et se paie en ligne sur sa page, aux jours et à l&apos;heure qui y
          sont annoncés, pour le nombre de participants et dans le délai avant le départ qui y sont
          indiqués ; elle se vend aussi au comptoir. Le vélo de chaque participant est attribué par{" "}
          {site.nom} parmi les vélos disponibles ; il n&apos;est pas choisi.
        </p>
        {groupe ? (
          // Décision 1 : Gbashi Bike repasse en ligne le dimanche, sur réservation.
          <p>
            <strong>Gbashi Bike</strong>, le road trip version sport avec sa séance encadrée par nos
            coachs, se réserve en ligne uniquement sur réservation, pour tout le groupe, comme offre de
            groupe (article 12)&nbsp;: un vélo par participant, au prix de la gamme choisie.
          </p>
        ) : (
          <p>
            <strong>Gbashi bike</strong>, le road trip version sport avec sa séance de sport, se commande
            sur WhatsApp, hors réservation en ligne, dès {formatXof(PRIX_MINIMUM_GBASHI_BIKE_XOF)} par
            personne selon la gamme. Le jour, le nombre de participants et le règlement sont convenus
            avec {site.nom} au moment de la commande.
          </p>
        )}
        <p>
          {site.nom} organise aussi des <strong>sorties de saison</strong>, comme Octobre rose :
          une sortie en groupe encadrée, à date et heure fixes, au prix unique par personne
          annoncé sur sa page, quel que soit le vélo. Le vélo de chaque participant est attribué
          par {site.nom} parmi les vélos disponibles ; il n&apos;est pas choisi.
        </p>
        {groupe && (
          <p>
            Les offres de groupe <strong>Bike for All</strong>, <strong>Road trip en groupe</strong> et{" "}
            <strong>Gbashi Bike</strong> suivent en plus les conditions particulières de l&apos;article 12.
          </p>
        )}
        <p>
          Les prix sont indiqués en francs CFA (XOF), toutes taxes comprises.
          L&apos;opérateur de paiement ajoute sa commission au montant de la location.{" "}
          <strong>
            Cette commission vous est annoncée avant toute validation : l&apos;écran de paiement
            affiche le détail et le montant exact qui sera débité de votre compte.
          </strong>{" "}
          {groupe
            ? "Aucun autre supplément n'est appliqué, sauf, pour les offres de groupe, les frais de paiement électronique décrits à l'article 12."
            : "Aucun autre supplément n'est appliqué."}
        </p>
        <p>
          Le paiement en ligne s&apos;effectue par Mobile Money : MTN Money, Moov Money ou
          Celtiis Cash. Au comptoir, il peut aussi se faire en espèces. Aucune coordonnée de
          paiement n&apos;est conservée par {site.nom}.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 4. Caution et garanties">
        <p>
          <strong>Road trip et sorties de saison.</strong> Aucune caution n&apos;est demandée et aucun montant
          n&apos;est pré-autorisé. La sortie est encadrée par un coordinateur de {site.nom}, qui
          remet les vélos et les kits au départ et les récupère à l&apos;arrivée : le matériel
          demeure sous la garde de {site.nom} pendant toute la durée de la sortie.
        </p>
        <p>
          <strong>Location libre.</strong> Le vélo quittant la garde de {site.nom}, le locataire
          remet au départ une caution de{" "}
          <span className="whitespace-nowrap">{formatXof(CAUTION_LOCATION_LIBRE_XOF)}</span>, restituée
          intégralement lors de la restitution du vélo en bon état. Le locataire présente en
          outre une pièce d&apos;identité en cours de validité, qui lui est rendue au retour du
          vélo et dont aucune copie n&apos;est conservée, et signe un engagement de restitution.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 5. Annulation et modification">
        <p>
          L&apos;annulation est gratuite jusqu&apos;à 72 heures avant l&apos;heure de départ
          prévue. Entre 72 heures et l&apos;heure de départ, 50 % du montant reste dû. Passé
          l&apos;heure de départ, la location est due en totalité.
        </p>
        <p>
          Toute modification de dates est possible sous réserve de disponibilité, depuis le lien
          de suivi ou par téléphone.
        </p>
        <p>
          {site.nom} se réserve le droit d&apos;annuler une réservation en cas de force majeure
          ou d&apos;avarie du matériel ; le montant est alors intégralement remboursé sous sept
          jours, ou un vélo équivalent est proposé.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 6. Retrait et restitution">
        <p>
          Le vélo est remis par le coordinateur en état de fonctionnement, réglé à la taille du
          locataire, après un point de contrôle contradictoire. Il est récupéré par ce même
          coordinateur à la fin de la sortie, en même temps que le kit remis au départ.
        </p>
        <p>
          Le locataire qui quitte le groupe sans restituer le matériel au coordinateur en demeure
          responsable jusqu&apos;à sa remise effective, dans les conditions de l&apos;article 8.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 7. Obligations du locataire">
        <p>
          Le locataire s&apos;engage à utiliser le vélo en bon père de famille, à respecter le
          code de la route, à porter le casque fourni et à utiliser l&apos;antivol lors de tout
          stationnement. Le vélo ne peut être ni sous-loué, ni prêté, ni sorti du territoire
          béninois sans accord écrit.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 8. Dommages, vol et assistance">
        <p>
          L&apos;usure normale est à la charge de {site.nom}. Les dégradations résultant d&apos;une
          négligence, ainsi que le vol sans effraction, sont à la charge du locataire, dans la
          limite de la valeur de remplacement du matériel concerné.
        </p>
        <p>
          Une assistance téléphonique est assurée sept jours sur sept pendant la location. Un
          dépannage sur place est organisé dans un rayon de 60 km autour des points de départ.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 9. Responsabilité">
        <p>
          {site.nom} ne saurait être tenu responsable des dommages corporels ou matériels
          survenus au locataire ou à des tiers du fait de l&apos;usage du vélo, sauf défaut
          avéré du matériel imputable à un défaut d&apos;entretien.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 10. Données personnelles">
        <p>
          Le traitement des données est décrit dans la politique de protection des données, en
          conformité avec la législation béninoise sur la protection des données à caractère
          personnel, sous le contrôle de l&apos;Autorité de protection des données personnelles
          (APDP).
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 11. Réclamations et droit applicable">
        <p>
          Toute réclamation peut être adressée à {site.email} ou au{" "}
          <span className="whitespace-nowrap">{site.telephone}</span>. À défaut
          d&apos;accord amiable, les présentes conditions sont soumises au droit béninois et les
          tribunaux de Cotonou sont compétents.
        </p>
      </ArticleLegal>

      {groupe && <ConditionsOffresDeGroupe reglages={reglagesOffres} iaActive={iaActive} />}
    </PageLegale>
  );
}
