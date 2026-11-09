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
| 1. Construction | En cours : lot 0 terminé, lots 1 et 2 en construction |
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
| 17 | Infrastructure | Accord pour un projet Supabase de test gratuit ; secrets Vercel saisis par le responsable, guidé ; nettoyage des anciens secrets locaux. SasPay : pas de clé de test, la clé actuelle sert aussi aux essais (message du 9 novembre : « utilise la même clé SasPay qu'on a ici »), avec les précautions ci-dessous. |

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
- Interrupteur coupé : plus de nouvelle demande de groupe, mais un paiement déjà
  lancé est toujours confirmé par SasPay et une réservation payée reste honorée.
- Réglages des offres illisibles (valeur impossible en base) : vente refusée et
  alerte dans l'administration, jamais de vente aux valeurs par défaut.
- Comptoir (relecture du lot 1) : ni date limite du vendredi, ni délai minimum
  avant le départ ; un départ plus tôt le jour même peut être saisi après coup,
  jamais un jour passé. Ces deux règles ne valent que pour la réservation en
  ligne.
- En ligne, réservation au moins 2 h avant le départ (réglage
  `delaiMinimumMinutes`, modifiable) : le temps de préparer vélos, cocos et
  gâteaux.
- Gbashi : un coco (grand format) et une eau par personne, d'après la carte du
  cahier (« vélo, eau, un coco »), modifiables. À confirmer par le responsable :
  le site actuel en annonce deux depuis la consigne du 7 novembre.
- Réduction : comptes reconnus = Instagram @bikeland_bj (site) et le compte
  TikTok « Bike Land » cité par le cahier, dont l'identifiant reste à donner ;
  d'ici là, une capture TikTok passe en validation manuelle.
- Essais de paiement avec la clé SasPay réelle (décision 17) : les tests
  automatiques restent en mode démonstration, sans argent ; les quelques vrais
  paiements de contrôle se font sur la base de test, avec le numéro du
  responsable et des prix de test minuscules (200 F, minimum SasPay) réglés
  dans les réglages de la base de test seulement. SasPay envoie ses
  notifications au site de production : les références de test portent une
  marque distincte pour que la production ne les confonde jamais avec une vraie
  réservation (elle les ignore déjà, référence inconnue et montant contrôlé).

## Environnements

| Environnement | Détail |
|---|---|
| Production | Branche `Projet-Bikeland`, projets Vercel `bike-land` (site) et `bikeland-gestion-rsfaj` (gestion), base Supabase de production. |
| Test | Projet Supabase `bike-land-staging` (id `ypyiwoppmjfrmicaqazo`, Londres) : schéma de production, protection RLS sur toutes les tables, 18 vélos fictifs. |
| Branche de travail | `feature/offres-groupe`, locale seulement. Pas de push tant que les aperçus Vercel reçoivent la base de production : il faut d'abord donner aux aperçus de cette branche la base de test (la clé SasPay reste la même, décision 17). |

## Plan de retour arrière

La mise en ligne (Phase 4) se fait en deux temps : d'abord le code et la base,
interrupteur coupé, sans aucun changement pour les clients ; ensuite le
responsable allume l'interrupteur. En cas de problème, chaque niveau se tente
avant le suivant.

1. **Couper l'interrupteur** (immédiat, sans déploiement, faisable par le
   responsable depuis son téléphone) : tableau de bord de l'administration,
   « Ouverture des réservations », « Offres de groupe » sur fermé. Les trois
   offres disparaissent du site, le road trip actuel et Gbashi reprennent leur
   fonctionnement d'avant (décision 1). Les réservations payées restent
   valables et visibles dans l'administration.
2. **Revenir au déploiement de l'étape 1** (quelques minutes) : « Instant
   Rollback » Vercel sur les deux projets, vers le déploiement mis en ligne
   interrupteur coupé (identifiant noté ici le jour J). Jamais plus loin dès
   qu'une réservation de groupe existe : un code plus ancien ne connaît pas les
   nouvelles valeurs d'offre et l'administration ne pourrait plus lire ces
   réservations (même règle que pour Padel : jamais avant ee64e52).
3. **Corriger et redéployer** : `git revert` du commit fautif sur
   `Projet-Bikeland`, `npm test`, puis push.
4. **Base de données** : rien n'est supprimé ni renommé. Les ajouts (colonnes,
   tables, valeurs d'offre) sont ignorés par le code qui ne s'en sert pas : pas
   de retour arrière de la base. Sauvegarde complète juste avant la migration
   de production (`npm run db:sauvegarde`, à compléter des tables récentes avant
   la Phase 4), fichier gardé hors git.
5. **Paiements en cours** : un paiement arrivé après un retour arrière est
   enregistré ; si les vélos ne sont plus garantis, le remboursement est listé
   dans l'administration (décision 6) et le client prévenu par email.

## Actions du responsable

| Action | Quand | État |
|---|---|---|
| Clé SasPay de test | Remplacée par la clé actuelle (décision 17) | Sans objet |
| Saisir le mot de passe de la base de test dans `.env.staging` (guidé) | Avant les tests sur la base de test | À faire |
| Donner aux aperçus Vercel de la branche la base de test (guidé ; la clé SasPay y est déjà) | Avant la démo (Phase 3) | À faire |
| Créer la clé Anthropic (agent IA) | Avant le lot 5 | À faire |
| Révoquer l'ancien jeton Vercel (Compte, Tokens) : il a été retiré du PC | Quand possible | À faire |
| Programmer les jours de Padel bike dans l'administration | Avant le 20 novembre | À faire |

## Journal

- 9 novembre 2026 : Phase 0. Cahier et tableur lus, 9 cas de test recalculés
  exacts, audit du code par 4 auditeurs en lecture seule, plan et décisions
  envoyés. Feu vert 1 reçu avec les décisions ci-dessus.
- 9 novembre 2026 : Phase 1, lot 0 commencé : suivi, fiches des sous-agents,
  tests de non-régression, correctifs Padel issus de la relecture, base de test.
- 9 novembre 2026 : lot 0 terminé. Correctifs Padel en production (ce91892),
  contrat des réglages des offres (7165e38), pénalité de retard (264fad3),
  `npm test` : 12 suites de non-régression (371 contrôles) et 14 contrôles des
  réglages, tous verts. Ménage des secrets locaux : variables KkiaPay et ancien
  jeton Vercel retirés de `.env`, 4 copies périmées supprimées (noms seulement
  consultés, jamais les valeurs). Plan de retour arrière écrit.
- 9 novembre 2026 : lots 1 (moteur de calcul) et 2 (données et administration)
  lancés en parallèle, chacun dans son worktree, suivis d'une relecture
  indépendante en lecture seule.
