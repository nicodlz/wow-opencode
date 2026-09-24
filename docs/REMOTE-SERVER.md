# Remote OpenCode server

The game addon and screen-capture bridge run on the **Windows game PC**. OpenCode and your projects can run on a **Linux server**, including a remote machine or WSL, or on another Windows/macOS machine.

Folder browsing uses OpenCode's `/path` and `/file` APIs. The Windows bridge does not need a local copy, network drive, or Windows equivalent of your Linux project paths.

## 1. Make the server reachable

If you already have an authenticated OpenCode HTTPS endpoint, use its URL and existing credentials in step 3. URLs with a path prefix, such as `https://example.com/opencode`, are supported.

For an SSH tunnel, run OpenCode on the Linux server:

```sh
export OPENCODE_SERVER_PASSWORD='YOUR_SERVER_PASSWORD'
# Optional; omit this if you use the default username, opencode.
export OPENCODE_SERVER_USERNAME='opencode'
opencode serve --hostname 127.0.0.1 --port 4096
```

Then open a dedicated PowerShell terminal on Windows:

```powershell
ssh -N -L 4096:127.0.0.1:4096 your-user@your-linux-host
```

Leave it open. In this setup, use `http://127.0.0.1:4096` as the bridge's URL. Although this URL is loopback, folders still come from the Linux server at the other end of the tunnel.

## 2. Install or update the addon on Windows

From the `wow-opencode` repository:

```powershell
git pull --ff-only
npm ci
node setup.js --wow "C:\Games\World of Warcraft\_forever_" --server "http://127.0.0.1:4096" --project "/home/your-user/project"
```

Replace `--server` with your HTTPS endpoint if you are not using a tunnel. `--wow` is a **local Windows path**; `--project` is a **server path**. You can use `--project "~"` to start in the server account's home.

The explicit `--server` and `--project` flags update an existing `bridge/config.json` while preserving other settings. New installations default to the server's working directory if no project is provided.

For a first installation, fully restart WoW and enable WoW OpenCode and its slots. For an update that only changes existing Lua files, run `/reload` after the installer has copied them.

## 3. Authenticate the Windows bridge

In the same PowerShell terminal where you run `npm start`:

```powershell
$env:OPENCODE_SERVER_URL = "http://127.0.0.1:4096"
$env:OPENCODE_SERVER_PASSWORD = "YOUR_SERVER_PASSWORD"
# Optional: match the custom username on the server, if any.
$env:OPENCODE_SERVER_USERNAME = "opencode"
npm start
```

Use the exact password configured on the server. If the server username has not been customized, you can omit `OPENCODE_SERVER_USERNAME`; the bridge defaults to `opencode`.

`OPENCODE_SERVER_URL` overrides `serverUrl` in the config. `WOW_OPENCODE_PROJECT` can similarly override `defaultCwd`, or you can pass `npm start -- --project "/home/your-user/project"`. Restart the bridge after changing its environment variables. `bridge\start-window.cmd` uses the environment inherited from its launching process; it will not pick up variables set in a different PowerShell window.

The password is used for all HTTP calls and the SSE stream. It is not written to addon files, session data, or configuration. Provider credentials remain on the OpenCode server.

## 4. Use it in game

Run `/oc` → **Connect** → **Folders**. Enter a Linux path such as `/home/your-user/project` or `~/project`, then choose **Open this folder**. **Sessions** lists sessions in that server folder and lets you resume their history.

**Model: Auto** fetches connected providers and models from the same authenticated server. The **Thinking** selector fetches only that model's available reasoning variants. Changes are saved per WoW chat and affect the next prompt; attaching an OpenCode session restores its model and variant. The first update adding `ModelPicker.lua` needs a **full WoW restart**, even when the bridge runs on another machine.

`~` means the home directory reported by OpenCode, which may differ from the SSH login user's home if OpenCode runs under another account. Relative paths resolve against the configured default server project. Linux paths are case-sensitive, even when entered on Windows.

If an old chat still points to `C:\...` after switching to Linux, open the Linux project through Folders or set `/oc cd /home/your-user/project` in an idle chat. Existing OpenCode sessions can then be selected through Sessions.

## Verify the connection

In the authenticated bridge terminal:

```powershell
npm run test:live
```

This checks server authentication, folder browsing, session creation/history, and SSE. It creates and deletes a temporary session and stores a `noReply` message, without requesting model inference.

A **401/403** error means the server rejected the credentials. A **Folder not found** error refers to the server filesystem: check the server account's access and the Linux path, not the Windows filesystem.
