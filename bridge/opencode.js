'use strict';

const { randomBytes } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');

// No shell or CLI output parsing: OpenCode owns sessions, tools and permissions.
class OpenCode {
  constructor(config = {}, env = process.env) {
    this.url = new URL(env.OPENCODE_SERVER_URL || config.serverUrl || 'http://127.0.0.1:4096');
    if (!['http:', 'https:'].includes(this.url.protocol)) throw new Error('Invalid OpenCode serverUrl');
    if (this.url.username || this.url.password) throw new Error('Use OPENCODE_SERVER_PASSWORD and OPENCODE_SERVER_USERNAME instead of credentials in serverUrl.');
    if (this.url.search || this.url.hash) throw new Error('OpenCode serverUrl must not contain a query string or fragment.');
    if (!this.url.pathname.endsWith('/')) this.url.pathname += '/';
    this.headers = { 'Content-Type': 'application/json' };
    const password = env.OPENCODE_SERVER_PASSWORD;
    if (password) this.headers.Authorization = 'Basic ' + Buffer.from(
      `${env.OPENCODE_SERVER_USERNAME || 'opencode'}:${password}`).toString('base64');
    this.reconcileMs = config.reconcileMs || 3000;
  }

  async request(route, directory, { method = 'GET', body, signal, stream = false, query = {} } = {}) {
    const url = new URL(route.replace(/^\//, ''), this.url);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    if (directory) url.searchParams.set('directory', directory);
    const timeout = AbortSignal.timeout(stream ? 3600000 : 15000);
    const response = await fetch(url, {
      method, headers: this.headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      const authentication = response.status === 401 || response.status === 403;
      const detail = authentication
        ? 'Authentication failed. Set OPENCODE_SERVER_PASSWORD and, if customized on the server, OPENCODE_SERVER_USERNAME in the bridge terminal (default username: opencode).'
        : (await response.text()).slice(0, 500);
      if (authentication) await response.body?.cancel();
      throw new OpenCodeHTTPError(response.status, `OpenCode ${method} ${url.pathname}: ${response.status} ${detail}`);
    }
    if (stream) return response;
    return response.status === 204 ? undefined : response.json();
  }

  async events(directory, signal, onEvent) {
    const response = await this.request('/event', directory, { signal, stream: true });
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) onEvent(JSON.parse(data));
      }
    }
  }

  // Reconciliation makes SSE loss recoverable, including interactive requests.
  // A persisted messageID is never sent again when recovering a bridge restart.
  async run({ directory, sessionID, messageID, text, system, model, agent, recover, signal, onUpdate }) {
    const stream = new AbortController();
    const combined = AbortSignal.any([signal, stream.signal]);
    const parts = new Map();
    const roles = new Map([[messageID, 'user']]);
    let interactive = null;
    let transport = '';
    let fatal;
    const emit = () => {
      const values = [...parts.values()];
      const body = values.filter(p => p.type === 'text').map(p => p.text || '').join('\n\n');
      const tools = values.filter(p => p.type === 'tool').slice(-4).map(p =>
        `${p.state?.status === 'completed' ? '✓' : '›'} ${p.tool}: ${p.state?.title || p.state?.input?.command || p.state?.input?.filePath || ''}`);
      onUpdate({ text: [body, ...tools, transport].filter(Boolean).join('\n').slice(-24000) || 'Thinking…', request: interactive });
    };
    const eventLoop = (async () => {
      while (!combined.aborted) {
        try {
          await this.events(directory, combined, event => {
            const p = event.properties || {};
            if ((p.sessionID || p.part?.sessionID || p.info?.sessionID) !== sessionID) return;
            transport = '';
            if (event.type === 'session.error') fatal = new RunError(p.error?.data?.message || p.error?.name || 'OpenCode failed');
            if (event.type === 'message.updated') roles.set(p.info.id, p.info.role);
            if (event.type === 'message.part.updated' && roles.get(p.part.messageID) === 'assistant') { parts.set(p.part.id, p.part); emit(); }
            if (event.type === 'message.part.delta') {
              const part = parts.get(p.partID);
              if (part && p.field === 'text') { part.text = (part.text || '') + p.delta; emit(); }
            }
            if (event.type === 'permission.asked' || event.type === 'question.asked') {
              interactive = { ...p, kind: event.type.split('.')[0] }; emit();
            }
            if (event.type === 'permission.replied' || event.type === 'question.replied' || event.type === 'question.rejected') {
              interactive = null; emit();
            }
          });
        } catch (error) {
          if (combined.aborted) break;
          transport = `Reconnecting live events… ${error.message}`; emit();
        }
        await sleep(1000, undefined, { signal: combined }).catch(() => {});
      }
    })();
    try {
      if (!recover) {
        await this.request(`/session/${sessionID}/prompt_async`, directory, {
          method: 'POST', signal, body: {
            messageID, parts: [{ type: 'text', text }],
            ...(system ? { system } : {}), ...(model ? { model } : {}), ...(agent ? { agent } : {}),
          },
        });
      }
      while (!signal.aborted) {
        try {
          if (fatal) throw fatal;
          const [messages, statuses, permissions, questions] = await Promise.all([
            this.request(`/session/${sessionID}/message`, directory, { signal }),
            this.request('/session/status', directory, { signal }),
            this.request('/permission', directory, { signal }),
            this.request('/question', directory, { signal }),
          ]);
          transport = '';
          const start = messages.findIndex(m => m.info.id === messageID);
          for (const message of messages) roles.set(message.info.id, message.info.role);
          const responses = start < 0 ? [] : messages.slice(start + 1).filter(m => m.info.role === 'assistant');
          parts.clear();
          for (const message of responses) for (const part of message.parts) parts.set(part.id, part);
          const permission = permissions.find(p => p.sessionID === sessionID);
          const question = questions.find(q => q.sessionID === sessionID);
          interactive = permission ? { ...permission, kind: 'permission' } : question ? { ...question, kind: 'question' } : null;
          emit();
          const last = responses.at(-1);
          if (last && !interactive && (!statuses[sessionID] || statuses[sessionID].type === 'idle') && last.info.time?.completed) {
            if (last.info.error) throw new RunError(last.info.error.data?.message || last.info.error.name || 'OpenCode failed');
            return responses.flatMap(m => m.parts.filter(p => p.type === 'text').map(p => p.text)).join('\n\n') || 'Completed (no text response).';
          }
          if (recover && start < 0 && (!statuses[sessionID] || statuses[sessionID].type === 'idle')) {
            throw new RunError('This message was not accepted before the bridge stopped. Send it again.');
          }
        } catch (error) {
          if (signal.aborted || error instanceof RunError || (error instanceof OpenCodeHTTPError && [400, 401, 403, 404].includes(error.status))) throw error;
          transport = `OpenCode unavailable; reconnecting… ${error.message}`; emit();
        }
        await sleep(this.reconcileMs, undefined, { signal });
      }
      signal.throwIfAborted();
    } finally {
      stream.abort();
      await eventLoop;
    }
  }
}

class RunError extends Error {}

class OpenCodeHTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function messageID() {
  return 'msg_' + Date.now().toString(16).padStart(12, '0') + randomBytes(8).toString('hex');
}

module.exports = { OpenCode, OpenCodeHTTPError, messageID };
