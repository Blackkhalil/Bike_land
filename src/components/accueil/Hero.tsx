import { BoutonLien } from "@/components/Bouton";
import { VideoFond } from "@/components/accueil/VideoFond";

/**
 * Héros de la page d'accueil.
 *
 * Une vidéo de la route des Pêches occupe tout le fond, sous un voile
 * sombre qui garde le titre lisible. Le vélo détouré qui tenait cette
 * place est descendu plus bas dans la page : deux sujets forts en haut
 * d'écran se seraient disputé l'attention.
 *
 * La vidéo est tournée au téléphone, donc verticale. Sur un large écran
 * elle est recadrée par `object-cover`, on n'en voit qu'une bande
 * centrale, ce qui convient à un fond mais pas à un sujet qu'il faudrait
 * lire. Sur mobile, elle remplit l'écran naturellement.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-noir-piste text-craie">
      {/* Les 4,4 premières secondes du fichier portent le titre du modèle
          de montage (« MOMENTS », « BY YOURNAME ») : la lecture part
          après, et y revient à chaque boucle. */}
      <VideoFond
        source="/Video/bikeland-hero.mp4"
        affiche="/Video/bikeland-hero-affiche.jpg"
        debut={4.4}
      />

      <div className="mx-auto grid min-h-[max(620px,88svh)] max-w-[1280px] grid-cols-1 items-center px-5 pb-24 pt-[104px] sm:px-8 lg:pb-28 lg:pt-[120px]">
        <div className="relative z-10 max-w-2xl">
          <h1 className="titre-editorial text-[clamp(2.75rem,7.5vw,5.25rem)]">
            Louez le vélo,
            <br />
            gardez la route
          </h1>

          <p className="mt-6 max-w-md text-[1.02rem] leading-relaxed text-craie/85">
            Des vélos préparés pour la route des Pêches, à Cotonou. Une sortie encadrée par un
            coordinateur, sans caution et sans compte à créer.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BoutonLien href="/velos" variante="primaire" taille="lg">
              Réserver un vélo
            </BoutonLien>
            <BoutonLien href="/itineraires" variante="contour" taille="lg" className="text-craie">
              Voir les tours
            </BoutonLien>
          </div>
        </div>
      </div>
    </section>
  );
}
