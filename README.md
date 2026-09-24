# WoW OpenCode

Un client **OpenCode dans World of Warcraft: Forever** : ouvre un dossier, crée ou reprends une session, discute avec ton agent pendant que tu joues et reçois ses notifications en jeu.

Basé sur [chelinho139/wow-claude](https://github.com/chelinho139/wow-claude), sous licence MIT. Le transport spécifique à WoW, le chat, les liens d’objets et les notifications proviennent de ce projet. Le backend a été remplacé par l’API HTTP/SSE d’OpenCode.

## Fonctionnalités

- **Folders** : navigateur de dossiers avec chemin saisissable, dossier parent, pagination et dossiers récents.
- **Sessions** : retrouve les sessions OpenCode du dossier et importe leur conversation.
- **+ New session** : crée une session persistante dans le dossier courant.
- Plusieurs projets et sessions en parallèle, brouillon propre à chaque conversation.
- Texte et activité des outils actualisés pendant la génération ; reconnexion du flux et reprise après redémarrage du bridge sans renvoyer le prompt.
- **Stop** interrompt réellement la session OpenCode.
- Permissions **Allow once / Reject** et réponses aux questions depuis le jeu.
- Notifications : son de chuchotement, écho dans le chat, liens cliquables, compteur de non-lus et barre réduite.
- `/ai` et `/r`, liens d’objets/sorts/quêtes par Shift-clic, contexte du personnage optionnel.
- Compteur de slots, bouton Reload avant épuisement et **aucun reload automatique par défaut**.

## Prérequis

- **Windows**, avec WoW Forever en mode **fenêtré ou sans bordure**, visible à l’écran.
- **Node.js 22.2+**, **Git** et **OpenCode** installés sur ce PC.
- Un fournisseur connecté dans OpenCode et un modèle fonctionnel. Vérifie d’abord qu’une conversation fonctionne avec `opencode` dans un terminal.
- Le transport amont cible Forever **TOC 16001**, testé par son auteur sur le client **1.60.1.69913**.

Cette version a des tests automatisés du Lua, du bridge et du protocole, ainsi qu’un test de l’API d’un vrai serveur **OpenCode 1.18.32**. La validation visuelle et de la capture sur un client WoW Forever réel reste à faire. Il s’agit d’une première version à tester en jeu.

## Installation

Dans **PowerShell** :

```powershell
git clone https://github.com/nicodlz/wow-opencode.git
cd wow-opencode
npm ci
```

Si OpenCode n’est pas encore installé :

```powershell
npm install -g opencode-ai
opencode
```

Connecte ton fournisseur dans OpenCode (`/connect`) et sélectionne un modèle (`/models`). Quitte ensuite OpenCode.

### 1. Installer l’addon

Adapte ces deux chemins : `--wow` est le dossier qui contient **WowB.exe et Interface**, `--project` est ton dossier de travail initial.

```powershell
node setup.js --wow "C:\Games\World of Warcraft\_forever_" --project "C:\dev\mon-projet"
```

Le client Forever peut aussi se trouver dans `_classic_beta_`. Le programme peut essayer de le trouver si tu omets `--wow`. S’il y a plusieurs comptes, ajoute `--account "TON_COMPTE"`.

L’installation copie l’addon, crée `bridge/config.json` et prépare les **200 addons de réception** et leurs fichiers de signal. Les milliers de petits fichiers sont normaux.

**Quitte complètement WoW puis relance-le.** Un simple `/reload` ne suffit pas lors de la première installation. Active **WoW OpenCode** et laisse ses addons « slot » activés.

### 2. Démarrer OpenCode

Dans un premier terminal :

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
```

### 3. Démarrer le bridge

Dans un second terminal, dans le dossier `wow-opencode` :

```powershell
npm start
```

Garde les deux terminaux ouverts pendant que tu joues. `bridge\start-window.cmd` ouvre aussi le bridge dans sa propre fenêtre. Le bridge se relance s’il plante.

### 4. Dans WoW

1. Tape **`/oc`**, puis clique **Connect**.
2. Clique **Folders**, navigue ou colle un chemin, puis **Open this folder**.
3. Une session est créée. Écris en bas et appuie sur **Entrée**. **Shift+Entrée** ajoute une ligne.
4. **Sessions** permet de reprendre une conversation existante du dossier ; **+ New session** en ouvre une autre.
5. Réduis la fenêtre avec **Échap** ou le bouton en haut à droite. Tu seras notifié quand OpenCode répond ou attend ton intervention.

Les dossiers sont ceux du PC sur lequel tournent le bridge et OpenCode. Cette version vise un serveur OpenCode local avec les mêmes chemins que le bridge.

## Commandes utiles

| Commande | Action |
|---|---|
| `/oc` ou `/wow-opencode` | Ouvrir/réduire la fenêtre |
| `/oc folders` | Parcourir les dossiers |
| `/oc sessions` | Reprendre une session OpenCode du dossier |
| `/oc new [nom]` | Nouvelle session |
| `/oc cd <chemin>` | Changer le dossier du chat actuel ; le prochain message commence une nouvelle session |
| `/ai <message>` | Envoyer depuis le chat normal |
| `/r <message>` | Répondre à OpenCode s’il est le dernier à t’avoir écrit |
| `/oc cancel` | Interrompre la tâche en cours |
| `/oc echo short` | Notifications courtes dans le chat (`full`, `off` ou nombre de caractères possibles) |
| `/oc context off` | Ne plus envoyer le contexte du personnage |
| `/oc slots` | Voir la réserve de réception |
| `/oc reload` | Renouveler les slots ; les sessions OpenCode continuent |
| `/oc help` | Toutes les commandes |

Une question OpenCode se répond dans le champ de saisie : numéro d’option ou texte libre, **une ligne par question**. Pour un choix multiple, sépare les numéros par des virgules. **Reject** refuse la question. Une autorisation est accordée pour **cette demande uniquement** ; les permissions habituelles restent gérées par OpenCode.

## Temps réel et limites de WoW

Un addon WoW ne peut pas ouvrir de socket HTTP. Le bridge reçoit les événements OpenCode en SSE, puis les transmet par le transport de `wow-claude` : **pixels à l’écran en sortie**, **addons chargés à la demande en entrée**.

- Mises à jour en jeu environ **toutes les 3–4 secondes** avec la fenêtre ouverte, **10 secondes** en arrière-plan ; les réponses finales disposent aussi d’un signal rapide.
- **200 réceptions par session d’interface**, partagées entre tous les chats. Une réception contient l’état de tous les chats. Les 20 derniers slots sont économisés avec un intervalle plus long.
- Clique **Reload** quand la réserve est basse. Les conversations et tâches OpenCode restent sur le serveur ; l’interface les retrouve ensuite. Il n’y a pas de streaming illimité sans reload.
- 16 conversations ouvertes dans l’addon, 3 tâches simultanées par défaut. Les tâches supplémentaires attendent leur tour.
- Une session déjà en cours dans un autre client ne peut pas être reprise tant qu’elle n’est pas au repos. Les nouvelles tâches lancées depuis un autre client ne sont pas surveillées automatiquement par cet addon.
- La capture nécessite que le jeu reste visible. Le plein écran exclusif et un jeu minimisé ne conviennent pas.

Pour conserver la compatibilité du transport amont, les dossiers techniques de l’addon, les SavedVariables et certains identifiants Lua portent encore le nom **`WoWClaude`**. L’interface et le backend utilisent OpenCode. N’exécute pas le bridge original en même temps sur cette installation.

## Configuration et dépannage

- [Installation Windows détaillée](docs/INSTALL-WINDOWS.md)
- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contribuer et tester](CONTRIBUTING.md)

Si **Connect** échoue, vérifie `opencode serve`, `npm start`, puis le mode fenêtré et la visibilité de WoW. Si les slots manquent, relance `node setup.js` puis **redémarre complètement le jeu**. Le journal est `bridge/bridge.log`.

## Crédits

- [chelinho139/wow-claude](https://github.com/chelinho139/wow-claude), base importée depuis le commit `75dd54b588906cb9cd8d7849bfeaec8affe335ee`.
- [0xInuarashi/wow-forever-codex](https://github.com/0xinuarashi/wow-forever-codex), travaux initiaux sur le transport pixel et le chargement de fichiers dans Forever.
- [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source), branche `forever`, référence des API du client.
- [OpenCode](https://opencode.ai), serveur et API de sessions.

Licence **MIT**, voir [LICENSE](LICENSE). Le screenshot conservé dans `docs/screenshot.jpg` est celui du projet amont, pas une capture de cette version.
