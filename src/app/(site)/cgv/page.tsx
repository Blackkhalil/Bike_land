import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import {
  CAUTION_LOCATION_LIBRE_XOF,
  DUREE_MAX_LOCATION_LIBRE,
  PRIX_ROAD_TRIP_XOF,
} from "@/data/offres";
import { formatXof } from "@/lib/format";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions de location Bike Land : réservation, paiement, sorties encadrées, annulation et responsabilité.",
  alternates: { canonical: "/cgv" },
};

export default function PageCGV() {
  return (
    <PageLegale
      titre="Conditions générales de vente"
      miseAJour="8 septembre 2026"
      sousTitre="Ce que nous nous engageons à faire, et ce que nous vous demandons en retour. Elles s'appliquent à toute réservation effectuée sur ce site."
    >
      <ArticleLegal titre="Article 1 — Objet">
        <p>
          Les présentes conditions régissent la location de cycles proposée par {site.nom} aux
          particuliers et aux professionnels, au départ de la route
          des Pêches, à Cotonou.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 2 — Réservation">
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

      <ArticleLegal titre="Article 3 — Offres et tarifs">
        <p>
          {site.nom} propose deux offres distinctes. Le <strong>road trip</strong> est une sortie
          en groupe sur l&apos;un de nos circuits, encadrée par un coordinateur, au forfait de{" "}
          {formatXof(PRIX_ROAD_TRIP_XOF)} par personne, eau et coco compris. La{" "}
          <strong>location libre</strong> est la mise à disposition d&apos;un vélo sans
          accompagnement, facturée à l&apos;heure selon la grille publiée sur le site, de une à{" "}
          {DUREE_MAX_LOCATION_LIBRE} heures.
        </p>
        <p>
          Les prix sont indiqués en francs CFA (XOF), toutes taxes comprises. Le paiement
          s&apos;effectue par Mobile Money (MTN Money, Moov Money) ou par carte bancaire, via un
          prestataire agréé. Aucune coordonnée bancaire n&apos;est conservée par {site.nom}.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 4 — Caution et garanties">
        <p>
          <strong>Road trip.</strong> Aucune caution n&apos;est demandée et aucun montant
          n&apos;est pré-autorisé. La sortie est encadrée par un coordinateur de {site.nom}, qui
          remet les vélos et les kits au départ et les récupère à l&apos;arrivée : le matériel
          demeure sous la garde de {site.nom} pendant toute la durée de la sortie.
        </p>
        <p>
          <strong>Location libre.</strong> Le vélo quittant la garde de {site.nom}, le locataire
          remet au départ une caution de {formatXof(CAUTION_LOCATION_LIBRE_XOF)}, restituée
          intégralement lors de la restitution du vélo en bon état. Le locataire présente en
          outre une pièce d&apos;identité en cours de validité, qui lui est rendue au retour du
          vélo et dont aucune copie n&apos;est conservée, et signe un engagement de restitution.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 5 — Annulation et modification">
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

      <ArticleLegal titre="Article 6 — Retrait et restitution">
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

      <ArticleLegal titre="Article 7 — Obligations du locataire">
        <p>
          Le locataire s&apos;engage à utiliser le vélo en bon père de famille, à respecter le
          code de la route, à porter le casque fourni et à utiliser l&apos;antivol lors de tout
          stationnement. Le vélo ne peut être ni sous-loué, ni prêté, ni sorti du territoire
          béninois sans accord écrit.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 8 — Dommages, vol et assistance">
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

      <ArticleLegal titre="Article 9 — Responsabilité">
        <p>
          {site.nom} ne saurait être tenu responsable des dommages corporels ou matériels
          survenus au locataire ou à des tiers du fait de l&apos;usage du vélo, sauf défaut
          avéré du matériel imputable à un défaut d&apos;entretien.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 10 — Données personnelles">
        <p>
          Le traitement des données est décrit dans la politique de protection des données, en
          conformité avec la législation béninoise sur la protection des données à caractère
          personnel, sous le contrôle de l&apos;Autorité de protection des données personnelles
          (APDP).
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 11 — Réclamations et droit applicable">
        <p>
          Toute réclamation peut être adressée à {site.email} ou au {site.telephone}. À défaut
          d&apos;accord amiable, les présentes conditions sont soumises au droit béninois et les
          tribunaux de Cotonou sont compétents.
        </p>
      </ArticleLegal>
    </PageLegale>
  );
}
