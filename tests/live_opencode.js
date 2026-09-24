// Optional real-server smoke test; no provider call and no API credits required.
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { OpenCode, messageID } = require('../bridge/opencode');

async function main() {
  let server;
  if (process.argv.includes('--spawn')) {
    process.env.OPENCODE_SERVER_URL = 'http://127.0.0.1:14096';
    server = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', '14096'], { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => process.stdout.write(data));
    server.stderr.on('data', data => process.stderr.write(data));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    process.on('exit', () => server.kill());
  }
  const client = new OpenCode({ serverUrl: process.env.OPENCODE_SERVER_URL });
  const directory = process.cwd();
  if (server) {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await client.request('/global/health'); ready = true; break; } catch { await sleep(500); }
    }
    if (!ready) { server.kill(); throw new Error('OpenCode server did not start'); }
  }
  try {
  console.log('Health:', await client.request('/global/health'));
  const session = await client.request('/session', directory, { method: 'POST', body: { title: 'wow-opencode smoke test (temporary)' } });
  try {
    assert.ok(session.id.startsWith('ses_'));
    const sessions = await client.request('/session', directory);
    assert.ok(sessions.some(s => s.id === session.id));
    assert.ok(Array.isArray(await client.request(`/session/${session.id}/message`, directory)));
    const id = messageID();
    await client.request(`/session/${session.id}/prompt_async`, directory, { method: 'POST', body: {
      messageID: id, noReply: true, parts: [{ type: 'text', text: 'Transport smoke test; no model response requested.' }],
    } });
    let stored = false;
    for (let i = 0; i < 40; i++) {
      const messages = await client.request(`/session/${session.id}/message`, directory);
      if (messages.some(m => m.info.id === id)) { stored = true; break; }
      await sleep(250);
    }
    assert.ok(stored, 'prompt_async accepts our generated messageID and persists the message');
    assert.ok(Array.isArray(await client.request('/permission', directory)));
    assert.ok(Array.isArray(await client.request('/question', directory)));
    await client.request('/session/status', directory);
    const controller = new AbortController();
    let connected = false;
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await client.events(directory, controller.signal, event => {
        if (event.type === 'server.connected') { connected = true; controller.abort(); }
      });
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { clearTimeout(timer); }
    assert.ok(connected, 'SSE connection established');
    console.log('PASS: real OpenCode health, sessions, prompt_async (noReply), history, permissions, questions, status and SSE.');
  } finally {
    await client.request(`/session/${session.id}`, directory, { method: 'DELETE' });
  }
  } finally { server?.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
