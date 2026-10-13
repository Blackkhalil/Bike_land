"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { GRILLE_HORAIRE, type GammeVelo } from "@/data/offres";
import { formatXof } from "@/lib/format";
import { analyserAffiche } from "@/lib/lecture-affiche";
import type { PointDeRetrait } from "@/lib/types";

/**
 * Ajout d'un vélo au parc.
 *
 * Replié par défaut : cet écran sert d'abord à suivre le parc au
 * quotidien, et un formulaire déplié en permanence mettrait au premier
 * plan une action qu'on fait deux fois par an.
 *
 * On commence par la photo ou la vidéo du vélo, déposée ici même : plus
 * besoin de passer par les fichiers du site. Sur une vidéo, le formulaire
 * en tire une image qui sert de photo. Si c'est une affiche Bike Land,
 * sa fiche technique est lue et remplit la fiche du vélo, accroche et
 * description comprises : il ne reste qu'à relire.
 *
 * La gamme se choisit toujours à la main, parce que c'est elle qui fixe
 * le prix. Le vélo naît « en service » et apparaît aussitôt sur le site.
 */

const CATEGORIES = [
  { valeur: "VTT", libelle: "VTT" },
  { valeur: "VTC", libelle: "VTC" },
  { valeur: "GRAVEL", libelle: "Gravel" },
  { valeur: "RANDONNEUR", libelle: "Randonneur" },
  { valeur: "VAE", libelle: "Vélo à assistance électrique" },
  { valeur: "TANDEM", libelle: "Tandem" },
] as const;

const GAMMES: { valeur: GammeVelo; libelle: string }[] = [
  { valeur: "CLASSIQUE", libelle: `Classique, ${formatXof(GRILLE_HORAIRE.CLASSIQUE[0].prixXof)} l'heure` },
  { valeur: "PREMIUM", libelle: `Premium, ${formatXof(GRILLE_HORAIRE.PREMIUM[0].prixXof)} l'heure` },
  { valeur: "PRESTIGE", libelle: `Prestige, ${formatXof(GRILLE_HORAIRE.PRESTIGE[0].prixXof)} l'heure` },
];

const TAILLES = ["S", "M", "L", "XL"] as const;

type EtatMedia =
  | { etape: "vide" }
  | { etape: "en-cours"; message: string }
  | { etape: "pret"; trouvailles: string[]; avertissement?: string }
  | { etape: "erreur"; message: string };

