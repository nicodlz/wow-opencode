#!/usr/bin/env node
'use strict';
// One-shot installer.
//
//   node setup.js [--wow "<client folder>"] [--server <URL>] [--project "<server folder>"] [--account <name>]
//
// Finds the WoW: Forever client, copies the addon into Interface\AddOns, writes
// bridge/config.json from the example (if missing), and builds the slot pool.
// Existing config is kept unless --server or --project explicitly updates it.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const ADDON_SRC = path.join(ROOT, 'addon', 'WoWClaude');
const BRIDGE = path.join(ROOT, 'bridge');
const CONFIG = path.join(BRIDGE, 'config.json');
const EXAMPLE = path.join(BRIDGE, 'config.example.json');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}

function isClient(dir) {
  try {
    return fs.existsSync(path.join(dir, 'Interface')) && fs.readdirSync(dir).some(f => /^Wow.*\.exe$/i.test(f));
  } catch { return false; }
}

function findClient() {
  if (args.wow) {
    if (isClient(args.wow)) return args.wow;
    throw new Error(`--wow "${args.wow}" does not look like a WoW client folder (needs Interface\\ and a Wow*.exe)`);
  }
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'D:\\', 'E:\\', 'D:\\Games', 'E:\\Games', 'C:\\Games']
    .filter(Boolean).map(r => path.join(r, 'World of Warcraft'));
  for (const root of roots) {
    for (const flavor of ['_classic_beta_', '_forever_', '_retail_', '_classic_era_', '_classic_']) {
      const dir = path.join(root, flavor);
      if (isClient(dir)) return dir;
    }
  }
  throw new Error('Could not find the WoW client. Pass --wow "C:\\path\\to\\World of Warcraft\\_classic_beta_"');
}

function findAccount(client) {
  const base = path.join(client, 'WTF', 'Account');
  let names = [];
  try { names = fs.readdirSync(base).filter(n => n !== 'SavedVariables' && fs.statSync(path.join(base, n)).isDirectory()); } catch {}
  if (args.account) {
    if (!names.includes(args.account)) throw new Error(`Account "${args.account}" not found under ${base}`);
    return args.account;
  }
  if (!names.length) throw new Error(`No account folder under ${base}. Log into the game once, then run setup again.`);
  if (names.length > 1) console.log(`Several accounts found (${names.join(', ')}); using "${names[0]}". Pass --account to choose another.`);
  return names[0];
}

function copyAddon(client) {
  const dest = path.join(client, 'Interface', 'AddOns', 'WoWClaude');
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(ADDON_SRC)) {
    const target = path.join(dest, f);
    if (f === 'Inbox.lua' && fs.existsSync(target)) continue; // the bridge owns it once running
    fs.copyFileSync(path.join(ADDON_SRC, f), target);
    copied++;
  }
  return { dest, copied };
}

function writeConfig(client, account) {
  const existing = fs.existsSync(CONFIG);
  if (existing && args.server === undefined && args.project === undefined) {
    console.log(`config   : ${CONFIG} already exists, keeping it`);
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  }
  const cfg = JSON.parse(fs.readFileSync(existing ? CONFIG : EXAMPLE, 'utf8'));
  if (!existing) {
    cfg.addonDir = path.join(client, 'Interface', 'AddOns');
    cfg.inboxFile = path.join(cfg.addonDir, 'WoWClaude', 'Inbox.lua');
    cfg.savedVariablesFile = path.join(client, 'WTF', 'Account', account, 'SavedVariables', 'WoWClaude.lua');
    cfg.defaultCwd = '';
    const exe = fs.readdirSync(client).find(f => /^Wow.*\.exe$/i.test(f));
    if (exe) cfg.capture.processName = exe.replace(/\.exe$/i, '');
  }
  // Project paths are server paths: never resolve /home/... against Windows.
  if (typeof args.project === 'string') cfg.defaultCwd = args.project;
  if (typeof args.server === 'string') cfg.serverUrl = args.server;
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`config   : wrote ${CONFIG}`);
  return cfg;
}

try {
  const client = findClient();
  console.log(`client   : ${client}`);
  const account = findAccount(client);
  console.log(`account  : ${account}`);
  const { dest, copied } = copyAddon(client);
  console.log(`addon    : ${copied} file(s) -> ${dest}`);
  const cfg = writeConfig(client, account);
  console.log(`server   : ${process.env.OPENCODE_SERVER_URL || cfg.serverUrl}`);
  console.log(`project  : ${cfg.defaultCwd || '(OpenCode server working directory)'}  (use Folders in game, or /oc cd)`);
  console.log('slots    : building the reply-slot pool and signal files...');
  const r = spawnSync(process.execPath, [path.join(BRIDGE, 'install-slots.js')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('install-slots.js failed');
  console.log(`
Done. Next:
  1. Fully quit and relaunch World of Warcraft (it only discovers new addon files at launch).
  2. Enable "WoW OpenCode" at character select (leave its slot addons enabled).
  3. Make sure OpenCode is running at the configured server URL.
  4. In this PC's terminal, set OPENCODE_SERVER_PASSWORD (and optionally OPENCODE_SERVER_USERNAME), then run: npm start
  5. In game: /oc, click Connect, then Folders to open your project.
`);
} catch (e) {
  console.error('setup failed:', e.message);
  process.exit(1);
}
