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
| Catalogue | `/velos` | Les onze vélos groupés par gamme, chacun présenté par une vidéo |
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

`/admin`, protégé par mot de passe. Tableau de bord, sortie du jour, réservations,
parc, clients, avis à modérer, partenaires et codes de parrainage. Le parc
s'édite depuis l'interface : ajouter un vélo, le mettre en entretien, le retirer,
changer sa gamme.

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

### Road trip encadré

| Gamme | Prix | Cocos offertes |
|---|---|---|
| Classique | 2 625 | 1 |
| Premium | 3 125 | 2 |
| Prestige | 3 625 | 2 |

Le road trip part sur un créneau fixe, le samedi et le dimanche de 8 h à 11 h (chaque
créneau s'ouvre et se ferme depuis le tableau de bord).

**Chaque départ de road trip se ferme la veille à 22 h**, heure du Bénin : le samedi le
vendredi à 22 h, le dimanche le samedi à 22 h, chaque semaine. Le road trip ne se réserve
pas non plus en ligne entre 22 h et 8 h. Le site le signale et le serveur refuse la
réservation ; un paiement déjà commencé, lui, peut se terminer.

**La location libre se réserve à toute heure**, la nuit comprise. Le samedi et le
dimanche, elle commence à 11 h, les vélos étant en road trip de 8 h à 11 h, et le jour
même seules les heures à venir sont proposées. Toutes les règles horaires sont lues à
l'heure de Cotonou (UTC+1), pas sur l'horloge du serveur.

**Rappel de la veille** : chaque soir à 18 h (heure du Bénin), une tâche planifiée de
Vercel (`vercel.json`, `/api/cron/rappels`) écrit aux clients qui partent le lendemain.
Chaque rappel ne part qu'une fois, marqué en base (`Booking.reminderSentAt`). Définir
`CRON_SECRET` sur Vercel réserve cette adresse à la tâche planifiée.

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

## Déploiement

**Vercel** pour le site et les routes d'API, **Supabase** pour PostgreSQL.

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
| Prix non arrondis | 1 125 et 2 625 sont les prix décidés, les afficher autrement serait mentir sur le montant débité |
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
