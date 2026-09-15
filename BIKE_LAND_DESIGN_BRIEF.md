# Bike Land — Brief de design et de développement du site vitrine

> À poser à la racine du repo. Lire intégralement avant d'écrire la moindre ligne de code.

---

## 1. Le produit

**Bike Land** loue des vélos et organise des tours/balades guidés à vélo, dans la région de Cotonou / Abomey-Calavi (Bénin).

Ce n'est **pas** une boutique en ligne. On ne vend pas de vélos, on n'a pas de panier, pas de fiche produit avec variantes, pas de WooCommerce. Le site a exactement trois jobs, dans cet ordre :

1. **Faire réserver** un vélo ou une place sur un tour.
2. **Rassurer** : à quoi ressemblent les vélos, combien ça coûte vraiment, comment on récupère et rend le vélo.
3. **Donner envie** : les tours sont le produit à marge et le produit à photo.

Audience : jeunes actifs et étudiants de Cotonou/Calavi, expatriés, voyageurs de passage. **Majoritairement sur mobile, souvent en connexion moyenne.** Le mobile n'est pas une adaptation du desktop : c'est la vue principale, elle se conçoit en premier.

CTA principal du site, présent partout : **Réserver un vélo**.

---

## 2. Direction artistique

La référence visuelle est un site de bike shop en noir et orange (capture fournie par le client). On en garde **l'énergie et le contraste**, pas la mise en page. Ce qu'il faut en retenir :

- Fond noir dominant, blocs de couleur vive en aplat pleine largeur.
- Le vélo est détouré et posé sur l'aplat, il déborde de son bloc — l'objet est le héros, pas le texte.
- Alternance franche de sections sombres et de sections claires, sans transition douce.
- Zéro dégradé décoratif, zéro ombre portée molle.

Ce qu'on **ne reprend pas** : la barre d'annonces en haut, la mégamenu e-commerce, la grille de trois cartes « Facilities & Features » avec picto + lorem, les blocs numérotés 01/02/03/04.

### Tokens couleur

```
--noir-piste    #0E0E0E   fond principal
--noir-releve   #1A1A1A   surfaces surélevées sur fond noir
--craie         #F2EFE9   fond des sections claires, texte sur noir
--orange-signal #F25C05   accent unique : CTA, prix, états actifs
--vert-lagune   #1F6F5C   accent secondaire, réservé aux tours
--gris-cadre    #6B6B6B   texte secondaire, bordures
```

L'orange est un **signal**, pas une décoration : il marque uniquement ce sur quoi on peut cliquer pour avancer, et les prix. S'il apparaît sur un élément non actionnable, c'est une erreur.

Le vert lagune sépare visuellement l'univers « tours » de l'univers « location ». Deux offres, deux couleurs, l'utilisateur doit pouvoir les distinguer d'un coup d'œil sans lire.

### Typographie

Deux familles, franchement distinctes :

- **Titres** : une grotesque condensée à graisse lourde (Archivo Condensed, Oswald, ou Bebas Neue). Grande taille, interlettrage serré, casse phrase — **pas de capitales**. Le titre est un élément graphique, il peut déborder, être coupé par une image, sortir de la grille.
- **Texte courant** : une sans-serif neutre et lisible en petit corps (Inter, Source Sans 3). Longueur de ligne sous 70 caractères.

Interdits, ce sont des tics reconnaissables :
- Les eyebrows en capitales espacées au-dessus de chaque titre.
- Un seul mot du titre coloré en orange.
- Une flèche « → » collée dans le texte des boutons.
- La numérotation 01/02/03 sur des contenus qui ne sont pas une séquence.

### Grille et rythme

Grille 12 colonnes, gouttière 24px, largeur max 1280px — mais **les sections héros et les aplats de couleur cassent la grille et vont bord à bord**. C'est ce contraste contenu-contenu/plein-écran qui donne l'énergie du modèle.

Angles droits partout. Un seul rayon autorisé : les boutons, 2px, pas plus.

### Mouvement

Un seul moment orchestré sur toute la page : à l'arrivée, le vélo du héros entre depuis la droite pendant que l'aplat orange se déploie. C'est tout.

Pas de fade-and-slide-up sur chaque section au scroll. Pas de transition hover sur chaque carte. Le reste du mouvement répond uniquement à une action de l'utilisateur : ouverture du calendrier, ajout d'une option, confirmation. `prefers-reduced-motion` respecté.

---

## 3. Structure de la page d'accueil

