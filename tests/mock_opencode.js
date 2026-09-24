'use strict';
const http = require('node:http');

async function mockOpenCode(t) {
  const sessions = new Map();
  const streams = new Set();
  const calls = [];
  let sequence = 0;
  const api = { sessions, calls, onPrompt: null };
  api.emit = event => { for (const stream of streams) stream.write('data: ' + JSON.stringify(event) + '\n\n'); };
  api.complete = (id, text = 'Bonjour depuis OpenCode ✓') => {
    const s = sessions.get(id);
    s.busy = false; s.permission = null; s.question = null;
    const info = { id: 'msg_answer' + (++sequence), sessionID: id, role: 'assistant', time: { created: Date.now(), completed: Date.now() } };
    const part = { id: 'prt_' + sequence, messageID: info.id, sessionID: id, type: 'text', text };
    s.messages.push({ info, parts: [part] });
    api.emit({ type: 'message.updated', properties: { info } });
    api.emit({ type: 'message.part.updated', properties: { part } });
    api.emit({ type: 'session.status', properties: { sessionID: id, status: { type: 'idle' } } });
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, route: url.pathname, directory: url.searchParams.get('directory'), body, authorization: req.headers.authorization });
    const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (url.pathname === '/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"server.connected","properties":{}}\n\n');
      streams.add(res); res.on('close', () => streams.delete(res)); return;
    }
    if (url.pathname === '/global/health') return json({ healthy: true, version: 'mock' });
    if (url.pathname === '/session/status') return json(Object.fromEntries([...sessions].filter(([, s]) => s.busy).map(([id]) => [id, { type: 'busy' }])));
    if (url.pathname === '/permission') return json([...sessions.values()].flatMap(s => s.permission ? [s.permission] : []));
    if (url.pathname === '/question') return json([...sessions.values()].flatMap(s => s.question ? [s.question] : []));
    if (url.pathname === '/session' && req.method === 'POST') {
      const info = { id: 'ses_' + (++sequence), title: body.title, directory: url.searchParams.get('directory'), time: { created: Date.now(), updated: Date.now() } };
      sessions.set(info.id, { info, messages: [] }); return json(info);
    }
    if (url.pathname === '/session') return json([...sessions.values()].map(s => s.info));
    const match = url.pathname.match(/^\/session\/([^/]+)(?:\/(.*))?$/);
    if (match) {
      const [, id, action] = match;
      const s = sessions.get(id);
      if (!s) { res.statusCode = 404; return json({ error: 'missing' }); }
      if (!action) return json(s.info);
      if (action === 'message') return json(s.messages);
      if (action === 'prompt_async') {
        s.messages.push({ info: { id: body.messageID, sessionID: id, role: 'user', time: { created: Date.now() } }, parts: body.parts });
        s.busy = true;
        res.writeHead(204); res.end();
        if (api.onPrompt) api.onPrompt(id, body);
        else setTimeout(() => api.complete(id), 60);
        return;
      }
      if (action === 'abort') { api.complete(id, 'Stopped.'); return json(true); }
    }
    if (/^\/(permission|question)\//.test(url.pathname)) {
      const [, kind, id] = url.pathname.split('/');
      const s = [...sessions.values()].find(s => s[kind]?.id === id);
      if (!s) { res.statusCode = 404; return json({ error: 'request missing' }); }
      s[kind] = null;
      api.complete(s.info.id, 'Continued after your answer.');
      return json(true);
    }
    res.statusCode = 404; json({ error: 'unknown route ' + url.pathname });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  api.url = `http://127.0.0.1:${server.address().port}`;
  api.closeStreams = () => { for (const stream of streams) stream.end(); };
  t.after(() => { for (const stream of streams) stream.destroy(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return api;
}

module.exports = { mockOpenCode };
