"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Bouton } from "@/components/Bouton";
import { VeloIllustration } from "@/components/VeloIllustration";
import { Pastille } from "@/components/ui";
import { optionsLocation } from "@/data/catalogue";
import {
  creneauDuJour,
  DUREE_ROAD_TRIP_HEURES as dureeRoadTrip,
  EXIGENCES,
  EXPIRATION_PANIER_MINUTES,
  DERNIER_DEPART_HEURE as dernierDepart,
  FERMETURE_HEURE as fermeture,
  formatHeure,
  GAMMES,
  GRILLE_HORAIRE,
  heuresDepartPossibles,
  OFFRES,
  OUVERTURE_HEURE as ouvertureAtelier,
  prixRoadTripDu,
  prixRoadTripMinimum,
  roadTripsDuJour,
  type GammeVelo,
} from "@/data/offres";

/** « Premium » : le nom d'une gamme, pour les phrases. */
const nomGamme = (gamme: GammeVelo) => GAMMES.find((entree) => entree.code === gamme)?.nom ?? gamme;
import type { DateISO } from "@/lib/dates";
import { diagnostiquer } from "@/lib/echecs-paiement";
import { formatDate, formatXof } from "@/lib/format";
import { fraisEncaissement, moyensDisponibles, TAUX_ENCAISSEMENT } from "@/lib/tarifs-paiement";
import { SuiviPaiementMomo } from "./SuiviPaiementMomo";
import { calculerDevis } from "@/lib/tarification";
import type {
  CodeOffre,
  MoyenPaiement,
  PointDeRetrait,
  Velo,
} from "@/lib/types";
import { DepartComplet, departsDansLOrdre, premierDepart } from "./DepartComplet";
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
  /** Le nom sous lequel ce départ se vend, s'il en a un : Gbashi bike le dimanche. */
  produit?: string | null;
  /** Ce que ce départ demande en plus de prévoir (la tenue de sport de Gbashi bike). */
  consigne?: string | null;
  date: DateISO;
  heureDebut: number;
  heureFin: number;
}

interface Props {
  /**
   * La gamme choisie. Le client ne choisit pas de vélo : des vélos libres de
   * cette gamme lui sont attribués à la réservation, un par personne.
   */
  gamme: GammeVelo;
  /** Un vélo de la gamme, pour l'image d'en-tête seulement. */
  apercu?: Pick<Velo, "photo" | "categorie" | "teintes">;
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
  /** Les départs fermés par l'exploitant, montrés « Sold out » (voir `departsComplets`). */
  complets: CreneauProposable[];
  /**
   * L'instant du rendu serveur, en millisecondes. Les heures de départ
   * se calculent d'abord sur lui, pour que le navigateur affiche à
   * l'hydratation exactement ce que le serveur a rendu ; elles suivent
   * ensuite l'horloge, minute par minute.
   */
  instant: number;
  optionsInitiales: string[];
}

