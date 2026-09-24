# Configuration

`node setup.js` génère `bridge/config.json` depuis `bridge/config.example.json`. Ce fichier et les données de session sont ignorés par Git.

| Clé | Valeur / rôle |
|---|---|
| `serverUrl` | `http://127.0.0.1:4096`, serveur `opencode serve` local |
| `defaultCwd` | Dossier initial ; remplacé par `--project`, `WOW_OPENCODE_PROJECT` ou le dossier de lancement si celui-ci est hors du dépôt |
| `model` | Vide : modèle OpenCode par défaut ; sinon `provider/model` |
| `agent` | Vide : agent OpenCode par défaut ; sinon son nom, par exemple `build` ou `plan` |
| `maxParallel` | 3 tâches simultanées ; les autres restent en attente |
| `timeoutMs` | 1800000 (30 minutes) ; le bridge demande l’arrêt de la session à expiration |
| `progressWriteMs` | 1500 ; limite la fréquence d’écriture des états intermédiaires |
| `reconcileMs` | 3000 si absent ; vérification des messages, état et interactions pour récupérer les événements SSE manqués |
| `pollMs` | 750 ; lecture du chemin SavedVariables de secours |
| `gameContext` | `true` ; autorise le contexte du personnage, sauf si désactivé en jeu avec `/oc context off` |
| `primerFile` | `docs/WOW-ADDON-PRIMER.md` ; référence WoW ajoutée avec le contexte. Chaîne vide : désactivée |
| `addonDir` | Dossier `Interface\AddOns` du client |
| `inboxFile` | `Interface\AddOns\WoWClaude\Inbox.lua` |
| `savedVariablesFile` | `WTF\Account\<compte>\SavedVariables\WoWClaude.lua` |
| `capture.enabled` | `true` ; capture PowerShell. `false` pour tests ou utilisation du transport reload |
| `capture.processName` | Exécutable du jeu sans `.exe`, normalement `WowB` |
| `capture.intervalMs` | 250 ; fréquence de lecture des pixels |
| `tocInterface` | `16001` pour Forever |
| `slots` / `actMax` / `presenceMax` | 200 / 60 / 2000 ; doivent correspondre aux constantes Lua et aux fichiers générés |
| `presenceIntervalMs` | 30000 ; heartbeat du bridge |

Ne change pas `capture.cellPx`, `cellsPerRow`, `maxRows` ou les tailles de pools sans adapter les constantes de l’addon et réinstaller les slots.

## Authentification du serveur

Le bridge lit les mêmes variables d’environnement que le serveur :

- `OPENCODE_SERVER_PASSWORD`
- `OPENCODE_SERVER_USERNAME` (défaut : `opencode`)

Si tu protèges le serveur par mot de passe, définis ces variables dans **les deux terminaux**. Les identifiants du fournisseur restent gérés par OpenCode. Les anciennes clés Claude `claudePath`, `allowedTools` et `permissionMode` ne sont plus utilisées.

## Arguments du bridge

```text
wow-opencode --project <dossier>
node bridge/bridge.js --config <fichier>
node bridge/bridge.js --inject "message de test"
node bridge/bridge.js --once
```

`--inject` lance réellement un prompt via le fournisseur OpenCode. `--once` traite une sortie SavedVariables puis quitte. `--config` place aussi les fichiers d’état dans le dossier du fichier choisi ; utile pour les tests.

## Fichiers locaux

- `state.json` : associations chat/session, tâches en cours, résultats et accusés de réception.
- `transcripts.json` : copie des conversations pour restaurer l’addon si le client réinitialise ses données.
- `bridge.log` : démarrage, erreurs de transport et fins de tâches.
- `bridge.lock` : PID du bridge ; une instance vivante empêche un second lancement.

Ces fichiers restent locaux. Le bridge ne crée aucun partage public de session. Supprimer un chat WoW n’efface pas sa session OpenCode.
