"use client";

import { useState } from "react";

/**
 * Activation et désactivation de la double authentification.
 *
 * Trois temps pour l'activer : afficher le QR code, le scanner avec
 * l'application, taper le code qu'elle affiche. Tant que ce code n'est
 * pas confirmé, rien ne change à la connexion.
 */
export function GestionSecurite({ activeAuDepart }: { activeAuDepart: boolean }) {
  const [active, setActive] = useState(activeAuDepart);
  const [preparation, setPreparation] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const appeler = async (corps: Record<string, string>) => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch("/api/admin/securite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setMessage({ ton: "erreur", texte: donnees.erreur ?? "Action refusée." });
        return null;
      }
      return donnees;
    } catch {
      setMessage({ ton: "erreur", texte: "Pas de réseau. Réessayez." });
      return null;
    } finally {
      setEnCours(false);
    }
  };

  const preparer = async () => {
    const donnees = await appeler({ action: "preparer" });
    if (donnees) {
      setPreparation(donnees);
      setCode("");
    }
  };

  const activer = async () => {
    const donnees = await appeler({ action: "activer", code });
    if (donnees?.active) {
      setActive(true);
      setPreparation(null);
      setCode("");
      setMessage({
        ton: "ok",
        texte: "Double authentification activée. Le code de l'application sera demandé à chaque connexion.",
      });
    }
  };

  const desactiver = async () => {
    const donnees = await appeler({ action: "desactiver", code });
    if (donnees && donnees.active === false) {
      setActive(false);
      setCode("");
      setMessage({ ton: "ok", texte: "Double authentification désactivée." });
    }
  };

  const champCode = (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      value={code}
      onChange={(evenement) => setCode(evenement.target.value)}
      placeholder="123456"
      aria-label="Code à 6 chiffres de l'application"
      className="h-11 w-40 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 text-[1rem] tracking-[0.3em] outline-none focus:border-orange-signal"
    />
  );
  const codeComplet = code.replace(/\s/g, "").length === 6;

  return (
    <div className="mt-8 max-w-2xl rounded-[var(--radius-carte)] bg-white p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Double authentification</h2>
        <span
          className={`rounded-full px-3 py-1 text-[0.78rem] font-semibold ${
            active ? "bg-vert-lagune/15 text-vert-lagune" : "bg-orange-signal/15 text-orange-sourd"
          }`}
        >
          {active ? "Activée" : "Désactivée"}
        </span>
      </div>
      <p className="mt-3 text-[0.88rem] leading-relaxed text-gris-cadre">
        En plus du mot de passe, la connexion demande un code à six chiffres affiché par une
        application sur votre téléphone (Google Authenticator, Microsoft Authenticator ou une
        autre). Un mot de passe volé ne suffit plus pour entrer.
      </p>

      {message && (
        <p
          role={message.ton === "erreur" ? "alert" : "status"}
          className={`mt-4 text-[0.88rem] ${message.ton === "erreur" ? "text-orange-sourd" : "text-vert-lagune"}`}
        >
          {message.texte}
        </p>
      )}

      {!active && !preparation && (
        <button
          type="button"
          onClick={preparer}
          disabled={enCours}
          className="mt-5 rounded-[var(--radius-bouton)] bg-noir-piste px-5 py-3 text-[0.88rem] font-semibold text-craie disabled:opacity-50"
        >
          Activer la double authentification
        </button>
      )}

      {!active && preparation && (
        <ol className="mt-5 space-y-5 text-[0.88rem] leading-relaxed">
          <li>
            <strong>1.</strong> Installez Google Authenticator sur votre téléphone, puis appuyez sur
            « + » et « Scanner un code QR ».
          </li>
          <li>
            <strong>2.</strong> Scannez ce code :
            {/* eslint-disable-next-line @next/next/no-img-element -- QR code généré à la volée, en data: */}
            <img src={preparation.qr} alt="QR code à scanner avec l'application" width={200} height={200} className="mt-3 rounded-[var(--radius-bouton)] border border-noir-piste/10" />
            <span className="mt-2 block text-[0.8rem] text-gris-cadre">
              Pas d&apos;appareil photo ? Saisissez cette clé dans l&apos;application :{" "}
              <code className="break-all font-mono text-noir-piste">{preparation.secret}</code>
            </span>
          </li>
          <li>
            <strong>3.</strong> Tapez le code à six chiffres que l&apos;application affiche :
            <span className="mt-3 flex flex-wrap items-center gap-3">
              {champCode}
              <button
                type="button"
                onClick={activer}
                disabled={enCours || !codeComplet}
                className="h-11 rounded-[var(--radius-bouton)] bg-orange-signal px-5 text-[0.88rem] font-semibold text-noir-piste disabled:opacity-50"
              >
                Confirmer et activer
              </button>
            </span>
          </li>
        </ol>
      )}

      {active && (
        <div className="mt-5">
          <p className="text-[0.85rem] text-gris-cadre">
            Pour la désactiver, tapez le code actuel de l&apos;application.
          </p>
          <span className="mt-3 flex flex-wrap items-center gap-3">
            {champCode}
            <button
              type="button"
              onClick={desactiver}
              disabled={enCours || !codeComplet}
              className="h-11 rounded-[var(--radius-bouton)] border border-noir-piste/25 px-5 text-[0.88rem] font-semibold disabled:opacity-50"
            >
              Désactiver
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
