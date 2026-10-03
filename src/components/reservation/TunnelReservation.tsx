"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import {
  DUREE_ROAD_TRIP_HEURES as dureeRoadTrip,
  EXIGENCES,
  EXPIRATION_PANIER_MINUTES,
  FERMETURE_HEURE as fermeture,
  formatHeure,
  GRILLE_HORAIRE,
  heuresDepartPossibles,
  OFFRES,
  PRIX_ROAD_TRIP_XOF,
} from "@/data/offres";
import type { DateISO } from "@/lib/dates";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { formatDate, formatXof } from "@/lib/format";
import { fraisEncaissement, moyensDisponibles, TAUX_ENCAISSEMENT } from "@/lib/paiement";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";
import { calculerDevis } from "@/lib/tarification";
import type {
  CodeOffre,
  MoyenPaiement,
  PointDeRetrait,
  Velo,
} from "@/lib/types";
import { NoteHoraires, useReservationsOuvertes } from "./NoteHoraires";
import { site } from "@/lib/site";

/**
 * Tunnel de réservation en trois étapes (§2.1).
 *
 * Le principe du cahier des charges est respecté à la lettre : aucun compte
 * n'est créé, et les coordonnées comme le moyen de paiement ne sont demandés
 * qu'à la dernière étape, une fois le prix connu.
 */

type Etape = 1 | 2 | 3;

const etapes: { numero: Etape; titre: string }[] = [
  { numero: 1, titre: "Votre location" },
  { numero: 2, titre: "Vos coordonnées" },
  { numero: 3, titre: "Paiement" },
];

/**
 * Un créneau encadré, calculé côté serveur.
 *
 * Il arrive en `props` et n'est pas recalculé ici : `new Date()` dans le
 * rendu d'un composant client donnerait une valeur différente de celle du
 * serveur, et l'hydratation s'en plaindrait.
 */
export interface CreneauProposable {
  code: string;
  libelle: string;
  date: DateISO;
  heureDebut: number;
  heureFin: number;
}

interface Props {
  velo: Velo;
  offre: CodeOffre;
  dureeHeures: number;
  nombrePersonnes: number;
  /**
   * Personnes au plus : autant que de vélos de la gamme en état de rouler.
   * Une seule pour le Prestige, qui n'existe qu'en un exemplaire.
   */
  personnesMax: number;
  point?: PointDeRetrait;
  dateDebut: DateISO;
  dateFin: DateISO;
  /** Heure de départ retenue à l'arrivée sur la page. */
  heureDebut: number;
  /** Les départs encadrés, pour la formule road trip : le samedi, aujourd'hui. */
  creneaux: CreneauProposable[];
  optionsInitiales: string[];
}

