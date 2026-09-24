# Architecture

```text
WoW Forever (Lua)
  ↕ pixels sortants / addons load-on-demand entrants
Bridge Node.js sur Windows
  ↕ HTTP + Server-Sent Events
opencode serve
  ↕ fournisseur configuré dans OpenCode
Modèle + outils
```

## Base amont

Le codec Lua, la capture PowerShell, les signaux WAV, le pool de slots et l’essentiel de l’interface viennent de `chelinho139/wow-claude`, commit `75dd54b588906cb9cd8d7849bfeaec8affe335ee`. Les noms techniques `WoWClaude*` sont conservés afin de réutiliser ce transport.

Les addons ne peuvent pas lire arbitrairement le disque ni ouvrir de socket réseau. Le bridge décode donc une bande de pixels affichée par l’addon. Dans l’autre sens, les fichiers d’un addon pas encore chargé sont lus lors de son premier chargement. Un pool de 200 addons existe dès le lancement du jeu ; chaque chargement consomme un slot jusqu’au prochain `/reload`.

Un fichier WAV vide est illisible, un fichier WAV silencieux valide est lisible. Cette différence permet au client de vérifier l’accusé de réception, l’activité, la disponibilité d’une réponse finale et la présence du bridge sans consommer un slot.

## Backend OpenCode

`bridge/opencode.js` est un client HTTP sans dépendance runtime. Il transmet le dossier dans le paramètre `directory` de chaque requête et utilise :

- `/global/health` pour la connexion ;
- `/session` pour créer/lister, `/session/:id/message` pour l’historique ;
- `/session/:id/prompt_async` pour envoyer une fois ;
- `/event` pour les textes, deltas et outils en SSE ;
- `/session/status`, `/permission` et `/question` pour réconcilier les données manquées ;
- `/session/:id/abort` et les routes de réponse aux permissions/questions pour les interactions.

Chaque chat WoW possède une association persistante avec une session OpenCode et un dossier. Un changement de dossier ou un reset démarre une nouvelle session. Les anciens identifiants de session Claude ne sont pas réutilisés.

Le bridge sauvegarde le `messageID` **avant** l’envoi. Après redémarrage, il retrouve ce message et surveille sa réponse sans réexécuter le prompt. Si le crash est survenu avant acceptation par OpenCode, une erreur explicite demande de le renvoyer. Les données persistées sont écrites par remplacement atomique.

## Protocole de contrôle

Le transport amont utilise des enregistrements séparés par `0x1E`, avec les champs séparés par `0x1F` :

```text
tokenAddon, chat, id, cwd, flags, nom, [contexte,] texte
```

Les opérations `op=folders`, `sessions`, `open`, `attach`, `abort`, `permission` et `question` utilisent leurs propres IDs. Le flag `req=<id>` lie une réponse à la permission/question effectivement affichée. Une commande de contrôle ne remplace pas le prompt en cours.

Les résultats de contrôle sont sérialisés dans le tableau Lua `controls`, adressés par token et ID, persistés puis consommés une fois. `request` sur une réponse en cours représente une interaction attendue. Le Lua notifie une fois par identifiant de demande.

Tous les textes sont échappés en littéraux Lua ; aucune donnée du modèle n’est exécutée comme code Lua. Les réponses d’autres sessions sont filtrées avant affichage.

## Interface

- `WoWClaude.lua` : chat, brouillons, contrôles, état du transport, permissions, questions, notifications et commandes `/oc`.
- `Workspaces.lua` : navigateur paginé, chemin manuel, dossier parent, dossiers récents et reprise de sessions.
- Un brouillon est propre à chaque chat ; le scroll suit les nouveaux messages seulement quand le lecteur est déjà en bas.
- Le pool est partagé : un seul chargement reçoit les états de tous les chats.
- Les mises à jour sont espacées de 3–4 s au premier plan, 10 s en arrière-plan, environ 15–16 s quand il reste moins de 20 slots. L’utilisateur choisit quand recharger l’interface.

## Périmètre

Le bridge et OpenCode doivent voir les mêmes chemins locaux. Le navigateur lit le système de fichiers du bridge. La reprise concerne les sessions existantes au repos ; la surveillance de nouvelles tâches démarrées depuis un autre client n’est pas implémentée.

Le prototype est testé par VM Lua, serveur HTTP/SSE simulé et API réelle OpenCode. La capture et l’apparence finale doivent être vérifiées sur le jeu Windows. Voir `CONTRIBUTING.md`.
