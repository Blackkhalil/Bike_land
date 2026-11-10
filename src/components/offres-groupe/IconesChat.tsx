/**
 * Les icônes du chatbot des offres de groupe, dessinées ici, sans
 * bibliothèque : la bulle qui l'ouvre, l'avion en papier « Envoyer »,
 * WhatsApp, « Recommencer » et « Fermer ». Toutes décoratives : le bouton
 * qui les porte a son propre nom (aria-label).
 *
 * Module léger : la bulle, présente sur toutes les pages, s'en sert sans
 * charger le chatbot.
 */

/** Une bulle de discussion pleine, ses trois points évidés : le signe du chatbot. */
export function IconeDiscussion({ taille = 28 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true" className="shrink-0">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 3C6.98 3 3 6.58 3 11c0 2.33 1.11 4.42 2.88 5.88L5 21l4.3-2.15c.86.2 1.76.3 2.7.3 5.02 0 9-3.58 9-8.15S17.02 3 12 3ZM6.75 11a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0ZM10.75 11a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0ZM14.75 11a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0Z"
      />
    </svg>
  );
}

/** L'avion en papier du bouton « Envoyer ». */
export function IconeEnvoyer() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0 translate-x-px">
      <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6l.01 6.53L15 12 3.41 13.87Z" />
    </svg>
  );
}

/** Le logo de WhatsApp, pour le lien qui y écrit à Bike Land. */
export function IconeWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" className="shrink-0">
      <path
        fill="currentColor"
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35Zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z"
      />
    </svg>
  );
}

/** Une flèche qui revient sur elle-même : « Recommencer ». */
export function IconeRecommencer() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4.2h4.2" />
    </svg>
  );
}

/** Une croix : « Fermer ». */
export function IconeFermer({ taille = 22 }: { taille?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}
