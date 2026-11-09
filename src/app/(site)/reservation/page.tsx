import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TunnelReservation } from "@/components/reservation/TunnelReservation";
import { Section, TitreSection } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import {
  creneauDuJour,
  CRENEAUX_ROAD_TRIP,
  creneauxDisponibles,
  departsComplets,
  DUREE_ROAD_TRIP_HEURES,
  GAMMES,
  GRILLE_HORAIRE,
  heuresDepartPossibles,
  motifRoadTripGamme,
  roadTripPossible,
} from "@/data/offres";
import { MESSAGES_WHATSAPP } from "@/data/produits";
import type { CodeOffre } from "@/lib/types";
import { depot } from "@/lib/db";
import { aujourdhui, estDateISOValide } from "@/lib/dates";
import { departsDeLaGamme, lireOuverture, motifDeRefus } from "@/lib/ouverture";
import { formatDate } from "@/lib/format";
import { lienWhatsApp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Réserver",
  description: "Finalisez votre réservation Bike Land en trois étapes, sans créer de compte.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Recherche = Promise<Record<string, string | string[] | undefined>>;

export default async function PageReservation({ searchParams }: { searchParams: Recherche }) {
  const parametres = await searchParams;

  // La gamme choisie (« premium »). Un ancien lien porte encore un vélo
  // précis (?velo=) : il mène à la gamme de ce vélo, qu'on réserve comme les
  // autres, sans vélo choisi.
  const segmentGamme = typeof parametres.gamme === "string" ? parametres.gamme : null;
  const slug = typeof parametres.velo === "string" ? parametres.velo : null;
  // L'offre vient de l'URL mais n'est jamais crue sur parole : le prix
  // est recalcule cote serveur a la creation, et la validation Zod
  // refuse toute duree hors grille.
  const offre: CodeOffre = parametres.offre === "location-libre" ? "location-libre" : "road-trip";
  const heuresBrutes = Number(parametres.heures);
  const dureeHeures = Number.isInteger(heuresBrutes) ? heuresBrutes : 2;
  const personnesBrutes = Number(parametres.personnes);
  const nombrePersonnes =
    Number.isInteger(personnesBrutes) && personnesBrutes > 0 ? Math.min(personnesBrutes, 12) : 1;

  const debut = typeof parametres.debut === "string" ? parametres.debut : null;
  const fin = typeof parametres.fin === "string" ? parametres.fin : null;

  // Heure de départ. Le road trip part au créneau encadré ; la location
  // libre accepte l'heure passée dans l'URL, à condition qu'elle laisse
  // le temps de rendre le vélo avant la fermeture, qu'elle n'empiète pas
  // sur le road trip du week-end et qu'elle ne soit pas déjà passée.
  const maintenant = new Date();
  const heureBrute = Number(parametres.heure);
  const departsPossibles = heuresDepartPossibles(dureeHeures, debut ?? undefined, maintenant);
  const heureDebut =
    offre === "road-trip"
      ? CRENEAUX_ROAD_TRIP[0].heureDebut
      : departsPossibles.includes(heureBrute)
        ? heureBrute
        : (departsPossibles[0] ?? CRENEAUX_ROAD_TRIP[0].heureDebut);
  // Sans période valide, il n'y a rien à réserver : on renvoie au catalogue
  // plutôt que d'afficher un tunnel vide.
  if (
    (!segmentGamme && !slug) ||
    !debut ||
    !fin ||
    !estDateISOValide(debut) ||
    !estDateISOValide(fin) ||
    debut > fin ||
    debut < aujourdhui()
  ) {
    redirect("/velos");
  }

  // Les créneaux encadrés se calculent ici, sur le serveur : le tunnel
  // est un composant client, et y appeler `new Date()` donnerait une
  // valeur différente de celle du rendu serveur.
  const ouverture = await lireOuverture();
  const creneaux = creneauxDisponibles(maintenant, ouverture);
  // Les départs fermés depuis l'admin s'affichent « Sold out », sans se réserver.
  const complets = departsComplets(maintenant, ouverture);
  // Un jour fermé depuis l'admin, arrivé par un lien ou une page restée
  // ouverte : on le dit tout de suite, plutôt qu'au moment de payer.
  const refusLocation =
    offre === "location-libre"
      ? motifDeRefus(ouverture, { offre, dateDebut: debut, dateFin: fin, heureDebut })
      : null;

  const veloDuLien = !segmentGamme && slug ? await depot.trouverVeloParSlug(slug) : null;
  const codeGamme = segmentGamme?.toUpperCase() ?? veloDuLien?.gamme;
  const gamme = GAMMES.find((entree) => entree.code === codeGamme);
  if (!gamme) redirect("/velos");

  const [points, parc, departs] = await Promise.all([
    depot.listerPointsDeRetrait(),
    depot.listerVelos(),
    // Un départ encadré où tous les vélos de la gamme sont pris s'affiche
    // « Sold out » dans le tunnel, comme un départ fermé depuis l'admin.
    departsDeLaGamme(gamme.code, creneaux, complets),
  ]);

  // Reste-t-il un vélo de la gamme sur ce créneau ? Le tunnel recompte
  // ensuite à chaque changement d'heure, et l'écriture tranche.
  const gammeLibreA = async (heure: number, duree: number) =>
    (await depot.velosLibres(debut, heure, heure + duree)).some((velo) => velo.gamme === gamme.code);

  // Le road trip part à son créneau. La location libre garde l'heure
  // demandée si un vélo de la gamme y est libre, sinon la première heure
  // du jour où il en reste un : une gamme pleine à 8 h ne doit pas fermer
  // une journée encore libre l'après-midi. Le jour n'est complet que si
  // aucune heure ne l'est, pour la durée demandée comme pour la plus
  // courte de la grille : le calendrier, lui, compte heure par heure.
  let heureRetenue = heureDebut;
  let dureeRetenue = dureeHeures;
  let disponible = false;
  // Gbashi bike, le dimanche, se commande sur WhatsApp : un lien vers ce
  // départ (page restée ouverte, ancien lien) mène au numéro, pas au
  // tunnel. Le serveur le refuserait de toute façon.
  const departDuJour = offre === "road-trip" ? creneauDuJour(debut) : undefined;
  const surCommande = departDuJour && !departDuJour.enLigne ? departDuJour : undefined;
  // Le road trip du samedi se roule en Premium ou Prestige : un lien vers
  // ce départ pour le Classique (page restée ouverte, ancien lien) mène à
  // l'explication, pas au tunnel.
  // Seulement un jour de départ : un autre jour (ancien lien sans formule),
  // le tunnel propose lui-même les départs de la gamme.
  const horsGamme =
    offre === "road-trip" && creneauDuJour(debut) ? motifRoadTripGamme(gamme.code, debut) : null;
  if (surCommande || horsGamme) {
    disponible = false;
  } else if (offre === "road-trip") {
    disponible = await gammeLibreA(heureDebut, DUREE_ROAD_TRIP_HEURES);
  } else {
    const candidates = [heureDebut, ...departsPossibles.filter((heure) => heure !== heureDebut)];
    for (const heure of candidates) {
      if (await gammeLibreA(heure, dureeHeures)) {
        heureRetenue = heure;
        disponible = true;
        break;
      }
    }
    const plusCourte = GRILLE_HORAIRE[gamme.code][0].heures;
    if (!disponible && plusCourte < dureeHeures) {
      for (const heure of heuresDepartPossibles(plusCourte, debut, maintenant)) {
        if (await gammeLibreA(heure, plusCourte)) {
          heureRetenue = heure;
          dureeRetenue = plusCourte;
          disponible = true;
          break;
        }
      }
    }
  }
  // Pas plus de personnes que de vélos de la gamme en état de rouler : une
  // seule pour le Prestige, exemplaire unique.
  const enEtat = parc.filter(
    (velo) => velo.gamme === gamme.code && velo.statut !== "MAINTENANCE" && velo.statut !== "RETIRE",
  );
  const personnesMax = Math.max(1, enEtat.length);
  // Un vélo de la gamme pour l'image d'en-tête du tunnel : celui du lien
  // s'il y en a un, sinon le premier qui a une photo.
  const apercu = veloDuLien ?? enEtat.find((velo) => velo.photo) ?? enEtat[0];
  const lienGamme = `/reserver/${gamme.code.toLowerCase()}`;

  const optionsDemandees = (
    Array.isArray(parametres.option) ? parametres.option : parametres.option ? [parametres.option] : []
  ).filter((code) => optionsLocation.some((option) => option.code === code));

  return (
    <Section fond="craie" className="pb-24 pt-32 sm:pt-40">
      <TitreSection as="h1">
        Plus que quelques minutes
      </TitreSection>

      {refusLocation ? (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Ce jour est complet</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Toutes les places du {formatDate(debut)} sont prises. Aucun montant n&apos;a été
            prélevé.
          </p>
          <Link
            href={lienGamme}
            className="mt-6 inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
          >
            Choisir une autre date
          </Link>
        </div>
      ) : surCommande ? (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">
            {surCommande.produit ?? "Ce départ"} se commande sur WhatsApp
          </p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Il ne se réserve plus en ligne&nbsp;: écrivez-nous au{" "}
            <span className="whitespace-nowrap font-semibold text-noir-piste">{site.whatsapp[1].numero}</span>,
            avec le jour choisi et le nombre de personnes, et nous organisons votre sortie. Aucun
            montant n&apos;a été prélevé.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={lienWhatsApp(`${MESSAGES_WHATSAPP.gbashiBike} Jour souhaité : le ${formatDate(debut)}.`)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
            >
              Commander sur WhatsApp
            </a>
            <Link
              href={lienGamme}
              className="inline-flex rounded-full border border-noir-piste/30 px-6 py-3 text-sm font-semibold text-noir-piste"
            >
              Réserver un vélo {gamme.nom}
            </Link>
          </div>
        </div>
      ) : horsGamme ? (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Pas de road trip en {gamme.nom} ce jour-là</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            {horsGamme} Aucun montant n&apos;a été prélevé.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {/* Tout droit vers le tunnel de ce départ, dans une gamme qui le roule. */}
            {GAMMES.filter((autre) => roadTripPossible(autre.code, debut)).map((autre, index) => (
              <Link
                key={autre.code}
                href={`/reservation?gamme=${autre.code.toLowerCase()}&offre=road-trip&debut=${debut}&fin=${debut}&heure=${heureDebut}`}
                className={
                  index === 0
                    ? "inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
                    : "inline-flex rounded-full border border-noir-piste/30 px-6 py-3 text-sm font-semibold text-noir-piste"
                }
              >
                Road trip en {autre.nom}
              </Link>
            ))}
            <Link
              href={`${lienGamme}?debut=${debut}`}
              className="inline-flex rounded-full border border-noir-piste/30 px-6 py-3 text-sm font-semibold text-noir-piste"
            >
              Rester en {gamme.nom}
            </Link>
          </div>
        </div>
      ) : disponible ? (
        <div className="mt-12">
          <TunnelReservation
            gamme={gamme.code}
            apercu={apercu}
            point={points.find((point) => point.id === apercu?.pointDeRetraitId)}
            offre={offre}
            dureeHeures={dureeRetenue}
            nombrePersonnes={Math.min(nombrePersonnes, personnesMax)}
            personnesMax={personnesMax}
            dateDebut={debut}
            dateFin={fin}
            heureDebut={heureRetenue}
            creneaux={departs.creneaux}
            complets={departs.complets}
            instant={maintenant.getTime()}
            optionsInitiales={optionsDemandees}
          />
        </div>
      ) : (
        <div className="mt-12 max-w-xl rounded-[var(--radius-bloc)] bg-white p-8">
          <p className="titre-editorial text-[1.4rem]">Plus de vélo {gamme.nom} libre</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
            Tous les vélos {gamme.nom} sont pris {offre === "road-trip" ? "sur ce départ" : "ce jour-là"}.
            Choisissez {offre === "road-trip" ? "un autre départ" : "un autre jour"}, ou une autre gamme.
            Aucun montant n&apos;a été prélevé.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={lienGamme}
              className="inline-flex rounded-full bg-noir-piste px-6 py-3 text-sm font-semibold text-craie"
            >
              {offre === "road-trip" ? "Choisir un autre départ" : "Choisir un autre jour"}
            </Link>
            <Link
              href="/velos"
              className="inline-flex rounded-full border border-noir-piste/30 px-6 py-3 text-sm font-semibold text-noir-piste"
            >
              Voir les autres gammes
            </Link>
          </div>
        </div>
      )}
    </Section>
  );
}
