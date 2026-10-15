import LayoutSite from "./(site)/layout";
import PageIntrouvable from "./(site)/not-found";

/**
 * La page des adresses qui ne mènent nulle part.
 *
 * La 404 du groupe (site) ne sert qu'aux `notFound()` de ses pages : une
 * adresse inconnue tombait sur la page par défaut de Next.js, en anglais,
 * sans en-tête ni pied de page, une impasse sur téléphone. Celle-ci reprend
 * la même page, dans l'habillage du site public.
 */
export default function Introuvable() {
  return (
    <LayoutSite>
      <PageIntrouvable />
    </LayoutSite>
  );
}
