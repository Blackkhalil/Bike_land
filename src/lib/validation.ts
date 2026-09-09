/**
 * Schémas de validation des entrées publiques.
 *
 * Toutes les données venant du navigateur repassent par ici côté serveur :
 * le formulaire de réservation valide déjà dans le navigateur, mais rien
 * n'empêche d'appeler l'API directement.
 */

import { z } from "zod";

import { optionsLocation } from "@/data/catalogue";
import { estDateISOValide } from "./dates";

const dateISO = z
  .string()
  .refine(estDateISOValide, { message: "Date attendue au format AAAA-MM-JJ." });

const codesOptions = optionsLocation.map((option) => option.code) as [string, ...string[]];

export const schemaDisponibilite = z.object({
  veloId: z.string().min(1),
  dateDebut: dateISO,
  dateFin: dateISO,
});

export const schemaReservation = z
  .object({
    veloId: z.string().min(1, "Vélo manquant."),
    dateDebut: dateISO,
    dateFin: dateISO,
    options: z
      .array(z.object({ code: z.enum(codesOptions), quantite: z.number().int().min(1).max(6) }))
      .max(8)
      .default([]),
    client: z.object({
      prenom: z.string().trim().min(2, "Prénom trop court.").max(60),
      nom: z.string().trim().min(2, "Nom trop court.").max(60),
      email: z.string().trim().toLowerCase().email("Adresse email invalide."),
      telephone: z
        .string()
        .trim()
        .regex(/^[+0-9 ().-]{8,20}$/, "Numéro de téléphone invalide.")
        .optional()
        .or(z.literal("")),
    }),
    moyenPaiement: z.enum(["MTN_MONEY", "MOOV_MONEY", "CARTE_BANCAIRE"]),
    message: z.string().trim().max(1000).optional(),
    cgvAcceptees: z.literal(true, {
      errorMap: () => ({ message: "Les conditions générales doivent être acceptées." }),
    }),
  })
  .refine((valeurs) => valeurs.dateDebut <= valeurs.dateFin, {
    message: "La date de retour doit suivre la date de départ.",
    path: ["dateFin"],
  })
  .refine(
    (valeurs) => {
      // Une location ne peut pas démarrer dans le passé.
      const aujourdHui = new Date().toISOString().slice(0, 10);
      return valeurs.dateDebut >= aujourdHui;
    },
    { message: "La date de départ est déjà passée.", path: ["dateDebut"] },
  )
  .refine(
    (valeurs) => {
      // Garde-fou : au-delà de 60 jours, le tarif se négocie de vive voix.
      const jours =
        (Date.parse(`${valeurs.dateFin}T00:00:00Z`) - Date.parse(`${valeurs.dateDebut}T00:00:00Z`)) /
          86_400_000 +
        1;
      return jours <= 60;
    },
    { message: "Au-delà de 60 jours, contactez-nous directement.", path: ["dateFin"] },
  );

export const schemaContact = z.object({
  nom: z.string().trim().min(2, "Nom trop court.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  sujet: z.string().trim().min(3, "Sujet trop court.").max(120),
  message: z.string().trim().min(10, "Message trop court.").max(2000),
  /** Champ piège invisible : rempli, c'est un robot. */
  siteWeb: z.string().max(0).optional(),
});

export type EntreeReservation = z.infer<typeof schemaReservation>;
export type EntreeContact = z.infer<typeof schemaContact>;

/** Met une erreur Zod en forme pour l'affichage champ par champ. */
export function erreursParChamp(erreur: z.ZodError): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const probleme of erreur.errors) {
    const chemin = probleme.path.join(".");
    if (!resultat[chemin]) resultat[chemin] = probleme.message;
  }
  return resultat;
}
