import { Suspense } from "react";

import { AnnonceOctobreRose } from "@/components/AnnonceOctobreRose";
import { BandeauAdmin } from "@/components/BandeauAdmin";
import { EnTete } from "@/components/EnTete";
import { ChatGroupeDuSite } from "@/components/offres-groupe/ChatGroupeDuSite";
import { PiedDePage } from "@/components/PiedDePage";
import { ProtectionMedias } from "@/components/ProtectionMedias";
import { Reveal } from "@/components/Reveal";

/**
 * Les pages publiques se régénèrent au plus toutes les cinq minutes, comme
 * l'accueil, et tout de suite après un réglage de l'administration
 * (rafraichirSitePublic) : la bulle des offres de groupe suit l'interrupteur
 * même si le rafraîchissement demandé par l'administration n'arrive pas. Une
 * page qui se régénère plus souvent garde sa propre durée.
 */
export const revalidate = 300;

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
      {/* Le chatbot des offres de groupe : rien tant que l'interrupteur est coupé. */}
      <Suspense fallback={null}>
        <ChatGroupeDuSite />
      </Suspense>
    </>
  );
}
