"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { PointDeRetrait } from "@/lib/types";

/**
 * Ajout d'un vélo au parc.
 *
 * Replié par défaut : cet écran sert d'abord à suivre le parc au
 * quotidien, et un formulaire déplié en permanence mettrait au premier
 * plan une action qu'on fait deux fois par an.
 *
 * Il ne demande que ce qu'on lit sur la machine en la recevant. Ni prix
 * ni caution : ils dépendent de la formule choisie par le client, pas du
 * vélo (cf. src/data/offres.ts). Le vélo naît « en service » et apparaît
 * aussitôt sur le site public.
 */

const CATEGORIES = [
  { valeur: "VTC", libelle: "VTC" },
  { valeur: "GRAVEL", libelle: "Gravel" },
  { valeur: "RANDONNEUR", libelle: "Randonneur" },
  { valeur: "VAE", libelle: "Vélo à assistance électrique" },
  { valeur: "TANDEM", libelle: "Tandem" },
] as const;

const TAILLES = ["S", "M", "L", "XL"] as const;

/** Photos déjà présentes dans `public/images`. */
const PHOTOS = [
  "/images/IMG_6168.PNG",
  "/images/IMG_6169.PNG",
  "/images/IMG_6170.PNG",
  "/images/IMG_6171.PNG",
  "/images/IMG_6172.PNG",
  "/images/IMG_6173.PNG",
  "/images/IMG_6174.PNG",
];

