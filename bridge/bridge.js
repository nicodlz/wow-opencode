#!/usr/bin/env node
'use strict';
// WoW Forever transport from wow-claude; OpenCode is the session backend.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const P = require('./protocol');
const { OpenCode, messageID } = require('./opencode');
const { ServerWorkspace } = require('./workspace');
const { ModelCatalog } = require('./models');

const HERE = __dirname;
const ROOT = path.dirname(HERE);
const argv = process.argv.slice(2);
const arg = name => argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined;
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('wow-opencode [--project <directory>] [--config <file>] [--once] [--inject "text"]');
  process.exit(0);
}
const configFile = path.resolve(arg('--config') || path.join(HERE, 'config.json'));
let cfg;
try { cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
catch (error) { console.error(`Run node setup.js first. ${error.message}`); process.exit(2); }
const DATA = path.dirname(configFile);
const stateFile = path.join(DATA, 'state.json');
const transcriptFile = path.join(DATA, 'transcripts.json');
const lockFile = path.join(DATA, 'bridge.lock');
let cwd = '';
const slots = cfg.slots || 200;
const client = new OpenCode(cfg);
const workspace = new ServerWorkspace(client, arg('--project') || process.env.WOW_OPENCODE_PROJECT || cfg.defaultCwd || '');
const catalog = new ModelCatalog(client);
const once = argv.includes('--once');
const inject = arg('--inject');
const exitWhenIdle = once || inject !== undefined;
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read ${file}: ${error.message}`); return fallback; }
};
function write(file, data) { fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); }
function log(text) {
  const line = `[${new Date().toISOString()}] ${text}`;
  console.log(line);
  fs.appendFileSync(path.join(DATA, 'bridge.log'), line + '\n');
}

// Only one companion may publish to the slot pool at a time.
try {
  try { fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    try { process.kill(pid, 0); throw new Error(`Bridge already running (PID ${pid})`); }
    catch (alive) { if (alive.code !== 'ESRCH') throw alive; }
    fs.unlinkSync(lockFile);
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
  }
} catch (error) { console.error(error.message); process.exit(2); }
process.on('exit', () => { try { if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile); } catch {} });

const state = readJson(stateFile, { lastId: 0, handled: {}, sessions: {}, sessionCwd: {}, jobs: {}, live: {}, recent: [] });
for (const name of ['handled', 'sessions', 'sessionCwd', 'jobs', 'live']) state[name] ||= {};
state.recent ||= [];
// Claude session identifiers cannot be resumed by OpenCode.
if (state.backend !== 'opencode') { state.sessions = {}; state.jobs = {}; state.live = {}; state.backend = 'opencode'; }
const transcripts = readJson(transcriptFile, { chats: {}, tokens: {} });
P.pruneStale(state, transcripts);
const save = () => write(stateFile, JSON.stringify(state));
const saveTranscripts = () => write(transcriptFile, JSON.stringify(transcripts));
const running = new Map();
const controls = new Map(Object.entries(state.controls || {}));
const controlling = new Set();
const forgotten = new Set();
let restore;
let restoreExpires = 0;
let publishTimer;
let lastPublish = 0;
let capture;
let stopping = false;
let backend = { healthy: false, message: 'Connecting to OpenCode…' };

function signal(kind, id, on = true) {
  try { write(path.join(cfg.addonDir, 'WoWClaude', kind, P.pad3(P.slotNumber(id, slots)) + '.wav'), on ? P.SILENT_WAV : Buffer.alloc(0)); }
  catch (error) { log(`Signal ${kind}: ${error.message}`); }
}
function beat(job) {
  job.beats = (job.beats || 0) + 1;
  if (job.beats > (cfg.actMax || 60)) return;
  try { write(path.join(cfg.addonDir, 'WoWClaude', 'act', P.pad3(P.slotNumber(job.id, slots)), String(job.beats).padStart(2, '0') + '.wav'), P.SILENT_WAV); } catch {}
}
function publishNow() {
  lastPublish = Date.now();
  if (lastPublish > restoreExpires) restore = undefined;
  const records = Object.values(state.live).slice(-30);
  const options = { cwd, restore, backend, controls: [...controls.values()].slice(-30) };
  try {
    write(cfg.inboxFile, P.luaTable('WoWClaude_Inbox', records, options));
    const body = P.luaTable('WoWClaude_SlotData', records, options);
    for (let i = 1; i <= slots; i++) write(path.join(cfg.addonDir, 'WoWClaude_S' + P.pad3(i), 'Inbox.lua'), body);
  } catch (error) { log(`Cannot publish replies: ${error.message}. Run node setup.js, then restart WoW.`); }
}
function publish(job, record, urgent = false) {
  if (forgotten.has(job.chat)) return;
  state.live[P.chatKey(job)] = { chat: job.chat, token: job.session, id: job.id, cwd: job.cwd, session: job.sessionID || '', ...record };
  // Keep durable final results, but avoid a state write on every token.
  if (urgent) save();
  if (urgent || Date.now() - lastPublish >= (cfg.progressWriteMs || 1500)) {
    clearTimeout(publishTimer); publishTimer = null; publishNow();
  } else if (!publishTimer) publishTimer = setTimeout(() => { publishTimer = null; publishNow(); }, cfg.progressWriteMs || 1500);
}
function note(job, role, text) {
  if (!job.chat || forgotten.has(job.chat)) return;
  const chat = transcripts.chats[job.chat] ||= { id: job.chat, name: job.name || '', cwd: job.cwd, messages: [] };
  chat.cwd = job.cwd;
  if (job.name) chat.name = job.name;
  if (job.model !== undefined) { chat.model = job.model; chat.variant = job.variant || ''; }
  chat.messages.push({ role, text: String(text).slice(0, 24000), id: job.id, t: Math.floor(Date.now() / 1000) });
  chat.messages = chat.messages.slice(-200);
  chat.updated = Date.now();
  saveTranscripts();
}
function offerRestore(job) {
  if (!job.session) return;
  transcripts.tokens[job.session] = Date.now();
  restore = { token: job.session, chats: Object.values(transcripts.chats).filter(c => c.id !== job.chat).slice(-16).map(c => ({ ...c, messages: c.messages.slice(-40).map(m => ({ ...m, text: m.text.slice(0, 2000) })) })) };
  restoreExpires = Date.now() + 30000;
  saveTranscripts();
}
function remember(directory) {
  state.recent = [directory, ...state.recent.filter(d => !workspace.same(d, directory))].slice(0, 20);
}
async function health() {
  try {
    const result = await client.request('/global/health');
    await workspace.initialize();
    cwd = workspace.defaultDirectory;
    backend = { healthy: result.healthy === true, message: `OpenCode ${result.version || ''}` };
  } catch (error) { backend = { healthy: false, message: error.message }; }
}

async function control(job) {
  const key = `${job.session}:${job.id}`;
  if (controlling.has(key)) return;
  controlling.add(key);
  const result = { token: job.session, id: job.id, chat: job.chat, op: job.op };
  try {
    const dir = ['folders', 'open', 'abort'].includes(job.op) ? cwd : await workspace.directory(job.op === 'sessions' ? job.text || job.cwd : job.cwd);
    const skey = P.sessKey(job);
    const sessionID = state.sessions[skey];
    if (job.op === 'folders') {
      Object.assign(result, await workspace.folders(job.text || job.cwd));
      result.recent = state.recent;
    } else if (job.op === 'sessions') {
      result.path = dir;
      result.items = (await client.request('/session', dir)).filter(s => !s.parentID && !s.time?.archived && workspace.same(s.directory, dir))
        .sort((a, b) => b.time.updated - a.time.updated).map(s => ({ name: s.title || s.id, value: s.id }));
    } else if (job.op === 'providers') {
      result.items = await catalog.providers(dir);
    } else if (job.op === 'models') {
      const [providerID, page] = job.text.split('\n');
      Object.assign(result, await catalog.models(dir, providerID, Number(page || 1)));
    } else if (job.op === 'variants') {
      Object.assign(result, await catalog.variants(dir, job.text));
    } else if (job.op === 'open' || job.op === 'attach') {
      if (Object.values(state.jobs).some(j => j.chat === job.chat)) throw new Error('Stop the current session before switching folders or sessions.');
      const target = job.op === 'open' ? await workspace.directory(job.text) : dir;
      let session;
      if (job.op === 'attach') {
        session = await client.request(`/session/${encodeURIComponent(job.text)}`, target);
        if (!workspace.same(session.directory, target)) throw new Error('This session belongs to another folder.');
        const statuses = await client.request('/session/status', target);
        if (statuses[session.id] && statuses[session.id].type !== 'idle') throw new Error('Session is running in another client. Attach once it finishes.');
      } else session = await client.request('/session', target, { method: 'POST', body: { title: job.name || 'WoW session' } });
      state.sessions[skey] = session.id;
      state.sessionCwd[skey] = target;
      result.path = target; result.session = session.id; result.name = session.title;
      const messages = job.op === 'attach' ? await client.request(`/session/${session.id}/message`, target) : [];
      const lastUser = messages.findLast(m => m.info.role === 'user');
      const selected = session.model || (lastUser?.info.model && { providerID: lastUser.info.model.providerID, id: lastUser.info.model.modelID, variant: lastUser.info.model.variant });
      if (job.op === 'attach') {
        result.model = selected?.providerID && selected?.id ? `${selected.providerID}/${selected.id}` : '';
        result.variant = selected?.variant === 'default' ? '' : (selected?.variant || '');
      }
      result.messages = messages.filter(m => ['user', 'assistant'].includes(m.info.role)).slice(-80).map(m => ({
        role: m.info.role === 'assistant' ? 'claude' : 'user', text: m.parts.filter(p => p.type === 'text').map(p => p.text).join('\n'),
        t: Math.floor(m.info.time.created / 1000),
      }));
      transcripts.chats[job.chat] = { id: job.chat, name: result.name, cwd: target,
        model: result.model || '', variant: result.variant || '', messages: result.messages, updated: Date.now() };
      saveTranscripts(); remember(target);
    } else if (job.op === 'abort') {
      const pending = Object.values(state.jobs).find(j => j.chat === job.chat);
      if (pending?.sessionID) await client.request(`/session/${pending.sessionID}/abort`, pending.cwd, { method: 'POST' });
      if (pending) {
        pending.cancelled = true;
        running.get(P.chatKey(pending))?.abort();
        if (!running.has(P.chatKey(pending))) finish(pending, 'done', 'Stopped.');
      }
    } else if (job.op === 'permission' || job.op === 'question') {
      if (!sessionID) throw new Error('No OpenCode session for this chat.');
      const live = Object.values(state.live).find(r => r.chat === job.chat && r.request);
      const request = live?.request;
      if (!request || request.kind !== job.op) throw new Error('This request is no longer pending.');
      if (job.requestID && job.requestID !== request.id) throw new Error('OpenCode is now asking a different question. Read the new request before responding.');
      const endpoint = `/${job.op}/${encodeURIComponent(request.id)}`;
      if (job.op === 'permission') {
        if (!['once', 'reject'].includes(job.text)) throw new Error('Choose Allow once or Reject.');
        await client.request(endpoint + '/reply', dir, { method: 'POST', body: { reply: job.text } });
      } else if (job.text === '/reject') {
        await client.request(endpoint + '/reject', dir, { method: 'POST' });
      } else {
        const rows = job.text.split('\n').filter(s => s.trim());
        if (rows.length !== request.questions.length) throw new Error(`Answer each of the ${request.questions.length} question(s) on a separate line.`);
        const answers = rows.map((row, i) => {
          const q = request.questions[i];
          const choices = q.multiple ? row.split(',').map(s => s.trim()) : [row.trim()];
          return choices.map(value => {
            const option = /^\d+$/.test(value) && q.options[Number(value) - 1];
            if (option) return option.label;
            if (q.custom === false && !q.options.some(o => o.label === value)) throw new Error('Choose one of the listed options.');
            return value;
          });
        });
        await client.request(endpoint + '/reply', dir, { method: 'POST', body: { answers } });
      }
      live.request = null;
    } else throw new Error(`Unknown action: ${job.op}`);
  } catch (error) { result.error = error.message; }
  controls.set(key, result);
  while (controls.size > 30) controls.delete(controls.keys().next().value);
  state.controls = Object.fromEntries(controls);
  P.markHandled(state, job); save(); signal('ack', job.id); publishNow();
  controlling.delete(key);
}

async function submit(job) {
  if (P.alreadyHandled(state, job)) return;
  if (job.ctx !== undefined) state.context = String(job.ctx).slice(0, 2000);
  if (job.op) return control(job);
  if (job.hello) {
    await health(); offerRestore(job); P.markHandled(state, job); save(); signal('ack', job.id); publishNow(); return;
  }
  if (job.forget) {
    forgotten.add(job.chat);
    for (const pending of Object.values(state.jobs).filter(j => j.chat === job.chat)) {
      pending.cancelled = true;
      if (pending.sessionID) await client.request(`/session/${pending.sessionID}/abort`, pending.cwd, { method: 'POST' }).catch(error => log(error.message));
      running.get(P.chatKey(pending))?.abort();
      delete state.jobs[P.chatKey(pending)]; delete state.live[P.chatKey(pending)];
    }
    delete transcripts.chats[job.chat]; delete state.sessions[P.sessKey(job)];
    for (const [key, record] of Object.entries(state.live)) if (record.chat === job.chat) delete state.live[key];
    if (restore) restore.chats = restore.chats.filter(c => c.id !== job.chat);
    saveTranscripts(); P.markHandled(state, job); save(); signal('ack', job.id); return;
  }
  const key = P.chatKey(job);
  if (state.jobs[key]) return;
  forgotten.delete(job.chat);
  state.jobs[key] = job;
  save(); signal('ack', job.id); signal('sig', job.id, false);
  publish(job, { status: 'working', text: 'Queued…' }, true);
  drain();
}

function finish(job, status, text) {
  const key = P.chatKey(job);
  running.delete(key); delete state.jobs[key];
  P.markHandled(state, job);
  note(job, status === 'done' ? 'claude' : 'system', text);
  publish(job, { status, text, request: null }, true);
  signal('sig', job.id);
  save(); log(`#${job.id} ${status}`);
  drain();
  if (exitWhenIdle && !Object.keys(state.jobs).length) process.exit(status === 'done' ? 0 : 1);
}
function drain() {
  if (stopping) return;
  for (const [key, job] of Object.entries(state.jobs)) {
    if (running.size >= (cfg.maxParallel || 3)) break;
    if (running.has(key)) continue;
    const controller = new AbortController();
    running.set(key, controller);
    run(job, controller).catch(error => {
      if (stopping) return;
      finish(job, job.cancelled ? 'done' : 'error', job.cancelled ? 'Stopped.' : error.message);
    });
  }
}
async function run(job, controller) {
  const recover = !!job.messageID;
  job.cwd = await workspace.directory(job.cwd);
  const skey = P.sessKey(job);
  let timer;
  try {
    if (!recover) {
      let sessionID = state.sessions[skey];
      if (job.newSession || !workspace.same(state.sessionCwd[skey], job.cwd)) sessionID = null;
      if (!sessionID) sessionID = (await client.request('/session', job.cwd, { method: 'POST', body: { title: job.name || 'WoW session' }, signal: controller.signal })).id;
      const statuses = await client.request('/session/status', job.cwd, { signal: controller.signal });
      if (statuses[sessionID] && statuses[sessionID].type !== 'idle') throw new Error('This OpenCode session is already running in another chat or client.');
      if (job.name && !/^Chat \d+$/.test(job.name)) await client.request(`/session/${sessionID}`, job.cwd, { method: 'PATCH', body: { title: job.name }, signal: controller.signal });
      job.sessionID = sessionID; job.messageID = messageID();
      state.sessions[skey] = sessionID; state.sessionCwd[skey] = job.cwd;
      remember(job.cwd); note(job, 'user', job.text); save();
      for (let i = 1; i <= (cfg.actMax || 60); i++) {
        try { write(path.join(cfg.addonDir, 'WoWClaude', 'act', P.pad3(P.slotNumber(job.id, slots)), String(i).padStart(2, '0') + '.wav'), Buffer.alloc(0)); } catch {}
      }
    }
    publish(job, { status: 'working', text: recover ? 'Reconnecting to your session…' : 'Thinking…' }, true);
    let primer = '';
    if (cfg.primerFile) primer = fs.readFileSync(path.resolve(ROOT, cfg.primerFile), 'utf8');
    let model;
    const chosen = job.model || cfg.model;
    if (chosen) {
      const slash = chosen.indexOf('/');
      if (slash < 1) throw new Error('model must be provider/model (or empty to use the OpenCode default).');
      if (job.model) await catalog.validate(job.cwd, job.model, job.variant || '');
      model = { providerID: chosen.slice(0, slash), modelID: chosen.slice(slash + 1) };
    }
    timer = setTimeout(() => {
      client.request(`/session/${job.sessionID}/abort`, job.cwd, { method: 'POST' }).catch(error => log(error.message));
      controller.abort(new Error('Session timed out.'));
    }, cfg.timeoutMs || 1800000);
    let lastBeat = 0;
    const text = await client.run({
      directory: job.cwd, sessionID: job.sessionID, messageID: job.messageID, text: job.text,
      system: P.systemPrompt(cfg.gameContext === false ? '' : state.context, primer), model,
      variant: job.variant || undefined, agent: cfg.agent,
      recover, signal: controller.signal,
      onUpdate: update => {
        if (Date.now() - lastBeat > 5000) { beat(job); lastBeat = Date.now(); }
        const previous = state.live[P.chatKey(job)]?.request?.id;
        publish(job, { status: 'working', ...update }, !!update.request && update.request.id !== previous);
      },
    });
    if (!stopping) finish(job, 'done', job.cancelled ? 'Stopped.' : text);
  } finally { clearTimeout(timer); }
}

