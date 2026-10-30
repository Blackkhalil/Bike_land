import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonLien } from "@/components/Bouton";
import { CarteVelo } from "@/components/CarteVelo";
import { SpecificationsAnnotees } from "@/components/SpecificationsAnnotees";
import Image from "next/image";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille, Section, TitreSection } from "@/components/ui";
import { velos as catalogue } from "@/data/catalogue";
import { GAMMES, GRILLE_HORAIRE, prixRoadTripMinimum } from "@/data/offres";
import { DonneesStructurees } from "@/components/DonneesStructurees";
import { depot } from "@/lib/db";
import { filDAriane, veloALouer } from "@/lib/donnees-structurees";
import { formatXof } from "@/lib/format";
import { DESCRIPTION_MAX, libelleVelo, metadonneesPage, premierQuiTient, SUFFIXE_TITRE, TITRE_MAX } from "@/lib/seo";

type Params = Promise<{ slug: string }>;

/**
 * Page régénérée au plus une fois par minute.
 *
 * Elle l'était auparavant à chaque visite, parce que le calendrier
 * montre les créneaux déjà pris. C'était payer très cher une fraîcheur
 * dont personne n'a besoin : mesuré sur un build de production, soixante
 * visiteurs simultanés sur cette seule page suffisaient à épuiser le pool
 * de connexions, zéro réponse servie sur soixante.
 *
 * Une minute de retard sur le calendrier ne coûte rien, parce que
 * l'affichage n'a jamais été ce qui protège des doubles réservations :
 * le tunnel revérifie la disponibilité avant le paiement, et la
 * transaction sérialisable qui écrit la réservation tranche en dernier
 * ressort. Au pire, un client voit un créneau libre qui ne l'est plus et
 * reçoit un refus explicite, sans qu'un franc ait été prélevé.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return catalogue.map((velo) => ({ slug: velo.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) return { title: "Vélo introuvable" };

  // Le titre et la description les plus complets qui tiennent dans les
  // longueurs de Google (src/lib/seo.ts). L'accroche, seule information
  // propre au vélo, passe avant tout : la phrase de prix raccourcit d'abord.
  const libelle = libelleVelo(velo);
  // L'accroche saisie dans l'admin peut finir par un point : on n'en veut qu'un.
  const accroche = velo.accroche.trim().replace(/\.+$/, "");
  const heure = formatXof(GRILLE_HORAIRE[velo.gamme][0].prixXof);
  const roadTrip = formatXof(prixRoadTripMinimum(velo.gamme));
  const prixLong = `À louer à Cotonou dès ${heure} l'heure, ou en road trip le week-end dès ${roadTrip} par personne.`;
  const prixCourt = `À louer à Cotonou dès ${heure} l'heure, road trip dès ${roadTrip}.`;
  const metadonnees = metadonneesPage({
    titre: premierQuiTient(
      [`${libelle} à louer à Cotonou`, `${libelle} à louer`, velo.nom],
      TITRE_MAX - SUFFIXE_TITRE.length,
    ),
    description: premierQuiTient(
      [
        `${accroche}. ${prixLong} Réservation en ligne.`,
        `${accroche}. ${prixLong}`,
        `${accroche}. ${prixCourt}`,
        `${accroche}. À Cotonou dès ${heure} l'heure.`,
        `${libelle}. ${prixLong} Réservation en ligne.`,
        `${libelle}. ${prixLong}`,
      ],
      DESCRIPTION_MAX,
    ),
    chemin: `/velos/${velo.slug}`,
    ...(velo.photo ? { image: { url: velo.photo, alt: `${libelle}, à louer chez Bike Land` } } : {}),
  });
  // Un vélo retiré sort de l'index, comme il est sorti du plan du site.
  return velo.statut === "RETIRE" ? { ...metadonnees, robots: { index: false, follow: true } } : metadonnees;
}

export default async function PageVelo({ params }: { params: Params }) {
  const { slug } = await params;

  const velo = await depot.trouverVeloParSlug(slug);
  if (!velo) notFound();

  const [points, tousLesVelos] = await Promise.all([depot.listerPointsDeRetrait(), depot.listerVelos()]);
  // On ne réserve plus un vélo précis mais une gamme : la fiche montre le
  // vélo, et renvoie à la réservation de sa gamme.
  const gamme = GAMMES.find((entree) => entree.code === velo.gamme);
  const nomGamme = gamme?.nom ?? velo.gamme;
  const lienGamme = `/reserver/${velo.gamme.toLowerCase()}`;
  const seulDeSaGamme = tousLesVelos.filter((autre) => autre.gamme === velo.gamme).length <= 1;

  const point = points.find((p) => p.id === velo.pointDeRetraitId);
  // Les autres vélos du parc, sans trier par catégorie : elle ne guide
  // plus le choix du client.
  const similaires = tousLesVelos.filter((autre) => autre.id !== velo.id).slice(0, 3);

  // Ni catégorie ni taille : elles ne changent rien pour le client, le
  // coordinateur réglant la machine à sa morphologie au départ.
  const caracteristiques = [
    { libelle: "Poids", valeur: `${velo.poidsKg.toLocaleString("fr-FR")} kg` },
    { libelle: "Vitesses", valeur: `${velo.vitesses}` },
    { libelle: "Charge maximale", valeur: `${velo.chargeMaxKg} kg` },
    { libelle: "Autonomie conseillée", valeur: `${velo.autonomieConseilleeKm} km / jour` },
    { libelle: "Point de départ", valeur: point ? `${point.nom}, ${point.ville}` : "À définir" },
  ];

  return (
    <>
      <DonneesStructurees
        donnees={[
          filDAriane([
            { nom: "Nos vélos", chemin: "/velos" },
            { nom: velo.nom, chemin: `/velos/${velo.slug}` },
          ]),
          veloALouer(velo),
        ]}
      />
      {/* --- Bandeau produit --- */}
      {/* Le dégradé est clair, donc l'encre doit être sombre : l'encre par
          défaut du site est claire (le fond par défaut est noir) et le nom
          du vélo serait sinon blanc sur blanc. */}
      <section
        className="pt-28 text-noir-piste sm:pt-36"
        style={{ background: `linear-gradient(170deg, ${fondDuBandeau(velo.teintes[1])} 0%, #f2efe9 78%)` }}
      >
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <nav aria-label="Fil d'ariane" className="etiquette flex items-center gap-2 opacity-75">
            <Link href="/velos" className="lien-souligne cible-elargie">
              Nos vélos
            </Link>
            <span aria-hidden="true">/</span>
            <span>{velo.nom}</span>
          </nav>

          {velo.statut === "MAINTENANCE" && (
            <div className="mt-8">
              <Pastille ton="alerte">À l&apos;atelier</Pastille>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              {/* La gamme avant le nom : c'est elle qui fixe le tarif, et
                  le client doit savoir dans quelle catégorie il regarde
                  avant de lire le prix. */}
              <p className="etiquette text-orange-sourd">
                {nomGamme}
              </p>
              <TitreSection as="h1" taille="lg" className="mt-2">
                {velo.nom}
              </TitreSection>
              <p className="mt-4 max-w-xl text-[1.05rem] text-noir-releve">{velo.accroche}</p>

              {/* Sur téléphone, le prix du road trip passe en bloc à la
                  ligne : coupée après « road trip », la ligne faisait lire
                  le prix à l'heure comme celui du road trip. */}
              <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.95rem] text-noir-releve/75">
                <strong className="font-display text-[1.5rem] font-extrabold tabular-nums text-noir-piste">
                  {formatXof(GRILLE_HORAIRE[velo.gamme][0].prixXof)}
                </strong>
                l&apos;heure
                <span aria-hidden="true" className="hidden px-1 opacity-40 sm:inline">
                  •
                </span>
                <span className="whitespace-nowrap">
                  road trip dès{" "}
                  <strong className="font-semibold tabular-nums text-noir-piste">
                    {formatXof(prixRoadTripMinimum(velo.gamme))}
                  </strong>{" "}
                  par personne
                </span>
              </p>

              {/* Sous 1024 px, l'encart passe sous la description : ce
                  bouton mène à la réservation d'un geste. */}
              <BoutonLien href={lienGamme} className="mt-6 w-full sm:w-auto lg:hidden">
                Réserver un vélo {nomGamme}
              </BoutonLien>
            </div>
            {/* Plus d'étoiles par vélo : les avis portent sur l'expérience
                Bike Land dans son ensemble, pas sur la machine. Coller
                cette note sur un vélo ferait dire aux clients autre chose
                que ce qu'ils ont écrit. */}
          </div>

          {/* La photo, et non la vidéo du vélo : seule la vidéo de
              l'accueil est gardée sur le site, pour qu'une fiche
              s'affiche vite même sur un réseau mobile. */}
          {velo.photo ? (
            <div className="relative mx-auto mt-4 aspect-16/9 w-full max-w-4xl overflow-hidden">
              <Image
                src={velo.photo}
                alt={`${libelleVelo(velo)}, à louer chez Bike Land`}
                fill
                priority
                sizes="(min-width: 1024px) 900px, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <VeloIllustration
              categorie={velo.categorie}
              teintes={velo.teintes}
              className="mx-auto mt-4 w-full max-w-4xl"
            />
          )}
        </div>
      </section>

      {/* --- Description, caractéristiques et encart de réservation --- */}
      <Section fond="noir" className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed">{velo.description}</p>

            <h2 className="etiquette mt-12 opacity-75">Caractéristiques</h2>
            <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
              {caracteristiques.map((item) => (
                <div
                  key={item.libelle}
                  className="flex items-baseline justify-between gap-4 border-b border-craie/15 py-3"
                >
                  <dt className="text-[0.88rem] text-craie/70">{item.libelle}</dt>
                  <dd className="text-right text-[0.9rem] font-semibold">{item.valeur}</dd>
                </div>
              ))}
            </dl>

            <h2 className="etiquette mt-12 opacity-75">Fourni avec le vélo</h2>
            <ul className="mt-5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {velo.equipementInclus.map((equipement) => (
                <li
                  key={equipement}
                  className="flex items-start gap-3 border-b border-craie/15 py-3 text-[0.9rem]"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    className="mt-0.5 shrink-0 text-vert-lagune"
                    aria-hidden="true"
                  >
                    <path
                      d="m3 8.4 3.2 3.2L13 4.8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  {equipement}
                </li>
              ))}
            </ul>

            <div className="mt-12 rounded-[var(--radius-carte)] bg-white p-6">
              <p className="text-[0.85rem] font-semibold">Bon à savoir</p>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">
                Le prix dépend de la gamme du vélo et de la formule : forfait par personne pour
                le road trip encadré, grille horaire pour la location libre. Formule et jour se
                choisissent sur la page de la gamme.
              </p>
            </div>
          </div>

          <div id="reserver" className="scroll-mt-24 lg:col-span-5">
            <div className="rounded-[var(--radius-bloc)] border border-noir-piste/10 bg-white p-6 text-noir-piste sm:p-7 lg:sticky lg:top-24">
              <p className="etiquette text-orange-sourd">Gamme {nomGamme}</p>
              <p className="titre-editorial mt-3 text-[1.45rem]">On réserve une gamme, pas un vélo</p>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-gris-cadre">
                {seulDeSaGamme
                  ? `Le ${velo.nom} est l'unique vélo ${nomGamme} : il vous est réservé s'il est libre sur votre créneau.`
                  : `Le ${velo.nom} fait partie des vélos ${nomGamme}. À la réservation, nous vous attribuons un vélo ${nomGamme} libre sur votre créneau : celui-ci ou un autre de la gamme, réglé à votre taille au départ.`}
              </p>
              <BoutonLien href={lienGamme} taille="lg" className="mt-6 w-full">
                Réserver un vélo {nomGamme}
              </BoutonLien>
              <p className="mt-3 text-center text-[0.76rem] text-gris-cadre">
                Road trip ou location libre, jour et paiement à l&apos;étape suivante.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* --- Schéma annoté --- */}
      <Section fond="craie" className="py-16 sm:py-20">
        <TitreSection>Ce qui compte sur la route</TitreSection>
        <SpecificationsAnnotees velo={velo} className="mt-6" />
      </Section>

      {/* --- Autres vélos --- */}
      <Section fond="craie" className="py-16 sm:py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <TitreSection>Voir aussi</TitreSection>
          <BoutonLien href="/velos" variante="contour" className="text-noir-piste">
            Tout le catalogue
          </BoutonLien>
        </div>
        {/* Trois vélos sur deux colonnes finissaient par une carte seule :
            sur tablette, le troisième attend la grille à trois colonnes. */}
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {similaires.map((autre, index) => (
            <CarteVelo key={autre.id} velo={autre} className={index === 2 ? "sm:max-lg:hidden" : ""} />
          ))}
        </div>
      </Section>
    </>
  );
}

/**
 * Le départ du dégradé du bandeau : la teinte du vélo quand elle est
 * claire, le sable des autres fiches sinon. L'encre du bandeau est sombre ;
 * partie d'une teinte presque noire (#1c1b19 : le Prestige et trois
 * Premium), elle laissait le fil d'Ariane et la ligne de prix gris sur gris.
 */
function fondDuBandeau(teinte: string | undefined): string {
  if (!teinte || !/^#[0-9a-f]{6}$/i.test(teinte)) return "#e0dcd3";
  const rvb = parseInt(teinte.slice(1), 16);
  // Luminance perçue (ITU-R BT.601), de 0 à 255.
  const luminance = 0.299 * ((rvb >> 16) & 255) + 0.587 * ((rvb >> 8) & 255) + 0.114 * (rvb & 255);
  return luminance > 160 ? teinte : "#e0dcd3";
}
