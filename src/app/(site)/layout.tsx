import { AnnonceOctobreRose } from "@/components/AnnonceOctobreRose";
import { BandeauAdmin } from "@/components/BandeauAdmin";
import { EnTete } from "@/components/EnTete";
import { PiedDePage } from "@/components/PiedDePage";
import { ProtectionMedias } from "@/components/ProtectionMedias";
import { Reveal } from "@/components/Reveal";

/** Chrome du site public : en-tête flottant, contenu, pied de page. */
export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-noir-piste focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-craie"
      >
        Aller au contenu
      </a>
      <EnTete />
      <main id="contenu">{children}</main>
      <PiedDePage />
      <BandeauAdmin />
      <AnnonceOctobreRose />
      <Reveal />
      <ProtectionMedias />
    </>
  );
}
