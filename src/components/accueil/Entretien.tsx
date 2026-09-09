import { Accordeon } from "@/components/Accordeon";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Etiquette, Section, TitreSection } from "@/components/ui";

/**
 * « Votre vélo, prêt à rouler » : accordéon d'entretien à gauche, visuel à
 * droite — la construction du bloc maintenance de la maquette.
 */

const volets = [
  {
    titre: "Contrôle avant chaque départ",
    contenu:
      "Freins, pression des pneus, tension de la chaîne, serrage des porte-bagages : un point de contrôle complet est effectué et signé avant chaque remise de vélo. Rien ne part sans être passé entre les mains d'un mécanicien.",
  },
  {
    titre: "Pneus et crevaisons",
    contenu:
      "Nos gravels roulent en tubeless, les autres vélos en chambre renforcée anti-épines. Chaque vélo part avec une chambre de rechange, des démonte-pneus et une pompe. Un tutoriel de deux minutes est fait au départ à qui le souhaite.",
  },
  {
    titre: "Batteries et recharge",
    contenu:
      "Les batteries sont testées en capacité réelle tous les trois mois et remplacées dès qu'elles passent sous 80 % de leur capacité d'origine. Un chargeur rapide est fourni ; une seconde batterie est disponible en option sur les étapes longues.",
  },
  {
    titre: "Assistance en route",
    contenu:
      "Un numéro unique, joignable sept jours sur sept pendant votre location. Nous intervenons dans un rayon de 60 km autour de Cotonou, Ouidah et Natitingou, ou nous organisons un dépannage local ailleurs.",
  },
];

export function Entretien() {
  return (
    <Section fond="sable" className="py-20 sm:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="reveal">
          <Etiquette numero="04">Entretien du parc</Etiquette>
          <TitreSection className="mt-6">
            Un vélo qui roule
            <br />
            sans vous trahir
          </TitreSection>
          <p className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-encre-500">
            Un road trip s&apos;arrête rarement à cause du cycliste : il s&apos;arrête à cause
            du vélo. C&apos;est pour cette raison que nous en louons peu, et que nous les suivons
            un par un.
          </p>
          <Accordeon volets={volets} className="mt-8" idPrefixe="entretien" />
        </div>

        <div
          className="reveal relative grid place-items-center overflow-hidden rounded-[1.75rem] px-8 py-16"
          data-delai="140"
          style={{ background: "linear-gradient(150deg, #3d4f27 0%, #2e3b1f 55%, #1f2716 100%)" }}
        >
          <VeloIllustration
            categorie="GRAVEL"
            teintes={["#f0b445", "#e8eddd"]}
            className="w-full max-w-xl"
          />
          <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-4 text-olive-50">
            {[
              { valeur: "48 h", detail: "révision complète entre deux locations" },
              { valeur: "7 j / 7", detail: "assistance téléphonique" },
              { valeur: "60 km", detail: "rayon de dépannage" },
            ].map((item) => (
              <div key={item.valeur} className="border-t border-olive-50/25 pt-3">
                <dt className="font-display text-[1.35rem] font-extrabold leading-none">{item.valeur}</dt>
                <dd className="mt-2 text-[0.72rem] leading-snug opacity-65">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
