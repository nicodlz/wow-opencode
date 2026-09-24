# Configuration

`node setup.js` generates `bridge/config.json` from `bridge/config.example.json`. This file and session data are ignored by Git.

| Key | Value / purpose |
|---|---|
| `serverUrl` | `http://127.0.0.1:4096` by default; a local or remote OpenCode URL. `OPENCODE_SERVER_URL` overrides it. Reverse-proxy path prefixes are supported |
| `defaultCwd` | Folder on the OpenCode server. Empty: use the directory reported by `/path`. Priority: `--project`, then `WOW_OPENCODE_PROJECT`, then this value. Relative paths and `~` are resolved on the server |
| `model` | Empty: use OpenCode's default model; otherwise `provider/model`. Per-chat selections made through Model take precedence |
| `agent` | Empty: use OpenCode's default agent; otherwise its name, such as `build` or `plan` |
| `maxParallel` | 3 concurrent tasks; additional tasks are queued |
| `timeoutMs` | 1800000 (30 minutes); the bridge requests a session abort when the timeout expires |
| `progressWriteMs` | 1500; limits how often intermediate states are written |
| `reconcileMs` | 3000 if omitted; checks messages, status, and interactions to recover missed SSE events |
| `pollMs` | 750; polling interval for the SavedVariables fallback |
| `gameContext` | `true`; allows character context unless disabled in game with `/oc context off` |
| `primerFile` | `docs/WOW-ADDON-PRIMER.md`; WoW reference included with the context. Empty string: disabled |
| `addonDir` | The client's `Interface\AddOns` folder |
| `inboxFile` | `Interface\AddOns\WoWClaude\Inbox.lua` |
| `savedVariablesFile` | `WTF\Account\<account>\SavedVariables\WoWClaude.lua` |
| `capture.enabled` | `true`; PowerShell screen capture. Use `false` for tests or the reload transport |
| `capture.processName` | Game executable without `.exe`, usually `WowB` |
| `capture.intervalMs` | 250; pixel capture interval |
| `tocInterface` | `16001` for Forever |
| `slots` / `actMax` / `presenceMax` | 200 / 60 / 2000; must match the Lua constants and generated files |
| `presenceIntervalMs` | 30000; bridge heartbeat interval |

Do not change `capture.cellPx`, `cellsPerRow`, `maxRows`, or the pool sizes without updating the addon constants and reinstalling the slots.

## Server authentication

The bridge reads the same environment variables as the server:

- `OPENCODE_SERVER_PASSWORD`
- `OPENCODE_SERVER_USERNAME` (default: `opencode`)

If you password-protect the server, set matching values in **the server process and the Windows bridge terminal**. The username defaults to `opencode` when omitted. HTTP requests, directory browsing, session controls, and SSE all use the same Basic authentication header. A 401 or 403 produces an explicit configuration error. Passwords are not stored in the config, addon data, or logs; do not put credentials in `serverUrl`.

OpenCode continues to manage provider credentials. The old Claude keys `claudePath`, `allowedTools`, and `permissionMode` are no longer used. See [Remote server setup](REMOTE-SERVER.md) for PowerShell and Linux examples.

## Local files versus server folders

`addonDir`, `inboxFile`, `savedVariablesFile`, and `primerFile` are paths on the **bridge PC**. `defaultCwd`, `--project`, `WOW_OPENCODE_PROJECT`, and paths entered in the game are paths on the **OpenCode server**.

The bridge discovers the server's path format and home through `/path`, then browses and validates folders through `/file`. Linux paths remain case-sensitive even when the bridge runs on Windows. An empty `defaultCwd` uses the server's working directory; the Windows terminal's working directory is not sent as an implicit project path.

The **Model** picker queries `/provider` and shows only connected providers. Models are paginated ten at a time; **Thinking** displays the selected model's `variants` from that API. The chosen model and variant are stored per chat in WoW SavedVariables and included with each prompt, independently of the bridge-wide `model` setting. Attach restores a session's existing model and variant; resetting the chat selection returns to its OpenCode/configured default.

## Bridge arguments

```text
wow-opencode --project <folder>
node bridge/bridge.js --config <file>
node bridge/bridge.js --inject "test message"
node bridge/bridge.js --once
```

`--inject` sends a real prompt through the OpenCode provider. `--once` processes a SavedVariables outbox entry and exits. `--config` also places state files in the selected configuration file's directory, which is useful for testing.

## Local files

- `state.json`: chat/session mappings, active tasks, results, and acknowledgements.
- `transcripts.json`: conversation copies used to restore the addon if the client resets its data.
- `bridge.log`: startup messages, transport errors, and task completion logs.
- `bridge.lock`: the bridge PID; a running instance prevents a second one from starting.

These files remain local. The bridge does not create public session shares. Deleting a WoW chat does not delete its OpenCode session.
