import { VeloIllustration } from "@/components/VeloIllustration";
import { CadrePhoto, Etiquette, Section, TitreSection } from "@/components/ui";

/**
 * Bloc « une liste de bonnes raisons » : titre à gauche, visuel produit au
 * centre dans un cadre façon tirage papier, arguments listés à droite.
 */

const raisons = [
  "Zéro émission, zéro bruit, zéro carburant à trouver en route",
  "Cadres légers et géométries confortables, réglés à votre morphologie",
  "Une machine adaptée à chaque terrain, de la piste littorale aux crêtes",
  "Assistance téléphonique sept jours sur sept pendant toute la location",
];

export function Raisons() {
  return (
    <Section fond="sable" className="py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="reveal lg:col-span-4">
          <Etiquette numero="02">Nos arguments</Etiquette>
          <TitreSection className="mt-6">
            Une bonne raison,
            <br />
            puis quatre autres
          </TitreSection>
          <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-encre-500">
            Choisir le vélo pour un road trip, c&apos;est arriver là où les voitures ne passent
            pas et repartir avec des souvenirs que l&apos;on n&apos;achète pas.
          </p>
        </div>

        <div className="reveal lg:col-span-4" data-delai="120">
          <CadrePhoto rotation={-1.5}>
            <div
              className="grid aspect-4/5 place-items-center px-4"
              style={{ background: "linear-gradient(160deg, #f0e5d6 0%, #e3d3bd 55%, #d0b998 100%)" }}
            >
              <VeloIllustration categorie="VAE" teintes={["#c75c34", "#fdfbf7"]} className="w-full" />
            </div>
          </CadrePhoto>
        </div>

        <ul className="reveal space-y-0 lg:col-span-4" data-delai="200">
          {raisons.map((raison, index) => (
            <li
              key={raison}
              className="flex items-start gap-4 border-b border-encre-900/12 py-5 first:border-t"
            >
              <span className="mt-1 font-display text-[0.7rem] font-bold tabular-nums text-terre-600">
                0{index + 1}
              </span>
              <span className="text-[0.95rem] font-medium leading-relaxed">{raison}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
