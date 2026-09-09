/** Le logo : une roue stylisée dont les rayons forment une boussole (§4.2). */
export function Marque({ className = "", taille = 34 }: { className?: string; taille?: number }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={taille}
        height={taille}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="20" cy="20" r="17.5" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="20" cy="20" r="3.4" fill="currentColor" />
        {/* Aiguille de boussole orientée nord-est : le départ en voyage. */}
        <path d="M27.5 12.5 22.6 22.6 12.5 27.5 17.4 17.4Z" fill="currentColor" opacity="0.92" />
        {[0, 45, 90, 135].map((angle) => (
          <line
            key={angle}
            x1="20"
            y1="20"
            x2="20"
            y2="4.5"
            stroke="currentColor"
            strokeWidth="1.1"
            opacity="0.32"
            transform={`rotate(${angle} 20 20)`}
          />
        ))}
      </svg>
      <span className="font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[-0.04em]">
        Bike&nbsp;Land
      </span>
    </span>
  );
}
