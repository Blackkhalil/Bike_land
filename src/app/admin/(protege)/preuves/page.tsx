import type { Metadata } from "next";
import Link from "next/link";

import { PreuvesAVerifier, type PreuveAVerifier } from "@/components/admin/PreuvesAVerifier";
import { lienWhatsAppClient } from "@/lib/site";
import { comptesBikeLand, NOMS_RESEAUX } from "@/lib/agent-ia/comptes";
import { exigerSessionAdmin } from "@/lib/admin";
import { dateAuBenin } from "@/lib/dates";
import { depot, type ReservationRoadTripClient } from "@/lib/db";
import { formatDateAvecJour, formatHeureAuBenin } from "@/lib/format";
import { prenomDeAuteur } from "@/lib/journal";
import { estPayee } from "@/lib/reservations";
import { formatPourcentage } from "@/lib/offres";
import { departsALire, situationDuClient } from "@/lib/offres-groupe/preuves";
import { lireReglagesOffres } from "@/lib/reglages-offres";
import type { PreuveReduction } from "@/lib/types";

export const metadata: Metadata = { title: "Preuves de réduction" };

/** Combien de preuves décidées l'écran rappelle. */
const DERNIERES_DECIDEES = 30;

/** « le mercredi 11 novembre, 16 h 05 » : un instant, à l'heure de Cotonou. */
function instantEnClair(instant: string): string {
  return `le ${formatDateAvecJour(dateAuBenin(instant))}, ${formatHeureAuBenin(instant)}`;
}

/** « Instagram @bikeland_bj ou TikTok @bikelandbj » : les comptes à reconnaître sur une capture. */
function comptesEnClair(): { abonnement: string; story: string } {
  const comptes = comptesBikeLand().filter((compte) => compte.identifiant);
  const abonnement = comptes.map((compte) => `${NOMS_RESEAUX[compte.reseau]} @${compte.identifiant}`).join(" ou ");
  const instagram = comptes.find((compte) => compte.reseau === "instagram");
  return { abonnement, story: instagram ? `@${instagram.identifiant}` : "le compte Instagram de Bike Land" };
}

/**
 * Les road trips en groupe payés qui disent la situation des clients des
 * captures : ceux qui ont eu la réduction, et ceux au prix normal qui
 * partent depuis le jour de la plus ancienne capture à vérifier (faits après
 * elle, ou encore à venir). Une demande pas encore payée n'apparaît pas ici
 * (décision 27) : seulement ce que le client a payé. Une lecture qui échoue
 * ne fait pas tomber la page : les captures restent à décider, sans ces
 * rappels.
 */
async function reservationsDesClients(aVerifier: PreuveReduction[], maintenant: number): Promise<{
  avecReduction: ReservationRoadTripClient[];
  auPrixNormal: ReservationRoadTripClient[];
}> {
  try {
    const [avecReduction, auPrixNormal] = await Promise.all([
      depot.listerReservationsRoadTripGroupe({ avecReduction: true }),
      aVerifier.length > 0
        ? depot.listerReservationsRoadTripGroupe({ avecReduction: false, departDepuis: departsALire(aVerifier, maintenant) })
        : Promise.resolve([]),
    ]);
    return { avecReduction: avecReduction.filter(estPayee), auPrixNormal: auPrixNormal.filter(estPayee) };
  } catch (erreur) {
    console.error("[admin/preuves] réservations des clients illisibles", erreur);
    return { avecReduction: [], auPrixNormal: [] };
  }
}

/**
 * Les cartes des captures à vérifier, chacune avec la situation de son
 * client à l'instant de la requête (lu ici, hors du rendu) : la réduction
 * déjà eue (décision 25), une réservation au prix normal payée pendant
 * l'attente (décision 24). Et les références des réservations payées qui
 * ont pris une capture : une capture servie à une demande pas encore payée
 * n'en montre pas la référence (décision 27).
 */
async function cartesAVerifier(aVerifier: PreuveReduction[]): Promise<{ preuves: PreuveAVerifier[]; servies: Set<string> }> {
  const maintenant = Date.now();
  const reservations = await reservationsDesClients(aVerifier, maintenant);
  const preuves = aVerifier.map((preuve) => {
    const situation = situationDuClient(preuve, reservations.avecReduction, reservations.auPrixNormal, maintenant);
    return {
      id: preuve.id,
      recue: instantEnClair(preuve.creeLe),
      ...(preuve.email ? { email: preuve.email } : {}),
      ...(preuve.telephone ? { telephone: preuve.telephone } : {}),
      avecImage: Boolean(preuve.fichierCle),
      ...(situation.dejaEue ? { dejaEue: situation.dejaEue } : {}),
      ...(situation.prixNormal ? { prixNormal: situation.prixNormal } : {}),
    };
  });
  return { preuves, servies: new Set(reservations.avecReduction.map((r) => r.reference.toUpperCase())) };
}

