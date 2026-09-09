import { BoutonLien } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";

/**
 * Hero de la page d'accueil.
 *
 * Reprend la construction de la maquette : un mot en très grand corps posé
 * derrière le vélo, le produit détouré au premier plan, l'accroche et les
 * appels à l'action en bas. La palette est celle du §4.1 — un dégradé de
 * fin de journée, terre et soleil, plutôt que le bleu froid de la référence.
 */
export function Hero() {
  return (
    <section className="grain relative isolate overflow-hidden bg-encre-900 pt-[72px] text-sable-50">
      {/* Dégradé de fond : nuit chaude en haut, lumière rasante en bas */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 85% at 72% 18%, #c75c34 0%, #90371f 38%, #3a322c 68%, #1c1714 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-56"
        style={{ background: "linear-gradient(to bottom, transparent, rgba(28,23,20,0.85))" }}
      />
      {/* Halo solaire, décalé pour ne pas être exactement derrière le vélo */}
      <div
        aria-hidden="true"
        className="absolute -z-10 h-[46rem] w-[46rem] rounded-full opacity-40 blur-3xl"
        style={{
          top: "-14rem",
          right: "-8rem",
          background: "radial-gradient(circle, #f0b445 0%, transparent 65%)",
        }}
      />

      <div className="mx-auto flex min-h-[max(600px,82svh)] max-w-[1400px] flex-col justify-between px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
        <div className="relative flex flex-1 items-center justify-center">
          {/* Le mot posé derrière le produit, coupé par le cadre du vélo */}
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[62%] select-none text-center font-display text-[clamp(4rem,18vw,14.5rem)] font-extrabold uppercase leading-[0.78] tracking-[-0.05em] text-sable-50/85 mix-blend-overlay"
          >
            Road trip
          </p>

          <VeloIllustration
            categorie="GRAVEL"
            teintes={["#f0b445", "#f8f2e9"]}
            avecOmbre={false}
            className="relative w-full max-w-[min(880px,86vw)] drop-shadow-[0_36px_60px_rgba(28,23,20,0.55)]"
          />

          {/* Accroche en bas à droite du visuel, comme sur la maquette */}
          <p className="absolute bottom-2 right-0 hidden max-w-[15rem] text-right font-display text-[1.4rem] font-bold uppercase leading-[1.02] tracking-[-0.02em] lg:block">
            Le Bénin à vélo,
            <br />
            du littoral
            <br />à l&apos;Atacora
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-8 lg:mt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="titre-editorial text-[clamp(2.2rem,6vw,4.4rem)]">
              Louez le vélo,
              <br />
              gardez la route
            </h1>
            <p className="mt-5 max-w-lg text-[1.02rem] leading-relaxed text-sable-100/80">
              Neuf vélos préparés pour l&apos;itinérance, réglés à votre taille, réservables en
              deux minutes et payables en Mobile Money. Sans créer de compte.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BoutonLien href="/velos" variante="clair" taille="lg">
              Réserver un vélo
            </BoutonLien>
            <BoutonLien
              href="/itineraires"
              variante="contour"
              taille="lg"
              className="border-sable-50/35 text-sable-50 hover:bg-sable-50/10"
            >
              Voir les itinéraires
            </BoutonLien>
          </div>
        </div>
      </div>
    </section>
  );
}
