# PagQUIZ ⚽

Jeu de soirée en temps réel. Tu poses une question (« Cite un joueur qui a joué au Real Madrid »),
tes amis ont **1 minute** pour répondre depuis leur téléphone, et les réponses s'affichent
en direct sur ton écran. Les **doublons** (une réponse déjà donnée par quelqu'un) sont
signalés en rouge — à toi de décider si tu élimines le joueur.

## Lancer le jeu en ligne (recommandé)

Dans le Terminal, depuis ce dossier :

```bash
cd ~/QUIZZBARCA
./go-online.sh
```

Le script affiche :

- **Lien JOUEURS** — à partager à tes amis (ils ouvrent le lien, choisissent un pseudo).
- **Lien ANIMATEUR** — pour toi, se termine par `/host`.
- **Jeton animateur** — le code à taper sur l'écran animateur pour te connecter.

> Le lien public est fourni gratuitement par Cloudflare (aucun compte). Il reste valide
> tant que le script tourne sur ton Mac. Ferme avec **Ctrl+C**. À chaque relance, un nouveau
> lien et un nouveau jeton sont générés.

## Lien permanent (marche même Mac éteint)

Le code est déjà sur GitHub : `dueloquizz-max/pagquiz` (privé).
Pour le mettre en ligne gratuitement sur **Render** :

1. Va sur **https://render.com** → **Get Started** → **Sign in with GitHub**
   (choisis le compte `dueloquizz-max`).
2. En haut à droite : **New +** → **Blueprint**.
3. Choisis le dépôt **pagquiz** (autorise Render à y accéder si demandé) → **Connect**.
4. Render lit `render.yaml` et te demande une valeur pour **HOST_TOKEN** :
   tape ton code animateur (ex : `soiree2026`) — c'est ce que tu taperas sur l'écran animateur.
5. Clique **Apply** / **Create** et attends ~2-3 min (première mise en ligne).

Ton lien sera du type `https://pagquiz.onrender.com` :

- **Joueurs**   : `https://pagquiz.onrender.com/`
- **Animateur** : `https://pagquiz.onrender.com/host` (tape ton HOST_TOKEN)

> ⚠️ Sur le plan gratuit, le service « s'endort » après ~15 min sans visite : le tout
> premier accès peut mettre ~50 s à réveiller le serveur. Ouvre le lien animateur une
> minute avant de commencer, et c'est réglé.

### Mettre à jour le jeu plus tard
Après une modification, dans le Terminal :
```bash
cd ~/QUIZZBARCA && git add -A && git commit -m "maj" && git push
```
Render redéploie tout seul en quelques minutes.

## Jouer sur le même Wi-Fi (sans internet)

Si tout le monde est dans la même pièce :

```bash
cd ~/QUIZZBARCA
npm start
```

Puis les téléphones du même Wi-Fi ouvrent `http://TON-IP-LOCALE:3000/`
(le terminal indique l'adresse ; ton IP actuelle est `192.168.0.13`).

## Comment ça marche

### Écran animateur (`/host`)
1. Tape le **jeton** affiché dans le terminal.
2. Écris ta question, choisis la durée (60 s par défaut), clique **Lancer la manche**.
3. Regarde les réponses arriver en direct sous chaque joueur.
   - Les réponses identiques sont **pré-signalées en rouge** automatiquement.
   - **Clique sur n'importe quelle réponse** pour la marquer ou la démarquer comme doublon
     toi-même (indispensable pour les fautes d'orthographe ou les synonymes que le jeu ne
     repère pas tout seul, ex. « PSG » et « Paris Saint-Germain »).
4. Clique **Éliminer** sur un joueur si tu décides de le sortir (ou **Réintégrer**).
5. **Arrêter** stoppe le chrono ; **Nouvelle partie** efface tout et relance à zéro.

### Écran joueur (`/`)
1. Choisis un pseudo.
2. Quand tu lances une manche, le joueur voit la question + le chrono + un champ texte.
3. Il envoie autant de réponses qu'il veut avant la fin du temps.

## Règles intégrées
- Doublon auto = réponse déjà donnée **par n'importe qui** dans la manche (casse et accents ignorés :
  « Zidane », « ZIDANE » et « zidané » comptent pareil).
- **Le dernier mot te revient** : tu peux cliquer une réponse pour la (dé)marquer comme doublon,
  ce qui règle les orthographes différentes et les synonymes.
- Le joueur signalé en doublon n'est **pas** éliminé automatiquement : c'est toi qui choisis.
- Un joueur éliminé ne peut plus répondre jusqu'à la manche suivante.

## Fichiers
- `server.js` — serveur temps réel (Node, zéro dépendance).
- `public/host.html` — écran animateur.
- `public/player.html` — écran joueur.
- `go-online.sh` — lance le serveur + le lien public.