/**
 * Les captures envoyées pour la réduction du road trip en groupe. L'agent IA
 * n'est pas activé au lancement (décision 21) : chaque capture se vérifie
 * ici, à la main, la plus ancienne d'abord. Bike Land reçoit un email à
 * chaque capture (décision 24). Le client reçoit la réponse par email ;
 * validée, son lien rouvre la discussion avec la réduction comptée, une
 * seule fois par client (décision 25). Chaque carte dit, avant de décider,
 * si le client a déjà eu la réduction ou s'il a déjà payé au prix normal.
 * La capture est effacée dès la décision, et 30 jours au plus tard.
 */
export default async function PagePreuves() {
  await exigerSessionAdmin();
  const [aVerifier, validees, refusees, lecture, emailsNonPartis] = await Promise.all([
    depot.listerPreuves({ statut: "en_attente" }),
    depot.listerPreuves({ statut: "validee", limite: DERNIERES_DECIDEES }),
    depot.listerPreuves({ statut: "refusee", limite: DERNIERES_DECIDEES }),
    lireReglagesOffres().catch(() => null),
    depot.listerJournal({ type: "preuve-email-non-envoye", limite: 200 }).catch(() => []),
  ]);
  const { preuves, servies } = await cartesAVerifier(aVerifier);
  const sansEmail = new Set(emailsNonPartis.map((evenement) => evenement.details.preuveId).filter((id): id is string => typeof id === "string"));
  const decidees = [...validees, ...refusees]
    .sort((a, b) => (b.decideLe ?? b.creeLe).localeCompare(a.decideLe ?? a.creeLe))
    .slice(0, DERNIERES_DECIDEES);
  const reduction = lecture && lecture.source !== "illisible" ? formatPourcentage(lecture.reglages.roadTrip.reduction) : null;
  const comptes = comptesEnClair();

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Offres de groupe</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Preuves de réduction</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          Les captures envoyées pour la réduction{reduction ? ` de ${reduction}` : ""} du road trip en groupe, une
          seule fois par client. Validez si la capture montre l&apos;abonnement à {comptes.abonnement}, ou une story
          Instagram qui identifie {comptes.story}. Au moindre doute, refusez : le client peut en envoyer une autre. Il
          reçoit la réponse par email, et la capture est effacée dès votre décision.
        </p>
      </header>

      <section className="mt-8" aria-labelledby="titre-a-verifier">
        <h2 id="titre-a-verifier" className="font-display text-[1rem] font-bold uppercase tracking-tight">
          À vérifier{preuves.length > 0 ? ` (${preuves.length})` : ""}
        </h2>
        {/* Toujours rendu, même vide : le message de la dernière décision reste à l'écran. */}
        <div className="mt-3">
          <PreuvesAVerifier preuves={preuves} comptes={`${comptes.abonnement}, ou une story qui identifie ${comptes.story}`} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="titre-decidees">
        <h2 id="titre-decidees" className="font-display text-[1rem] font-bold uppercase tracking-tight">
          Décidées
        </h2>
        {decidees.length === 0 ? (
          <p className="mt-3 text-[0.88rem] text-gris-cadre">Aucune décision pour l&apos;instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-noir-piste/10 rounded-[var(--radius-carte)] bg-white px-4">
            {decidees.map((preuve) => (
              <li key={preuve.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[0.86rem]">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {preuve.statut === "validee" ? "Validée" : "Refusée"}
                    {preuve.decideLe ? ` ${instantEnClair(preuve.decideLe)}` : ""}
                    {preuve.decidePar ? `, par ${prenomDeAuteur(preuve.decidePar)}` : ""}
                  </p>
                  <p className="text-[0.78rem] text-gris-cadre">
                    {preuve.telephone ?? preuve.email ?? "contact effacé"}
                    {preuve.motif ? ` · ${preuve.motif}` : ""}
                    {preuve.reference && servies.has(preuve.reference.toUpperCase())
                      ? ""
                      : preuve.statut === "validee"
                        ? " · pas encore servie"
                        : ""}
                  </p>
                  {sansEmail.has(preuve.id) && (
                    <p className="mt-1 text-[0.8rem] font-semibold text-orange-sourd">
                      L&apos;email au client n&apos;est pas parti : prévenez-le par WhatsApp
                      {preuve.telephone ? (
                        <>
                          {" ("}
                          <a href={lienWhatsAppClient(preuve.telephone)} target="_blank" rel="noreferrer noopener" className="underline cible-elargie whitespace-nowrap">
                            {preuve.telephone}
                          </a>
                          {")"}
                        </>
                      ) : null}
                      .
                    </p>
                  )}
                </div>
                {preuve.reference && servies.has(preuve.reference.toUpperCase()) && (
                  <Link
                    href={`/admin/reservations?detail=${encodeURIComponent(preuve.reference)}`}
                    className="lien-souligne cible-elargie whitespace-nowrap font-mono text-[0.78rem]"
                  >
                    {preuve.reference}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[0.78rem] text-gris-cadre">
          Toutes les décisions restent dans le{" "}
          {/* Souligné et d'une autre couleur que le texte : il se voit comme un lien, et se touche au doigt. */}
          <Link href="/admin/journal" className="cible-elargie font-semibold text-noir-piste underline underline-offset-2">
            journal
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
