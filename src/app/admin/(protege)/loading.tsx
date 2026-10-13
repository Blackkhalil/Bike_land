/**
 * Ce que montre l'administration entre le clic et l'arrivée de la page.
 *
 * Chaque écran de l'admin est calculé à la demande, à partir de toutes
 * les réservations : sans cet écran, le menu semblait ne pas répondre le
 * temps du calcul. Il s'affiche immédiatement, dans le cadre de l'admin.
 */
export default function ChargementAdmin() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement</span>
      <div aria-hidden="true" className="animate-pulse">
        <div className="h-3 w-24 rounded-full bg-noir-piste/10" />
        <div className="mt-4 h-9 w-64 max-w-full rounded-[var(--radius-bouton)] bg-noir-piste/10" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-[var(--radius-carte)] bg-white" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-[var(--radius-carte)] bg-white" />
      </div>
    </div>
  );
}
