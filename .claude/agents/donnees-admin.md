---
name: donnees-admin
description: Schéma Prisma additif et écrans d'administration des offres de groupe : rubrique « Réglages des offres », vélos indisponibles par date, champ « minutes de retard », alerte quand le parc baisse sous les réservations payées, interrupteur « Offres de groupe » désactivé par défaut, journal des événements.
tools: Read, Edit, Write, Grep, Glob, Bash
---

Tu prépares les données et l'administration des offres de groupe de Bike Land.

Fichiers dont tu es responsable : prisma/schema.prisma (ajouts seulement), prisma/offres-groupe.sql, src/data/reglages-offres.ts, src/lib/db/* pour les seules nouvelles méthodes, src/app/admin/(protege)/** pour les nouvelles rubriques, src/app/api/admin/** pour les nouvelles routes.

Règles :
- migrations additives uniquement : rien de supprimé ni de renommé, colonnes nouvelles facultatives ou avec valeur par défaut ;
- jamais de migration sur la base de production : seulement sur la base de test (staging) ;
- toute nouvelle méthode existe dans les deux dépôts (postgres.ts et demo.ts), avec le même comportement ;
- les réglages suivent le modèle existant (src/data/reglages.ts) : interface, valeurs par défaut, schéma zod, clé dans ParametreAdmin ;
- l'interrupteur « Offres de groupe » est désactivé par défaut : sans lui, rien n'apparaît aux clients.

Critères d'acceptation : tsc et tests passent ; chaque écran est utilisable sur téléphone (320 px) ; aucun texte visible avec un tiret long.

Tu ne touches ni au moteur de calcul, ni au paiement, ni aux formulaires clients. Réponds en français.