export function TunnelReservation({
  gamme,
  apercu,
  offre: offreInitiale,
  dureeHeures: dureeInitiale,
  nombrePersonnes: personnesInitiales,
  personnesMax,
  point,
  dateDebut: dateInitiale,
  dateFin: dateFinInitiale,
  heureDebut: heureInitiale,
  creneaux,
  complets,
  instant,
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
  //
  // Le départ choisi sur la fiche vélo est gardé : sans cela, un client
  // venu pour le dimanche, Gbashi bike, retombait sur le samedi, premier
  // créneau de la liste, et risquait de payer le mauvais jour. S'il n'est
  // plus proposé (fermé entre-temps, ou clos la veille à 22 h), c'est le
  // même créneau la semaine suivante, et le client en est averti.
  const creneauDemande =
    creneaux.find((creneau) => creneau.date === dateInitiale) ??
    creneaux.find((creneau) => creneau.code === creneauDuJour(dateInitiale)?.code) ??
    premierDepart(creneaux);
  const departRemplace =
    offreInitiale === "road-trip" &&
    creneauDuJour(dateInitiale) !== undefined &&
    creneauDemande !== undefined &&
    creneauDemande.date !== dateInitiale;
  const [dateDebut, setDateDebut] = useState<DateISO>(
    offreInitiale === "road-trip"
      ? (creneauDemande?.date ?? dateInitiale)
      : dateInitiale,
  );
  const [heureDebut, setHeureDebut] = useState(
    offreInitiale === "road-trip" && creneauDemande ? creneauDemande.heureDebut : heureInitiale,
  );
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
  // Seul le road trip ferme la nuit : la location libre se réserve à
  // toute heure.
  const fermeLaNuit = offre === "road-trip" && ouvertes === false;
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

  // L'horloge du tunnel : l'instant du rendu serveur, puis l'heure réelle
  // chaque minute. Une page laissée ouverte le matin ne propose donc plus
  // à midi un départ à 10 h.
  const [maintenant, setMaintenant] = useState(instant);
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => clearInterval(minuteur);
  }, []);

  // Heures de départ compatibles avec la durée et le jour choisis : retour
  // avant la fermeture, rien pendant le road trip du week-end, rien de
  // déjà passé.
  const departsPossibles = useMemo(
    () => heuresDepartPossibles(dureeHeures, dateDebut, maintenant),
    [dureeHeures, dateDebut, maintenant],
  );

  // L'heure affichée et envoyée est toujours l'une de celles proposées :
  // si l'heure retenue vient de passer, on prend le premier départ encore
  // possible plutôt que d'envoyer au serveur une heure qu'il refuserait.
  // `undefined` quand il n'en reste aucun ce jour-là pour cette durée.
  const heureRetenue =
    offre === "location-libre" && !departsPossibles.includes(heureDebut)
      ? departsPossibles[0]
      : heureDebut;
  const aucunDepart = heureRetenue === undefined;
  const heureAffichee = heureRetenue ?? heureDebut;
  const roadTripsCeJour = offre === "location-libre" ? roadTripsDuJour(dateDebut) : [];

  // Un vélo par personne, de la gamme choisie : le plafond est ce qu'il
  // reste de cette gamme à l'heure retenue, demandé au serveur dès que le
  // jour, l'heure ou la durée changent. En attendant sa réponse, les vélos
  // de la gamme en état de rouler. Zéro : la gamme est complète à cette
  // heure, il faut en changer avant de continuer.
  const heureFinCreneau = heureAffichee + (offre === "road-trip" ? dureeRoadTrip : dureeHeures);
  const cleCreneau = `${gamme}|${dateDebut}|${heureAffichee}|${heureFinCreneau}`;
  const [libresGamme, setLibresGamme] = useState<{ cle: string; nombre: number } | null>(null);
  useEffect(() => {
    if (aucunDepart) return;
    const controleur = new AbortController();
    fetch("/api/disponibilite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamme, dateDebut, dateFin, heureDebut: heureAffichee, heureFin: heureFinCreneau }),
      signal: controleur.signal,
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (donnees && typeof donnees.libresGamme === "number") {
          setLibresGamme({ cle: cleCreneau, nombre: donnees.libresGamme });
        }
      })
      .catch(() => undefined);
    return () => controleur.abort();
  }, [aucunDepart, cleCreneau, gamme, dateDebut, dateFin, heureAffichee, heureFinCreneau]);
  const velosMax =
    libresGamme?.cle === cleCreneau ? Math.max(1, Math.min(personnesMax, libresGamme.nombre)) : personnesMax;
  const gammeComplete = libresGamme?.cle === cleCreneau && libresGamme.nombre === 0;
  // Le nombre choisi, ramené au plafond s'il a baissé entre-temps.
  const nombreEffectif = Math.min(nombrePersonnes, velosMax);

  // Les devis se calculent à chaque rendu : c'est une fonction pure et
  // légère, et le compilateur de React s'occupe de la mémoïsation.
  const devis = calculerDevis({
    offre,
    // La gamme choisie fixe le tarif. Le serveur recalcule tout avant
    // d'encaisser : ce qui est affiché ici n'engage rien.
    gamme,
    // Le jour aussi, en road trip : Gbashi bike, le dimanche, a son prix.
    date: dateDebut,
    nombrePersonnes: nombreEffectif,
    dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
    options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
    remise: remise ?? undefined,
  });

  // Le montant avant remise : c'est sur lui que le code s'applique, et
  // c'est donc lui qu'on envoie vérifier.
  const devisSansRemise = calculerDevis({
    offre,
    gamme,
    date: dateDebut,
    nombrePersonnes: nombreEffectif,
    dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
    options: optionsChoisies.map((code) => ({ code, quantite: 1 })),
  });

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
      const creneau = creneauDemande;
      if (creneau) {
        setDateDebut(creneau.date);
        setHeureDebut(creneau.heureDebut);
      }
    } else {
      setDateDebut(dateInitiale);
      const possibles = heuresDepartPossibles(dureeHeures, dateInitiale, maintenant);
      setHeureDebut(
        possibles.includes(heureInitiale) ? heureInitiale : (possibles[0] ?? heureInitiale),
      );
    }
  };

  /** Change la durée, en ramenant l'heure de départ dans les clous. */
  const choisirDuree = (heures: number) => {
    setDureeHeures(heures);
    const possibles = heuresDepartPossibles(heures, dateDebut, maintenant);
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
          gamme,
          offre,
          nombrePersonnes: nombreEffectif,
          dureeHeures: offre === "location-libre" ? dureeHeures : undefined,
          dateDebut,
          dateFin,
          heureDebut: heureRetenue,
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
        } else if (reponse.status === 409 && donnees.code === "EN_ATTENTE") {
          // Une réservation à son nom attend déjà son paiement ce jour-là : le
          // message dit laquelle, et comment la payer.
          setErreurGlobale(donnees.erreur);
        } else if (reponse.status === 409 && donnees.code === "PLACES") {
          // Des vélos de la gamme viennent d'être pris : le compteur suit.
          if (typeof donnees.places === "number") setLibresGamme({ cle: cleCreneau, nombre: donnees.places });
          setErreurGlobale(`${donnees.erreur} Aucun montant n'a été prélevé.`);
        } else if (reponse.status === 409) {
          // Plus aucun vélo de la gamme sur ce créneau : le compteur le dit,
          // et le bouton attend une autre heure.
          if (typeof donnees.places === "number") setLibresGamme({ cle: cleCreneau, nombre: donnees.places });
          setErreurGlobale(
            `${donnees.erreur ?? `Plus aucun vélo ${nomGamme(gamme)} n'est libre sur ce créneau : choisissez une autre heure, un autre jour ou une autre gamme.`} Aucun montant n'a été prélevé.`,
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
        <NoteHoraires offre={offre} className="mb-6" />
        {/* Fil des étapes */}
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-0 sm:gap-y-2">
          {etapes.map((item, index) => (
            <li key={item.numero} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => item.numero < etape && setEtape(item.numero)}
                disabled={item.numero >= etape}
                className={`flex min-h-11 items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-[0.08em] transition-opacity ${
                  item.numero === etape
                    ? "text-noir-piste"
                    : item.numero < etape
                      ? "text-orange-signal hover:opacity-70"
                      : "text-noir-piste/35"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[0.75rem] ${
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
              {/* Pas de trait sur téléphone : le fil y passe à la ligne, et
                  le trait restait suspendu en bout de ligne. */}
              {index < etapes.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden h-px w-6 bg-noir-piste/20 sm:block sm:w-10"
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
              {apercu?.photo ? (
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-[var(--radius-bouton)] bg-white">
                  <Image
                    src={apercu.photo}
                    alt={`Un vélo ${nomGamme(gamme)}`}
                    fill
                    sizes="128px"
                    className={`object-cover ${apercu.photo.startsWith("/images/affiches/") ? "object-left" : ""}`}
                  />
                </div>
              ) : apercu ? (
                <div
                  className="grid h-24 w-32 shrink-0 place-items-center rounded-[var(--radius-bouton)] px-2"
                  style={{ background: apercu.teintes[1] }}
                >
                  <VeloIllustration categorie={apercu.categorie} teintes={apercu.teintes} className="w-full" />
                </div>
              ) : null}
              <div className="flex-1">
                <p className="titre-editorial text-[1.35rem]">Vélo {nomGamme(gamme)}</p>
                <p className="mt-2 text-[0.85rem]">
                  Le{" "}
                  <strong className="font-semibold">
                    {formatDate(dateDebut)}
                  </strong>
                  , de{" "}
                  <strong className="font-semibold">
                    {formatHeure(heureAffichee)}
                  </strong>{" "}
                  à{" "}
                  <strong className="font-semibold">
                    {formatHeure(
                      heureAffichee +
                        (offre === "road-trip" ? dureeRoadTrip : dureeHeures),
                    )}
                  </strong>
                </p>
                <p className="mt-1 text-[0.8rem] text-gris-cadre">
                  Un vélo de la gamme, attribué selon les disponibilités et réglé à votre taille au
                  départ.
                </p>
              </div>
              {/* Le road trip n'a pas de date à changer : il part à l'un
                  du créneau proposé juste en dessous. */}
              {offre === "location-libre" && (
                <a
                  href={`/reserver/${gamme.toLowerCase()}?debut=${dateDebut}`}
                  className="lien-souligne cible-elargie text-[0.82rem] font-semibold text-orange-signal"
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
                            ? offre === "road-trip"
                              ? `${formatXof(prixRoadTripDu(gamme, dateDebut))} / pers.`
                              : `dès ${formatXof(prixRoadTripMinimum(gamme))} / pers.`
                            : `dès ${formatXof(GRILLE_HORAIRE[gamme][0].prixXof)}`}
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
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRILLE_HORAIRE[gamme].map((palier) => {
                    const actif = dureeHeures === palier.heures;
                    return (
                      <button
                        key={palier.heures}
                        type="button"
                        onClick={() => choisirDuree(palier.heures)}
                        aria-pressed={actif}
                        className={`min-h-[44px] rounded-[var(--radius-bouton)] border px-3 transition-colors ${
                          actif
                            ? "border-orange-signal bg-orange-signal text-noir-piste"
                            : "border-noir-piste/20 bg-white hover:border-noir-piste/50"
                        }`}
                      >
                        <span className="block font-semibold">
                          {palier.heures}&nbsp;h
                        </span>
                        <span className="block whitespace-nowrap text-[0.8rem] opacity-75">
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
                  Départs de {formatHeure(ouvertureAtelier)} à {formatHeure(dernierDepart)}, vélo rendu à{" "}
                  {formatHeure(fermeture)} au plus tard&nbsp;: nous ne proposons que les départs
                  qui vous laissent le temps de le rendre.
                </p>
                {roadTripsCeJour.map((creneau) => (
                  <p
                    key={creneau.code}
                    className="mt-2 text-[0.8rem] leading-relaxed text-gris-cadre"
                  >
                    Le {creneau.libelle.toLowerCase()}, de{" "}
                    {formatHeure(creneau.heureDebut)} à {formatHeure(creneau.heureFin)}, les
                    vélos partent en road trip : la location libre commence à{" "}
                    {formatHeure(creneau.heureFin)} ce jour-là.
                  </p>
                ))}
                {aucunDepart && (
                  <p className="mt-3 rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white px-4 py-3 text-[0.85rem] leading-relaxed">
                    Il ne reste plus de départ possible le {formatDate(dateDebut)} pour{" "}
                    {dureeHeures} h de location.{" "}
                    {heuresDepartPossibles(1, dateDebut, maintenant).length > 0
                      ? "Choisissez une durée plus courte, ou "
                      : "Choisissez "}
                    <Link href={`/reserver/${gamme.toLowerCase()}`} className="font-semibold underline">
                      un autre jour
                    </Link>
                    .
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {departsPossibles.map((heure) => {
                    const actif = heureRetenue === heure;
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
                    {complets.length > 0
                      ? "Les prochains départs de road trip sont sold out. "
                      : "Aucun départ de road trip n'est ouvert à la réservation en ce moment : les prochaines sorties sont complètes. "}
                    La location libre reste possible, ou appelez-nous au{" "}
                    <span className="whitespace-nowrap">{site.telephone}</span>.
                  </p>
                  </div>
                )}
                {departRemplace && (
                  <p
                    role="status"
                    className="mt-3 rounded-[var(--radius-carte)] border border-noir-piste/15 bg-white px-4 py-3 text-[0.85rem] leading-relaxed"
                  >
                    {complets.some((depart) => depart.date === dateInitiale)
                      ? `Le départ du ${formatDate(dateInitiale)} est sold out : nous vous proposons le suivant.`
                      : `Le départ du ${formatDate(dateInitiale)} n'est plus ouvert à la réservation : nous vous proposons le suivant.`}
                  </p>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {departsDansLOrdre(creneaux, complets).map(({ depart: creneau, complet }) => {
                    if (complet) {
                      return <DepartComplet key={`complet-${creneau.code}-${creneau.date}`} depart={creneau} />;
                    }
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
                          {creneau.produit && ` · ${creneau.produit}, sport devant la plage`}
                        </span>
                        {/* Le prix du jour : Gbashi bike, le dimanche, a le sien. */}
                        <span className="mt-0.5 block text-[0.78rem] font-semibold">
                          {formatXof(prixRoadTripDu(gamme, creneau.date))} / pers.
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
                <span className="font-semibold">Une personne.</span> La gamme {nomGamme(gamme)} ne
                compte qu&apos;un vélo : il se réserve pour une seule personne. Pour venir à
                plusieurs, choisissez la gamme Classique ou Premium.
              </p>
            )}

            {/* Un vélo par personne, de la gamme choisie : autant qu'il en
                reste à cette heure. */}
            {velosMax > 1 && (
              <fieldset className="mt-7">
                <legend className="text-[0.9rem] font-semibold">
                  {offre === "road-trip" ? "Combien de personnes ?" : "Combien de vélos ?"}
                </legend>
                <p className="mt-1.5 text-[0.8rem] text-gris-cadre">
                  {offre === "road-trip"
                    ? `Jusqu'à ${velosMax}\u00a0: un vélo ${nomGamme(gamme)} par personne, autant qu'il en reste à cette heure.`
                    : `Jusqu'à ${velosMax} vélos ${nomGamme(gamme)} libres à cette heure, au même prix chacun.`}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNombrePersonnes(Math.max(1, nombreEffectif - 1))}
                    disabled={nombreEffectif <= 1}
                    aria-label={offre === "road-trip" ? "Retirer une personne" : "Retirer un vélo"}
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem] disabled:opacity-35"
                  >
                    −
                  </button>
                  <span id="tunnel-nombre-velos" aria-live="polite" className="min-w-[3rem] text-center font-display text-[1.5rem] tabular-nums">
                    {nombreEffectif}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNombrePersonnes(Math.min(velosMax, nombreEffectif + 1))}
                    disabled={nombreEffectif >= velosMax}
                    aria-label={offre === "road-trip" ? "Ajouter une personne" : "Ajouter un vélo"}
                    className="grid h-11 w-11 place-items-center rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-white text-[1.2rem] disabled:opacity-35"
                  >
                    +
                  </button>
                </div>
              </fieldset>
            )}

            {/* --------------------------------- Ce qu'il faut prévoir */}
            <ul className="mt-7 space-y-2 rounded-[var(--radius-carte)] bg-craie p-5 text-[0.86rem] leading-relaxed text-gris-cadre">
              {[
                // La consigne du départ choisi d'abord : la tenue de sport de Gbashi bike.
                ...(offre === "road-trip"
                  ? creneaux
                      .filter((c) => c.date === dateDebut && c.heureDebut === heureDebut && c.consigne)
                      .map((c) => c.consigne as string)
                  : []),
                ...EXIGENCES[offre],
              ].map((exigence) => (
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

            {optionsLocation.length > 0 && (
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
            )}

            {gammeComplete && (
              <p
                role="status"
                className="mt-8 rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-white px-4 py-3 text-[0.86rem] leading-relaxed"
              >
                Plus aucun vélo {nomGamme(gamme)} n&apos;est libre à cette heure.{" "}
                {offre === "road-trip"
                  ? "Choisissez un autre départ, ou "
                  : "Choisissez une autre heure, un autre jour, ou "}
                <Link href="/velos" className="font-semibold underline">
                  une autre gamme
                </Link>
                .
              </p>
            )}

            <Bouton
              onClick={() => setEtape(2)}
              disabled={aucunDepart || gammeComplete}
              taille="lg"
              className="mt-8"
            >
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
                montantXof={montantDebite}
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
                      placeholder="Code partenaire"
                      className="min-w-[12rem] flex-1 rounded-[var(--radius-bouton)] border border-noir-piste/20 bg-craie px-4 py-3 text-[0.95rem] uppercase outline-none transition-colors placeholder:normal-case focus:border-orange-signal"
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
                <dd className="shrink-0 whitespace-nowrap tabular-nums">{formatXof(devis.totalXof)}</dd>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <dt className="text-gris-cadre">
                  Frais Mobile Money
                  <span className="block text-[0.76rem] opacity-75">
                    {(TAUX_ENCAISSEMENT * 100).toLocaleString("fr-FR")} %, prélevés par
                    l&apos;opérateur de paiement
                  </span>
                </dt>
                <dd className="shrink-0 whitespace-nowrap tabular-nums">+ {formatXof(fraisEncaissement(devis.totalXof))}</dd>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-noir-piste/12 pt-3">
                <dt className="font-semibold">Débité de votre compte</dt>
                <dd className="shrink-0 whitespace-nowrap font-display text-[1.2rem] font-extrabold tabular-nums text-orange-sourd">
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
                  disabled={!cgv || envoiEnCours || fermeLaNuit || aucunDepart || gammeComplete}
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
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="etiquette opacity-75">Récapitulatif</p>
              <Pastille ton="neutre" className="whitespace-nowrap">
                {offre === "road-trip"
                  ? `${creneauDuJour(dateDebut)?.produit ?? "Road trip"} · ${devis.nombrePersonnes} pers.`
                  : `Location libre · ${devis.dureeHeures} h${devis.nombrePersonnes > 1 ? ` · ${devis.nombrePersonnes} vélos` : ""}`}
              </Pastille>
            </div>

            <p className="mt-3 text-[0.82rem] text-gris-cadre">
              {formatDate(dateDebut)}, de {formatHeure(heureAffichee)} à{" "}
              {formatHeure(
                heureAffichee +
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
                Une caution de {formatXof(devis.cautionXof)}
                {devis.nombrePersonnes > 1
                  ? ` (${formatXof(devis.cautionXof / devis.nombrePersonnes)} par vélo)`
                  : ""}{" "}
                est remise en espèces au départ, en même temps que votre pièce
                d&apos;identité. Elle vous est rendue à la restitution
                {devis.nombrePersonnes > 1 ? " des vélos" : " du vélo"}, elle n&apos;est jamais encaissée en ligne.
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
