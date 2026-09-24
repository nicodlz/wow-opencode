# Development

Requires Node.js 22.2+. Runtime code uses Node's built-in modules; `fengari` and `luaparse` are development dependencies for running and validating the real addon Lua.

```sh
npm ci
npm test
```

Tests cover:

- Lua 5.1 syntax and declaration ordering, including the workspace browser.
- The real addon in a WoW API stub: login, connection, pixels, folders, sessions, permissions, questions, cancellation, notifications and recovery.
- Protocol parsing, folder semantics, escaping, deduplication and restoration.
- HTTP/SSE streaming, dropped-event reconciliation, isolation between sessions and provider errors.
- The real bridge process with a simulated OpenCode server, filesystem, permission/question responses and restart recovery without duplicate prompts.
- A simulated authenticated Linux server with folders that do not exist on the bridge PC, including browsing, session attachment, prompt execution, and recovery on Windows/Linux CI.
- Server-specific POSIX/Windows path handling, default/custom Basic authentication usernames, SSE authentication, and reverse-proxy URL prefixes.
- Connected-provider model discovery, pagination, variant validation, selection per chat, snapshotting for pending prompts, and resuming an attached session's model/variant.
- On Windows, PNG → `capture.ps1` round trips with noise and gamma changes. This test explicitly skips on Linux; the addon pixel encoder still runs there.

CI runs on both Windows and Ubuntu.

## Real OpenCode smoke test

With `opencode serve` running:

```sh
npm run test:live
```

Set `OPENCODE_SERVER_URL` if it is not at `http://127.0.0.1:4096`, plus `OPENCODE_SERVER_PASSWORD` and optionally `OPENCODE_SERVER_USERNAME` when authentication is enabled. `WOW_OPENCODE_PROJECT` selects a server folder; otherwise `/path` supplies the default. The test checks authentication and remote folders, creates a temporary session, stores a `noReply` message, checks history and SSE, then deletes the session. It does not request model inference. On Linux, `npm exec --package=opencode-ai -- node tests/live_opencode.js --spawn` launches a temporary authenticated server on port 14096.

## Layout

| Path | Responsibility |
|---|---|
| `addon/WoWClaude/` | Game UI and transport; legacy internal names from upstream |
| `bridge/opencode.js` | OpenCode HTTP/SSE client and stream reconciliation |
| `bridge/workspace.js` | Server-side path semantics and remote directory browsing |
| `bridge/models.js` | Connected providers, model pagination and reasoning variants |
| `bridge/bridge.js` | I/O, jobs, controls, persistence, capture and slot publication |
| `bridge/protocol.js` | Pure parsing and Lua serialization |
| `bridge/capture.ps1` | Windows pixel decoder |
| `setup.js`, `bridge/install-slots.js` | Installation and pre-created slots/signals |
| `tests/` | Automated verification |

After addon changes, run `node setup.js --wow "<client>"` to copy files. **This release adds `ModelPicker.lua`; fully restart the game** to discover the new file. Do not commit `bridge/config.json`, authentication, logs, session state or transcripts.

Keep the MIT license and upstream attribution. The original screenshot is retained as an upstream artifact, not as a screenshot of OpenCode in game.
