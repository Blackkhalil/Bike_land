import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Petites briques de mise en page partagées par toutes les sections.
 * Elles portent l'essentiel du rythme visuel : étiquette numérotée,
 * grand titre éditorial, filet horizontal fin.
 */

/**
 * Fonds de section.
 *
 * Les quatre premiers sont la nouvelle charte. Les quatre derniers
 * (`sable`, `blanc`, `encre`, `olive`) sont des ALIAS DE MIGRATION vers
 * l'ancienne charte : ils permettent aux pages pas encore reprises de
 * continuer à compiler et à s'afficher correctement. À supprimer une
 * fois toutes les pages passées aux nouveaux noms.
 */
type FondSection =
  | "noir"
  | "noir-releve"
  | "craie"
  | "lagune"
  | "transparent"
  | "sable"
  | "blanc"
  | "encre"
  | "olive";

/**
 * Section pleine largeur.
 *
 * L'alternance franche sombre / clair est le moteur visuel du site : les
 * fonds vont toujours bord à bord, seul le contenu est contraint à la
 * grille (1280px, brief §2). `bordAbord` relâche cette contrainte pour
 * les héros et les aplats de couleur, qui doivent casser la grille.
 *
 * `lagune` est réservé à l'univers « tours » : c'est ce qui permet de
 * distinguer les deux offres d'un coup d'œil, sans lire.
 */
export function Section({
  children,
  className = "",
  fond = "noir",
  bordAbord = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  fond?: FondSection;
  bordAbord?: boolean;
  id?: string;
}) {
  const fonds = {
    noir: "bg-noir-piste text-craie",
    "noir-releve": "bg-noir-releve text-craie",
    craie: "bg-craie text-noir-piste",
    lagune: "bg-vert-lagune text-craie",
    transparent: "",
    // Alias de migration, voir FondSection.
    sable: "bg-craie text-noir-piste",
    blanc: "bg-craie text-noir-piste",
    encre: "bg-noir-piste text-craie",
    olive: "bg-vert-lagune text-craie",
  } as const;

  return (
    <section id={id} className={`${fonds[fond]} ${className}`}>
      {bordAbord ? children : <div className="mx-auto max-w-[1280px] px-5 sm:px-8">{children}</div>}
    </section>
  );
}

/**
 * @deprecated Le brief §2 proscrit les « eyebrows » en capitales espacées
 * au-dessus des titres, ainsi que la numérotation 01/02/03 sur des
 * contenus qui ne sont pas une séquence.
 *
 * Le composant est conservé le temps de la migration pour que les
 * sections pas encore reprises restent lisibles : il rend désormais un
 * simple intertitre gris, et ignore volontairement `numero`. Chaque lot
 * supprime ses usages ; le composant part avec le dernier.
 */
export function Etiquette({
  children,
  className = "",
}: {
  numero?: string;
  children: ReactNode;
  className?: string;
}) {
  return <p className={`etiquette ${className}`}>{children}</p>;
}

export function TitreSection({
  children,
  className = "",
  taille = "md",
  as: Balise = "h2",
}: {
  children: ReactNode;
  className?: string;
  taille?: "sm" | "md" | "lg";
  as?: "h1" | "h2" | "h3";
}) {
  const tailles = {
    sm: "text-[clamp(1.6rem,3.4vw,2.4rem)]",
    md: "text-[clamp(2rem,5vw,3.9rem)]",
    lg: "text-[clamp(2.5rem,7vw,5.6rem)]",
  } as const;

  return <Balise className={`titre-editorial ${tailles[taille]} ${className}`}>{children}</Balise>;
}

export function Filet({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-current/15 ${className}`} />;
}

/**
 * Lien d'action secondaire. Sans flèche accolée : le brief §2 la range
 * parmi les tics à éviter. Le soulignement au survol suffit à signaler
 * l'interaction.
 */
export function LienFleche({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`lien-souligne inline-flex items-center text-[0.8rem] font-semibold uppercase tracking-[0.08em] ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Cadre d'image. À plat, arêtes vives, sans rotation ni ombre portée :
 * le brief §2 exclut les ombres molles et les angles arrondis.
 */
export function CadrePhoto({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated L'inclinaison décorative a été retirée. */
  rotation?: number;
}) {
  return (
    <div className={`bg-craie p-2 ${className}`}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function Etoiles({ note, className = "" }: { note: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Note : ${note} sur 5`}>
      {[1, 2, 3, 4, 5].map((rang) => (
        <svg key={rang} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7 1.2 8.8 5h4.1L9.6 7.6l1.2 4L7 9.2l-3.8 2.4 1.2-4L1.1 5h4.1L7 1.2Z"
            fill={rang <= Math.round(note) ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            opacity={rang <= Math.round(note) ? 1 : 0.35}
          />
        </svg>
      ))}
    </span>
  );
}

export function Pastille({
  children,
  ton = "neutre",
  className = "",
}: {
  children: ReactNode;
  ton?: "neutre" | "succes" | "alerte" | "info" | "sombre";
  className?: string;
}) {
  // Angles droits, à-plats francs. L'orange n'apparaît pas ici : une
  // pastille n'est pas cliquable, et l'orange est réservé au signal.
  const tons = {
    neutre: "bg-craie-ombre text-noir-piste",
    succes: "bg-vert-lagune text-craie",
    alerte: "bg-noir-piste text-craie",
    info: "bg-noir-releve text-craie",
    sombre: "bg-noir-piste text-craie",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${tons[ton]} ${className}`}
    >
      {children}
    </span>
  );
}
