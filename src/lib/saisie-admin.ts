/**
 * Ce que les nouvelles routes de l'administration (offres de groupe)
 * partagent pour lire une saisie : le prénom de qui agit, des messages
 * d'erreur en français, et les erreurs rangées par case du formulaire.
 */

import { z } from "zod";

import { formatNombre } from "@/lib/format";

/**
 * Le prénom saisi par qui agit : il signe la ligne du journal
 * (« admin (Koffi) »). Mêmes règles que « Argent reçu par » au comptoir.
 */
export const schemaPrenom = z
  .string({ required_error: "Indiquez votre prénom.", invalid_type_error: "Indiquez votre prénom." })
  .trim()
  .min(2, "Indiquez votre prénom.")
  .max(40, "Prénom trop long.")
  .regex(/^[\p{L}\p{N} .'’-]+$/u, "Lettres, chiffres, espaces et tirets seulement.");

/** Les messages que zod écrit de lui-même, en anglais. */
const MESSAGE_ANGLAIS = /^(Required|Expected |Invalid |Number must|String must|Array must|Too )/;

/**
 * Les messages par défaut de zod, en français. Un message écrit dans le
 * schéma (« Heure attendue au format 08:00. », « Montant attendu en francs
 * CFA. ») passe toujours avant : ceci ne remplace que les messages anglais
 * de zod. Passé à `safeParse(donnees, { errorMap: erreursEnFrancais })`.
 */
export const erreursEnFrancais: z.ZodErrorMap = (probleme, contexte) => {
  // Le schéma a déjà donné son message, en français : on le garde.
  if (contexte.defaultError && !MESSAGE_ANGLAIS.test(contexte.defaultError)) {
    return { message: contexte.defaultError };
  }
  switch (probleme.code) {
    case z.ZodIssueCode.invalid_type:
      if (probleme.received === "undefined" || probleme.received === "null") return { message: "Case à remplir." };
      if (probleme.expected === "integer") return { message: "Nombre entier attendu." };
      if (probleme.expected === "number") return { message: "Nombre attendu." };
      return { message: "Valeur invalide." };
    case z.ZodIssueCode.too_small:
      if (probleme.type === "number") return { message: `${formatNombre(Number(probleme.minimum))} au moins.` };
      if (probleme.type === "string") return { message: "Trop court." };
      return { message: `${formatNombre(Number(probleme.minimum))} au moins.` };
    case z.ZodIssueCode.too_big:
      if (probleme.type === "number") return { message: `${formatNombre(Number(probleme.maximum))} au plus.` };
      if (probleme.type === "string") return { message: "Trop long." };
      return { message: `${formatNombre(Number(probleme.maximum))} au plus.` };
    case z.ZodIssueCode.not_multiple_of:
      return { message: `Multiple de ${formatNombre(Number(probleme.multipleOf))} attendu.` };
    case z.ZodIssueCode.invalid_string:
      return { message: "Format invalide." };
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_literal:
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: "Valeur inconnue." };
    default:
      return { message: contexte.defaultError };
  }
};

/**
 * Les erreurs d'une saisie, une par case : « roadTrip.retour » → « Le
 * retour doit suivre le départ. ». `prefixe` ôte le nom de l'objet envoyé
 * en tête du chemin (« reglages.roadTrip.retour » devient
 * « roadTrip.retour ») ; les autres cases gardent leur nom (« prenom »). Ce
 * qui ne vise aucune case va sous « general ».
 */
export function champsEnErreur(erreur: z.ZodError, prefixe?: string): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const probleme of erreur.errors) {
    const chemin = prefixe !== undefined && probleme.path[0] === prefixe ? probleme.path.slice(1) : probleme.path;
    const champ = chemin.join(".") || "general";
    champs[champ] ??= probleme.message;
  }
  return champs;
}
