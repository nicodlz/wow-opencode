# WoW OpenCode

An **OpenCode client inside World of Warcraft: Forever**: open a folder, create or resume a session, chat with your agent while you play, and receive notifications in game.

Based on [chelinho139/wow-claude](https://github.com/chelinho139/wow-claude), licensed under MIT. The WoW-specific transport, chat, item links, and notifications come from that project. The backend has been replaced with OpenCode's HTTP/SSE API.

## Features

- **Folders**: folder browser with an editable path, parent-folder navigation, pagination, and recent folders.
- **Sessions**: find OpenCode sessions in the current folder and import their conversations.
- **+ New session**: create a persistent session in the current folder.
- Multiple projects and sessions running in parallel, with a separate draft for each conversation.
- Live text and tool activity during generation; stream reconnection and recovery after a bridge restart without resending the prompt.
- **Stop** actually interrupts the OpenCode session.
- **Allow once / Reject** permissions and answers to questions directly from the game.
- Notifications: whisper sound, chat echo, clickable links, unread counts, and a minimized bar.
- `/ai` and `/r`, Shift-click item/spell/quest links, and optional character context.
- Slot counter, a Reload button before the pool runs out, and **no automatic reload by default**.

## Requirements

- **Windows**, with WoW Forever running in **windowed or borderless mode**, visible on screen.
- **Node.js 22.2+**, **Git**, and **OpenCode** installed on that PC.
- A connected provider and a working model in OpenCode. First check that you can have a conversation by running `opencode` in a terminal.
- The upstream transport targets Forever **TOC 16001**, tested by its author on client **1.60.1.69913**.

This version includes automated Lua, bridge, and protocol tests, plus an API smoke test against a real **OpenCode 1.18.32** server. Visual and screen-capture validation on a real WoW Forever client is still pending. This is an initial version ready for in-game testing.

## Installation

In **PowerShell**:

```powershell
git clone https://github.com/nicodlz/wow-opencode.git
cd wow-opencode
npm ci
```

If OpenCode is not installed yet:

```powershell
npm install -g opencode-ai
opencode
```

Connect your provider in OpenCode (`/connect`) and select a model (`/models`). Then exit OpenCode.

### 1. Install the addon

Adjust these two paths: `--wow` is the folder containing **WowB.exe and Interface**; `--project` is your initial working folder.

```powershell
node setup.js --wow "C:\Games\World of Warcraft\_forever_" --project "C:\dev\my-project"
```

The Forever client may also be in `_classic_beta_`. The installer can try to find it if you omit `--wow`. If you have multiple accounts, add `--account "YOUR_ACCOUNT"`.

Installation copies the addon, creates `bridge/config.json`, and prepares the **200 reply-slot addons** and their signal files. Thousands of small files are expected.

**Fully quit and relaunch WoW.** A simple `/reload` is not enough for the first installation. Enable **WoW OpenCode** and leave its slot addons enabled.

### 2. Start OpenCode

In a first terminal:

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
```

### 3. Start the bridge

In a second terminal, inside the `wow-opencode` folder:

```powershell
npm start
```

Keep both terminals open while you play. `bridge\start-window.cmd` also opens the bridge in its own window. The bridge restarts if it crashes.

### 4. In WoW

1. Type **`/oc`**, then click **Connect**.
2. Click **Folders**, browse or paste a path, then click **Open this folder**.
3. A session is created. Type in the input box and press **Enter**. **Shift+Enter** adds a new line.
4. **Sessions** resumes an existing conversation in the folder; **+ New session** starts another one.
5. Minimize the window with **Esc** or the button in the top-right corner. You will be notified when OpenCode replies or needs your input.

Folders belong to the PC running the bridge and OpenCode. This version targets a local OpenCode server that uses the same paths as the bridge.

## Useful commands

| Command | Action |
|---|---|
| `/oc` or `/wow-opencode` | Open/minimize the window |
| `/oc folders` | Browse folders |
| `/oc sessions` | Resume an OpenCode session in the folder |
| `/oc new [name]` | Create a new session |
| `/oc cd <path>` | Change the current chat's folder; the next message starts a new session |
| `/ai <message>` | Send from the regular game chat |
| `/r <message>` | Reply to OpenCode if it was the last to message you |
| `/oc cancel` | Interrupt the current task |
| `/oc echo short` | Short chat notifications (`full`, `off`, or a character count also work) |
| `/oc context off` | Stop sending character context |
| `/oc slots` | Show the remaining reply slots |
| `/oc reload` | Replenish the slot pool; OpenCode sessions keep running |
| `/oc help` | List all commands |

Answer an OpenCode question in the input box using an option number or free text, with **one line per question**. For multiple-choice questions, separate option numbers with commas. **Reject** dismisses the question. Permission is granted for **that request only**; OpenCode continues to manage your usual permission rules.

## Real-time updates and WoW limitations

A WoW addon cannot open an HTTP connection. The bridge receives OpenCode events over SSE, then relays them through the `wow-claude` transport: **on-screen pixels for outgoing messages**, **load-on-demand addons for incoming updates**.

- In-game updates arrive roughly **every 3–4 seconds** while the window is open, or **every 10 seconds** in the background; final replies also have a fast readiness signal.
- **200 slot reads per UI session**, shared across all chats. Each read contains the state of every chat. The last 20 slots are conserved by using a longer polling interval.
- Click **Reload** when the pool is running low. OpenCode conversations and tasks remain on the server and are picked up again by the UI. Unlimited streaming without a reload is not possible.
- Up to 16 chats open in the addon, with 3 concurrent tasks by default. Additional tasks are queued.
- A session running in another client cannot be attached until it is idle. New tasks launched from another client are not automatically monitored by this addon.
- Screen capture requires the game to remain visible. Exclusive fullscreen and a minimized game are not supported.

To preserve upstream transport compatibility, the addon's internal folders, SavedVariables, and some Lua identifiers still use the name **`WoWClaude`**. The UI and backend use OpenCode. Do not run the original bridge against this installation at the same time.

## Configuration and troubleshooting

- [Detailed Windows installation guide](docs/INSTALL-WINDOWS.md)
- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing and testing](CONTRIBUTING.md)

If **Connect** fails, check `opencode serve`, `npm start`, and that WoW is visible in windowed mode. If slots are missing, rerun `node setup.js`, then **fully restart the game**. Logs are in `bridge/bridge.log`.

## Credits

- [chelinho139/wow-claude](https://github.com/chelinho139/wow-claude), the base project imported from commit `75dd54b588906cb9cd8d7849bfeaec8affe335ee`.
- [0xInuarashi/wow-forever-codex](https://github.com/0xinuarashi/wow-forever-codex), pioneering work on pixel transport and file loading in Forever.
- [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source), the `forever` branch, as the client API reference.
- [OpenCode](https://opencode.ai), the server and session API.

**MIT** license; see [LICENSE](LICENSE). The screenshot retained at `docs/screenshot.jpg` comes from the upstream project and does not show this version.