export function TunnelReservation({
  velo,
  offre: offreInitiale,
  dureeHeures: dureeInitiale,
  nombrePersonnes: personnesInitiales,
  personnesMax,
  point,
  dateDebut: dateInitiale,
  dateFin: dateFinInitiale,
  heureDebut: heureInitiale,
  creneaux,
  optionsInitiales,
}: Props) {
  const routeur = useRouter();
  const [etape, setEtape] = useState<Etape>(1);

  // La formule se choisit ici, et non sur la fiche vélo : c'est elle qui
  // commande le prix, la caution et ce qu'il faudra présenter au départ.
  // La fiche vélo ne demande que la date.
  const [offre, setOffre] = useState<CodeOffre>(offreInitiale);
  const [dureeHeures, setDureeHeures] = useState(dureeInitiale);

  // Le jour et l'heure vivent ici depuis que les deux formules ne se
  // réservent plus de la même façon : le road trip part à l'un des deux
  // créneaux encadrés du week-end, la location libre au jour choisi dans
  // le calendrier, à l'heure que le client retient.
  const [dateDebut, setDateDebut] = useState<DateISO>(
    offreInitiale === "road-trip"
      ? (creneaux[0]?.date ?? dateInitiale)
      : dateInitiale,
  );
  const [heureDebut, setHeureDebut] = useState(heureInitiale);
  // Une sortie tient toujours dans la journée : la date de fin suit.
  const dateFin: DateISO = dateDebut;
  const [nombrePersonnes, setNombrePersonnes] = useState(personnesInitiales);
  const [optionsChoisies, setOptionsChoisies] =
    useState<string[]>(optionsInitiales);

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [message, setMessage] = useState("");
  const [moyenPaiement, setMoyenPaiement] =
    useState<MoyenPaiement>("MTN_MONEY");
  const [cgv, setCgv] = useState(false);

  // Code de parrainage. `remise` n'est renseignée qu'après validation
  // par le serveur : le navigateur ne décide d'aucune réduction, il en
  // affiche une que le serveur a calculée, et qui sera recalculée à
  // l'écriture, car un quota peut s'épuiser entre-temps.
  const [codeParrainage, setCodeParrainage] = useState("");
  const [remise, setRemise] = useState<{ code: string; montantXof: number } | null>(null);
  const [verificationPromo, setVerificationPromo] = useState(false);
  const [messagePromo, setMessagePromo] = useState<string | null>(null);

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const ouvertes = useReservationsOuvertes();
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [erreursChamps, setErreursChamps] = useState<Record<string, string>>(
    {},
  );

  // Réservation créée, demande poussée sur le téléphone. Tant que c'est
  // là, on ne refait surtout pas d'appel de création : le vélo est déjà
  // retenu, un second appel en bloquerait un autre pour rien.
  const [attentePaiement, setAttentePaiement] = useState<{
    token: string;
    paiementId: string;
    moyen: MoyenPaiement;
    telephone: string;
    urlCheckout?: string;
  } | null>(null);
  const [messagePaiement, setMessagePaiement] = useState<string | null>(null);

  const devis = useMemo(
    () =>
      calculerDevis({
        offre,
        // La gamme est celle du vélo choisi : c'est elle qui fixe le
        // tarif. Le serveur la relit en base avant d'encaisser, ce qui
        // est affiché ici n'engage rien.
        gamme: velo.gamme,
        nombrePersonnes,
        dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
        options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
        remise: remise ?? undefined,
      }),
    [velo.gamme, offre, nombrePersonnes, dureeHeures, optionsChoisies, remise],
  );

  // Le montant avant remise : c'est sur lui que le code s'applique, et
  // c'est donc lui qu'on envoie vérifier.
  const devisSansRemise = useMemo(
    () =>
      calculerDevis({
        offre,
        gamme: velo.gamme,
        nombrePersonnes,
        dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
        options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
      }),
    [velo.gamme, offre, nombrePersonnes, dureeHeures, optionsChoisies],
  );

  /**
   * Fait vérifier le code par le serveur.
   *
   * Le navigateur ne calcule jamais la remise lui-même : il la demande.
   * Sans quoi il suffirait d'ouvrir la console pour s'accorder 100 % de
   * réduction, que le serveur refuserait, mais après avoir affiché un
   * prix mensonger.
   */
  const verifierPromo = async () => {
    const saisie = codeParrainage.trim();
    if (!saisie) return;

    setVerificationPromo(true);
    setMessagePromo(null);
    try {
      const reponse = await fetch("/api/parrainage/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: saisie, montantXof: devisSansRemise.totalXof }),
      });
      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok || !donnees.valide) {
        setRemise(null);
        setMessagePromo(donnees.message ?? donnees.erreur ?? "Ce code n'a pas pu être vérifié.");
        return;
      }

      setRemise({ code: donnees.code, montantXof: donnees.remiseXof });
      setCodeParrainage(donnees.code);
      setMessagePromo(null);
    } catch {
      setMessagePromo("Pas de réseau. Réessayez pour appliquer votre code.");
    } finally {
      setVerificationPromo(false);
    }
  };

  /** Retire le code appliqué et remet le prix plein. */
  const retirerPromo = () => {
    setRemise(null);
    setCodeParrainage("");
    setMessagePromo(null);
  };

  // Heures de départ compatibles avec la durée choisie : au-delà, le
  // retour tomberait après la fermeture de l'atelier.
  const departsPossibles = useMemo(
    () => heuresDepartPossibles(dureeHeures),
    [dureeHeures],
  );

  /**
   * Change de formule, et remet jour et heure en accord avec elle.
   *
   * Sans cela, passer d'une location libre du mercredi à un road trip
   * enverrait au serveur un mercredi 14 h, que la validation refuserait,
   * le road trip ne partant qu'aux créneaux encadrés.
   */
  const choisirOffre = (code: CodeOffre) => {
    setOffre(code);
    if (code === "road-trip") {
      const creneau = creneaux[0];
      if (creneau) {
        setDateDebut(creneau.date);
        setHeureDebut(creneau.heureDebut);
      }
    } else {
      setDateDebut(dateInitiale);
      setHeureDebut(
        heuresDepartPossibles(dureeHeures).includes(heureInitiale)
          ? heureInitiale
          : (heuresDepartPossibles(dureeHeures)[0] ?? heureInitiale),
      );
    }
  };

  /** Change la durée, en ramenant l'heure de départ dans les clous. */
  const choisirDuree = (heures: number) => {
    setDureeHeures(heures);
    const possibles = heuresDepartPossibles(heures);
    if (!possibles.includes(heureDebut))
      setHeureDebut(possibles[possibles.length - 1] ?? heureDebut);
  };

  // Ce que le client verra partir de son compte : la location plus la
  // commission que SasPay ajoute par-dessus.
  const montantDebite = devis.totalXof + fraisEncaissement(devis.totalXof);

  const basculerOption = (code: string) =>
    setOptionsChoisies((actuelles) =>
      actuelles.includes(code)
        ? actuelles.filter((c) => c !== code)
        : [...actuelles, code],
    );

  // Le téléphone est devenu obligatoire : SasPay pousse la demande de
  // paiement dessus. Sans numéro, il n'y a personne à joindre.
  const coordonneesValides =
    prenom.trim().length >= 2 &&
    nom.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^[+0-9 ().-]{8,20}$/.test(telephone.trim());

  const envoyer = async () => {
    setEnvoiEnCours(true);
    setErreurGlobale(null);
    setErreursChamps({});

    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veloId: velo.id,
          offre,
          nombrePersonnes,
          dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
          dateDebut,
          dateFin,
          heureDebut,
          options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
          codeParrainage: remise?.code,
          client: { prenom, nom, email, telephone },
          moyenPaiement,
          message: message || undefined,
          cgvAcceptees: cgv,
        }),
      });

      const donnees = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        if (reponse.status === 403 && donnees.code === "FERME") {
          // La page était restée ouverte au-delà de 22 h : le serveur a
          // refusé, et son message dit quand revenir.
          setErreurGlobale(donnees.erreur);
        } else if (reponse.status === 409 && donnees.code === "COMPLET") {
          // Jour ou départ fermé entre-temps depuis l'admin.
          setErreurGlobale(`${donnees.erreur} Aucun montant n'a été prélevé.`);
        } else if (reponse.status === 409) {
          setErreurGlobale(
            "Ce vélo vient d'être réservé sur ce créneau. Choisissez une autre heure ou un autre vélo. Aucun montant n'a été prélevé.",
          );
        } else {
          setErreurGlobale(
            donnees.erreur ?? "La réservation n'a pas pu aboutir.",
          );
          setErreursChamps(donnees.champs ?? {});
          if (
            donnees.champs &&
            Object.keys(donnees.champs).some((c) => c.startsWith("client"))
          ) {
            setEtape(2);
          }
        }
        return;
      }

      // En mode démonstration, le serveur a déjà confirmé : rien à payer.
      if (donnees.confirmee) {
        routeur.push(`/reservation/${donnees.token}?nouvelle=1`);
        return;
      }

      // Pas de suivi : la demande n'est jamais partie sur le téléphone.
      // La réservation existe et le vélo est retenu, mais le client doit
      // savoir **pourquoi** cela a échoué, sans quoi il relancera la même
      // demande avec le même numéro ou le même compte vide.
      if (!donnees.paiement?.suivi) {
        const motif = diagnostiquer(
          donnees.paiement?.message,
          donnees.paiement?.statut,
        ).motif;
        routeur.push(`/reservation/${donnees.token}?nouvelle=1&echec=${motif}`);
        return;
      }

      // Le vélo est retenu et la demande vient de partir sur le téléphone
      // du client. Il n'y a plus qu'à attendre qu'il valide.
      setAttentePaiement({
        token: donnees.token,
        paiementId: donnees.paiement.suivi.paiementId,
        moyen: donnees.paiement.suivi.moyen,
        telephone: donnees.paiement.suivi.telephone,
        urlCheckout: donnees.paiement.suivi.urlCheckout,
      });
    } catch {
      setErreurGlobale(
        "Connexion interrompue. Vérifiez votre réseau et réessayez.",
      );
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <NoteHoraires className="mb-6" />
        {/* Fil des étapes */}
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {etapes.map((item, index) => (
            <li key={item.numero} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => item.numero < etape && setEtape(item.numero)}
                disabled={item.numero >= etape}
                className={`flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-[0.08em] transition-opacity ${
                  item.numero === etape
                    ? "text-noir-piste"
                    : item.numero < etape
                      ? "text-orange-signal hover:opacity-70"
                      : "text-noir-piste/35"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[0.72rem] ${
                    item.numero === etape
                      ? "bg-noir-piste text-craie"
                      : item.numero < etape
                        ? "bg-orange-signal text-noir-piste"
                        : "border border-current"
                  }`}
                >
                  {item.numero < etape ? "✓" : item.numero}
                </span>
                {item.titre}
              </button>
              {index < etapes.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px w-6 bg-noir-piste/20 sm:w-10"
                />
              )}
            </li>
          ))}
        </ol>

        {erreurGlobale && (
          <p
            role="alert"
            className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-noir-releve px-5 py-4 text-[0.9rem] leading-relaxed text-craie"
          >
            {erreurGlobale}
          </p>
        )}

        {/* ---------------------------------------------- Étape 1 : location */}
        {etape === 1 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Votre location</h2>

            <div className="mt-6 flex flex-wrap items-center gap-5 rounded-[var(--radius-carte)] bg-craie p-5">
              <div
                className="grid h-24 w-32 shrink-0 place-items-center rounded-[var(--radius-bouton)] px-2"
                style={{ background: velo.teintes[1] }}
              >
                <VeloIllustration
                  categorie={velo.categorie}
                  teintes={velo.teintes}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <p className="titre-editorial text-[1.35rem]">{velo.nom}</p>
                <p className="mt-2 text-[0.85rem]">
                  Le{" "}
                  <strong className="font-semibold">
                    {formatDate(dateDebut)}
                  </strong>
                  , de{" "}
                  <strong className="font-semibold">
                    {formatHeure(heureDebut)}
                  </strong>{" "}
                  à{" "}
                  <strong className="font-semibold">
                    {formatHeure(
                      heureDebut +
                        (offre === "road-trip" ? dureeRoadTrip : dureeHeures),
                    )}
                  </strong>
                </p>
                <p className="mt-1 text-[0.8rem] text-gris-cadre">
                  Réglé à votre taille au départ.
                </p>
              </div>
              {/* Le road trip n'a pas de date à changer : il part à l'un
                  du créneau proposé juste en dessous. */}
              {offre === "location-libre" && (
                <a
                  href={`/velos/${velo.slug}?debut=${dateDebut}&fin=${dateFin}`}
                  className="lien-souligne text-[0.82rem] font-semibold text-orange-signal"
                >
                  Changer le jour
                </a>
              )}
            </div>

            {/* ------------------------------------------- La formule */}
            <fieldset className="mt-8">
              <legend className="titre-editorial text-[1.2rem]">
                Votre formule
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {OFFRES.map((item) => {
                  const actif = offre === item.code;
                  return (
                    <label
                      key={item.code}
                      className={`flex cursor-pointer flex-col rounded-[var(--radius-carte)] border p-4 transition-colors ${
                        actif
                          ? "border-orange-signal bg-orange-signal/10"
                          : "border-noir-piste/15 bg-white hover:border-noir-piste/40"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{item.nom}</span>
                        <input
                          type="radio"
                          name="offre"
                          checked={actif}
                          onChange={() => choisirOffre(item.code)}
                          className="sr-only"
                        />
                        <span className="shrink-0 font-display text-[1.1rem] text-orange-sourd">
                          {item.code === "road-trip"
                            ? `${formatXof(PRIX_ROAD_TRIP_XOF[velo.gamme])} / pers.`
                            : `dès ${formatXof(GRILLE_HORAIRE[velo.gamme][0].prixXof)}`}
                        </span>
                      </span>
                      <span className="mt-2 text-[0.85rem] leading-relaxed text-gris-cadre">
                        {item.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* --------------------------------- Durée (location libre) */}
            {offre === "location-libre" && (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">
                  Combien de temps ?
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRILLE_HORAIRE[velo.gamme].map((palier) => {
                    const actif = dureeHeures === palier.heures;
                    return (
                      <button
                        key={palier.heures}
                        type="button"
                        onClick={() => choisirDuree(palier.heures)}
                        aria-pressed={actif}
                        className={`min-h-[44px] flex-1 rounded-[var(--radius-bouton)] border px-3 transition-colors ${
                          actif
                            ? "border-orange-signal bg-orange-signal text-noir-piste"
                            : "border-noir-piste/20 bg-white hover:border-noir-piste/50"
                        }`}
                      >
                        <span className="block font-semibold">
                          {palier.heures} h
                        </span>
                        <span className="block text-[0.72rem] opacity-75">
                          {formatXof(palier.prixXof)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* --------------------------------- Heure de départ */}
            {offre === "location-libre" && (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">
                  À quelle heure ?
                </legend>
                <p className="mt-1.5 text-[0.8rem] text-gris-cadre">
                  L&apos;atelier ouvre à{" "}
                  {formatHeure(departsPossibles[0] ?? heureDebut)} et ferme à{" "}
                  {formatHeure(fermeture)} : nous ne proposons que les départs
                  qui vous laissent le temps de rendre le vélo.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {departsPossibles.map((heure) => {
                    const actif = heureDebut === heure;
                    return (
                      <button
                        key={heure}
                        type="button"
                        onClick={() => setHeureDebut(heure)}
                        aria-pressed={actif}
                        className={`min-h-[44px] min-w-[5.5rem] rounded-[var(--radius-bouton)] border px-3 text-[0.9rem] transition-colors ${
                          actif
                            ? "border-orange-signal bg-orange-signal font-semibold text-noir-piste"
                            : "border-noir-piste/20 bg-white hover:border-noir-piste/50"
                        }`}
                      >
                        {formatHeure(heure)} -{" "}
                        {formatHeure(heure + dureeHeures)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* --------------------------------- Créneau encadré */}
            {offre === "road-trip" && (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">
                  Quel départ ?
                </legend>
                <p className="mt-1.5 text-[0.8rem] text-gris-cadre">
                  La sortie est encadrée : elle part en groupe, à heure fixe,
                  avec un coordinateur qui ouvre la route.
                </p>
                {creneaux.length === 0 && (
                  <div className="mt-3">
                  <p className="rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white px-4 py-3 text-[0.85rem] leading-relaxed">
                    Aucun départ de road trip n&apos;est ouvert à la réservation en ce moment :
                    les prochaines sorties sont complètes. La location libre reste possible, ou
                    appelez-nous au {site.telephone}.
                  </p>
                  </div>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {creneaux.map((creneau) => {
                    const actif =
                      dateDebut === creneau.date &&
                      heureDebut === creneau.heureDebut;
                    return (
                      <button
                        key={creneau.code}
                        type="button"
                        onClick={() => {
                          setDateDebut(creneau.date);
                          setHeureDebut(creneau.heureDebut);
                        }}
                        aria-pressed={actif}
                        className={`rounded-[var(--radius-bouton)] border px-4 py-3 text-left transition-colors ${
                          actif
                            ? "border-orange-signal bg-orange-signal text-noir-piste"
                            : "border-noir-piste/20 bg-white hover:border-noir-piste/50"
                        }`}
                      >
                        <span className="block font-semibold">
                          {creneau.libelle} {formatDate(creneau.date)}
                        </span>
                        <span className="mt-0.5 block text-[0.78rem] opacity-75">
                          {formatHeure(creneau.heureDebut)} -{" "}
                          {formatHeure(creneau.heureFin)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {offre === "road-trip" && personnesMax === 1 && (
              // Un exemplaire unique : rien à choisir. On le dit plutôt
              // que de montrer un compteur bloqué à 1, qui laisserait
              // croire à une panne.
              <p className="mt-7 rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white px-4 py-3 text-[0.86rem] leading-relaxed">
                <span className="font-semibold">Une personne.</span> Le {velo.nom} est un
                exemplaire unique : il se réserve pour une seule personne. Pour venir à
                plusieurs, choisissez un vélo Classique ou Premium.
              </p>
            )}

            {offre === "road-trip" && personnesMax > 1 && (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">
                  Combien de personnes ?
                </legend>
                <p className="mt-1.5 text-[0.8rem] text-gris-cadre">
                  Jusqu&apos;à {personnesMax}, autant que de vélos de cette gamme.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setNombrePersonnes((n) => Math.max(1, n - 1))
                    }
                    aria-label="Retirer une personne"
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem]"
                  >
                    −
                  </button>
                  <span className="min-w-[3rem] text-center font-display text-[1.5rem] tabular-nums">
                    {nombrePersonnes}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNombrePersonnes((n) => Math.min(personnesMax, n + 1))
                    }
                    disabled={nombrePersonnes >= personnesMax}
                    aria-label="Ajouter une personne"
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem]"
                  >
                    +
                  </button>
                </div>
              </fieldset>
            )}

            {/* --------------------------------- Ce qu'il faut prévoir */}
            <ul className="mt-7 space-y-2 rounded-[var(--radius-carte)] bg-craie p-5 text-[0.86rem] leading-relaxed text-gris-cadre">
              {EXIGENCES[offre].map((exigence) => (
                <li key={exigence} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-orange-signal">
                    •
                  </span>
                  {exigence}
                </li>
              ))}
            </ul>

            {point && (
              <p className="mt-4 text-[0.88rem] text-gris-cadre">
                Retrait et restitution :{" "}
                <strong className="text-noir-piste">{point.nom}</strong>,{" "}
                {point.adresse}, {point.ville}. {point.horaires}.
              </p>
            )}

            <fieldset className="mt-10">
              <legend className="etiquette opacity-75">Options</legend>
              <div className="mt-4 space-y-3">
                {optionsLocation.map((option) => {
                  const actif = optionsChoisies.includes(option.code);
                  return (
                    <label
                      key={option.code}
                      className={`flex cursor-pointer items-start gap-4 rounded-[var(--radius-bouton)] border p-4 transition-colors ${
                        actif
                          ? "border-orange-signal bg-orange-signal/10"
                          : "border-noir-piste/15 bg-craie"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={() => basculerOption(option.code)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#f25c05]"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold">
                            {option.libelle}
                          </span>
                          <span className="text-[0.85rem] font-semibold text-orange-sourd">
                            {formatXof(option.prixXof)}
                            <span className="font-normal text-gris-cadre">
                              {option.unite === "jour" ? " / jour" : " forfait"}
                            </span>
                          </span>
                        </span>
                        <span className="mt-1 block text-[0.85rem] leading-relaxed text-gris-cadre">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Bouton onClick={() => setEtape(2)} taille="lg" className="mt-8">
              Continuer
            </Bouton>
          </div>
        )}

        {/* ------------------------------------------- Étape 2 : coordonnées */}
        {etape === 2 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Vos coordonnées</h2>
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-gris-cadre">
              Nous n&apos;ouvrons pas de compte. Ces informations servent à
              préparer votre vélo, vous envoyer la facture et vous transmettre
              votre lien de suivi.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Champ
                libelle="Prénom"
                valeur={prenom}
                onChange={setPrenom}
                erreur={erreursChamps["client.prenom"]}
                autoComplete="given-name"
                obligatoire
              />
              <Champ
                libelle="Nom"
                valeur={nom}
                onChange={setNom}
                erreur={erreursChamps["client.nom"]}
                autoComplete="family-name"
                obligatoire
              />
              <Champ
                libelle="Adresse email"
                type="email"
                valeur={email}
                onChange={setEmail}
                erreur={erreursChamps["client.email"]}
                autoComplete="email"
                aide="Votre facture et votre lien de suivi y sont envoyés."
                obligatoire
              />
              <Champ
                libelle="Téléphone"
                type="tel"
                valeur={telephone}
                onChange={setTelephone}
                erreur={erreursChamps["client.telephone"]}
                autoComplete="tel"
                aide="Pour vous joindre en cas d'imprévu."
              />
            </div>

            <label className="mt-6 block">
              <span className="etiquette opacity-75">
                Un mot pour nous ? (facultatif)
              </span>
              <textarea
                value={message}
                onChange={(evenement) => setMessage(evenement.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Votre taille, votre itinéraire, un besoin particulier"
                className="mt-2 w-full rounded-[var(--radius-bouton)] border border-noir-piste/25 bg-craie px-4 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal"
              />
            </label>

            <div className="mt-8 flex flex-wrap gap-3">
              <Bouton
                variante="contour"
                className="text-noir-piste"
                onClick={() => setEtape(1)}
              >
                Retour
              </Bouton>
              <Bouton
                onClick={() => setEtape(3)}
                disabled={!coordonneesValides}
                taille="lg"
              >
                Continuer vers le paiement
              </Bouton>
            </div>
            {!coordonneesValides && (
              <p className="mt-3 text-[0.82rem] text-gris-cadre">
                Prénom, nom et adresse email sont nécessaires pour continuer.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------- Étape 3 : paiement */}
        {etape === 3 && (
          <div className="mt-10">
            <h2 className="titre-editorial text-[1.6rem]">Paiement</h2>
            <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-gris-cadre">
              Une demande de paiement partira sur votre téléphone, que vous validerez avec votre
              code Mobile Money. Aucune coordonnée de paiement ne transite ni n&apos;est conservée
              par Bike Land : nous ne connaissons que votre numéro.
            </p>

            {/* La demande est partie : on attend que le client valide sur
                son téléphone, et la page se met à jour d'elle-même. */}
            {attentePaiement && (
              <SuiviPaiementMomo
                token={attentePaiement.token}
                paiementId={attentePaiement.paiementId}
                moyen={attentePaiement.moyen}
                telephone={attentePaiement.telephone}
                montantXof={devis.totalXof}
                urlCheckout={attentePaiement.urlCheckout}
                onConfirme={() => routeur.push(`/reservation/${attentePaiement.token}?nouvelle=1`)}
                onEchec={(texte) => setMessagePaiement(texte)}
              />
            )}

            {messagePaiement && (
              <p
                role="alert"
                className="mt-4 rounded-[var(--radius-carte)] bg-white px-5 py-4 text-[0.88rem] leading-relaxed text-orange-sourd"
              >
                {messagePaiement}
              </p>
            )}

            <fieldset className="mt-8">
              <legend className="etiquette opacity-75">
                Moyen de paiement
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {moyensDisponibles.map((moyen) => {
                  const actif = moyenPaiement === moyen.code;
                  return (
                    <label
                      key={moyen.code}
                      className={`cursor-pointer rounded-[var(--radius-bouton)] border p-4 text-center transition-colors ${
                        actif
                          ? "border-orange-signal bg-orange-signal/10"
                          : "border-noir-piste/15 bg-craie"
                      }`}
                    >
                      <input
                        type="radio"
                        name="moyen-paiement"
                        value={moyen.code}
                        checked={actif}
                        onChange={() => setMoyenPaiement(moyen.code)}
                        className="sr-only"
                      />
                      <span className="block font-semibold">
                        {moyen.libelle}
                      </span>
                      <span className="mt-1 block text-[0.78rem] text-gris-cadre">
                        {moyen.detail}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* --------------------------------------- Code de parrainage */}
            {/* Placé avant le récapitulatif de montant : le client doit voir
                sa remise appliquée avant de lire ce qui sera débité. Le
                champ est discret et facultatif : la plupart des clients
                n'en ont pas, et un champ trop présent laisse croire qu'on
                paie plus cher sans code. */}
            <div className="mt-8">
              {remise ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-carte)] border border-vert-lagune/50 bg-vert-lagune/10 px-5 py-4">
                  <p className="text-[0.9rem]">
                    Code <strong className="font-semibold">{remise.code}</strong> appliqué,{" "}
                    <strong className="font-semibold">
                      {formatXof(remise.montantXof)} de remise
                    </strong>
                  </p>
                  <button
                    type="button"
                    onClick={retirerPromo}
                    className="lien-souligne text-[0.82rem] font-semibold text-gris-cadre"
                  >
                    Retirer
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="champ-code-parrainage" className="etiquette opacity-75">
                    Code de parrainage (facultatif)
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      id="champ-code-parrainage"
                      type="text"
                      value={codeParrainage}
                      maxLength={32}
                      autoCapitalize="characters"
                      onChange={(evenement) => setCodeParrainage(evenement.target.value)}
                      onKeyDown={(evenement) => {
                        // Entrée applique le code au lieu de soumettre : le
                        // client qui valide au clavier ne doit pas déclencher
                        // le paiement sans avoir vu sa remise.
                        if (evenement.key === "Enter") {
                          evenement.preventDefault();
                          void verifierPromo();
                        }
                      }}
                      placeholder="Celui que vous a donné notre partenaire"
                      className="min-w-[12rem] flex-1 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-3 text-[0.95rem] uppercase outline-none transition-colors focus:border-orange-signal"
                    />
                    <button
                      type="button"
                      onClick={verifierPromo}
                      disabled={verificationPromo || codeParrainage.trim().length < 3}
                      className="rounded-[var(--radius-bouton)] border border-noir-piste/25 px-5 py-3 text-[0.88rem] font-semibold transition-colors hover:bg-noir-piste/5 disabled:opacity-40"
                    >
                      {verificationPromo ? "Vérification…" : "Appliquer"}
                    </button>
                  </div>
                  {messagePromo && (
                    <p role="alert" className="mt-2 text-[0.84rem] text-orange-sourd">
                      {messagePromo}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Ce qui sera réellement débité.

                SasPay ajoute sa commission au montant demandé : son compte
                est en « ADD_ON » et ignore la consigne inverse. Annoncer
                ici le seul prix de la location laisserait le client
                découvrir l'écart sur son relevé, ce qui use la confiance
                bien plus vite que l'écart lui-même. */}
            <dl className="mt-6 rounded-[var(--radius-carte)] bg-craie p-5 text-[0.88rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-gris-cadre">Votre location</dt>
                <dd className="tabular-nums">{formatXof(devis.totalXof)}</dd>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <dt className="text-gris-cadre">
                  Frais Mobile Money
                  <span className="block text-[0.76rem] opacity-75">
                    {(TAUX_ENCAISSEMENT * 100).toLocaleString("fr-FR")} %, prélevés par
                    l&apos;opérateur de paiement
                  </span>
                </dt>
                <dd className="tabular-nums">+ {formatXof(fraisEncaissement(devis.totalXof))}</dd>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-noir-piste/12 pt-3">
                <dt className="font-semibold">Débité de votre compte</dt>
                <dd className="font-display text-[1.2rem] font-extrabold tabular-nums text-orange-sourd">
                  {formatXof(montantDebite)}
                </dd>
              </div>
            </dl>

            <label className="mt-8 flex cursor-pointer items-start gap-3 text-[0.9rem] leading-relaxed">
              <input
                type="checkbox"
                checked={cgv}
                onChange={(evenement) => setCgv(evenement.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#f25c05]"
              />
              <span>
                J&apos;accepte les{" "}
                <a
                  href="/cgv"
                  target="_blank"
                  className="lien-souligne font-semibold text-orange-sourd"
                >
                  conditions générales de vente
                </a>{" "}
                et la{" "}
                <a
                  href="/donnees-personnelles"
                  target="_blank"
                  className="lien-souligne font-semibold text-orange-sourd"
                >
                  politique de protection des données
                </a>
                .
              </span>
            </label>
            {erreursChamps.cgvAcceptees && (
              <p className="mt-2 text-[0.82rem] text-orange-sourd">
                {erreursChamps.cgvAcceptees}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              {/* Une fois la réservation créée, on ne revient plus en
                  arrière : le vélo est retenu et les montants sont figés. */}
              {!attentePaiement && (
                <Bouton
                  variante="contour"
                  className="text-noir-piste"
                  onClick={() => setEtape(2)}
                >
                  Retour
                </Bouton>
              )}

              {/* Plus de bouton une fois la demande partie : le client ne
                  peut rien faire de plus ici, tout se joue sur son
                  téléphone. Un bouton laisserait croire le contraire, et
                  un second appui pousserait une deuxième demande. */}
              {attentePaiement ? (
                <p className="text-[0.85rem] leading-relaxed text-gris-cadre">
                  Votre vélo reste retenu {EXPIRATION_PANIER_MINUTES} minutes. Si la demande
                  n&apos;arrive pas, vous pourrez la relancer depuis votre lien de suivi.
                </p>
              ) : (
                <Bouton
                  onClick={envoyer}
                  disabled={!cgv || envoiEnCours || ouvertes === false}
                  taille="lg"
                >
                  {envoiEnCours
                    ? "Envoi de la demande…"
                    : `Payer ${formatXof(montantDebite)}`}
                </Bouton>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------- Récapitulatif fixe */}
      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <div className="border border-noir-piste/15 bg-craie p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="etiquette opacity-75">Récapitulatif</p>
              <Pastille ton="neutre">
                {offre === "road-trip"
                  ? `Road trip · ${devis.nombrePersonnes} pers.`
                  : `Location libre · ${devis.dureeHeures} h`}
              </Pastille>
            </div>

            <p className="mt-3 text-[0.82rem] text-gris-cadre">
              {formatDate(dateDebut)}, de {formatHeure(heureDebut)} à{" "}
              {formatHeure(
                heureDebut +
                  (offre === "road-trip" ? dureeRoadTrip : dureeHeures),
              )}
            </p>

            <dl className="mt-5 space-y-2.5 text-[0.88rem]">
              {devis.lignes.map((ligne) => (
                <div key={ligne.libelle} className="flex justify-between gap-4">
                  <dt className="text-gris-cadre">
                    {ligne.libelle}
                    <span className="block text-[0.76rem] opacity-70">
                      {ligne.detail}
                    </span>
                  </dt>
                  <dd className="shrink-0 tabular-nums">
                    {ligne.montantXof < 0 ? "− " : ""}
                    {formatXof(Math.abs(ligne.montantXof))}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex items-baseline justify-between border-t border-noir-piste/12 pt-4">
              <p className="font-display text-[1.05rem] font-bold uppercase">
                Total à payer
              </p>
              <p className="font-display text-[1.5rem] font-extrabold tabular-nums text-orange-sourd">
                {formatXof(devis.totalXof)}
              </p>
            </div>

            {devis.cautionXof > 0 ? (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-gris-cadre">
                Une caution de {formatXof(devis.cautionXof)} est remise en
                espèces au départ, en même temps que votre pièce
                d&apos;identité. Elle vous est rendue à la restitution du vélo,
                elle n&apos;est jamais encaissée en ligne.
              </p>
            ) : (
              <p className="mt-3 text-[0.78rem] leading-relaxed text-vert-lagune">
                Aucune caution : la sortie est encadrée par un coordinateur, qui
                récupère le vélo et le kit à l&apos;arrivée.
              </p>
            )}

            {/* Le coco et l'eau sont compris dans le forfait road trip : on
                les montre plutôt que de les écrire, c'est ce que le client
                retient de la sortie. */}
            {offre === "road-trip" && (
              <div className="mt-5 flex items-center gap-4 rounded-[var(--radius-carte)] bg-white p-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-bouton)]">
                  <Image
                    src="/images/xiaoyu-li-tW0j8n-GIUY-unsplash.jpg"
                    alt="Un coco frais servi avec une paille"
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <p className="text-[0.8rem] leading-relaxed">
                  <strong className="font-semibold">
                    Coco frais et eau compris
                  </strong>
                  <span className="mt-0.5 block text-gris-cadre">
                    Servis à l&apos;arrivée, pour chaque participant.
                  </span>
                </p>
              </div>
            )}
          </div>

          <ul className="mt-6 space-y-2.5 text-[0.82rem] text-gris-cadre">
            {[
              "Annulation gratuite jusqu'à 72 h avant le départ",
              "Facture envoyée par email juste après le paiement",
              "Lien de suivi personnel, sans mot de passe",
            ].map((garantie) => (
              <li key={garantie} className="flex items-start gap-2.5">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  className="mt-1 shrink-0 text-vert-lagune"
                >
                  <path
                    d="m3 8.4 3.2 3.2L13 4.8"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                {garantie}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  type = "text",
  erreur,
  aide,
  autoComplete,
  obligatoire = false,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  type?: string;
  erreur?: string;
  aide?: string;
  autoComplete?: string;
  obligatoire?: boolean;
}) {
  const identifiant = `champ-${libelle.toLowerCase().replace(/[^a-z]/g, "")}`;

  return (
    <div>
      <label htmlFor={identifiant} className="etiquette opacity-75">
        {libelle}
        {obligatoire && <span className="text-orange-signal"> *</span>}
      </label>
      <input
        id={identifiant}
        type={type}
        value={valeur}
        required={obligatoire}
        autoComplete={autoComplete}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={
          erreur
            ? `${identifiant}-erreur`
            : aide
              ? `${identifiant}-aide`
              : undefined
        }
        onChange={(evenement) => onChange(evenement.target.value)}
        className={`mt-2 w-full rounded-[var(--radius-bouton)] border bg-craie px-5 py-3 text-[0.95rem] outline-none transition-colors focus:border-orange-signal ${
          erreur ? "border-orange-signal" : "border-noir-piste/15"
        }`}
      />
      {erreur ? (
        <p
          id={`${identifiant}-erreur`}
          className="mt-1.5 text-[0.8rem] text-orange-sourd"
        >
          {erreur}
        </p>
      ) : aide ? (
        <p
          id={`${identifiant}-aide`}
          className="mt-1.5 text-[0.8rem] text-gris-cadre"
        >
          {aide}
        </p>
      ) : null}
    </div>
  );
}
