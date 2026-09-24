'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { mockOpenCode } = require('./mock_opencode');

test('real bridge: folder/session controls, prompt, permission, question, stop and restart recovery', { timeout: 30000 }, async t => {
  const api = await mockOpenCode(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-opencode-test-'));
  const addons = path.join(root, 'AddOns');
  fs.mkdirSync(path.join(root, 'project with spaces'));
  fs.mkdirSync(path.join(addons, 'WoWClaude'), { recursive: true });
  fs.mkdirSync(path.join(addons, 'WoWClaude_S001'));
  for (const dir of ['sig', 'ack', 'act/001', 'presence']) fs.mkdirSync(path.join(addons, 'WoWClaude', dir), { recursive: true });
  const config = { addonDir: addons, defaultCwd: root, inboxFile: path.join(addons, 'WoWClaude', 'Inbox.lua'), savedVariablesFile: path.join(root, 'Saved.lua'), serverUrl: api.url, capture: { enabled: false }, slots: 1, actMax: 2, presenceMax: 2, pollMs: 25, progressWriteMs: 25, reconcileMs: 30, timeoutMs: 10000 };
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
  let bridge;
  let output = '';
  const start = () => {
    bridge = spawn(process.execPath, [path.join(__dirname, '../bridge/bridge.js'), '--config', path.join(root, 'config.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
    bridge.stdout.on('data', data => { output += data; }); bridge.stderr.on('data', data => { output += data; });
  };
  const stop = async () => {
    if (!bridge || bridge.exitCode !== null) return;
    const closed = new Promise(resolve => bridge.once('exit', resolve)); bridge.kill(); await closed;
  };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const state = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8')); } catch { return {}; } };
  const wait = async condition => {
    const until = Date.now() + 7000;
    while (!condition()) { if (Date.now() > until) throw new Error('Timed out: ' + output); await sleep(20); }
  };
  let seq = 0;
  const send = async (text, op, cwd = '') => {
    const id = ++seq;
    const hex = s => Buffer.from(s).toString('hex');
    fs.writeFileSync(config.savedVariablesFile, `WoWClaudeDB = { ["outbox"] = { ["id"] = ${id}, ["session"] = "abc", ["chat"] = "c1", ["text"] = "${hex(text)}", ["cwd"] = "${hex(cwd)}", ${op ? `["op"] = "${op}",` : ''} } }`);
    if (op) await wait(() => state().controls?.[`abc:${id}`]);
    return id;
  };
  start();
  await wait(() => output.includes('OpenCode mock'));
  let id = await send(root, 'folders');
  assert.ok(state().controls[`abc:${id}`].items.some(i => i.name === 'project with spaces'));
  const folder = path.join(root, 'project with spaces');
  id = await send(folder, 'open');
  const sessionID = state().controls[`abc:${id}`].session;
  assert.ok(sessionID);
  id = await send('', 'sessions', folder);
  assert.equal(state().controls[`abc:${id}`].items[0].value, sessionID);
  id = await send('hello', undefined, folder);
  await wait(() => state().live?.['abc:c1']?.status === 'done');
  assert.match(state().live['abc:c1'].text, /Hello/);
  api.onPrompt = sid => { api.sessions.get(sid).permission = { id: 'per_1', sessionID: sid, permission: 'bash', patterns: ['npm test'] }; };
  await send('test', undefined, folder);
  await wait(() => state().live?.['abc:c1']?.request?.id === 'per_1');
  await send('once', 'permission', folder);
  await wait(() => state().live?.['abc:c1']?.status === 'done');
  assert.ok(api.calls.some(c => c.route === '/permission/per_1/reply' && c.body.reply === 'once'));
  api.onPrompt = sid => { api.sessions.get(sid).question = { id: 'que_1', sessionID: sid, questions: [{ question: 'Which?', options: [{ label: 'One' }, { label: 'Two' }], custom: false }] }; };
  await send('ask', undefined, folder);
  await wait(() => state().live?.['abc:c1']?.request?.id === 'que_1');
  await send('2', 'question', folder);
  await wait(() => state().live?.['abc:c1']?.status === 'done');
  assert.deepEqual(api.calls.find(c => c.route === '/question/que_1/reply').body, { answers: [['Two']] });
  api.onPrompt = () => {};
  await send('long task', undefined, folder);
  await wait(() => api.sessions.get(sessionID).busy);
  const promptCount = api.calls.filter(c => c.route.endsWith('/prompt_async')).length;
  await stop();
  // Windows terminates processes without SIGTERM handlers; the PID lock must be recoverable too.
  start();
  await sleep(150);
  api.complete(sessionID, 'Recovered without duplicate execution');
  await wait(() => state().live?.['abc:c1']?.text === 'Recovered without duplicate execution');
  assert.equal(api.calls.filter(c => c.route.endsWith('/prompt_async')).length, promptCount);
  await send('stop me', undefined, folder);
  await wait(() => api.sessions.get(sessionID).busy);
  await send('', 'abort', folder);
  await wait(() => state().live?.['abc:c1']?.status === 'done');
  assert.equal(api.sessions.get(sessionID).busy, false);
  assert.ok(fs.readFileSync(config.inboxFile, 'utf8').includes('Stopped.'));
});
