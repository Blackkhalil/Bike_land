/**
 * Ce que montre le site entre le clic et l'arrivée de la page.
 *
 * Sans lui, un clic vers une page préparée par le serveur (réservation,
 * fiche vélo à rafraîchir) ne changeait rien à l'écran tant que la
 * réponse n'était pas arrivée : sur un réseau mobile béninois, une à
 * trois secondes pendant lesquelles le site semblait bloqué. Next.js
 * l'affiche immédiatement au clic, l'en-tête et le pied de page restant
 * en place ; la page le remplace dès qu'elle est prête.
 */
export default function Chargement() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="min-h-[70vh] bg-noir-piste px-5 pb-24 pt-32 sm:px-8 sm:pt-40"
    >
      <span className="sr-only">Chargement de la page</span>
      <div aria-hidden="true" className="mx-auto max-w-[1280px] animate-pulse">
        <div className="h-4 w-32 rounded-full bg-craie/10" />
        <div className="mt-5 h-12 w-3/4 max-w-xl rounded-[var(--radius-bouton)] bg-craie/10" />
        <div className="mt-4 h-4 w-2/3 max-w-lg rounded-full bg-craie/10" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-4/3 rounded-[var(--radius-carte)] bg-craie/[0.07]" />
          ))}
        </div>
      </div>
    </section>
  );
}
