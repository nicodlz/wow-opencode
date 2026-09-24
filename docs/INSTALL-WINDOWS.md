# Windows installation

## Set up OpenCode

If OpenCode already runs on a Linux or other remote server, follow [Remote server setup](REMOTE-SERVER.md). You only need Git and Node.js on the Windows game PC; keep using the provider configured on your server.

Install Git and Node.js 22.2 or newer, then run in PowerShell:

```powershell
npm install -g opencode-ai
opencode --version
opencode
```

In OpenCode, use `/connect` to connect a provider and `/models` to choose a model. Check that a simple message receives a reply before moving on to WoW.

## Install the project

```powershell
git clone https://github.com/nicodlz/wow-opencode.git
cd wow-opencode
npm ci
node setup.js --wow "C:\Games\World of Warcraft\_forever_" --project "C:\dev\my-project"
```

The `--wow` folder must contain `WowB.exe` (or another `Wow*.exe`) and `Interface`. Depending on your installation, it may be called `_classic_beta_`. Log into the game once so that the `WTF\Account` folder exists. To choose between multiple accounts, add `--account "NAME"`.

`setup.js` copies the files to `Interface\AddOns\WoWClaude`, then creates `WoWClaude_S001` through `WoWClaude_S200`. The internal folder names come from the upstream transport; the displayed title is **WoW OpenCode**.

Fully quit the game, relaunch it, and enable **WoW OpenCode** along with its slot addons. The game only discovers new files at launch.

## Each time you play

Terminal 1:

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
```

Terminal 2, in the repository:

```powershell
npm start
```

In WoW, using windowed or borderless mode: `/oc` → **Connect** → **Folders** → **Open this folder**. The new session uses OpenCode's model and permissions. **Sessions** resumes an existing conversation, and **Stop** interrupts the current task.

Click **Model: Auto** to pick a connected provider and model, then a reasoning variant supported by that model. Use **Thinking: default** to change the reasoning variant later. These settings are saved per chat and apply to the next message. `/oc model` and `/oc reasoning` open the same selectors.

Right-click a chat for Rename and Folder options. The delete button closes the chat and forgets its local copy; the session remains available in OpenCode and can be resumed through Sessions.

## Optional global command

In the repository:

```powershell
npm link
```

You can then run `wow-opencode` from any folder. Use `wow-opencode --project "C:\dev\another-project"` for a Windows server or `wow-opencode --project "/home/user/project"` for a Linux server. Without an explicit project, the configured default or server working directory is used. Only one bridge should use the slot pool at a time. The OpenCode server still needs to be started separately.

## Updating

Stop the bridge, then run in the repository:

```powershell
git pull --ff-only
npm ci
node setup.js --wow "C:\Games\World of Warcraft\_forever_"
```

Your existing configuration is preserved; explicitly passing `--server` or `--project` updates those connection settings. Edit `bridge/config.json` if local addon paths have changed. Fully restart WoW if addon files have been added, then restart the bridge. **This update adds `ModelPicker.lua`, so it requires a full game restart.** Updating existing Lua files only requires `/reload` after copying them.

## Troubleshooting

| Symptom | What to check |
|---|---|
| OpenCode offline | Make sure `opencode serve` is listening on the port in `serverUrl`; also check server authentication if enabled. |
| No outgoing messages | Keep the game visible, not minimized, and out of exclusive fullscreen; check that `capture.processName` matches the executable; inspect `bridge/bridge.log`. |
| Reply slots not installed | Rerun `node setup.js`, fully quit WoW, and enable the slot addons. |
| Updates have stopped | Run `/oc slots`, then click Reload; `/oc diag` checks the signal channel. |
| Folder not found | Enter a path on the OpenCode server: `/home/...` or `~/...` for Linux, a drive path for Windows. Check `defaultCwd` when migrating from a local server. |
| Authentication failed (401/403) | Set `OPENCODE_SERVER_PASSWORD` and, if customized, `OPENCODE_SERVER_USERNAME` in the terminal running the bridge. Restart the bridge after changing them. |
| Session already busy | Wait for it to finish in the other client, or create a new session. |
| PowerShell window closes | Run `npm start` from an already-open terminal so you can read the error. |
| Folders or configuration moved | Correct the paths in `bridge/config.json`; the installer preserves this file if it already exists. |

With the server running, `npm run test:live` checks authentication, remote folders, routes, and SSE by creating and then deleting a temporary session. It uses `OPENCODE_SERVER_URL`, the authentication variables, and optionally `WOW_OPENCODE_PROJECT`. It stores a message with `noReply`, without requesting model inference.

## In-game validation still needed

Screen capture and rendering need to be checked on your actual Forever build: open a folder with spaces in its name, send a prompt, minimize the window and receive a notification, respond to a permission request, stop a task, then run `/reload` during generation and retrieve the reply. Automated tests simulate the WoW APIs; they do not replace this check.
