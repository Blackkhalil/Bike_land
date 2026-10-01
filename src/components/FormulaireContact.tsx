"use client";

import { useState } from "react";

import { Bouton } from "@/components/Bouton";

/**
 * Formulaire de contact (§2.1).
 *
 * Protection anti-robots par champ piège (« honeypot ») plutôt que par
 * captcha : rien à charger, rien à résoudre pour les visiteurs, et aucune
 * donnée envoyée à un tiers.
 */
export function FormulaireContact() {
  const [champs, setChamps] = useState({ nom: "", email: "", sujet: "", message: "", siteWeb: "" });
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<"repos" | "envoi" | "envoye" | "erreur">("repos");

  const modifier = (cle: keyof typeof champs) => (valeur: string) =>
    setChamps((actuels) => ({ ...actuels, [cle]: valeur }));

  const soumettre = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setEtat("envoi");
    setErreurs({});

    try {
      const reponse = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(champs),
      });

      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreurs(donnees.champs ?? {});
        setEtat("erreur");
        return;
      }

      setEtat("envoye");
      setChamps({ nom: "", email: "", sujet: "", message: "", siteWeb: "" });
    } catch {
      setEtat("erreur");
    }
  };

  if (etat === "envoye") {
    return (
      <div className="rounded-[var(--radius-bloc)] bg-white p-8">
        <p className="titre-editorial text-[1.5rem] text-vert-lagune">Message envoyé</p>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-gris-cadre">
          Nous répondons sous 24 heures ouvrées. Un accusé de réception vient de partir vers
          votre adresse. Vérifiez vos courriers indésirables si vous ne le voyez pas.
        </p>
        <Bouton variante="contour" className="mt-6 text-noir-piste" onClick={() => setEtat("repos")}>
          Écrire un autre message
        </Bouton>
      </div>
    );
  }

  return (
    <form onSubmit={soumettre} className="rounded-[var(--radius-bloc)] bg-white p-6 sm:p-8" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Champ
          libelle="Votre nom"
          valeur={champs.nom}
          onChange={modifier("nom")}
          erreur={erreurs.nom}
          autoComplete="name"
        />
        <Champ
          libelle="Votre email"
          type="email"
          valeur={champs.email}
          onChange={modifier("email")}
          erreur={erreurs.email}
          autoComplete="email"
        />
      </div>

      <div className="mt-5">
        <Champ
          libelle="Sujet"
          valeur={champs.sujet}
          onChange={modifier("sujet")}
          erreur={erreurs.sujet}
        />
      </div>

      <label className="mt-5 block">
        <span className="etiquette opacity-75">Votre message</span>
        <textarea
          value={champs.message}
          onChange={(evenement) => modifier("message")(evenement.target.value)}
          rows={6}
          maxLength={2000}
          aria-invalid={erreurs.message ? true : undefined}
          className={`mt-2 w-full rounded-[var(--radius-carte)] border bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
            erreurs.message ? "border-orange-signal" : "border-noir-piste/15"
          }`}
        />
        {erreurs.message && <span className="mt-1.5 block text-[0.8rem] text-orange-sourd">{erreurs.message}</span>}
      </label>

      {/* Champ piège : masqué aux humains et aux lecteurs d'écran. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input
            tabIndex={-1}
            autoComplete="off"
            value={champs.siteWeb}
            onChange={(evenement) => modifier("siteWeb")(evenement.target.value)}
          />
        </label>
      </div>

      {etat === "erreur" && Object.keys(erreurs).length === 0 && (
        <p role="alert" className="mt-5 text-[0.88rem] text-orange-sourd">
          Le message n&apos;a pas pu être envoyé. Réessayez, ou appelez-nous directement.
        </p>
      )}

      <Bouton type="submit" taille="lg" disabled={etat === "envoi"} className="mt-7">
        {etat === "envoi" ? "Envoi…" : "Envoyer le message"}
      </Bouton>

      <p className="mt-4 text-[0.8rem] leading-relaxed text-gris-cadre">
        Vos données servent uniquement à répondre à votre demande. Vous pouvez en demander la
        suppression à tout moment.
      </p>
    </form>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  type = "text",
  erreur,
  autoComplete,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  type?: string;
  erreur?: string;
  autoComplete?: string;
}) {
  const identifiant = `contact-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;
  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
      </label>
      <input
        id={identifiant}
        type={type}
        value={valeur}
        autoComplete={autoComplete}
        aria-invalid={erreur ? true : undefined}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-full border bg-craie px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/15"
        }`}
      />
      {erreur && <p className="mt-1.5 text-[0.8rem] text-orange-sourd">{erreur}</p>}
    </div>
  );
}
