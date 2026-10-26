/**
 * Données structurées schema.org pour Google, en JSON-LD.
 *
 * Elles disent aux moteurs ce que la page décrit (l'entreprise, un vélo,
 * une sortie, le fil d'Ariane) sans rien changer à l'affichage. Le `<`
 * est échappé : une balise fermante dans un texte sortirait sinon du bloc
 * de script et serait interprétée comme du HTML.
 */
export function DonneesStructurees({ donnees }: { donnees: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees).replace(/</g, "\\u003c") }}
    />
  );
}
