// Optional real-server smoke test; no provider call and no API credits required.
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { OpenCode, messageID } = require('../bridge/opencode');
const { ServerWorkspace } = require('../bridge/workspace');
const { randomBytes } = require('node:crypto');

async function main() {
  let server;
  if (process.argv.includes('--spawn')) {
    process.env.OPENCODE_SERVER_URL = 'http://127.0.0.1:14096';
    process.env.OPENCODE_SERVER_PASSWORD ||= randomBytes(24).toString('hex');
    server = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', '14096'], { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => process.stdout.write(data));
    server.stderr.on('data', data => process.stderr.write(data));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    process.on('exit', () => server.kill());
  }
  const client = new OpenCode({ serverUrl: process.env.OPENCODE_SERVER_URL });
  if (server) {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await client.request('/global/health'); ready = true; break; } catch { await sleep(500); }
    }
    if (!ready) { server.kill(); throw new Error('OpenCode server did not start'); }
  }
  try {
  console.log('Health:', await client.request('/global/health'));
  if (process.env.OPENCODE_SERVER_PASSWORD) {
    const anonymous = new OpenCode({ serverUrl: client.url.href }, {});
    await assert.rejects(anonymous.request('/global/health'), error => error.status === 401 || error.status === 403);
  }
  const workspace = new ServerWorkspace(client, process.env.WOW_OPENCODE_PROJECT || '');
  await workspace.initialize();
  const directory = await workspace.directory('');
  const { ModelCatalog } = require('../bridge/models');
  const catalog = new ModelCatalog(client);
  const providers = await catalog.providers(directory);
  console.log('Connected providers:', providers.length);
  const listing = await workspace.folders(directory);
  assert.equal(listing.path, directory);
  assert.ok(Array.isArray(listing.items));
  await assert.rejects(workspace.directory(workspace.paths.resolve('wow-opencode-missing-' + randomBytes(8).toString('hex'))), /Folder not found/);
  console.log('Server folder:', directory);
  const session = await client.request('/session', directory, { method: 'POST', body: { title: 'wow-opencode smoke test (temporary)' } });
  try {
    assert.ok(session.id.startsWith('ses_'));
    const sessions = await client.request('/session', directory);
    assert.ok(sessions.some(s => s.id === session.id));
    assert.ok(Array.isArray(await client.request(`/session/${session.id}/message`, directory)));
    const id = messageID();
    const provider = providers.find(p => p.count > 0);
    const selected = provider && (await catalog.models(directory, provider.value)).items[0];
    const variants = selected && await catalog.variants(directory, selected.value);
    const variant = variants?.items.find(v => v.value !== '')?.value;
    const model = selected && { providerID: provider.value, modelID: selected.value.slice(provider.value.length + 1) };
    await client.request(`/session/${session.id}/prompt_async`, directory, { method: 'POST', body: {
      messageID: id, noReply: true, parts: [{ type: 'text', text: 'Transport smoke test; no model response requested.' }],
      ...(model ? { model } : {}), ...(variant ? { variant } : {}),
    } });
    let stored = false;
    for (let i = 0; i < 40; i++) {
      const messages = await client.request(`/session/${session.id}/message`, directory);
      const sent = messages.find(m => m.info.id === id);
      if (sent) {
        if (model) {
          assert.equal(sent.info.model.providerID, model.providerID);
          assert.equal(sent.info.model.modelID, model.modelID);
          if (variant) assert.equal(sent.info.model.variant, variant);
        }
        stored = true; break;
      }
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
    console.log('PASS: real OpenCode authentication, remote paths/folders, connected models/variants, sessions, prompt_async (noReply), history, permissions, questions, status and SSE.');
  } finally {
    await client.request(`/session/${session.id}`, directory, { method: 'DELETE' });
  }
  } finally { server?.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
