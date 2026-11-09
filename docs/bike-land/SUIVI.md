# Offres de groupe : suivi de la mission

Réservation en ligne de Bike for All, Road trip en groupe et Gbashi Bike.
Sources : `bikeland new docs/Bike Land Cahier des charges.pdf` et
`bikeland new docs/Bike_Land_Calculatrice_Offres.xlsx` (hors git). En cas de
conflit, le cahier des charges s'applique, sauf décision contraire du
responsable notée ici.

## État

| Phase | État |
|---|---|
| 0. Audit et plan | Terminée le 9 novembre 2026 |
| Feu vert 1 | Donné le 9 novembre 2026 |
| 1. Construction | En cours : lot 0 |
| 2. Tests | À venir |
| 3. Démo, feu vert 2 | À venir |
| 4. Mise en ligne | À venir |
| 5. Clôture | À venir |

## Règles de la mission

- La production ne casse jamais. Travail sur la branche `feature/offres-groupe`,
  tirée de `Projet-Bikeland` (la branche de production ; il n'y a pas de `main`).
- Base de test séparée. Aucune migration en production sans accord écrit du
  responsable ; migrations additives seulement, sauvegarde avant.
- Interrupteur « Offres de groupe » dans l'administration, désactivé par défaut.
- Tests : paiement de démonstration, emails de test, jamais de vrai client.
- Tests de non-régression lancés avant et après chaque lot.
- Plan de retour arrière écrit avant toute mise en ligne.

## Décisions du responsable (9 novembre 2026)

| N° | Sujet | Décision |
|---|---|---|
| 1 | Remplacements | Le Road trip en groupe (samedi ou dimanche, 8 h à 12 h, toutes gammes) remplace le road trip actuel (8 h à 11 h, par gamme). Gbashi Bike repasse en ligne le dimanche de 7 h à 11 h. Les deux à l'activation de l'interrupteur. |
| 2 | Prix du road trip | 3 125 F par personne, frais de paiement électronique compris : 3 000 F + 125 F. Le cahier donnait 3 125 F + 125 F (cas 7 : 32 500 F) ; la décision l'emporte. |
| 3 | Commission SasPay | Les 3,25 % de SasPay (mode ADD_ON imposé par le compte) restent ajoutés, sur une ligne visible avant paiement. |
| 4 | Prix Gbashi | 3 625 / 4 125 / 4 625 F en ligne (Classique, Premium, Prestige), soit 3 500 / 4 000 / 4 500 F + 125 F. Au comptoir : 3 500 / 4 000 / 4 500 F. Le cahier donnait 3 000 / 3 500 / 4 000 F. |
| 5 | Deux groupes sur un créneau | Une demande garde ses vélos 30 minutes pendant le paiement (comme aujourd'hui). Pas de double vente, pas de remboursement. |
| 6 | Paiement après 30 minutes | Confirmé si les vélos sont encore libres ; sinon remboursement listé dans l'administration, email au client et à Bike Land. |
| 7 | Remboursements | Faits par le responsable (SasPay ou Mobile Money) sous 48 h ; le site les liste et prévient le client. |
| 8 | Réduction de 4 % | Accordée seulement si l'agent IA voit sur la capture que le client est abonné à un réseau de Bike Land (ou a partagé la story taguée). En cas de doute : validation manuelle dans l'administration, jamais de réduction par défaut. |
| 9 | Pénalité de retard | Payée en espèces au retour, saisie dans l'administration ; clause ajoutée aux CGV. |
| 10 | Taille d'un groupe | Limitée au nombre total de vélos disponibles ce jour-là, toutes gammes confondues (plus de plafond à 12). |
| 11 | Horaires Bike for All | Départs de 8 h à 21 h 30, au quart d'heure, retour à 22 h au plus tard. La date limite du vendredi 19 h vaut pour les trois offres le week-end. |
| 12 | Comptoir | Les trois offres se vendent aussi en espèces, mêmes réglages, sans les 125 F. |
| 13 | Agent IA | Claude Fable 5.1 (`claude-fable-5-1`, Anthropic), clé côté serveur créée par le responsable. Captures envoyées à Anthropic puis supprimées ; page « données personnelles » mise à jour. |
| 14 | Email | Obligatoire dans les formulaires (récapitulatif, facture, lien de suivi). |
| 15 | Couleurs | Identité actuelle du site (orange sur noir et crème), pas de terracotta. |
| 16 | Points 8.1 à 8.5 du brief | Refus sous 30 minutes, budget minimum calculé (1 000 F + 400 F par personne aujourd'hui) ; seuil de 15 000 F gardé tel quel (budget en mode budget, temps de vélo en mode durée) ; quart d'heure ; exemple à 20 personnes ignoré ; hypothèses du tableur confirmées et modifiables. |
| 17 | Infrastructure | Accord pour un projet Supabase de test gratuit ; clé SasPay de test demandée par le responsable ; secrets Vercel saisis par le responsable, guidé ; nettoyage des anciens secrets locaux. |

## Cas de test de référence (après décisions)

Départ 8 h, sans gâteaux sauf mention, paiement électronique inclus.

| N° | Cas | Attendu |
|---|---|---|
| 1 | Bike for All, 10 pers., 5 000 F, sans accompagnateur | aucun coco, 30 min, 6 250 F, barré 11 750 F |
| 2 | Bike for All, 10 pers., 10 000 F, sans accompagnateur | petit coco, 45 min, 11 250 F, barré 17 250 F |
| 3 | Bike for All, 10 pers., 10 000 F, avec accompagnateur | petit coco, 45 min, 13 750 F, barré 19 750 F |
| 4 | Bike for All, 13 pers., 10 000 F, avec accompagnateur | aucun coco, 45 min, 14 725 F, barré 22 350 F |
| 5 | Bike for All, 12 pers., 20 000 F, avec accompagnateur | grand coco, 90 min, 24 650 F, barré 37 950 F |
| 6 | Bike for All durée, 15 pers., 60 min, petit coco, 1 gâteau | 19 750 F, barré 32 250 F |
| 7 | Road trip, 10 pers., sans réduction | 31 250 F, pas de prix barré (décision 2) |
| 8 | Road trip, 10 pers., avec réduction | 30 050 F, barré 31 250 F (réduction de 4 % sur le prix avant frais : 30 000 F - 1 200 F + 1 250 F ; à confirmer en démo) |
| 9 | Gbashi, 5 pers. (2 Classique, 2 Premium, 1 Prestige) | 7 000 + 8 000 + 4 500 = 19 500 F + 625 F = 20 125 F (décision 4) |

Refus attendus : 18 personnes et 5 000 F (budget insuffisant pour 30 min,
minimum 8 200 F) ; parc passé de 18 à 15 vélos, groupe de 16 refusé ; 3 vélos
en réparation un samedi précis, capacité réduite de 3 ce jour-là seulement ;
parc baissé sous les vélos déjà payés, alerte qui liste les réservations ;
demande après le vendredi 19 h pour le week-end, refusée.

## Décisions techniques (prises par le chef de projet)

- Moteur de calcul à part, `src/lib/offres/`, pur, sans plafond fixe : le calcul
  actuel (`calculerDevis`) plafonne les groupes à 12 et les options à 6.
- Parité avec le tableur : recalcul du vrai fichier Excel par un moteur de
  formules Python (`formulas`) sur des entrées tirées au hasard ; LibreOffice
  n'est pas installé. Pour le road trip, le paramètre « Prix par personne » du
  tableur est porté à 3 000 F (décision 2).
- Disponibilité : minutes ajoutées à côté des heures pleines (colonnes nouvelles),
  une seule fonction pour toutes les offres.
- Vélos indisponibles déclarés vélo par vélo, avec proposition de réaffectation.
- Journal des événements : « admin » plus le prénom saisi (compte administrateur
  unique aujourd'hui).
- Agent IA version 1 : récapitulatif et contrôle des captures, pas de discussion.
- Captures : stockage privé, supprimées dès la décision, 30 jours au plus.
- Toutes les nouvelles tables avec la protection Supabase (RLS).
- Expiration des demandes vérifiée au fil des requêtes (forfait Vercel gratuit :
  une tâche planifiée par jour) ; nettoyage quotidien.
- Tests de non-régression dans `tests/`, lancés par `npm test` (tsx, sans base,
  sans paiement réel).

## Journal

- 9 novembre 2026 : Phase 0. Cahier et tableur lus, 9 cas de test recalculés
  exacts, audit du code par 4 auditeurs en lecture seule, plan et décisions
  envoyés. Feu vert 1 reçu avec les décisions ci-dessus.
- 9 novembre 2026 : Phase 1, lot 0 commencé : suivi, fiches des sous-agents,
  tests de non-régression, correctifs Padel issus de la relecture, base de test.
