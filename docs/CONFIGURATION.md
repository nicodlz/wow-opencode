# Configuration

`node setup.js` generates `bridge/config.json` from `bridge/config.example.json`. This file and session data are ignored by Git.

| Key | Value / purpose |
|---|---|
| `serverUrl` | `http://127.0.0.1:4096`, the local `opencode serve` server |
| `defaultCwd` | Initial folder; overridden by `--project`, `WOW_OPENCODE_PROJECT`, or the launch directory if it is outside the repository |
| `model` | Empty: use OpenCode's default model; otherwise `provider/model` |
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

If you password-protect the server, set these variables in **both terminals**. OpenCode continues to manage provider credentials. The old Claude keys `claudePath`, `allowedTools`, and `permissionMode` are no longer used.

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
