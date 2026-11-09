# Bike Land

Plateforme de location de vélos à Cotonou, au Bénin. Site public et espace
d'exploitation.

> **Onze vélos répartis en trois gammes, location à l'heure ou road trip encadré,
> réservation en ligne sans création de compte, paiement en Mobile Money.**

**Conception, direction du projet et propriété : SIBI IBRAHIM KHALIL.**
Toutes les décisions de produit, de tarification, d'identité visuelle et de
contenu éditorial lui reviennent. Le code a été écrit d'après son cahier des
charges et sous sa direction.

En ligne : <https://bike-land.vercel.app>

---

## Sommaire

1. [Ce que fait le site](#ce-que-fait-le-site)
2. [Démarrer](#démarrer)
3. [Tarification](#tarification)
4. [Parrainage](#parrainage)
5. [Architecture](#architecture)
6. [Variables d'environnement](#variables-denvironnement)
7. [Paiement](#paiement)
8. [Emails](#emails)
9. [Déploiement](#déploiement)
10. [Identité visuelle](#identité-visuelle)
11. [Décisions techniques et leurs raisons](#décisions-techniques-et-leurs-raisons)
12. [Ce qui reste à faire](#ce-qui-reste-à-faire)

---

## Ce que fait le site

### Site public

| Page | Route | Contenu |
|---|---|---|
| Accueil | `/` | Vélo en vedette en 3D, les trois gammes, le parc, carrousel de photos, avis |
| Nos produits | `/produits` | Padel bike (vers sa page), Gbashi bike (sur commande, sur WhatsApp), road trip du week-end, location libre, avec leurs affiches ; Octobre rose en octobre |
| Padel bike | `/padel-bike` | La sortie vélo + padel, réservée et payée en ligne les jours programmés dans l'administration, sans choix de vélo |
| Octobre rose | `/octobre-rose` | La sortie de saison, réservée et payée en ligne sans choix de vélo |
| Catalogue | `/velos` | Les trois gammes en cadres (le Premium « le plus pris ») ; un cadre touché affiche les vélos de sa gamme, et d'elle seule |
| Fiche vélo | `/velos/[slug]` | Gamme et tarif, caractéristiques, disponibilité à l'heure, avis |
| Itinéraires | `/itineraires`, `/itineraires/[slug]` | Deux parcours de la route des Pêches, étape par étape |
| Comment ça marche | `/comment-ca-marche` | Le déroulé d'une sortie, les moyens de paiement, ce qui est compris |
| À propos | `/a-propos` | L'activité, le point de départ, les horaires |
| Contact et FAQ | `/contact` | Formulaire qui écrit directement à Bike Land, questions fréquentes |
| Suivi | `/reservation/suivi`, `/reservation/[token]` | Accès par lien signé, facture, annulation, dépôt d'avis |
| Légal | `/mentions-legales`, `/cgv`, `/donnees-personnelles` | Dont la loi béninoise sur les données personnelles |

### Tunnel de réservation

`/reservation` en trois étapes : la location, les coordonnées, le paiement. Sans
compte, avec le récapitulatif chiffré visible en permanence. Le code de
parrainage se saisit à la dernière étape et la réduction est recalculée côté
serveur.

### Espace d'exploitation

`/admin`, protégé par mot de passe. Tableau de bord, sortie du jour, ventes en
espèces, réservations, parc, clients, avis à modérer, partenaires et codes de
parrainage. Le parc s'édite depuis l'interface : ajouter un vélo, le mettre en
entretien, le retirer, changer sa gamme. Les réglages des produits (heures, jours,
prix, nombre de personnes, dates) se changent sur `/admin/reglages`, voir
[Réglages des produits](#réglages-des-produits).

### Ventes en espèces

`/admin/especes`, pour le client qui paie au comptoir. Le commercial choisit la
formule, le créneau et le vélo, saisit le client et son nom à lui, et encaisse le
montant affiché. La location libre y part à l'heure que tape le commercial (une heure
pleine), et rentre à 22 h au plus tard (`OUVERTURE_COMPTOIR_HEURE`, `FERMETURE_COMPTOIR_HEURE`) ; en
ligne, elle garde les horaires de l'atelier. Octobre rose s'y vend aussi, à la
personne, sans vélo à choisir, comme Padel bike, à l'heure et au prix de ses
réglages. Gbashi bike, sur commande, ne se vend qu'ici, sur un vélo choisi dont la
gamme fixe le prix ; pas de code de parrainage sur ces deux sorties. Ce montant vient de `calculerDevis`, comme en ligne, au prix de la
plaquette (sans les 125 F de frais du paiement en ligne, voir
[Tarification](#tarification)) : il n'est jamais saisi, et le serveur refuse d'en
enregistrer un autre. La réservation naît
confirmée et payée (paiement `ESPECES`, `collectedBy` = qui a reçu l'argent), le
client reçoit aussitôt sa confirmation et sa facture, et le gérant un email
« Vente en espèces ». Une saisie envoyée deux fois n'est enregistrée qu'une fois
(sa référence de paiement est unique en base).

Le bas de la page fait le rapprochement de caisse : encaissé du jour, de la
semaine et du mois, détail par vendeur, ventes une par une avec renvoi de la
facture. Les règles de la réservation en ligne (fermeture de nuit, clôture du
road trip la veille à 22 h, jours fermés) ne s'y appliquent pas : le client est
sur place. La colonne `collectedBy` est ajoutée par `prisma/especes.sql`.

### Nos produits et Octobre rose

`/produits` présente les façons de rouler, toutes tirées des mêmes données que la
réservation (`src/data/produits.ts`, prix dans `src/data/offres.ts`) :

- **Padel bike** (lancé en novembre 2026) : à vélo jusqu'au terrain de padel, puis
  trois heures de padel, le soir. Il a sa propre page, `/padel-bike`, où l'on choisit
  son jour et le nombre de personnes, puis l'on paie en Mobile Money ; un vélo libre
  est attribué à chacun, toutes gammes confondues, dans la transaction qui écrit.
  La réservation en ligne s'ouvre d'elle-même le vendredi 20 novembre 2026 à minuit,
  heure du Bénin ; avant, la page annonce la date et renvoie vers WhatsApp. Il ne
  part que les jours que l'équipe programme dans l'administration. Tout ce qui le
  règle (heure, jours, prix, durée, nombre de personnes, ouverture, délai) se change
  sur `/admin/reglages` ; un interrupteur du tableau de bord (code `padel-bike`) le
  ferme en ligne. Sa galerie est faite de quatre vidéos de l'exploitant
  (`AFFICHES_PADEL`), qui ne se chargent qu'à l'écran.
- **Gbashi bike** est le road trip version sport, avec une séance de sport devant la
  plage à l'arrivée, dans les trois gammes, à son propre prix. **Sur commande depuis
  novembre 2026** : il ne se réserve plus en ligne et ne part plus le dimanche ; les
  clients écrivent sur WhatsApp pour le jour qui leur convient. Jusqu'au 8 novembre 2026,
  le road trip du dimanche se vendait sous ce nom (`DERNIER_GBASHI_DU_DIMANCHE`) : ces
  réservations le gardent dans l'admin et les emails.
- **Road trip** est la sortie du samedi et du dimanche matin, en Premium ou Prestige
  seulement ;
  **location libre** le vélo à l'heure, dans les trois gammes.
- **Octobre rose** n'existe qu'en octobre de l'année de la campagne. Tout se règle
  dans `src/data/octobre-rose.ts` : la date, le rassemblement, le départ et le
  retour à la minute près, le prix en ligne (le même pour tous les vélos ; au
  comptoir, 125 F de moins), la tenue, l'itinéraire et l'heure limite des
  inscriptions en ligne. `sortie: null` tant que rien n'est fixé : la carte et
  l'annonce disent « date annoncée très bientôt » et renvoient vers WhatsApp.
- **L'inscription** se fait sur `/octobre-rose` : combien de personnes (cinq au
  plus par paiement), les coordonnées, l'opérateur Mobile Money, et l'on paie. Pas
  de vélo à choisir : le dépôt attribue un vélo libre par participant, dans la
  transaction qui écrit (le Classique d'abord, le Prestige en dernier). Les places
  sont les vélos en état et libres du rassemblement au retour (16 h - 19 h) ; la
  location libre ne peut pas empiéter sur ces heures ce jour-là. Plus de place,
  l'heure limite passée, ou l'inscription fermée depuis le tableau de bord (ligne
  « Octobre rose » des départs) : la page et la carte affichent « Sold out » et
  renvoient vers WhatsApp. Le paiement suit le chemin de toute réservation, et
  l'email de confirmation, aux couleurs d'Octobre rose, donne le rendez-vous, la
  tenue, le point de départ, l'itinéraire et la facture.
- Sa carte ouvre la page Nos produits, et une annonce s'ouvre une fois sur le site
  public, jamais sur la réservation et le suivi, les fiches vélo, la page Nos
  produits, la page Octobre rose, les CGV, les mentions légales ni la page des
  données personnelles. Tant que l'inscription est ouverte, son bouton y mène.
  La carte et l'annonce s'effacent d'elles-mêmes au départ du groupe, heure du
  Bénin, sans redéploiement : la saison est relue dans le navigateur, même sur une
  copie de la page en cache. Pour l'octobre suivant, changer l'année et la sortie.
  L'offre `OCTOBRE_ROSE` s'ajoute à l'énumération des offres par
  `prisma/octobre-rose.sql`.

Une carte dont le départ est fermé dans le tableau de bord propose WhatsApp au lieu
de la réservation en ligne. Ses boutons « Réserver » retiennent le produit choisi le
temps de la visite : la fiche vélo ouvre son encart dessus (le road trip du samedi, ou
la location libre). Les produits sur commande montrent le numéro WhatsApp en clair, à
côté du bouton « Commander sur WhatsApp ».

---

## Démarrer

```bash
npm install
npm run dev
```

Puis <http://localhost:3000>.

**Aucune configuration n'est nécessaire pour voir le site.** Sans `DATABASE_URL`,
l'application démarre en mode démonstration, sur un jeu de données en mémoire qui
rend le site et le tableau de bord entièrement navigables, paiement simulé
compris.

L'espace d'exploitation est à <http://localhost:3000/admin>. En développement il
s'ouvre sans mot de passe. **En production il refuse l'accès tant que
`ADMIN_PASSWORD` n'est pas défini**, et personne n'entre, pas même le
propriétaire.

### Les commandes

```bash
npm run build          # construction de production
npm run start          # serveur de production
npm run typecheck      # TypeScript, sans émission
npm run lint           # ESLint
npm run db:push        # applique le schéma Prisma à la base
npm run db:seed        # verse le catalogue en base
npm run db:sauvegarde  # exporte toute la base en JSON dans sauvegardes/
```

---

## Tarification

Trois gammes. Le vélo détermine la gamme, la gamme détermine le prix. Tout est
dans [`src/data/offres.ts`](src/data/offres.ts), seule source de vérité : le
widget, le tunnel, l'API et l'admin lisent la même grille.

### Location libre, en francs CFA

| Durée | Classique | Premium | Prestige |
|---|---|---|---|
| 1 h | 1 125 | 1 625 | 2 125 |
| 2 h | 2 125 | 3 125 | 4 125 |
| 3 h | 3 125 | 4 625 | 6 125 |
| 4 h | 3 625 | 5 625 | 7 125 |

### Road trip encadré, par personne

| Gamme | Road trip, samedi et dimanche (en ligne) | Gbashi bike (sur commande) |
|---|---|---|
| Classique | pas de road trip | 3 500 |
| Premium | 3 125 | 4 000 |
| Prestige | 3 625 | 4 500 |

Padel bike : un prix par personne, quel que soit le vélo, le même en ligne et au
comptoir, réglé sur `/admin/reglages` (3 500 F au lancement).

Eau et **deux cocos offertes par personne** au retour, quelle que soit la gamme
(`COCOS_ROAD_TRIP`, décision du gérant de novembre 2026).

**Le road trip du samedi se roule en Premium ou Prestige** (décision du gérant, novembre
2026) : le Classique n'a pas de prix dans `PRIX_ROAD_TRIP_XOF`, et une gamme sans prix ne
roule pas ce départ (`roadTripPossible`, `motifRoadTripGamme`). Le site ne le lui propose
pas, le tunnel, l'API et le comptoir le refusent avec le motif, et les réservations déjà
prises gardent leur montant. Le Classique garde la location libre. Le dimanche matin
suit les mêmes règles que le samedi depuis le 9 novembre 2026.

**Le road trip du samedi se fait en groupe de 10 personnes au moins** (décision du gérant,
novembre 2026, `PERSONNES_MIN_ROAD_TRIP` et `personnesMin` sur le créneau). Une
réservation, en ligne comme au comptoir, compte 10 personnes au moins, un vélo de la gamme
choisie par personne (`motifGroupeRoadTrip`, code `GROUPE`). Une gamme qui a moins de 10
vélos en état ne propose pas le road trip (`sortieEncadreeDe(gamme, velosEnEtat)`) : avec
un seul vélo, le Prestige ne le propose plus. Un départ où il reste moins de 10 vélos
libres de la gamme s'affiche « Sold out » pour elle (`departsDeLaGamme`). Gbashi bike,
sur commande, n'a pas ce minimum.

Ces tarifs comprennent 125 F de frais du paiement en ligne, par location libre et par
personne en road trip (`FRAIS_PAIEMENT_EN_LIGNE_XOF`). **Au comptoir, en espèces, on paie
le prix de la plaquette**, ces 125 F en moins : 1 000 F l'heure en Classique, 3 000 F le
road trip Premium. Seule une vente saisie dans l'administration y a droit. Gbashi bike,
vendu sur commande, ne porte pas ces frais : le comptoir l'enregistre à son prix.

Le road trip part sur un créneau fixe, le samedi et le dimanche de 8 h à 11 h ; chaque
créneau s'ouvre et se ferme depuis le tableau de bord. **Un départ fermé
reste affiché, « Sold out »** : le créneau entier ou ce jour seulement, il paraît à sa date
dans la fiche vélo, le formulaire et la page Nos produits, sans pouvoir être choisi, et le
départ ouvert suivant reste proposé (`departsComplets`).

**Chaque départ de road trip se ferme la veille à 22 h**, heure du Bénin : le samedi le
vendredi à 22 h, chaque semaine. Le road trip ne se réserve
pas non plus en ligne entre 22 h et 8 h. Le site le signale et le serveur refuse la
réservation ; un paiement déjà commencé, lui, peut se terminer.

**La location libre se réserve à toute heure**, la nuit comprise. Le samedi et le
dimanche, elle commence à 11 h, après le road trip de 8 h à 11 h, et le jour
même seules les heures à venir sont proposées. Toutes les règles horaires sont lues à
l'heure de Cotonou (UTC+1), pas sur l'horloge du serveur.

**Rappel de la veille** : chaque soir à 18 h (heure du Bénin), une tâche planifiée de
Vercel (`vercel.json`, `/api/cron/rappels`) écrit aux clients qui partent le lendemain.
Chaque rappel ne part qu'une fois, marqué en base (`Booking.reminderSentAt`).
`CRON_SECRET` est obligatoire : sans lui la tâche ne tourne pas, avec lui seule la
tâche planifiée de Vercel peut l'appeler.

## Site public et administration séparés

Le même dépôt alimente deux projets Vercel, branchés sur la même base :

| Projet | `BIKELAND_ROLE` | Sert |
|---|---|---|
| bike-land | `site` | le site public, le webhook SasPay, les rappels |
| projet d'administration | `admin` | /admin et ses API, rien d'autre |

Sur le site, /admin répond « page introuvable ». Sur l'administration, la racine mène à
/admin et les pages publiques renvoient vers le site. Sans `BIKELAND_ROLE`, un
déploiement sert les deux (`src/proxy.ts`, `src/lib/deploiement.ts`).

Variables propres à la séparation : `ADMIN_URL` (adresse de l'administration, pour les
liens des emails ; variable du serveur, jamais envoyée aux visiteurs),
`REVALIDATION_SECRET` (identique sur les deux projets : l'administration demande au
site de rafraîchir ses pages après un changement, par `/api/revalider`) et
`ADMIN_SESSION_SECRET` (projet d'administration seulement : signe les sessions et
chiffre le secret de double authentification).

Les ventes en espèces partent du projet d'administration : il lui faut aussi
`BOOKING_TOKEN_SECRET`, **avec la même valeur que sur le site** (sinon le lien de suivi
envoyé au client ne s'ouvre pas sur le site), `NEXT_PUBLIC_SITE_URL` (l'adresse du site,
pour ce lien), `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_EXPEDITEUR` et `ADMIN_EMAIL`
(sinon la confirmation, la facture et l'avis au gérant ne partent pas ; l'écran le dit et
propose de renvoyer la facture).

Toute page de l'administration exige une session valide, vérifiée par le proxy et par la
page elle-même : un gabarit ne suffit pas, Next pouvant rendre une page sans lui.

Les essais de connexion, de code et les envois du formulaire de contact sont comptés
dans la table `CompteurEssais`, commune à tous les serveurs (`prisma/durcissement.sql`).

La connexion à l'administration peut exiger un code à six chiffres (double
authentification, page « Sécurité du compte ») ; le secret est rangé chiffré dans la
table `ParametreAdmin` (`prisma/securite-admin.sql`).

## Photos des vélos

Le formulaire d'ajout de l'admin dépose photos et vidéos dans Vercel Blob
(`BLOB_READ_WRITE_TOKEN`, ajoutée par Vercel en connectant le stockage au projet) et
lit la fiche technique des affiches pour remplir la fiche du vélo
(`src/lib/lecture-affiche.ts`).

Les prix
ne sont pas arrondis : ils sont affichés tels quels, à l'unité.

Le parc compte six vélos Classique, quatre Premium et un Prestige.

---

## Parrainage

Un partenaire reçoit un code. Le client qui le saisit obtient **1 %** de
réduction, le partenaire **5 %** de commission sur le montant réellement payé.

L'utilisation ne compte pour le partenaire **qu'après un paiement abouti**. Elle
suit trois états : `EN_ATTENTE` à la réservation, `VALIDE` à la confirmation du
paiement, `ANNULE` si la réservation tombe. Une réservation abandonnée ne
rémunère donc personne, et le quota du code est rendu.

La réduction est plafonnée pour que le montant reste au-dessus du minimum
encaissable par l'opérateur.

---

## Architecture

```
src/
├── app/
│   ├── (site)/          Site public, porte l'en-tête et le pied de page
│   ├── admin/
│   │   ├── connexion/   Page de connexion, hors périmètre protégé
│   │   └── (protege)/    Tableau de bord et gestion, session obligatoire
│   └── api/             Réservations, paiement, webhook, parrainage, admin
├── components/
│   ├── accueil/         Sections de la page d'accueil, vélo 3D, carrousel
│   ├── admin/           Navigation, calendrier du parc, contrôles d'édition
│   ├── graphiques/      Graphiques SVG écrits à la main
│   └── reservation/     Calendrier, tunnel, suivi, avis
├── data/
│   ├── catalogue.ts     Le parc, les points de retrait
│   └── offres.ts        Gammes, grille horaire, créneaux de road trip
└── lib/
    ├── db/              Couche de données, deux implémentations
    ├── saspay.ts        Client SasPay, signature de webhook
    ├── parrainage.ts    Réduction client et commission partenaire
    ├── statistiques.ts  Indicateurs du tableau de bord
    ├── tokens.ts        Liens de suivi signés
    └── email.ts         Gmail par SMTP
```

### La couche de données

Aucune page n'importe Prisma. Tout passe par `depot`
([`src/lib/db/index.ts`](src/lib/db/index.ts)), qui choisit son implémentation au
premier appel : `postgres.ts` si `DATABASE_URL` est défini, `demo.ts` sinon. Les
deux respectent le même contrat et la même règle métier.

Chaque méthode du dépôt PostgreSQL passe par une reprise automatique sur perte de
connexion. Le pooler de Supabase ferme les connexions inactives, et le premier
appel après une accalmie tombe dessus. Sans reprise, un client qui réserve après
une période calme perd sa réservation pour une raison qui n'a rien à voir avec
lui.

### Comment la double réservation est rendue impossible

La contrainte centrale du projet, traitée à trois niveaux :

1. **À l'affichage**, le calendrier désactive les créneaux déjà pris.
2. **Avant l'encaissement**, la disponibilité est revérifiée pour ne pas débiter à
   tort.
3. **À l'écriture**, l'insertion se fait dans une transaction PostgreSQL en niveau
   `Serializable`, qui relit le conflit à l'intérieur de la transaction. C'est le
   seul niveau qui empêche le *write skew* : deux clients qui paient à la même
   seconde ne peuvent pas lire tous les deux « aucun conflit » puis écrire. Le
   second reçoit un `409` et un message clair.

Depuis que la disponibilité se compte à l'heure, deux sorties peuvent partager la
même journée : le chevauchement se calcule sur les heures, pas sur les dates.

---

## Variables d'environnement

Copiez `.env.example` en `.env`. Aucune n'est requise pour démarrer.

| Variable | Effet si absente |
|---|---|
| `DATABASE_URL` | Mode démonstration, données en mémoire |
| `BOOKING_TOKEN_SECRET` | Secret aléatoire par processus en démo, **obligatoire** dès qu'une base est configurée |
| `NEXT_PUBLIC_SITE_URL` | `https://bikeland.bj`, sert aux emails et aux métadonnées |
| `SASPAY_API_KEY` | Paiement simulé en développement, **refusé en production** |
| `SASPAY_WEBHOOK_SECRET` | Le webhook rejette tout, ce qui est le comportement voulu |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Emails journalisés dans la console au lieu d'être envoyés |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `/admin` ouvert en développement, **fermé en production** |

`PAIEMENT_DEMO_AUTORISE=true` force le mode démonstration en production. Il
existe pour les vitrines de démonstration délibérées, et pour elles seules : avec
cette variable, le site confirme des réservations sans encaisser.

En production, toutes les variables de secret sont posées en `sensitive` sur
Vercel : leur valeur ne se relit plus depuis l'interface, y compris par le
propriétaire du projet.

---

## Paiement

**SasPay**, en Mobile Money, sur les trois opérateurs du pays : MTN, Moov et
Celtiis. La carte bancaire n'est pas proposée, elle est très minoritaire au Bénin.

La demande est poussée sur le téléphone du client, qui la valide. Aucune
coordonnée de paiement ne transite par le serveur.

La confirmation ne vient **jamais** du navigateur seul. Elle vient du webhook ou
d'une vérification auprès de SasPay, et la réservation reste
`EN_ATTENTE_PAIEMENT` tant que le paiement n'est pas constaté. Confirmer sur la
foi d'une redirection reviendrait à donner un vélo à qui n'a pas payé.

Le webhook vérifie une signature HMAC-SHA256 calculée sur `horodatage.corps`,
avec une tolérance de cinq minutes. Signature absente, falsifiée, horodatage
périmé ou corps modifié après signature : tout est rejeté en `401`.

Un panier non payé expire au bout de trente minutes et libère le vélo.

---

## Emails

[`src/lib/email.ts`](src/lib/email.ts) envoie par SMTP Gmail, avec un mot de
passe d'application. Sans identifiants, le contenu complet est journalisé dans la
console, ce qui permet de le relire en développement.

Bike Land reçoit une notification **après confirmation du paiement**, pas à la
réservation, avec le nom, l'email, le téléphone, le vélo, les dates, le montant,
le code de parrainage et les références de transaction. Le formulaire de contact
écrit directement à Bike Land, avec l'adresse du visiteur en `replyTo`.

---

### Réglages des produits

Ce que l'exploitant change lui-même, sans passer par le code, est décrit dans
[`src/data/reglages.ts`](src/data/reglages.ts) : pour chaque produit, une interface,
les valeurs par défaut, un schéma de validation et une clé. Les réglages enregistrés
sont rangés en JSON dans la table `ParametreAdmin` (clé `reglages:padel-bike`), sur
les valeurs par défaut : sans ligne, rien ne change. La page `/admin/reglages` les
enregistre (`/api/admin/reglages`, session d'administration exigée), puis demande au
site public de se régénérer.

Le prix et les heures ne viennent jamais de l'appelant : la couche de données relit
les réglages au moment d'écrire la réservation. Chaque réservation garde ce qu'on lui
a vendu : son prix, et pour une sortie réglée à la minute, son horaire exact
(`Booking.startTime`, `endTime`). Changer un réglage ne touche donc aucune
réservation déjà prise. Padel bike a ses réglages ; les autres produits suivront le
même modèle.

## Déploiement

**Vercel** pour le site et les routes d'API, **Supabase** pour PostgreSQL.

Une modification de la base s'applique en production **avant** le déploiement du
code qui s'en sert, par son fichier SQL purement additif dans `prisma/` : par
exemple `prisma/sorties-sur-commande.sql` (offres Gbashi bike et Padel bike, horaire
exact des réservations), sans lequel Prisma ne pourrait plus lire les réservations.

Deux réglages comptent, et ils ont chacun coûté une panne :

- **`DATABASE_URL` sur le port 6543**, le pooler en mode transaction, avec
  `?pgbouncer=true&connection_limit=3`. Sur le port 5432, le pooler en mode
  session plafonne à quinze connexions et le site s'effondre vers soixante
  visiteurs simultanés.
- **Les fonctions dans la même région que la base**, déclarée dans
  [`vercel.json`](vercel.json). Avec la base à Londres et les fonctions à
  Washington, chaque requête traversait l'Atlantique, et une transaction
  `Serializable` en fait plusieurs.

Mesuré en production après ces deux réglages, sur une route qui interroge la base
à chaque appel : 300 requêtes simultanées, 300 réponses en `200`, aucune erreur.

Les pages du site sont servies depuis le cache du CDN et ne consomment ni
invocation ni connexion à la base.

---

## Identité visuelle

Noir, craie, et un seul accent orange. L'orange ne sert qu'à ce qui appelle une
action ou porte un prix : un accent qui signale partout ne signale plus rien.

- **Typographies** : *Oswald* pour les titres, condensée et affirmée, *Inter* pour
  le texte courant.
- **Les vélos sont filmés**, pas illustrés. Chaque carte du catalogue porte une
  vidéo qui démarre quand elle entre à l'écran et s'arrête quand elle en sort,
  sur ordinateur comme sur téléphone. Onze vidéos lancées ensemble feraient
  télécharger vingt mégaoctets d'un coup : seules les vidéos réellement visibles
  se chargent, les autres restent sur leur affiche, qui est le premier plan de la
  vidéo elle-même.
- `prefers-reduced-motion` est respecté partout : la vidéo reste alors figée et
  rien ne bouge.

### Les couleurs des graphiques ont été validées, pas choisies à l'œil

La palette du tableau de bord est passée par un validateur : bandes de clarté,
plancher de chroma, séparation sous protanopie et deutéranopie, contraste sur le
fond. Les catégories nominales sont tracées d'une seule teinte : leur longueur
porte la magnitude, leur libellé porte l'identité. Colorer chaque barre selon sa
valeur re-encoderait en couleur ce que la barre dit déjà.

Chaque graphique propose un tableau de valeurs dépliable : l'information n'est
jamais accessible par la seule couleur.

---

## Décisions techniques et leurs raisons

| Décision | Raison |
|---|---|
| Montants en **entiers de FCFA** | Le franc CFA n'a pas de subdivision en usage, aucun arrondi flottant à gérer |
| Prix non arrondis | 1 125 et 3 125 sont les prix décidés, les afficher autrement serait mentir sur le montant débité |
| Une seule source de prix | `offres.ts` sert au widget, au tunnel, à l'API et à l'admin : le prix affiché est celui qui sera encaissé |
| Le prix envoyé par le client est **ignoré** | Il est recalculé côté serveur à partir du vélo et de la durée |
| Durées limitées à la grille publiée | Aucun tarif ne peut être inventé par l'appelant |
| Jeton de suivi haché en base | Une copie de la base ne permet pas de forger un lien vers une réservation |
| Champ piège plutôt que captcha | Rien à charger, rien à résoudre, aucune donnée envoyée à un tiers |
| Graphiques SVG écrits à la main | Six graphiques ne justifient pas 150 ko de bibliothèque |
| Carrousel sans bibliothèque | Défilement natif et `scroll-snap` suffisent, et se comportent correctement au clavier |
| Photos du carrousel lues dans un dossier | On dépose un fichier dans `public/carrousel`, il apparaît. Aucune liste à tenir dans le code. |
| Avis non modifiables à la modération | Un avis retouché ne vaut plus rien pour celui qui le lit. Publier ou retirer, rien d'autre. |

---

## Ce qui reste à faire

1. **Numéros RCCM et IFU**, à renseigner dans
   [`src/lib/site.ts`](src/lib/site.ts). Tant qu'ils sont vides, les mentions
   légales annoncent qu'ils seront publiés dès attribution. Les publier est une
   obligation pour une activité commerciale au Bénin.
2. **Basculer le compte SasPay en `DEDUCTED`**. Aujourd'hui les frais de 3,25 %
   s'ajoutent au montant, et le client paie au-dessus du prix affiché.
3. **Emails de rappel avant le départ**, à brancher sur une tâche planifiée.
4. **Nom de domaine**, à souscrire et à rattacher.
5. **Multilingue**, les textes sont centralisés mais pas externalisés.
6. **Alléger la page d'accueil**, 129 ko de HTML est lourd pour une connexion
   mobile béninoise.

---

## Licence et propriété

Projet privé. **Bike Land et l'ensemble de ses contenus, textes, identité
visuelle, photographies, vidéos et choix éditoriaux sont la propriété de SIBI
IBRAHIM KHALIL.** Toute reproduction ou réutilisation, totale ou partielle, sans
autorisation écrite préalable est interdite.
