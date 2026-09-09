import type { Metadata } from "next";

import { ArticleLegal, PageLegale } from "@/components/PageLegale";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions de location Bike Land : réservation, paiement, caution, annulation, responsabilité et assurance.",
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
          particuliers et aux professionnels, au départ de ses points de retrait situés à Cotonou,
          Ouidah et Natitingou.
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

      <ArticleLegal titre="Article 3 — Tarifs et paiement">
        <p>
          Les prix sont indiqués en francs CFA (XOF), toutes taxes comprises. Les remises de durée
          sont appliquées automatiquement. Une majoration de haute saison de 10 % s&apos;applique
          aux jours situés entre le 1<sup>er</sup> novembre et le 31 mars.
        </p>
        <p>
          Le paiement s&apos;effectue par Mobile Money (MTN Money, Moov Money) ou par carte
          bancaire, via un prestataire agréé. Aucune coordonnée bancaire n&apos;est conservée par{" "}
          {site.nom}.
        </p>
      </ArticleLegal>

      <ArticleLegal titre="Article 4 — Caution">
        <p>
          Une caution, dont le montant figure sur la fiche de chaque vélo, est pré-autorisée lors
          de la réservation. Elle est libérée dans les 48 heures suivant la restitution, après
          contrôle de l&apos;état du vélo. La souscription de l&apos;assurance sérénité dispense
          de caution.
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
          Le vélo est remis en état de fonctionnement, réglé à la taille du locataire, après un
          point de contrôle contradictoire. Il est restitué au point convenu, avant l&apos;heure
          de fermeture du dernier jour de location.
        </p>
        <p>
          Un retard de restitution non signalé donne lieu à la facturation d&apos;une journée
          supplémentaire par tranche entamée de 24 heures.
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
          limite de la caution ou de la valeur de remplacement.
        </p>
        <p>
          Une assistance téléphonique est assurée sept jours sur sept pendant la location. Un
          dépannage sur place est organisé dans un rayon de 60 km autour des points de retrait.
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
