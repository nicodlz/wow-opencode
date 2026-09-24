'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const { OpenCode, messageID } = require('../bridge/opencode');
const { mockOpenCode } = require('./mock_opencode');

test('OpenCode creates a scoped session, streams text and reconciles a dropped stream', { timeout: 8000 }, async t => {
  const api = await mockOpenCode(t);
  const client = new OpenCode({ serverUrl: api.url, reconcileMs: 30 });
  const directory = '/project with spaces/unicode-📁';
  const session = await client.request('/session', directory, { method: 'POST', body: { title: 'WoW' } });
  const updates = [];
  api.onPrompt = id => {
    setTimeout(() => {
      api.emit({ type: 'message.updated', properties: { info: { id: 'a1', sessionID: id, role: 'assistant' } } });
      api.emit({ type: 'message.part.updated', properties: { part: { id: 'p1', messageID: 'a1', sessionID: id, type: 'text', text: 'Streaming' } } });
      api.emit({ type: 'message.part.delta', properties: { sessionID: id, partID: 'p1', field: 'text', delta: ' ✓' } });
      api.emit({ type: 'message.part.updated', properties: { part: { id: 'foreign', sessionID: 'other', type: 'text', text: 'DO NOT LEAK' } } });
      api.closeStreams();
      setTimeout(() => api.complete(id), 70);
    }, 50);
  };
  const result = await client.run({ directory, sessionID: session.id, messageID: messageID(), text: 'Hello', signal: AbortSignal.timeout(5000), onUpdate: u => updates.push(u.text) });
  assert.equal(result, 'Hello from OpenCode ✓');
  assert.ok(updates.some(s => s.includes('Streaming ✓')));
  assert.ok(updates.every(s => !s.includes('DO NOT LEAK')));
  assert.ok(api.calls.filter(c => c.route !== '/global/health').every(c => c.directory === directory));
  assert.equal(api.calls.filter(c => c.route.endsWith('/prompt_async')).length, 1);
});

test('recovery never resends a prompt; permission requests survive a missed SSE', { timeout: 8000 }, async t => {
  const api = await mockOpenCode(t);
  const client = new OpenCode({ serverUrl: api.url, reconcileMs: 20 });
  const directory = '/project';
  const session = await client.request('/session', directory, { method: 'POST', body: {} });
  const id = messageID();
  api.sessions.get(session.id).messages = [{ info: { id, role: 'user' }, parts: [] }];
  api.sessions.get(session.id).busy = true;
  api.sessions.get(session.id).permission = { id: 'per_1', sessionID: session.id, permission: 'bash', patterns: ['npm test'] };
  const updates = [];
  const result = client.run({ directory, sessionID: session.id, messageID: id, recover: true, signal: AbortSignal.timeout(5000), onUpdate: u => updates.push(u) });
  while (!updates.some(u => u.request)) await sleep(10);
  assert.equal(updates.find(u => u.request).request.kind, 'permission');
  await client.request('/permission/per_1/reply', directory, { method: 'POST', body: { reply: 'once' } });
  assert.equal(await result, 'Continued after your answer.');
  assert.equal(api.calls.filter(c => c.route.endsWith('/prompt_async')).length, 0);
});

test('provider errors and cancellation terminate the run instead of waiting forever', { timeout: 8000 }, async t => {
  const api = await mockOpenCode(t);
  const client = new OpenCode({ serverUrl: api.url, reconcileMs: 20 });
  const session = await client.request('/session', '/x', { method: 'POST', body: {} });
  api.onPrompt = id => setTimeout(() => api.emit({ type: 'session.error', properties: { sessionID: id, error: { data: { message: 'Provider unavailable' } } } }), 50);
  await assert.rejects(client.run({ directory: '/x', sessionID: session.id, messageID: messageID(), text: 'x', signal: AbortSignal.timeout(2000), onUpdate() {} }), /Provider unavailable/);
  api.onPrompt = () => {};
  const controller = new AbortController();
  const run = client.run({ directory: '/x', sessionID: session.id, messageID: messageID(), text: 'x', signal: controller.signal, onUpdate() {} });
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(run, /abort/i);
});
