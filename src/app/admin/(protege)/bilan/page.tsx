import type { Metadata } from "next";

import { Pastille } from "@/components/ui";
import { ajouterJours, aujourdhui, type DateISO } from "@/lib/dates";
import { depot } from "@/lib/db";
import { formatNombre, formatXof } from "@/lib/format";
import { seulementPayees } from "@/lib/reservations";
import { calculerStatistiques, construirePeriode, dateEncaissement } from "@/lib/statistiques";

export const metadata: Metadata = { title: "Bilan des semaines" };

/**
 * Le bilan semaine par semaine, depuis la première réservation payée.
 *
 * Le tableau de bord répond à « où en est-on ? » ; cet écran répond à
 * « comment se sont passées les semaines ? », pour faire son bilan après
 * coup. Chaque ligne est une semaine du lundi au dimanche, la plus
 * récente en tête, avec les mêmes règles que le tableau de bord :
 * l'argent compte au jour du paiement, l'activité au jour de la sortie.
 * Une semaine se télécharge en PDF ou en CSV, au même format que
 * l'export du tableau de bord.
 */
export default async function PageBilan() {
  const [reservations, velos, clients] = await Promise.all([
    depot.listerReservations(),
    depot.listerVelos(),
    depot.listerClients(),
  ]);

  const payees = seulementPayees(reservations);
  const aujourdHui = aujourdhui();
  const premierJour = payees
    .flatMap((r) => [r.dateDebut, dateEncaissement(r)])
    .reduce<DateISO>((min, jour) => (jour < min ? jour : min), aujourdHui);

  // Les lundis, de la semaine en cours à celle de la première réservation.
  const lundis: DateISO[] = [];
  const premierLundi = construirePeriode("semaine", premierJour).debut;
  for (let lundi = construirePeriode("semaine", aujourdHui).debut; lundi >= premierLundi; lundi = ajouterJours(lundi, -7)) {
    lundis.push(lundi);
  }

  const semaines = lundis.map((debut) => {
    const fin = ajouterJours(debut, 6);
    const stats = calculerStatistiques(reservations, velos, clients, { debut, fin, libelle: "La semaine" });
    const commissions = payees
      .filter((r) => {
        const jour = dateEncaissement(r);
        return jour >= debut && jour <= fin;
      })
      .reduce((somme, r) => somme + (r.commissionParrainageXof ?? 0), 0);
    return { debut, fin, stats, commissions };
  });

  const total = {
    encaisse: semaines.reduce((s, x) => s + x.stats.chiffreAffaires.valeur, 0),
    net: semaines.reduce((s, x) => s + x.stats.encaisseNet, 0),
    reservations: semaines.reduce((s, x) => s + x.stats.nombreReservations.valeur, 0),
    commissions: semaines.reduce((s, x) => s + x.commissions, 0),
  };
  const meilleure = semaines.reduce<(typeof semaines)[number] | null>(
    (best, x) => (!best || x.stats.chiffreAffaires.valeur > best.stats.chiffreAffaires.valeur ? x : best),
    null,
  );

  return (
    <div>
      <header>
        <p className="etiquette opacity-75">Pilotage</p>
        <h1 className="titre-editorial mt-3 text-[2rem]">Bilan des semaines</h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-gris-cadre">
          Chaque semaine, du lundi au dimanche, la plus récente en tête. L&apos;argent est compté
          au jour du paiement, l&apos;activité au jour de la sortie, comme sur le tableau de bord.
        </p>
      </header>

      <dl className="mt-8 grid gap-4 *:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile titre="Encaissé depuis le début" valeur={formatXof(total.encaisse)} />
        <Tuile titre="Net après frais SasPay" valeur={formatXof(total.net)} />
        <Tuile titre="Réservations payées" valeur={formatNombre(total.reservations)} />
        <Tuile
          titre="Meilleure semaine"
          valeur={meilleure && meilleure.stats.chiffreAffaires.valeur > 0 ? formatXof(meilleure.stats.chiffreAffaires.valeur) : "-"}
          detail={meilleure && meilleure.stats.chiffreAffaires.valeur > 0 ? intitule(meilleure.debut, meilleure.fin) : undefined}
        />
      </dl>

      {/* Téléphone : une carte par semaine. */}
      <div className="mt-8 space-y-3 md:hidden">
        {semaines.map(({ debut, fin, stats, commissions }) => (
          <article key={debut} className="rounded-[var(--radius-carte)] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{intitule(debut, fin)}</h2>
              {stats.periodeEnCours && <Pastille ton="info">En cours</Pastille>}
            </div>
            <p className="mt-3 font-display text-[1.5rem] font-bold tabular-nums">
              {formatXof(stats.chiffreAffaires.valeur)}{" "}{!stats.periodeEnCours && <Variation valeur={stats.chiffreAffaires.variation} />}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.82rem]">
              <Ligne titre="Net après frais" valeur={formatXof(stats.encaisseNet)} />
              <Ligne titre="Réservations" valeur={formatNombre(stats.nombreReservations.valeur)} />
              <Ligne titre="Road trip" valeur={`${formatNombre(stats.participants.valeur)} pers.`} />
              <Ligne titre="Location libre" valeur={`${formatNombre(stats.heuresVendues.valeur)} h`} />
              <Ligne titre="Commissions" valeur={formatXof(commissions)} />
              <Ligne titre="Vélo en tête" valeur={veloEnTete(stats.velosLesPlusLoues)} />
            </dl>
            <Exports debut={debut} />
          </article>
        ))}
      </div>

      {/* Ordinateur : un tableau. */}
      <div className="mt-8 hidden overflow-x-auto rounded-[var(--radius-carte)] bg-white md:block">
        <table className="w-full whitespace-nowrap text-left text-[0.85rem]">
          <thead className="border-b border-noir-piste/10 text-[0.76rem] text-gris-cadre">
            <tr>
              <th className="px-3 py-3 font-semibold">Semaine</th>
              <th className="px-3 py-3 text-right font-semibold">Encaissé (évolution)</th>
              <th className="px-3 py-3 text-right font-semibold">Net après frais</th>
              <th className="px-3 py-3 text-right font-semibold">Réservations</th>
              <th className="px-3 py-3 text-right font-semibold">Road trip</th>
              <th className="px-3 py-3 text-right font-semibold">Location libre</th>
              <th className="px-3 py-3 text-right font-semibold">Commissions</th>
              <th className="px-3 py-3 font-semibold">Vélo en tête</th>
              <th className="px-3 py-3 font-semibold">Exporter</th>
            </tr>
          </thead>
          <tbody>
            {semaines.map(({ debut, fin, stats, commissions }) => (
              <tr key={debut} className="border-b border-noir-piste/5 last:border-0">
                <td className="px-3 py-3" title={intitule(debut, fin)}>
                  <span className="font-semibold">{intituleCourt(debut, fin)}</span>
                  {stats.periodeEnCours && (
                    <span className="mt-1 block">
                      <Pastille ton="info">En cours</Pastille>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">
                  {formatXof(stats.chiffreAffaires.valeur)}
                  {!stats.periodeEnCours && (
                    <span className="block">
                      <Variation valeur={stats.chiffreAffaires.variation} court />
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatXof(stats.encaisseNet)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNombre(stats.nombreReservations.valeur)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNombre(stats.participants.valeur)} pers.</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNombre(stats.heuresVendues.valeur)} h</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatXof(commissions)}</td>
                <td className="px-3 py-3">{veloEnTete(stats.velosLesPlusLoues)}</td>
                <td className="px-3 py-3">
                  <Exports debut={debut} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-noir-piste/15 font-semibold">
            <tr>
              <td className="px-3 py-3">Depuis le début</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatXof(total.encaisse)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatXof(total.net)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatNombre(total.reservations)}</td>
              <td className="px-3 py-3" colSpan={2} />
              <td className="px-3 py-3 text-right tabular-nums">{formatXof(total.commissions)}</td>
              <td className="px-3 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const jourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** « Du lun. 6 oct. au dim. 12 oct. » */
function intitule(debut: DateISO, fin: DateISO): string {
  const f = (jour: DateISO) => jourCourt.format(new Date(`${jour}T12:00:00Z`));
  return `Du ${f(debut)} au ${f(fin)}`;
}

/** Le vélo le plus loué, ou un tiret pour une semaine sans sortie. */
function veloEnTete(classement: { etiquette: string; valeur: number }[]): string {
  return classement[0] && classement[0].valeur > 0 ? classement[0].etiquette : "-";
}

/**
 * L'évolution sur la semaine d'avant. Jamais pour la semaine en cours :
 * deux jours écoulés comparés à une semaine pleine afficheraient une
 * chute qui n'existe pas.
 */
const jourNumero = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "UTC" });
const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** « 5 - 11 oct. », ou « 28 sept. - 4 oct. » à cheval sur deux mois : pour le tableau. */
function intituleCourt(debut: DateISO, fin: DateISO): string {
  const d = new Date(`${debut}T12:00:00Z`);
  const f = new Date(`${fin}T12:00:00Z`);
  const memeMois = debut.slice(0, 7) === fin.slice(0, 7);
  return `${memeMois ? jourNumero.format(d) : jourMois.format(d)} - ${jourMois.format(f)}`;
}

function Variation({ valeur, court = false }: { valeur: number | null; court?: boolean }) {
  if (valeur === null) return null;
  const arrondie = Math.round(valeur);
  if (arrondie === 0) return <span className="text-[0.76rem] font-normal text-gris-cadre">stable</span>;
  return (
    <span
      title="Par rapport à la semaine d'avant"
      className={`text-[0.76rem] font-semibold ${arrondie > 0 ? "text-vert-lagune" : "text-orange-sourd"}`}
    >
      {arrondie > 0 ? "+" : "−"}
      {Math.abs(arrondie)} %
      {!court && <span className="font-normal text-gris-cadre"> vs semaine d&apos;avant</span>}
    </span>
  );
}

function Tuile({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius-carte)] bg-white p-5">
      <dt className="text-[0.8rem] text-gris-cadre">{titre}</dt>
      <dd className="mt-2 font-display text-[1.5rem] font-bold tabular-nums">{valeur}</dd>
      {detail && <dd className="mt-1 text-[0.78rem] text-gris-cadre">{detail}</dd>}
    </div>
  );
}

function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-gris-cadre">{titre}</dt>
      <dd className="truncate font-semibold tabular-nums">{valeur}</dd>
    </div>
  );
}

function Exports({ debut }: { debut: DateISO }) {
  const base = `/api/admin/export?semaine=${debut}`;
  return (
    <p className="mt-3 flex gap-4 text-[0.82rem] font-semibold text-orange-sourd md:mt-0">
      <a href={`${base}&format=pdf`} className="lien-souligne cible-elargie">
        PDF
      </a>
      <a href={base} className="lien-souligne cible-elargie">
        CSV
      </a>
    </p>
  );
}
