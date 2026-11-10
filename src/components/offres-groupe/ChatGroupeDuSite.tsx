import { faitsDuChat } from "@/lib/offres-groupe/vitrine";

import { BulleChatGroupe } from "./BulleChatGroupe";

/**
 * Le chatbot des offres de groupe sur les pages du site public, décidé sur
 * le serveur : rendu seulement quand l'interrupteur « Offres de groupe » est
 * ouvert et que les réglages se lisent. Interrupteur coupé (par défaut), rien
 * n'est rendu : le site est exactement celui d'avant.
 *
 * La mise en page le pose dans une frontière Suspense : sa lecture de la base
 * ne retient jamais l'affichage de la page.
 */
export async function ChatGroupeDuSite() {
  const faits = await faitsDuChat();
  return faits ? <BulleChatGroupe faits={faits} /> : null;
}
