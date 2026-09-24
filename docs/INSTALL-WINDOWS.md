# Installation Windows

## Préparer OpenCode

Installe Git et Node.js 22.2 ou plus récent, puis dans PowerShell :

```powershell
npm install -g opencode-ai
opencode --version
opencode
```

Dans OpenCode, `/connect` permet de connecter un fournisseur et `/models` de choisir un modèle. Vérifie qu’un message simple reçoit une réponse avant de passer à WoW.

## Installer le projet

```powershell
git clone https://github.com/nicodlz/wow-opencode.git
cd wow-opencode
npm ci
node setup.js --wow "C:\Games\World of Warcraft\_forever_" --project "C:\dev\mon-projet"
```

Le dossier `--wow` doit contenir `WowB.exe` (ou un autre `Wow*.exe`) et `Interface`. Selon l’installation, il peut s’appeler `_classic_beta_`. Connecte-toi une fois au jeu pour que le dossier `WTF\Account` existe. Pour sélectionner un compte parmi plusieurs : `--account "NOM"`.

`setup.js` copie les fichiers dans `Interface\AddOns\WoWClaude`, puis crée `WoWClaude_S001` à `WoWClaude_S200`. Le nom de dossier technique vient du transport amont ; le titre affiché est **WoW OpenCode**.

Quitte entièrement le jeu, relance-le et active **WoW OpenCode** ainsi que les addons de slots. Le jeu découvre les nouveaux fichiers uniquement au lancement.

## À chaque session de jeu

Terminal 1 :

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
```

Terminal 2, dans le dépôt :

```powershell
npm start
```

Dans WoW en mode fenêtré/sans bordure : `/oc` → **Connect** → **Folders** → **Open this folder**. La session créée utilise le modèle et les permissions d’OpenCode. **Sessions** reprend une conversation existante et **Stop** arrête la tâche courante.

Un clic droit sur un chat propose Rename et Folder. Le bouton de suppression ferme le chat et oublie sa copie locale ; la session reste disponible dans OpenCode et peut être reprise depuis Sessions.

## Commande globale facultative

Dans le dépôt :

```powershell
npm link
```

Tu peux ensuite lancer `wow-opencode` depuis le dossier d’un projet, ou `wow-opencode --project "C:\dev\autre-projet"`. Un seul bridge doit utiliser les slots à la fois. Le serveur OpenCode reste à lancer séparément.

## Mise à jour

Arrête le bridge, puis dans le dépôt :

```powershell
git pull --ff-only
npm ci
node setup.js --wow "C:\Games\World of Warcraft\_forever_"
```

La configuration existante est conservée. Modifie `bridge/config.json` si les chemins ont changé. Redémarre complètement WoW si des fichiers d’addon ont été ajoutés, puis relance le bridge.

## Dépannage

| Symptôme | Vérifications |
|---|---|
| OpenCode offline | `opencode serve` écoute sur le port de `serverUrl` ; vérifie aussi l’authentification du serveur si activée. |
| Aucun message sortant | Jeu visible, pas minimisé, pas de plein écran exclusif ; `capture.processName` correspond à l’exécutable ; regarde `bridge/bridge.log`. |
| Reply slots not installed | Réexécute `node setup.js`, quitte entièrement WoW, réactive les addons de slots. |
| Plus de mises à jour | `/oc slots`, puis bouton Reload ; `/oc diag` vérifie le canal de signal. |
| Chemin introuvable | Dans Folders, saisis un chemin Windows du PC où tourne le bridge. Un chemin WSL `/home/...` n’est pas un chemin Windows. |
| Session déjà occupée | Attends la fin de son exécution dans l’autre client ou crée une nouvelle session. |
| Fenêtre PowerShell se ferme | Lance `npm start` depuis un terminal déjà ouvert pour lire l’erreur. |
| Dossiers/configuration déplacés | Corrige les chemins dans `bridge/config.json` ; l’installateur conserve ce fichier s’il existe. |

`npm run test:live`, avec le serveur ouvert, vérifie ses routes et le flux SSE en créant puis supprimant une session temporaire. Il enregistre un message avec `noReply`, sans demander de génération au modèle.

## Validation en jeu à effectuer

La capture et le rendu nécessitent une vérification réelle sur ta version de Forever : ouvrir un dossier avec espaces, envoyer un prompt, minimiser et recevoir une notification, répondre à une permission, arrêter une tâche, puis faire `/reload` pendant une génération et retrouver la réponse. Les tests automatisés simulent les API WoW ; ils ne remplacent pas cette vérification.