let lastMtime = 0;
function poll() {
  try {
    const stat = fs.statSync(cfg.savedVariablesFile);
    if (stat.mtimeMs === lastMtime) return;
    lastMtime = stat.mtimeMs;
    const job = P.parseOutbox(fs.readFileSync(cfg.savedVariablesFile, 'utf8'));
    if (job) submit(job).catch(error => log(error.message));
  } catch (error) { if (error.code !== 'ENOENT') log(error.message); }
}
function presence() {
  const max = cfg.presenceMax || 2000;
  state.presence = ((state.presence || 0) % max) + 1;
  for (let i = 0; i <= 50; i++) {
    const n = ((state.presence - 1 + i) % max) + 1;
    try { write(path.join(cfg.addonDir, 'WoWClaude', 'presence', String(n).padStart(4, '0') + '.wav'), i === 0 ? P.SILENT_WAV : Buffer.alloc(0)); } catch {}
  }
  save();
}
function startCapture() {
  const cap = { processName: 'WowB', cellPx: 4, cellsPerRow: 200, maxRows: 48, intervalMs: 250, ...cfg.capture };
  capture = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'capture.ps1'),
    '-Cell', String(cap.cellPx), '-Cells', String(cap.cellsPerRow), '-MaxRows', String(cap.maxRows),
    '-IntervalMs', String(cap.intervalMs), '-ProcessName', cap.processName], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: capture.stdout });
  lines.on('line', line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (typeof event.id === 'number') for (const job of P.jobsFromStrip(event.id, event.text)) submit(job).catch(error => log(error.message));
    else log(`capture: ${event.info || event.warn || event.error || line}`);
  });
  capture.stderr.on('data', data => log(`capture: ${String(data).slice(0, 500)}`));
  capture.on('error', error => log(`Screen capture: ${error.message}`));
  capture.on('close', () => { if (!stopping) setTimeout(startCapture, 5000); });
}
function stop() {
  stopping = true;
  save();
  for (const controller of running.values()) controller.abort();
  capture?.kill();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

log(`WoW OpenCode — ${client.url} — folders are resolved on the OpenCode server`);
health().then(() => {
  log(backend.message); publishNow(); drain();
  if (inject !== undefined) submit({ id: state.lastId + 1, session: '', chat: '', text: inject, cwd }).catch(error => { log(error.message); process.exit(1); });
  else {
    poll();
    if (once && !Object.keys(state.jobs).length) process.exit(0);
    if (!once) {
      setInterval(poll, cfg.pollMs || 750);
      presence(); setInterval(presence, cfg.presenceIntervalMs || 30000);
      setInterval(() => health().then(publishNow), 15000);
      if (cfg.capture?.enabled !== false) startCapture();
    }
  }
});
