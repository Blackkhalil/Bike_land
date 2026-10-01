import { BoutonLien } from "@/components/Bouton";
import { VeloTilt } from "@/components/accueil/VeloTilt";
import { GRILLE_HORAIRE, PRIX_MINIMUM_HEURE_XOF } from "@/data/offres";
import { formatXof } from "@/lib/format";

/**
 * Le vélo en pleine page, façon fiche produit.
 *
 * Composition en trois plans, du fond vers l'avant :
 *
 *  1. un fond noir semé de points et de grands cercles sourds, qui
 *     donne de la matière sans rien dire ;
 *  2. une **bande orange verticale**, décalée à droite, qui coupe la
 *     page et sert de fond au sujet ;
 *  3. le **vélo**, posé à cheval sur les deux, c'est ce chevauchement
 *     qui crée la profondeur, bien plus qu'une ombre portée.
 *
 * Le vélo est une photo sur fond **noir pur**, affichée en fusion
 * `screen` : le noir y devient transparent quel que soit ce qu'il y a
 * derrière. La machine se pose donc sur l'orange comme sur le noir, sans
 * détourage ni PNG à canal alpha. C'est ce qui rend le chevauchement
 * possible avec le matériel dont on dispose.
 */
export function VeloEnVedette() {
  const prixPrestige = GRILLE_HORAIRE.PRESTIGE[0].prixXof;

  return (
    <section className="relative isolate overflow-hidden bg-noir-piste text-craie">
      {/* Plan 1, la matière du fond : semis de points et deux grands
          cercles à peine détachés du noir. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(240,238,233,0.22) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-24 -z-20 h-[26rem] w-[26rem] rounded-full border-[3rem] border-craie/[0.04]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-[18%] -z-20 h-[32rem] w-[32rem] rounded-full border-[4rem] border-craie/[0.03]"
      />

      {/* Plan 2, la bande orange. Verticale et pleine hauteur sur grand
          écran ; sur mobile elle devient un bandeau bas, où une colonne
          traverserait le texte. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[38%] bg-orange-signal sm:inset-y-0 sm:left-[52%] sm:h-auto sm:w-[22%] lg:left-[54%] lg:w-[20%]"
      />

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:gap-0 lg:py-28">
        {/* Plan 3, le vélo à cheval sur la bande. Premier dans le
            balisage : c'est le sujet, et un lecteur d'écran comme un
            téléphone le rencontrent d'abord. */}
        <VeloTilt
          source="/images/micke-lindstrom-Vz4O-jhHvfk-unsplash.jpg"
          alt="Vélo vu de profil"
          largeur={3640}
          hauteur={4200}
          surFondSombre
          rotationEntree={-18}
          className="-mx-5 lg:order-2 lg:mx-0 lg:-ml-24 lg:w-[calc(100%+10rem)]"
          classeImage="mix-blend-screen"
        />

        <div className="relative z-10 max-w-xl lg:order-1">
          <p className="etiquette text-orange-signal">Le parc Bike Land</p>

          <h2 className="mt-4 titre-editorial text-[clamp(2rem,5vw,3.6rem)]">
            Des machines
            <br />
            prêtes à rouler
          </h2>

          {/* Le prix d'entrée, avec celui du haut de gamme barré à côté :
              le client situe immédiatement l'amplitude du parc. */}
          <p className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[0.95rem] font-semibold text-craie/45 line-through tabular-nums">
              {formatXof(prixPrestige)}
            </span>
            <span className="font-display text-[2rem] font-extrabold leading-none tabular-nums text-orange-signal">
              {formatXof(PRIX_MINIMUM_HEURE_XOF)}
            </span>
            <span className="text-[0.88rem] text-craie/70">l&apos;heure, frais compris</span>
          </p>

          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-craie/85">
            Chaque vélo est révisé entre deux sorties : freins, pression, transmission. Vous le
            recevez réglé à votre taille, avec casque, antivol et kit de réparation.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BoutonLien href="/velos" variante="primaire" taille="lg">
              Réserver
            </BoutonLien>
            <BoutonLien
              href="/comment-ca-marche"
              variante="contour"
              taille="lg"
              className="text-craie"
            >
              Comment ça marche
            </BoutonLien>
          </div>
        </div>
      </div>
    </section>
  );
}
