"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Bouton } from "@/components/Bouton";
import type { DiagnosticEchec } from "@/lib/echecs-paiement";
import { diagnostiquer, motifDepuisCode } from "@/lib/echecs-paiement";
import { formatXof } from "@/lib/format";
import { site } from "@/lib/site";
import { moyensDisponibles } from "@/lib/paiement";
import type { MoyenPaiement } from "@/lib/types";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";

/**
 * Reprise du paiement depuis le lien de suivi.
 *
 * Le cas est fréquent : le client n'a pas vu la notification Mobile Money,
 * l'a laissée expirer, ou s'est trompé de numéro. Sa réservation existe,
 * le vélo lui est retenu, mais rien n'est payé. Sans ce bouton, il
 * n'aurait plus aucun moyen de terminer et devrait tout recommencer, en
 * risquant de trouver le vélo pris.
 *
 * Aucune réservation n'est recréée ici : on relance le paiement de celle
 * qui existe. Le client peut au passage corriger son opérateur et son
 * numéro, puisque c'est le plus souvent la raison pour laquelle la
 * première demande n'est jamais arrivée.
 */
export function PaiementEnAttente({
  token,
  montantXof,
  moyenInitial,
  telephoneInitial,
  diagnostic,
}: {
  token: string;
  montantXof: number;
  /** L'opérateur choisi à la réservation, présélectionné. */
  moyenInitial?: MoyenPaiement;
  telephoneInitial?: string;
  /**
   * Pourquoi la tentative précédente a échoué, quand on le sait. Il
   * décide du texte affiché et du champ mis en avant : un solde
   * insuffisant ne se corrige pas en changeant de numéro.
   */
  diagnostic?: DiagnosticEchec | null;
}) {
  const routeur = useRouter();
  const champTelephone = useRef<HTMLInputElement>(null);

  // Le champ fautif prend le curseur dès l'arrivée, pour que le client
  // n'ait pas à chercher ce qu'on lui demande de corriger. Rien n'est
  // volé au clavier quand il n'y a rien à corriger.
  useEffect(() => {
    if (diagnostic?.champ === "telephone") champTelephone.current?.focus();
  }, [diagnostic]);

  // L'opérateur d'origine est présélectionné, sauf s'il s'agit d'espèces :
  // on ne relance pas en ligne un encaissement prévu au comptoir.
  const [moyen, setMoyen] = useState<MoyenPaiement>(
    moyenInitial && moyenInitial !== "ESPECES" ? moyenInitial : "MTN_MONEY",
  );
  const [telephone, setTelephone] = useState(telephoneInitial ?? "");
  const [envoi, setEnvoi] = useState(false);
  // Le diagnostic courant : celui reçu à l'arrivée, puis celui de la
  // dernière relance ratée. Une relance qui échoue pour une autre raison
  // doit remplacer l'explication, pas s'ajouter en dessous.
  const [echec, setEchec] = useState<DiagnosticEchec | null>(diagnostic ?? null);
  const [suivi, setSuivi] = useState<{
    paiementId: string;
    moyen: MoyenPaiement;
    telephone: string;
    urlCheckout?: string;
  } | null>(null);

  const numeroValide = /^[+0-9 ().-]{8,20}$/.test(telephone.trim());

  const relancer = async () => {
    setEnvoi(true);
    setEchec(null);
    try {
      const reponse = await fetch(`/api/reservations/${encodeURIComponent(token)}/paiement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moyen, telephone: telephone.trim() }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (donnees.dejaPayee) {
        routeur.refresh();
        return;
      }

      if (!reponse.ok || !donnees.suivi) {
        // Le serveur a déjà fait le diagnostic : on le reprend tel quel.
        // `diagnostiquer` ne sert que de repli, pour les réponses qui ne
        // viennent pas de notre route, un relais ou un pare-feu.
        setEchec(motifDepuisCode(donnees.motif) ?? diagnostiquer(donnees.erreur));
        return;
      }

      setSuivi(donnees.suivi);
    } catch {
      setEchec(diagnostiquer("connexion interrompue"));
    } finally {
      setEnvoi(false);
    }
  };

  // La demande est partie : on laisse le composant d'attente prendre la
  // main, et on ne propose plus de la relancer. Un second appui pousserait
  // une deuxième demande sur le même téléphone.
  if (suivi) {
    return (
      <SuiviPaiementMomo
        token={token}
        paiementId={suivi.paiementId}
        moyen={suivi.moyen}
        telephone={suivi.telephone}
        montantXof={montantXof}
        urlCheckout={suivi.urlCheckout}
        onConfirme={() => routeur.refresh()}
        onEchec={(texte) => {
          setSuivi(null);
          setEchec(diagnostiquer(texte));
        }}
      />
    );
  }

  return (
    <div className="mt-6 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-5 sm:px-6">
      <p className="font-display text-[1.05rem] font-bold uppercase leading-tight sm:text-[1.1rem]">
        {echec ? echec.titre : "Paiement à terminer"}
      </p>

      {echec ? (
        <>
          <p className="mt-2 text-[0.92rem] leading-relaxed">{echec.explication}</p>
          <p className="mt-2 text-[0.92rem] font-semibold leading-relaxed">{echec.remede}</p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-gris-cadre">
            Votre vélo reste retenu, et {formatXof(montantXof)} n&apos;ont pas été prélevés.
          </p>
        </>
      ) : (
        <p className="mt-2 text-[0.92rem] leading-relaxed">
          Votre vélo est retenu, mais le règlement de {formatXof(montantXof)} n&apos;est pas
          encore passé. Relancez la demande ici : elle repartira sur le numéro indiqué.
        </p>
      )}

      {/* Quand réessayer tel quel ne sert à rien, le téléphone de
          l'atelier vaut mieux qu'un bouton qui échouera pareil. */}
      {echec && !echec.reessayerUtile && (
        <a
          href={`tel:${site.telephoneLien}`}
          className="mt-4 inline-block font-display text-[1.05rem] font-bold text-orange-sourd underline underline-offset-4"
        >
          {site.telephone}
        </a>
      )}

      <fieldset className="mt-5">
        <legend className="etiquette opacity-75">Opérateur</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {moyensDisponibles
            .filter((option) => option.code !== "ESPECES")
            .map((option) => {
              const actif = moyen === option.code;
              return (
                <label
                  key={option.code}
                  className={`cursor-pointer rounded-[var(--radius-bouton)] border px-4 py-2.5 text-[0.88rem] transition-colors ${
                    actif
                      ? "border-orange-signal bg-orange-signal font-semibold text-noir-piste"
                      : "border-noir-piste/25 bg-white hover:border-noir-piste/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="moyen-reprise"
                    checked={actif}
                    onChange={() => setMoyen(option.code)}
                    className="sr-only"
                  />
                  {option.libelle}
                </label>
              );
            })}
        </div>
      </fieldset>

      <label className="mt-4 block w-full sm:max-w-xs">
        <span className="etiquette opacity-75">Numéro Mobile Money</span>
        <input
          ref={champTelephone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
          placeholder="+229 97 00 00 00"
          aria-invalid={echec?.champ === "telephone" || undefined}
          className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-white px-4 py-3 text-[1rem] outline-none transition-colors focus:border-orange-signal ${
            echec?.champ === "telephone" ? "border-orange-sourd" : "border-noir-piste/25"
          }`}
        />
      </label>

      <div className="mt-5">
        <Bouton onClick={relancer} disabled={envoi || !numeroValide}>
          {envoi ? "Envoi de la demande…" : `Payer ${formatXof(montantXof)}`}
        </Bouton>
      </div>
      {!numeroValide && (
        <p className="mt-2 text-[0.82rem] text-gris-cadre">
          Indiquez le numéro sur lequel vous voulez recevoir la demande.
        </p>
      )}
    </div>
  );
}
