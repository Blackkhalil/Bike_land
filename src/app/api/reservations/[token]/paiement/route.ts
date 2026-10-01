import { NextResponse } from "next/server";

import { panierExpire } from "@/data/offres";
import { depot } from "@/lib/db";
import { encaisser, fournisseurActif } from "@/lib/paiement";
import { site } from "@/lib/site";
import type { MoyenPaiement } from "@/lib/types";

type Params = Promise<{ token: string }>;

/** Les seuls moyens encaissables en ligne. */
const MOYENS_EN_LIGNE: MoyenPaiement[] = ["MTN_MONEY", "MOOV_MONEY", "CELTIIS_CASH"];

/**
 * Relance la demande de paiement d'une réservation déjà créée.
 *
 * Le cas est fréquent : le client n'a pas vu la notification, l'a laissée
 * expirer, ou s'est trompé de numéro. Sa réservation existe, le vélo lui
 * est retenu, mais rien n'est payé. Sans cette route il devrait tout
 * recommencer, en risquant de trouver le vélo pris entre-temps.
 *
 * Une nouvelle demande est poussée plutôt que l'ancienne reprise : une
 * demande Mobile Money expirée ne se ranime pas, et SasPay accepte
 * plusieurs tentatives sur une même réservation. Seule celle qui aboutit
 * confirme, et le contrôle de montant reste le même.
 *
 * Le jeton fait office d'autorisation : seul son porteur peut relancer le
 * paiement de cette réservation.
 */
export async function POST(requete: Request, { params }: { params: Params }) {
  if (fournisseurActif() !== "saspay") {
    return NextResponse.json({ erreur: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const { token } = await params;
  const reservation = await depot.trouverReservationParToken(decodeURIComponent(token));

  if (!reservation) {
    return NextResponse.json({ erreur: "Réservation introuvable." }, { status: 404 });
  }

  if (reservation.statut === "ANNULEE") {
    return NextResponse.json({ erreur: "Cette réservation est annulée." }, { status: 409 });
  }

  if (reservation.statut !== "EN_ATTENTE_PAIEMENT") {
    // Déjà payée : le webhook a confirmé pendant que le client attendait.
    return NextResponse.json({ dejaPayee: true, reference: reservation.reference });
  }

  // Passé le délai du panier, le vélo ne lui est plus retenu : relancer un
  // paiement encaisserait de l'argent pour un créneau peut-être repris.
  if (panierExpire(reservation.creeLe)) {
    return NextResponse.json(
      {
        erreur:
          `Le délai de paiement est dépassé et le vélo n'est plus retenu. ` +
          `Refaites une réservation, ou appelez-nous au ${site.telephone}.`,
        code: "PANIER_EXPIRE",
      },
      { status: 409 },
    );
  }

  const corps = (await requete.json().catch(() => ({}))) as {
    moyen?: unknown;
    telephone?: unknown;
  };

  // Le client peut corriger son opérateur et son numéro : c'est souvent la
  // raison pour laquelle la première demande n'est jamais arrivée.
  const moyen =
    typeof corps.moyen === "string" && MOYENS_EN_LIGNE.includes(corps.moyen as MoyenPaiement)
      ? (corps.moyen as MoyenPaiement)
      : (reservation.paiements.find((paiement) => !paiement.estCaution)?.moyen ?? "MTN_MONEY");

  const telephone =
    typeof corps.telephone === "string" && /^[+0-9 ().-]{8,20}$/.test(corps.telephone.trim())
      ? corps.telephone.trim()
      : reservation.client.telephone;

  if (!telephone) {
    return NextResponse.json(
      { erreur: "Un numéro de téléphone Mobile Money est nécessaire pour payer." },
      { status: 422 },
    );
  }

  const paiement = await encaisser({
    // Le montant vient de la réservation enregistrée, jamais de l'appelant.
    montantXof: reservation.totalXof,
    reference: reservation.reference,
    // Clé distincte à chaque relance : sans elle, SasPay reconnaîtrait la
    // première demande au lieu d'en pousser une nouvelle, et le client
    // attendrait une notification qui ne viendrait jamais. La référence,
    // elle, reste celle de la réservation, c'est par elle que le webhook
    // saura quoi confirmer.
    cleIdempotence: `${reservation.reference}-R${Date.now().toString(36)}`,
    moyen,
    client: { ...reservation.client, telephone },
  });

  if (paiement.statut === "ECHOUE" || !paiement.suivi) {
    return NextResponse.json(
      { erreur: paiement.message ?? "La demande de paiement n'a pas pu être envoyée." },
      { status: 502 },
    );
  }

  return NextResponse.json({ suivi: paiement.suivi });
}
