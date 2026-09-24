'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ServerPaths, ServerWorkspace } = require('../bridge/workspace');
const { OpenCode } = require('../bridge/opencode');
const { mockOpenCode } = require('./mock_opencode');

test('Linux paths use the server home and stay case-sensitive on every bridge OS', () => {
  const paths = new ServerPaths({ home: '/home/remote', directory: '/srv/project' });
  assert.equal(paths.resolve(''), '/srv/project');
  assert.equal(paths.resolve('~/code with spaces/../other'), '/home/remote/other');
  assert.equal(paths.resolve('../other'), '/srv/other');
  assert.equal(paths.resolve('/home/remote/Project/'), '/home/remote/Project');
  assert.equal(paths.same('/home/remote/Project', '/home/remote/project'), false);
  assert.equal(paths.same('/home/remote/project/', '/home/remote/project'), true);
  assert.equal(paths.parent('/'), '/');
  assert.throws(() => paths.resolve('C:\\dev\\project'), /Linux\/POSIX/);
  assert.throws(() => paths.resolve('/bad\x1fpath'), /control characters/);
});

test('Windows server paths work independently of the bridge OS, including drive and UNC roots', () => {
  const paths = new ServerPaths({ home: 'C:\\Users\\remote', directory: 'D:\\work\\project' });
  assert.equal(paths.resolve('~/code'), 'C:\\Users\\remote\\code');
  assert.equal(paths.resolve('../other'), 'D:\\work\\other');
  assert.equal(paths.resolve('D:/work/project'), 'D:\\work\\project');
  assert.equal(paths.same('D:/Work/project', 'd:\\work\\PROJECT'), true);
  assert.equal(paths.parent('D:\\'), 'D:\\');
  assert.equal(paths.parent('\\\\server\\share\\'), '\\\\server\\share\\');
  assert.throws(() => paths.resolve('C:relative'), /absolute server drive/);
});

test('remote browsing distinguishes empty folders, missing folders and files without local filesystem access', async t => {
  const home = '/home/remote';
  const entries = [
    { name: 'Project', absolute: home + '/Project', type: 'directory' },
    { name: 'project', path: 'project', type: 'directory' },
    { name: 'notes.txt', absolute: home + '/notes.txt', type: 'file' },
    { name: 'space # & 📁', absolute: home + '/space # & 📁', type: 'directory' },
  ];
  const api = await mockOpenCode(t, { home, directory: home, directories: {
    '/': [{ name: 'home', absolute: '/home', type: 'directory' }],
    '/home': [{ name: 'remote', absolute: home, type: 'directory' }], [home]: entries,
  } });
  const workspace = new ServerWorkspace(new OpenCode({ serverUrl: api.url }, {}));
  const folders = await workspace.folders('~');
  assert.equal(folders.path, home);
  assert.equal(folders.parent, '/home');
  assert.equal(folders.items.length, 3);
  assert.equal((await workspace.folders(folders.parent)).path, '/home');
  assert.equal((await workspace.folders('/')).parent, '/');
  assert.equal((await workspace.folders('~/space # & 📁')).items.length, 0);
  assert.equal(await workspace.directory('Project'), home + '/Project');
  await assert.rejects(workspace.directory('missing'), /Folder not found/);
  await assert.rejects(workspace.directory('notes.txt'), /Folder not found/);
  assert.ok(api.calls.some(call => call.directory === home + '/space # & 📁'));
});

for (const username of [undefined, 'custom-user']) {
  test(`environment authentication covers HTTP and SSE (${username || 'default username'})`, async t => {
    const password = 'test:p@ss/word ✓';
    const api = await mockOpenCode(t, { password, username, prefix: '/api/opencode' });
    const env = { OPENCODE_SERVER_URL: api.url, OPENCODE_SERVER_PASSWORD: password, ...(username ? { OPENCODE_SERVER_USERNAME: username } : {}) };
    const client = new OpenCode({ serverUrl: 'http://wrong.invalid' }, env);
    await new ServerWorkspace(client).initialize();
    await client.request('/global/health');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    let connected = false;
    try {
      await client.events('/home/opencode', controller.signal, event => {
        if (event.type === 'server.connected') { connected = true; controller.abort(); }
      });
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { clearTimeout(timer); }
    assert.equal(connected, true);
    assert.ok(api.calls.every(call => call.pathname.startsWith('/api/opencode/')));
    assert.ok(api.calls.every(call => call.authorization === 'Basic ' + Buffer.from(`${username || 'opencode'}:${password}`).toString('base64')));
  });
}

test('missing or incorrect authentication produces an actionable error without response secrets', async t => {
  const secret = 'server-body-secret';
  const api = await mockOpenCode(t, { password: 'expected', authError: secret });
  for (const env of [{}, { OPENCODE_SERVER_PASSWORD: 'wrong' }]) {
    const client = new OpenCode({ serverUrl: api.url }, env);
    await assert.rejects(client.request('/global/health'), error => {
      assert.equal(error.status, 401);
      assert.match(error.message, /OPENCODE_SERVER_PASSWORD/);
      assert.match(error.message, /OPENCODE_SERVER_USERNAME/);
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
  assert.throws(() => new OpenCode({ serverUrl: 'http://user:secret@example.com' }, {}), /instead of credentials in serverUrl/);
});
