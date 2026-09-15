import { Etiquette, LienFleche, Section, TitreSection } from "@/components/ui";

/**
 * Liste numérotée des trois arguments d'entrée, reprise de la maquette :
 * des lignes fines séparées par des filets, chacune avec son lien.
 */

const arguments_ = [
  {
    numero: "1.",
    titre: "La route des Pêches, à deux pas",
    detail:
      "Un point de départ à Fidjrossè, un vélo réglé à votre taille, et vous roulez : pas besoin de traverser tout Cotonou pour partir.",
    href: "/a-propos",
  },
  {
    numero: "2.",
    titre: "Réservation en deux minutes, sans compte",
    detail:
      "Vous choisissez, vous payez en Mobile Money, vous recevez votre facture. Aucun mot de passe à retenir.",
    href: "/comment-ca-marche",
  },
  {
    numero: "3.",
    titre: "Un parc suivi vélo par vélo",
    detail:
      "Chaque machine a son carnet d'entretien. Freins, transmission et pression sont revus avant chaque départ.",
    href: "/a-propos",
  },
];

export function CeQueVousCherchiez() {
  return (
    <Section fond="blanc" className="py-20 sm:py-28">
      <div className="reveal">
        <Etiquette numero="01">Pourquoi Bike Land</Etiquette>
        <TitreSection className="mt-6 max-w-3xl">Ce que vous cherchiez vraiment</TitreSection>
      </div>

      <ol className="mt-14 border-t border-noir-piste/12">
        {arguments_.map((argument, index) => (
          <li
            key={argument.numero}
            className="reveal border-b border-noir-piste/12"
            data-delai={index * 90}
          >
            <div className="group flex flex-col gap-4 py-7 sm:flex-row sm:items-center sm:gap-10">
              <span className="w-8 shrink-0 font-display text-sm font-bold tabular-nums text-orange-sourd">
                {argument.numero}
              </span>
              <h3 className="flex-1 font-display text-[1.05rem] font-bold uppercase leading-tight tracking-[-0.01em] sm:text-[1.2rem]">
                {argument.titre}
              </h3>
              <p className="max-w-md text-[0.92rem] leading-relaxed text-gris-cadre sm:flex-1">
                {argument.detail}
              </p>
              <LienFleche href={argument.href} className="shrink-0 text-orange-sourd">
                En savoir plus
              </LienFleche>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