export function FormulaireNouveauVelo({ points }: { points: PointDeRetrait[] }) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrerTransition] = useTransition();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);

  const [valeurs, setValeurs] = useState({
    nom: "",
    categorie: "VTC" as (typeof CATEGORIES)[number]["valeur"],
    taille: "M" as (typeof TAILLES)[number],
    accroche: "",
    description: "",
    poidsKg: "14",
    vitesses: "21",
    chargeMaxKg: "120",
    autonomieConseilleeKm: "60",
    equipementInclus: "Casque, antivol, kit de réparation",
    pointDeRetraitId: points[0]?.id ?? "",
    photo: PHOTOS[0],
  });

  const modifier = (champ: keyof typeof valeurs, valeur: string) =>
    setValeurs((actuelles) => ({ ...actuelles, [champ]: valeur }));

  const envoyer = async () => {
    setEnvoi(true);
    setErreur(null);
    setErreurs({});
    setSucces(null);

    try {
      const reponse = await fetch("/api/admin/velos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valeurs,
          // Les nombres passent par des champs texte : on les convertit
          // ici plutôt que de laisser Zod recevoir des chaînes.
          poidsKg: Number(valeurs.poidsKg),
          vitesses: Number(valeurs.vitesses),
          chargeMaxKg: Number(valeurs.chargeMaxKg),
          autonomieConseilleeKm: Number(valeurs.autonomieConseilleeKm),
        }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(donnees.erreur ?? "Le vélo n'a pas pu être enregistré.");
        setErreurs(donnees.champs ?? {});
        return;
      }

      setSucces(`${donnees.nom} est au parc et visible sur le site.`);
      setValeurs((actuelles) => ({ ...actuelles, nom: "", accroche: "", description: "" }));
      demarrerTransition(() => routeur.refresh());
    } catch {
      setErreur("Pas de réseau. Réessayez quand la connexion revient.");
    } finally {
      setEnvoi(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="rounded-[var(--radius-bouton)] bg-noir-piste px-6 py-3 text-[0.9rem] font-semibold text-craie transition-opacity hover:opacity-85"
        >
          + Ajouter un vélo au parc
        </button>
        {succes && <p className="mt-3 text-[0.85rem] text-vert-lagune">{succes}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-[var(--radius-bloc)] border border-noir-piste/15 bg-white p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="titre-editorial text-[1.3rem]">Ajouter un vélo</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="lien-souligne text-[0.85rem] font-semibold text-gris-cadre"
        >
          Fermer
        </button>
      </div>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3 text-[0.88rem]"
        >
          {erreur}
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Champ
          libelle="Nom du vélo"
          valeur={valeurs.nom}
          onChange={(v) => modifier("nom", v)}
          erreur={erreurs.nom}
          aide="Il sert aussi d'adresse publique de la fiche."
        />

        <Liste
          libelle="Catégorie"
          valeur={valeurs.categorie}
          onChange={(v) => modifier("categorie", v)}
          options={CATEGORIES.map((categorie) => ({
            valeur: categorie.valeur,
            libelle: categorie.libelle,
          }))}
        />

        <Liste
          libelle="Taille du cadre"
          valeur={valeurs.taille}
          onChange={(v) => modifier("taille", v)}
          options={TAILLES.map((taille) => ({ valeur: taille, libelle: taille }))}
        />

        <Liste
          libelle="Point de retrait"
          valeur={valeurs.pointDeRetraitId}
          onChange={(v) => modifier("pointDeRetraitId", v)}
          options={points.map((point) => ({ valeur: point.id, libelle: point.nom }))}
        />

        <Champ
          libelle="Poids en kg"
          valeur={valeurs.poidsKg}
          onChange={(v) => modifier("poidsKg", v)}
          erreur={erreurs.poidsKg}
          type="number"
        />
        <Champ
          libelle="Nombre de vitesses"
          valeur={valeurs.vitesses}
          onChange={(v) => modifier("vitesses", v)}
          erreur={erreurs.vitesses}
          type="number"
        />
        <Champ
          libelle="Charge maximale en kg"
          valeur={valeurs.chargeMaxKg}
          onChange={(v) => modifier("chargeMaxKg", v)}
          erreur={erreurs.chargeMaxKg}
          type="number"
          aide="Cycliste et bagages compris."
        />
        <Champ
          libelle="Autonomie conseillée en km"
          valeur={valeurs.autonomieConseilleeKm}
          onChange={(v) => modifier("autonomieConseilleeKm", v)}
          erreur={erreurs.autonomieConseilleeKm}
          type="number"
          aide="La distance qu'on recommande sur une sortie."
        />

        <Liste
          libelle="Photo"
          valeur={valeurs.photo}
          onChange={(v) => modifier("photo", v)}
          options={PHOTOS.map((chemin) => ({
            valeur: chemin,
            libelle: chemin.split("/").pop() ?? chemin,
          }))}
        />

        <Champ
          libelle="Équipement inclus"
          valeur={valeurs.equipementInclus}
          onChange={(v) => modifier("equipementInclus", v)}
          erreur={erreurs.equipementInclus}
          aide="Séparez par des virgules."
        />
      </div>

      <div className="mt-5 grid gap-5">
        <Champ
          libelle="Accroche"
          valeur={valeurs.accroche}
          onChange={(v) => modifier("accroche", v)}
          erreur={erreurs.accroche}
          aide="Une phrase, affichée sous le nom sur la fiche."
        />

        <div>
          <label htmlFor="champ-description" className="etiquette opacity-75">
            Description
          </label>
          <textarea
            id="champ-description"
            value={valeurs.description}
            onChange={(evenement) => modifier("description", evenement.target.value)}
            rows={4}
            maxLength={1200}
            placeholder="À quoi sert ce vélo, sur quel terrain il est à l'aise, ce qu'il a de particulier"
            className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
              erreurs.description ? "border-orange-signal" : "border-noir-piste/20"
            }`}
          />
          {erreurs.description && (
            <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreurs.description}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={envoyer}
        disabled={envoi || enCours}
        className="mt-7 rounded-[var(--radius-bouton)] bg-orange-signal px-6 py-3 text-[0.9rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {envoi ? "Enregistrement…" : "Mettre ce vélo en service"}
      </button>

      {succes && <p className="mt-3 text-[0.85rem] text-vert-lagune">{succes}</p>}
    </div>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  erreur,
  aide,
  type = "text",
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  erreur?: string;
  aide?: string;
  type?: string;
}) {
  const identifiant = `champ-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;
  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
      </label>
      <input
        id={identifiant}
        type={type}
        value={valeur}
        aria-invalid={erreur ? true : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/20"
        }`}
      />
      {erreur ? (
        <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreur}</p>
      ) : aide ? (
        <p className="mt-1.5 text-[0.8rem] text-gris-cadre">{aide}</p>
      ) : null}
    </div>
  );
}

function Liste({
  libelle,
  valeur,
  onChange,
  options,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  options: { valeur: string; libelle: string }[];
}) {
  const identifiant = `liste-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;
  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
      </label>
      <select
        id={identifiant}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal"
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}
