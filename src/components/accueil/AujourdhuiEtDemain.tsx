import Image from "next/image";
import Link from "next/link";

import { Pastille, Section } from "@/components/ui";

/**
 * Bandeau à deux tuiles juste sous le hero : l'offre réelle d'aujourd'hui
 * d'un côté, la vision road trip de demain de l'autre. Directement inspiré
 * des bandeaux « Kids Bikes / Accessories » vus sur les sites de location
 * de vélos concurrents, mais avec nos photos et notre grammaire visuelle
 * (coins arrondis, dégradé de lecture, étiquette + lien flèche).
 */

const tuiles = [
  {
    image: "/images/kirsten-frank-EWdxx8m1uh4-unsplash.jpg",
    alt: "Cycliste en plein effort sur une route en gravier, effet de filé",
    etat: "Dès maintenant" as const,
    titre: "La route des Pêches",
    detail: "Sorties courtes à Cotonou, vélo réglé à votre taille, réservé en deux minutes.",
    href: "/velos",
    libelleLien: "Réserver un vélo",
  },
  {
    image: "/images/streetsh-vZAk_n9Plfc-unsplash.jpg",
    alt: "VTT robuste posé devant un entrepôt",
    etat: "Bientôt" as const,
    titre: "Le road trip béninois",
    detail: "Du littoral aux montagnes de l'Atacora, la suite que nous préparons.",
    href: "/itineraires",
    libelleLien: "Découvrir la suite",
  },
];

export function AujourdhuiEtDemain() {
  return (
    <Section fond="blanc" className="py-14 sm:py-20">
      <div className="grid gap-6 lg:grid-cols-2">
        {tuiles.map((tuile) => (
          <Link key={tuile.href} href={tuile.href} className="group block">
            <div className="reveal relative aspect-4/5 overflow-hidden rounded-[var(--radius-bloc)] sm:aspect-16/10">
              <Image
                src={tuile.image}
                alt={tuile.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-noir-piste/90 via-noir-piste/15 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 text-craie sm:p-8">
                <Pastille ton={tuile.etat === "Bientôt" ? "alerte" : "succes"}>{tuile.etat}</Pastille>
                <h3 className="titre-editorial mt-4 text-[1.6rem] sm:text-[2rem]">{tuile.titre}</h3>
                <p className="mt-2 max-w-sm text-[0.9rem] leading-relaxed text-craie/85">
                  {tuile.detail}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.12em]">
                  {tuile.libelleLien}
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