export function FormulaireNouveauVelo({ points }: { points: PointDeRetrait[] }) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrerTransition] = useTransition();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [succes, setSucces] = useState<string | null>(null);
  const [stockageActif, setStockageActif] = useState<boolean | null>(null);
  const [media, setMedia] = useState<EtatMedia>({ etape: "vide" });
  const [apercu, setApercu] = useState<string | null>(null);

  const [valeurs, setValeurs] = useState({
    nom: "",
    categorie: "VTT" as (typeof CATEGORIES)[number]["valeur"],
    gamme: "CLASSIQUE" as GammeVelo,
    taille: "M" as (typeof TAILLES)[number],
    accroche: "",
    description: "",
    poidsKg: "14",
    vitesses: "21",
    chargeMaxKg: "120",
    autonomieConseilleeKm: "60",
    equipementInclus: "Casque, antivol, kit de réparation",
    pointDeRetraitId: points[0]?.id ?? "",
    photo: "",
    video: "",
  });

  const modifier = (champ: keyof typeof valeurs, valeur: string) =>
    setValeurs((actuelles) => ({ ...actuelles, [champ]: valeur }));

  // Le stockage des photos est-il branché ? On le dit avant le dépôt,
  // plutôt qu'après une attente pour rien.
  useEffect(() => {
    if (!ouvert || stockageActif !== null) return;
    fetch("/api/admin/televersement")
      .then((reponse) => reponse.json())
      .then((donnees: { actif?: boolean }) => setStockageActif(Boolean(donnees.actif)))
      .catch(() => setStockageActif(false));
  }, [ouvert, stockageActif]);

  /** Dépose la photo ou la vidéo, et lit l'affiche pour remplir la fiche. */
  const choisirFichier = async (fichier: File) => {
    setErreur(null);
    setSucces(null);
    const montrer = (image: Blob) =>
      setApercu((ancien) => {
        if (ancien) URL.revokeObjectURL(ancien);
        return URL.createObjectURL(image);
      });

    const estVideo = fichier.type.startsWith("video/");
    if (!estVideo) montrer(fichier);
    try {
      setMedia({ etape: "en-cours", message: estVideo ? "Extraction d'images de la vidéo…" : "Préparation…" });
      // Sur une vidéo, deux moments : la fiche technique incrustée n'est
      // souvent visible qu'en partie à un instant donné. Le premier sert
      // aussi de photo.
      const images = estVideo ? await imagesDeLaVideo(fichier) : [fichier];
      const image = images[0];
      if (estVideo) montrer(image);

      // Les deux en même temps : le dépôt et la lecture de l'affiche.
      const [depot, fiche] = await Promise.all([
        stockageActif
          ? deposer(fichier, estVideo ? image : null, (pourcentage) =>
              setMedia({ etape: "en-cours", message: `Envoi du fichier… ${pourcentage} %` }),
            )
          : Promise.resolve(null),
        lireAffiche(images, fichier.name, (pourcentage) =>
          setMedia((actuel) =>
            actuel.etape === "en-cours" && actuel.message.startsWith("Envoi")
              ? actuel
              : { etape: "en-cours", message: `Lecture de l'affiche… ${pourcentage} %` },
          ),
        ),
      ]);

      setValeurs((actuelles) => ({
        ...actuelles,
        nom: fiche.nom ?? actuelles.nom,
        categorie: fiche.categorie ?? actuelles.categorie,
        // Jamais héritée du fichier précédent : c'est elle qui fixe le prix.
        gamme: fiche.gamme ?? "CLASSIQUE",
        vitesses: fiche.vitesses ? String(fiche.vitesses) : actuelles.vitesses,
        accroche: fiche.accroche ?? actuelles.accroche,
        description: fiche.description ?? actuelles.description,
        photo: depot?.photo ?? actuelles.photo,
        video: depot?.video ?? actuelles.video,
      }));

      setMedia({
        etape: "pret",
        trouvailles: fiche.trouvailles,
        avertissement: !stockageActif
          ? "Le fichier n'a pas été enregistré : le stockage des photos n'est pas activé."
          : undefined,
      });
    } catch {
      setMedia({
        etape: "erreur",
        message: "Le fichier n'a pas pu être traité. Vérifiez la connexion et réessayez, ou remplissez la fiche à la main.",
      });
    }
  };

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
      setValeurs((actuelles) => ({ ...actuelles, nom: "", accroche: "", description: "", photo: "", video: "" }));
      setMedia({ etape: "vide" });
      setApercu(null);
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

  const occupe = media.etape === "en-cours";

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

      {/* ------------------------------------------ Photo ou vidéo */}
      <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="etiquette opacity-75">Photo ou vidéo du vélo</p>
          <label
            className={`mt-2 flex aspect-4/3 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[var(--radius-carte)] border-2 border-dashed bg-craie text-center transition-colors ${
              occupe ? "cursor-wait border-noir-piste/20" : "border-noir-piste/25 hover:border-orange-signal"
            }`}
          >
            {apercu ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local d'un fichier choisi, pas une image du site
              <img src={apercu} alt="Aperçu du vélo" className="h-full w-full object-cover" />
            ) : (
              <span className="px-4 text-[0.88rem] text-gris-cadre">
                <span className="block text-[1.6rem]" aria-hidden="true">
                  +
                </span>
                Choisir une photo ou une vidéo
                <span className="mt-1 block text-[0.76rem]">JPEG, PNG, WebP, MP4 ou MOV, 100 Mo au plus</span>
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              disabled={occupe}
              className="sr-only"
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0];
                if (fichier) void choisirFichier(fichier);
                evenement.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="text-[0.86rem] leading-relaxed">
          {stockageActif === false && (
            <p className="rounded-[var(--radius-carte)] border-l-4 border-orange-signal bg-orange-signal/10 px-4 py-3">
              Le stockage des photos n&apos;est pas branché sur ce projet. Dans Vercel :{" "}
              <strong>Storage</strong>, ouvrez <strong>bikeland-photos</strong>, puis connectez-le au
              projet de l&apos;administration. La lecture de l&apos;affiche fonctionne déjà.
            </p>
          )}
          {media.etape === "vide" && (
            <p className="mt-3 text-gris-cadre">
              Déposez l&apos;affiche du vélo ou sa vidéo : sa fiche technique est lue et remplit la fiche
              ci-dessous. Sur une vidéo, une image en est tirée pour servir de photo.
            </p>
          )}
          {media.etape === "en-cours" && (
            <p role="status" className="mt-3 font-semibold">
              {media.message}
            </p>
          )}
          {media.etape === "erreur" && (
            <p role="alert" className="mt-3 text-orange-sourd">
              {media.message}
            </p>
          )}
          {media.etape === "pret" && (
            <div role="status" className="mt-3">
              {media.trouvailles.length > 0 ? (
                <>
                  <p className="font-semibold text-vert-lagune">Lu sur l&apos;affiche :</p>
                  <p className="mt-1">{media.trouvailles.join(", ")}.</p>
                  <p className="mt-2 text-gris-cadre">
                    La fiche est remplie : relisez-la, choisissez la gamme et la taille, puis enregistrez.
                  </p>
                </>
              ) : (
                <p className="text-gris-cadre">
                  Aucune fiche technique lue sur cette image : complétez la fiche à la main.
                </p>
              )}
              {media.avertissement && <p className="mt-2 text-orange-sourd">{media.avertissement}</p>}
              {valeurs.video && <p className="mt-2 text-gris-cadre">Vidéo enregistrée avec le vélo.</p>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Champ
          libelle="Nom du vélo"
          valeur={valeurs.nom}
          onChange={(v) => modifier("nom", v)}
          erreur={erreurs.nom}
          aide="Il sert aussi d'adresse publique de la fiche."
        />

        <Liste
          libelle="Gamme"
          valeur={valeurs.gamme}
          onChange={(v) => modifier("gamme", v)}
          options={GAMMES}
          aide="C'est elle qui fixe le prix : vérifiez-la."
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
          libelle="Nombre de vitesses"
          valeur={valeurs.vitesses}
          onChange={(v) => modifier("vitesses", v)}
          erreur={erreurs.vitesses}
          type="number"
        />
        <Champ
          libelle="Poids en kg"
          valeur={valeurs.poidsKg}
          onChange={(v) => modifier("poidsKg", v)}
          erreur={erreurs.poidsKg}
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

      {(erreurs.photo || erreurs.video || erreurs.gamme) && (
        <p className="mt-4 text-[0.85rem] text-orange-sourd">
          {erreurs.gamme ?? erreurs.photo ?? erreurs.video}
        </p>
      )}

      <button
        type="button"
        onClick={envoyer}
        disabled={envoi || enCours || occupe}
        className="mt-7 rounded-[var(--radius-bouton)] bg-orange-signal px-6 py-3 text-[0.9rem] font-semibold text-noir-piste transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {envoi ? "Enregistrement…" : occupe ? "Fichier en cours de traitement…" : "Mettre ce vélo en service"}
      </button>

      {succes && <p className="mt-3 text-[0.85rem] text-vert-lagune">{succes}</p>}
    </div>
  );
}

/* --------------------------------------------------------- Fichiers */

/** Un nom de fichier sans espace ni accent, pour l'adresse du stockage. */
function nomDeStockage(nom: string, extension: string): string {
  const base = nom
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `velos/${base || "velo"}.${extension}`;
}

/** Envoie le fichier au stockage ; pour une vidéo, son image aussi, qui sert de photo. */
async function deposer(
  fichier: File,
  imageDeVideo: Blob | null,
  progression: (pourcentage: number) => void,
): Promise<{ photo: string; video?: string }> {
  const options = { access: "public" as const, handleUploadUrl: "/api/admin/televersement" };
  if (imageDeVideo) {
    const extension = fichier.name.split(".").pop()?.toLowerCase() || "mp4";
    const [video, photo] = await Promise.all([
      upload(nomDeStockage(fichier.name, extension), fichier, {
        ...options,
        onUploadProgress: ({ percentage }) => progression(Math.round(percentage)),
      }),
      upload(nomDeStockage(fichier.name, "jpg"), imageDeVideo, { ...options, contentType: "image/jpeg" }),
    ]);
    return { photo: photo.url, video: video.url };
  }
  const extension = fichier.type === "image/png" ? "png" : fichier.type === "image/webp" ? "webp" : "jpg";
  const photo = await upload(nomDeStockage(fichier.name, extension), fichier, {
    ...options,
    onUploadProgress: ({ percentage }) => progression(Math.round(percentage)),
  });
  return { photo: photo.url };
}

/**
 * Deux images nettes tirées de la vidéo : un peu après le début (la
 * première image est souvent noire), puis au milieu.
 */
function imagesDeLaVideo(fichier: File): Promise<Blob[]> {
  return new Promise((resoudre, rejeter) => {
    const adresse = URL.createObjectURL(fichier);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = adresse;
    const instants: number[] = [];
    const images: Blob[] = [];
    const finir = (erreur?: Error) => {
      URL.revokeObjectURL(adresse);
      if (images.length) resoudre(images);
      else rejeter(erreur ?? new Error("image vide"));
    };
    video.onloadedmetadata = () => {
      const duree = video.duration || 4;
      instants.push(Math.min(1.5, duree / 4), duree / 2);
      video.currentTime = instants.shift() as number;
    };
    video.onseeked = () => {
      const toile = document.createElement("canvas");
      toile.width = video.videoWidth;
      toile.height = video.videoHeight;
      toile.getContext("2d")?.drawImage(video, 0, 0);
      toile.toBlob(
        (image) => {
          if (image) images.push(image);
          const suivant = instants.shift();
          if (suivant !== undefined) video.currentTime = suivant;
          else finir();
        },
        "image/jpeg",
        0.88,
      );
    };
    video.onerror = () => finir(new Error("vidéo illisible"));
  });
}

/**
 * Lit le texte de l'affiche et en tire la fiche du vélo.
 *
 * La bibliothèque de lecture n'est chargée qu'ici, au premier dépôt : le
 * reste de l'admin, et le site public, n'en téléchargent jamais rien.
 */
async function lireAffiche(images: Blob[], nomFichier: string, progression: (pourcentage: number) => void) {
  const { createWorker } = await import("tesseract.js");
  let rang = 0;
  const lecteur = await createWorker("fra", 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") {
        progression(Math.round(((rang + message.progress) / images.length) * 100));
      }
    },
  });
  try {
    const textes: string[] = [];
    for (const image of images) {
      textes.push((await lecteur.recognize(image)).data.text);
      rang += 1;
    }
    return analyserAffiche(textes.join("\n"), nomFichier);
  } finally {
    await lecteur.terminate();
  }
}

/* ---------------------------------------------------------- Champs */

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
  aide,
}: {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  options: { valeur: string; libelle: string }[];
  aide?: string;
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
      {aide && <p className="mt-1.5 text-[0.8rem] text-gris-cadre">{aide}</p>}
    </div>
  );
}
