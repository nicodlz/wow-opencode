# Architecture

```text
WoW Forever (Lua)
  ↕ outgoing pixels / incoming load-on-demand addons
Node.js bridge on Windows
  ↕ HTTP + Server-Sent Events
opencode serve
  ↕ provider configured in OpenCode
Model + tools
```

## Upstream foundation

The Lua codec, PowerShell capture, WAV signals, slot pool, and most of the UI come from `chelinho139/wow-claude`, commit `75dd54b588906cb9cd8d7849bfeaec8affe335ee`. Internal `WoWClaude*` names are retained to reuse that transport.

Addons cannot read arbitrary files from disk or open network sockets. The bridge therefore decodes a strip of pixels displayed by the addon. In the other direction, an addon's files are read when it is first loaded. A pool of 200 addons exists before the game starts; each load consumes a slot until the next `/reload`.

An empty WAV file cannot be played, while a valid silent WAV file can. This distinction lets the client check acknowledgements, activity, final-reply readiness, and bridge presence without consuming a slot.

## OpenCode backend

`bridge/opencode.js` is an HTTP client with no runtime dependencies. It passes the folder in the `directory` parameter of each request and uses:

- `/global/health` to check the connection;
- `/session` to create/list sessions, and `/session/:id/message` for history;
- `/session/:id/prompt_async` to send the prompt once;
- `/event` for text, deltas, and tool activity over SSE;
- `/session/status`, `/permission`, and `/question` to recover missed data;
- `/session/:id/abort` and the permission/question reply routes for interactions.

Each WoW chat has a persistent mapping to an OpenCode session and a folder. Changing folders or resetting a chat starts a new session. Old Claude session identifiers are not reused.

The bridge saves the `messageID` **before** sending. After a restart, it finds that message and monitors its response without executing the prompt again. If the crash occurred before OpenCode accepted the message, an explicit error asks the user to resend it. Persisted data is written using atomic file replacement.

## Control protocol

The upstream transport uses records separated by `0x1E`, with fields separated by `0x1F`:

```text
addonToken, chat, id, cwd, flags, name, [context,] text
```

The `op=folders`, `sessions`, `open`, `attach`, `abort`, `permission`, and `question` operations use their own IDs. The `req=<id>` flag ties a response to the permission or question actually displayed. A control command does not replace the active prompt.

Control results are serialized into the Lua `controls` table, addressed by token and ID, persisted, and then consumed once. The `request` field on an in-progress reply represents an interaction awaiting user input. The Lua code notifies the user once per request ID.

All text is escaped as Lua string literals; model data is never executed as Lua code. Responses from other sessions are filtered out before display.

## User interface

- `WoWClaude.lua`: chat, drafts, controls, transport status, permissions, questions, notifications, and `/oc` commands.
- `Workspaces.lua`: paginated browser, manual path entry, parent folder, recent folders, and session resumption.
- Each chat has its own draft; scrolling follows new messages only when the reader is already at the bottom.
- The pool is shared: a single slot load receives the state of every chat.
- Updates are spaced 3–4 seconds apart in the foreground, 10 seconds in the background, and roughly 15–16 seconds when fewer than 20 slots remain. The user chooses when to reload the UI.

## Scope

The bridge and OpenCode must see the same local paths. The browser reads the bridge's filesystem. Sessions can be attached while idle; monitoring new tasks started from another client is not implemented.

The prototype is tested through a Lua VM, a simulated HTTP/SSE server, and the real OpenCode API. Screen capture and the final appearance need to be checked in the game on Windows. See `CONTRIBUTING.md`.
