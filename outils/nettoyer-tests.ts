/**
 * Retire les reservations d'essai, et elles seules.
 *
 * Deux categories partent :
 *
 *  - celles creees par les tests automatiques, reconnaissables a leur
 *    adresse en `@example.com` ;
 *  - les paniers abandonnes, restes en attente de paiement avec un
 *    paiement au mieux `INITIE`, donc jamais encaisse.
 *
 * Tout ce qui porte de l'argent est conserve, sans exception : un paiement
 * `REUSSI` ou `REMBOURSE`, un identifiant de transaction note (paiement
 * recu hors delai ou sur une reservation annulee, a rembourser), ou un
 * remboursement rattache (offres de groupe). Une reservation payee est une
 * trace comptable : meme faite pour essayer, elle atteste d'un mouvement
 * d'argent et ne s'efface pas sur une supposition. Le tri est laisse a qui
 * sait si l'argent a bouge. C'est la regle de `supprimerReservation`, et la
 * base refuse d'ailleurs d'effacer une reservation qui porte un
 * remboursement (cle etrangere RESTRICT).
 *
 * Chaque reservation part en une seule transaction : si elle ne peut pas
 * partir (un remboursement ajoute entre-temps), elle reste entiere et
 * l'outil passe a la suivante.
 *
 * Les clients ne sont supprimes que s'il ne leur reste plus aucune
 * reservation. Le journal des evenements et les preuves de reduction ne
 * sont pas touches : une ligne du journal ne s'efface pas, et une preuve a
 * sa propre duree de vie (capture supprimee sous 30 jours).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reservations = await prisma.booking.findMany({
    include: { customer: true, payments: true, remboursements: { select: { id: true } } },
  });

  type Ligne = (typeof reservations)[number];

  // Ce qui retient une reservation, ou `null` si rien ne la retient.
  const raisonDeGarder = (r: Ligne): string | null => {
    if (r.remboursements.length > 0) return "remboursement";
    const argent = r.payments.some(
      (p) =>
        p.status === "REUSSI" ||
        p.status === "REMBOURSE" ||
        (!p.isDeposit && p.providerReference !== null),
    );
    return argent ? "argent recu" : null;
  };

  const aRetirer = reservations.filter((r) => {
    if (raisonDeGarder(r)) return false;
    const email = r.customer?.email ?? "";
    if (email.endsWith("@example.com")) return true;
    return r.status === "EN_ATTENTE_PAIEMENT" || r.status === "ANNULEE";
  });

  const gardees = reservations.filter((r) => !aRetirer.includes(r));

  console.log(`${aRetirer.length} a retirer, ${gardees.length} conservees\n`);

  let echecs = 0;
  for (const r of aRetirer) {
    try {
      await prisma.$transaction([
        prisma.promoUsage.deleteMany({ where: { bookingId: r.id } }),
        prisma.payment.deleteMany({ where: { bookingId: r.id } }),
        prisma.bookingOption.deleteMany({ where: { bookingId: r.id } }),
        prisma.bookingItem.deleteMany({ where: { bookingId: r.id } }),
        prisma.review.deleteMany({ where: { bookingId: r.id } }),
        prisma.booking.delete({ where: { id: r.id } }),
      ]);
      console.log(`  retiree  ${r.reference}  ${r.status}  ${r.customer?.email ?? "?"}`);
    } catch (erreur) {
      echecs += 1;
      const raison = erreur instanceof Error ? erreur.message.split("\n")[0] : String(erreur);
      console.log(`  gardee   ${r.reference}  ${r.status}  (effacement refuse : ${raison})`);
    }
  }

  console.log("\nconservees :");
  for (const r of gardees) {
    const p = r.payments.map((x) => x.status).join(",");
    const raison = raisonDeGarder(r);
    console.log(`  ${r.reference}  ${r.status}  ${r.customer?.email ?? "?"}  [${p}]${raison ? `  ${raison}` : ""}`);
  }

  // Les clients devenus orphelins n'ont plus de raison de figurer.
  const orphelins = await prisma.customer.findMany({
    where: { bookings: { none: {} } },
    select: { id: true, email: true },
  });
  for (const c of orphelins) {
    await prisma.customer.delete({ where: { id: c.id } });
  }
  console.log(`\n${orphelins.length} client(s) sans reservation supprime(s)`);

  console.log(
    `\nreste : ${await prisma.booking.count()} reservation(s), ` +
      `${await prisma.customer.count()} client(s)` +
      (echecs ? `, ${echecs} reservation(s) gardee(s) faute de pouvoir les effacer` : ""),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
