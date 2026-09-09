# Bike Land

Plateforme de location de vélos pour road trips au Bénin — site public et espace
d'exploitation, développés d'après le cahier des charges du projet.

> **Neuf vélos, trois points de retrait, une réservation en ligne sans création de
> compte, payable en Mobile Money.**

---

## Sommaire

1. [Ce qui est livré](#ce-qui-est-livré)
2. [Démarrer en une commande](#démarrer-en-une-commande)
3. [Correspondance avec le cahier des charges](#correspondance-avec-le-cahier-des-charges)
4. [Architecture](#architecture)
5. [Variables d'environnement](#variables-denvironnement)
6. [Passer en base PostgreSQL](#passer-en-base-postgresql)
7. [Paiement et emails](#paiement-et-emails)
8. [Déploiement](#déploiement)
9. [Direction artistique](#direction-artistique)
10. [Décisions techniques et leurs raisons](#décisions-techniques-et-leurs-raisons)
11. [Ce qui reste à faire](#ce-qui-reste-à-faire)

---

## Ce qui est livré

**Site public** (11 pages)

| Page | Route | Contenu |
|---|---|---|
| Accueil | `/` | Hero, arguments, schéma technique annoté, entretien, parc, itinéraires, avis |
| Catalogue | `/velos` | Filtres type / taille / point de retrait / **dates réellement disponibles** |
| Fiche vélo | `/velos/[slug]` | Caractéristiques, équipement, calendrier de disponibilité, devis en direct, avis |
| Itinéraires | `/itineraires`, `/itineraires/[slug]` | Quatre road trips détaillés étape par étape |
| Comment ça marche | `/comment-ca-marche` | Les cinq étapes, les moyens de paiement, ce qui est compris |
| Tarifs | `/tarifs` | Grille par catégorie et par durée, remises, options, cautions |
| À propos | `/a-propos` | Histoire, valeurs, points de retrait |
| Contact & FAQ | `/contact` | Formulaire + 12 questions fréquentes (avec données structurées `FAQPage`) |
| Suivi | `/reservation/suivi`, `/reservation/[token]` | Accès à sa réservation par lien signé, facture, annulation |
| Légal | `/mentions-legales`, `/cgv`, `/donnees-personnelles` | Conformité, dont la loi béninoise sur les données (APDP) |

**Tunnel de réservation** — `/reservation` : trois étapes (location → coordonnées →
paiement), sans compte, avec récapitulatif chiffré en permanence.

**Espace d'exploitation** — `/admin` : tableau de bord complet (§2.3), calendrier du
parc, liste des réservations, fiches vélos, base clients, grille tarifaire, export CSV.

---

## Démarrer en une commande

```bash
npm install
npm run dev
```

Puis <http://localhost:3000>.

**Aucune configuration n'est nécessaire.** Sans `DATABASE_URL`, l'application démarre
en *mode démonstration* : un jeu de données en mémoire (9 vélos, 353 réservations et
255 clients répartis sur seize mois, avec leurs paiements) rend le site et le tableau
de bord entièrement navigables. Le tunnel de réservation fonctionne de bout en bout, paiement
simulé compris.

L'espace d'exploitation est à <http://localhost:3000/admin>. En développement, il
s'ouvre sans mot de passe ; en production il refuse l'accès tant que `ADMIN_PASSWORD`
n'est pas défini.

### Autres commandes

```bash
npm run build      # construction de production
npm run start      # serveur de production
npm run typecheck  # TypeScript, sans émission
npm run lint       # ESLint
npm run db:push    # applique le schéma Prisma à la base
npm run db:seed    # peuple la base avec le catalogue
```

---

## Correspondance avec le cahier des charges

### §2.1 — Côté visiteur

| Fonctionnalité demandée | État | Où |
|---|---|---|
| Catalogue de vélos | ✅ | `/velos` — photos (illustrations vectorielles), caractéristiques, tarifs |
| Fiche produit | ✅ | `/velos/[slug]` — type, taille, équipement inclus, autonomie conseillée |
| Réservation sans compte | ✅ | `/reservation` — coordonnées et paiement à la dernière étape |
| Paiement en ligne | ✅ | Adaptateurs FedaPay et KkiaPay (MTN Money, Moov Money, cartes) |
| Facture automatique par email | ✅ | `src/lib/email.ts`, envoyée juste après le paiement |
| Disponibilité en temps réel | ✅ | Calendrier par vélo + filtre par dates ; **double réservation impossible** |
| Suivi par lien unique | ✅ | Jeton HMAC signé, seul son haché est stocké en base |
| Confirmation et rappels | ✅ confirmation · ⏳ rappel | Rappel avant départ : à brancher sur une tâche planifiée |
| Contact / FAQ | ✅ | `/contact` — formulaire + FAQ ; chat non implémenté |
| Avis clients | ✅ affichage | Modèle `Review` prêt ; le dépôt d'avis reste à ouvrir |

### §2.2 — Côté administrateur

| Fonctionnalité | État | Où |
|---|---|---|
| Gestion du parc | ✅ consultation | `/admin/velos` — état, sorties, revenus par vélo |
| Gestion des réservations | ✅ | `/admin/reservations` — calendrier, départs et retours du jour, recherche |
| Gestion des tarifs | ✅ consultation et simulation | `/admin/tarifs` |
| Gestion des clients | ✅ | `/admin/clients` — base constituée automatiquement, sans compte client |
| Statistiques | ✅ | `/admin` |

L'édition en ligne (créer un vélo, changer un prix depuis l'interface) n'est pas
branchée : les écrans sont en lecture, et les données se modifient dans
`src/data/catalogue.ts` ou en base. Le schéma Prisma est prêt à recevoir ces écritures
(voir [Ce qui reste à faire](#ce-qui-reste-à-faire)).

### §2.3 — Tableau de bord statistique

Tous les indicateurs demandés sont calculés dans `src/lib/statistiques.ts` :

- **Financiers** — chiffre d'affaires (jour / semaine / mois / année) avec comparaison
  à la période précédente, revenu moyen par réservation, répartition par moyen de
  paiement, cautions encaissées et restituées.
- **Réservation** — nombre de réservations, taux d'occupation du parc, durée moyenne,
  taux d'annulation, saisonnalité mensuelle.
- **Parc** — vélos les plus et les moins loués, disponibles / en location / en entretien.
- **Clients** — nouveaux contre récurrents, origine par point de retrait, note moyenne.
- **Présentation** — courbe d'évolution, colonnes de saisonnalité, barres de
  répartition, jauge d'occupation, filtres de période, **export CSV** prêt pour la
  comptabilité.

> Deux précisions d'analyse, qui changent la lecture des chiffres :
> une période en cours n'est **jamais** comparée à une période complète — les deux
> fenêtres couvrent le même nombre de jours écoulés ; et le dernier point de la courbe,
> lorsqu'il porte sur un mois entamé, est tracé en pointillé pour ne pas se lire comme
> une chute d'activité.

### §5 — Contraintes techniques

| Contrainte | État |
|---|---|
| Site responsive | ✅ mobile, tablette, desktop — vérifié à 390 px et 1440 px |
| Disponibilité temps réel, sans double réservation | ✅ garantie par transaction sérialisable (voir plus bas) |
| Paiement adapté au marché béninois | ✅ Mobile Money en premier, cartes ensuite |
| Hébergement et nom de domaine | ⏳ à souscrire — la configuration est documentée |
| Multilingue | ⏳ à trancher (§8) — les textes sont centralisés, pas encore externalisés |
| Protection des données (APDP) | ✅ page dédiée, minimisation, durées de conservation |

---

## Architecture

```
src/
├── app/
│   ├── (site)/          Site public — porte l'en-tête et le pied de page
│   ├── admin/
│   │   ├── connexion/   Page de connexion, hors périmètre protégé
│   │   └── (protege)/   Tableau de bord et gestion — session obligatoire
│   └── api/             Réservations, disponibilité, contact, export, connexion
├── components/
│   ├── accueil/         Sections de la page d'accueil
│   ├── admin/           Navigation, calendrier du parc, filtres
│   ├── graphiques/      Graphiques SVG écrits à la main + palette validée
│   └── reservation/     Calendrier de disponibilité, tunnel, suivi
├── data/                Catalogue et contenus éditoriaux
└── lib/
    ├── db/              Couche de données — deux implémentations
    ├── dates.ts         Dates civiles et chevauchement de périodes
    ├── tarification.ts  Moteur de devis — source unique des prix
    ├── statistiques.ts  Indicateurs du §2.3
    ├── tokens.ts        Liens de suivi signés
    ├── paiement.ts      FedaPay / KkiaPay / démonstration
    └── email.ts         Resend, avec repli console
```

### La couche de données

Aucune page n'importe Prisma. Tout passe par `depot` (`src/lib/db/index.ts`), qui
choisit son implémentation au premier appel :

- **`DATABASE_URL` présent** → `postgres.ts`, l'implémentation Prisma / PostgreSQL
  retenue au §6.1 ;
- **absent** → `demo.ts`, un jeu de données en mémoire.

Les deux respectent le même contrat (`contrat.ts`) et la même règle métier.

### Comment la double réservation est rendue impossible

C'est la contrainte centrale du cahier des charges, et elle est traitée à trois niveaux :

1. **À l'affichage** — le calendrier de la fiche produit désactive les jours déjà pris,
   et le filtre par dates du catalogue masque les vélos indisponibles.
2. **Avant l'encaissement** — `POST /api/reservations` revérifie la disponibilité avant
   d'appeler l'agrégateur de paiement, pour ne pas débiter à tort.
3. **À l'écriture** — l'insertion se fait dans une transaction PostgreSQL en niveau
   `Serializable`, qui relit le conflit *à l'intérieur* de la transaction. C'est le seul
   niveau qui empêche le *write skew* : deux clients qui cliquent « payer » à la même
   seconde ne peuvent pas tous les deux lire « aucun conflit » puis écrire. Le second
   reçoit un `409` et un message explicite.

---

## Variables d'environnement

Copiez `.env.example` en `.env`. Aucune n'est requise pour démarrer.

| Variable | Effet si absente |
|---|---|
| `DATABASE_URL` | Mode démonstration, données en mémoire |
| `BOOKING_TOKEN_SECRET` | Secret aléatoire par processus en mode démo ; **obligatoire** dès qu'une base est configurée |
| `NEXT_PUBLIC_SITE_URL` | `https://bikeland.bj` — sert aux emails et aux métadonnées |
| `FEDAPAY_SECRET_KEY` / `KKIAPAY_PRIVATE_KEY` | Paiement simulé, aucune transaction réelle |
| `RESEND_API_KEY` | Emails journalisés dans la console au lieu d'être envoyés |
| `ADMIN_PASSWORD` | `/admin` ouvert en développement, **fermé en production** |

---

## Passer en base PostgreSQL

```bash
# 1. Créez une base (Railway, Render ou Supabase — cf. §6.1 du cahier des charges)
# 2. Renseignez DATABASE_URL et BOOKING_TOKEN_SECRET dans .env
openssl rand -hex 32          # pour BOOKING_TOKEN_SECRET

npm run db:push               # crée les tables
npm run db:seed               # y verse le catalogue
npm run dev
```

Le bandeau du tableau de bord passe alors de « Mode démonstration » à
« Base PostgreSQL ».

---

## Paiement et emails

**Paiement** — `src/lib/paiement.ts` expose une interface unique et trois
implémentations : FedaPay, KkiaPay et un mode démonstration. L'agrégateur héberge la
page de paiement : aucune coordonnée bancaire ne transite par le serveur. Les
commissions indicatives figurent au §7.2 du cahier des charges.

**Emails** — `src/lib/email.ts` envoie la confirmation (avec le lien de suivi) et la
facture via Resend. Sans clé d'API, le contenu complet est journalisé dans la console,
ce qui permet de le relire en développement.

---

## Déploiement

Cible prévue au §6.1 : **Vercel** pour le site et les routes d'API, **Railway / Render
/ Supabase** pour PostgreSQL.

```bash
npm run build
```

À configurer sur Vercel :

1. Les variables d'environnement ci-dessus, `ADMIN_PASSWORD` et `BOOKING_TOKEN_SECRET`
   en tête.
2. La commande d'installation : `npm install && npx prisma generate`.
3. Le domaine (`bikeland.bj` ou `bikeland.com` — disponibilité à vérifier, §7.1).

---

## Direction artistique

La maquette de référence est une page produit très éditoriale : typographie
monumentale posée derrière le produit, filets fins, schéma technique légendé,
accordéon d'entretien. Cette **construction** est reprise ; la **palette** est celle du
§4.1 du cahier des charges — terracotta, sable, olive, touches de soleil — et non le
bleu froid de la référence, parce que le cahier demande explicitement un ton chaleureux
et accueillant.

- **Typographies** — *Bricolage Grotesque* pour les titres (grotesque humaniste, tient
  en très grand corps), *Outfit* pour le texte courant (arrondie, lisible).
- **Illustrations** — tous les visuels sont des SVG paramétrés
  (`VeloIllustration`, `PaysageIllustration`) : nets à toutes les tailles, aucune
  requête réseau, recolorés par la charte. Ils tiennent la place des photographies
  authentiques prévues au §4.1 jusqu'à la séance photo ; le domaine Cloudinary est déjà
  autorisé dans `next.config.ts`.

### Les couleurs des graphiques ont été validées, pas choisies à l'œil

La palette du tableau de bord est passée par un validateur (bandes de clarté, plancher
de chroma, séparation sous protanopie et deutéranopie, contraste sur le fond) :

- **catégoriel** `#b04726 · #2a6fb0 · #c07813` — pire paire adjacente ΔE 20,5 en
  protanopie, 25,7 en vision normale ;
- **séquentiel** `#e6a687 → #90371f` — rampe monotone d'une seule teinte ;
- les catégories **nominales** (moyens de paiement, vélos, points de retrait) sont
  tracées d'une seule teinte : leur longueur porte la magnitude, leur libellé porte
  l'identité. Colorer chaque barre selon sa valeur re-encoderait en couleur ce que la
  barre dit déjà.

Chaque graphique propose un tableau de valeurs dépliable : l'information n'est jamais
accessible par la seule couleur.

---

## Décisions techniques et leurs raisons

| Décision | Raison |
|---|---|
| Montants en **entiers de FCFA** | Le franc CFA n'a pas de subdivision en usage : aucun arrondi flottant à gérer |
| Dates de location en `YYYY-MM-DD`, sans heure | Évite les décalages d'un jour entre le serveur (UTC) et le navigateur (UTC+1) |
| `endDate` **incluse** | Une location du 12 au 14 dure trois jours ; le vélo est immobilisé le 14 |
| Un seul moteur de prix | `calculerDevis` sert au widget, au tunnel, à l'API et à l'admin : le prix affiché est celui qui sera enregistré |
| Graphiques SVG écrits à la main | Six graphiques ne justifient pas 150 ko de bibliothèque |
| Jeton de suivi haché en base | Une copie de la base ne permet pas de forger un lien vers une réservation |
| Champ piège plutôt que captcha | Rien à charger, rien à résoudre, aucune donnée envoyée à un tiers |
| Historique de démonstration déterministe | Générateur à graine fixe : les chiffres du tableau de bord ne bougent pas d'un rechargement à l'autre |

---

## Ce qui reste à faire

Par ordre d'utilité :

1. **Édition en ligne du parc et des tarifs** — les écrans d'administration sont en
   lecture. Les modèles Prisma (`Bike`, `PriceRule`) et les écritures du dépôt sont
   prêts ; il manque les formulaires et les routes `PATCH`.
2. **Emails de rappel avant le départ** — le gabarit existe, il faut une tâche
   planifiée (Vercel Cron) qui balaie les départs à J−2.
3. **Dépôt d'avis par les clients** — le modèle `Review` et l'affichage existent ; le
   formulaire, envoyé par lien après la restitution, reste à écrire.
4. **Multilingue** (§8, à trancher) — les textes sont centralisés mais pas externalisés
   en fichiers de traduction.
5. **Photographies** — remplacer les illustrations par les prises de vue réelles, via
   Cloudinary.
6. **Points à trancher du §8** — nombre de points de retrait, restitution multi-sites,
   caution et assurance, budget et délais. Les choix provisoires retenus ici (trois
   points, restitution croisée en option, caution remplaçable par une assurance) sont
   tous paramétrables.