**A. Header**
Logo Bike Land (silhouette de cycliste) à gauche. Navigation : Vélos · Tours · Tarifs · Contact. Bouton « Réserver » en orange, plein, à droite. Sur mobile : logo + bouton Réserver visibles en permanence, le reste dans un menu. Header collant qui passe en fond noir opaque après 80px de scroll.

**B. Héros — plein écran, fond noir**
Aplat orange vertical décentré sur la droite, un vélo détouré posé dessus qui déborde du bloc. À gauche : titre sur deux lignes, une phrase de contexte (une seule), le tarif d'appel en gros — « à partir de X FCFA / jour » — et deux boutons : « Réserver un vélo » (plein orange) et « Voir les tours » (contour blanc).

Pas de carrousel. Un seul message.

**C. La flotte**
Les catégories réellement disponibles — VTT, vélo de ville, vélo à assistance électrique, vélo enfant. Pour chacune : photo réelle, une ligne de description utile (« pour les pistes de la lagune », pas « qualité premium »), le tarif jour et le tarif semaine. Le tarif est toujours visible sans clic.

**D. Les tours — section fond vert lagune, bord à bord**
2 à 4 itinéraires. Pour chacun : nom du parcours, distance, durée, niveau de difficulté, prix par personne. Une carte du tracé si possible.

Cette section est la plus soignée du site : grandes photos, écriture au présent, on décrit ce qu'on voit en route. C'est le produit qu'on veut vendre.

**E. Comment ça marche — fond craie**
Ici, et seulement ici, la numérotation est justifiée parce que c'est vraiment une séquence : choisir la date → passer prendre le vélo → rouler → rendre. Quatre étapes, une phrase chacune, aucune illustration décorative.

Cette section doit répondre aux vraies questions d'un premier client : caution demandée, pièce d'identité, casque et antivol fournis ou non, horaires de retrait, que faire en cas de crevaison.

**F. Réservation**
Le cœur du site. Formulaire court : type de vélo, date de début, durée, point de retrait, nom, téléphone. Puis confirmation par WhatsApp.

Pas de compte à créer. Pas de paiement en ligne à ce stade : le paiement se fait à la remise du vélo (espèces ou Mobile Money). Le formulaire doit fonctionner en une seule vue sur mobile, sans scroll horizontal, avec des champs assez grands pour le pouce (44px minimum).

**G. Zone couverte**
Carte simple des points de retrait à Cotonou et Abomey-Calavi, avec les horaires.

**H. Footer — fond noir**
Contact, WhatsApp, Instagram/TikTok, horaires, mentions légales.

---

## 4. Contraintes techniques

- **Stack** : à confirmer avec le client avant de commencer. Par défaut : Astro ou Next.js en statique, Tailwind avec les tokens ci-dessus définis dans la config. Site statique, pas de CMS pour la v1.
- **Poids** : la page d'accueil doit se charger en moins de 3 s sur une 3G. Images en WebP, `srcset` obligatoire, lazy loading sur tout ce qui est sous la ligne de flottaison. Les photos de vélos détourés sont le poste le plus lourd : les compresser agressivement.
- **Accessibilité** : contraste AA minimum — attention, l'orange #F25C05 sur noir passe pour du texte large mais **pas** pour du texte courant, ne pas l'utiliser en corps de texte. Focus clavier visible. Formulaire entièrement navigable au clavier, labels réels, pas de placeholder en guise de label.
- **SEO local** : balises en français, `hreflang="fr-BJ"`, données structurées `LocalBusiness`, mentions explicites de Cotonou et Abomey-Calavi.
- **Contenu** : écrire de vraies phrases françaises, pas de lorem ipsum. Là où une donnée manque (tarif exact, adresse du point de retrait), mettre un placeholder évident en majuscules du type `[TARIF À CONFIRMER]` et le lister en fin de travail, plutôt que d'inventer un chiffre.

---

## 5. Méthode

Avant de coder : produire un plan de design court — palette, typo retenue avec justification, wireframe ASCII de la page d'accueil en version mobile puis desktop. Le soumettre au client.

Relire ce plan contre le brief : toute partie qui ressemble à ce qu'on produirait pour n'importe quel site de location doit être reprise, en expliquant ce qui change et pourquoi.

Coder ensuite, section par section, en prenant une capture d'écran après chaque section pour se critiquer.

---

## 6. Le test final

Un client qui arrive sur mobile, sans rien connaître de Bike Land, doit pouvoir comprendre le tarif et envoyer une demande de réservation **en moins de 30 secondes et sans jamais faire défiler horizontalement**. Si ce n'est pas le cas, le design a échoué, quelle que soit sa beauté.
